package br.com.pagetranslator

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.graphics.Rect
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.DisplayMetrics
import android.util.Log
import android.view.WindowManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.LinkedHashMap

class ScreenTranslateService : Service() {
    companion object {
        const val ACTION_START = "br.com.pagetranslator.START"
        const val ACTION_STOP = "br.com.pagetranslator.STOP"
        const val EXTRA_RESULT_CODE = "resultCode"
        const val EXTRA_RESULT_DATA = "resultData"
        private const val CHANNEL = "pagetranslator_capture"
        private const val NOTIFICATION_ID = 42
        private const val INTERVAL_MS = 2000L
    }

    private var projection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var reader: ImageReader? = null
    private var worker: HandlerThread? = null
    private var workerHandler: Handler? = null
    private val main = Handler(Looper.getMainLooper())
    private var overlay: TranslationOverlay? = null
    private var recognizer: TextRecognizer? = null
    private var translator: Translator? = null
    @Volatile private var modelReady = false
    @Volatile private var busy = false
    @Volatile private var showing = true
    @Volatile private var lastFrame = 0L
    private var signature = ""
    private var captureWidth = 1
    private var captureHeight = 1

    /** Main-thread cache; do not store translated data beyond the session. */
    private val cache = object : LinkedHashMap<String, String>(100, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?): Boolean =
            size > 300
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_START || projection != null) return START_NOT_STICKY

        createChannel()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
            startForeground(NOTIFICATION_ID, notice("Captura autorizada"),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION)
        else startForeground(NOTIFICATION_ID, notice("Captura autorizada"))

        val code = intent.getIntExtra(EXTRA_RESULT_CODE, 0)
        @Suppress("DEPRECATION")
        val data: Intent? = if (Build.VERSION.SDK_INT >= 33)
            intent.getParcelableExtra(EXTRA_RESULT_DATA, Intent::class.java)
        else intent.getParcelableExtra(EXTRA_RESULT_DATA)
        if (data == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        try {
            overlay = TranslationOverlay(this) { showing = it }
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            translator = Translation.getClient(TranslatorOptions.Builder()
                .setSourceLanguage(TranslateLanguage.ENGLISH)
                .setTargetLanguage(TranslateLanguage.PORTUGUESE)
                .build())
            translator?.downloadModelIfNeeded()
                ?.addOnSuccessListener { modelReady = true; updateNotice("Tradução pronta") }
                ?.addOnFailureListener { e ->
                    Log.e("PageTranslator", "Model download error", e)
                    updateNotice("Modelo indisponível; verifique sua conexão")
                }

            val manager = getSystemService(MediaProjectionManager::class.java)
            projection = manager.getMediaProjection(code, data)
            projection?.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() { stopSelf() }
            }, main)

            @Suppress("DEPRECATION")
            val metrics = DisplayMetrics().also {
                (getSystemService(WINDOW_SERVICE) as WindowManager)
                    .defaultDisplay.getRealMetrics(it)
            }
            captureWidth = metrics.widthPixels
            captureHeight = metrics.heightPixels
            worker = HandlerThread("pagetranslator-reader").apply { start() }
            workerHandler = Handler(worker!!.looper)
            reader = ImageReader.newInstance(
                captureWidth, captureHeight, PixelFormat.RGBA_8888, 2)
            reader?.setOnImageAvailableListener({ source -> receiveFrame(source) }, workerHandler)
            virtualDisplay = projection?.createVirtualDisplay(
                "PageTranslator", captureWidth, captureHeight, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader!!.surface, null, workerHandler)
        } catch (e: Exception) {
            Log.e("PageTranslator", "Capture failed to start", e)
            stopSelf()
        }
        return START_NOT_STICKY
    }

    private fun receiveFrame(source: ImageReader) {
        val image = try { source.acquireLatestImage() } catch (e: IllegalStateException) { null }
            ?: return
        try {
            val now = SystemClock.elapsedRealtime()
            if (!modelReady || busy || !showing || now - lastFrame < INTERVAL_MS) return
            lastFrame = now
            busy = true
            val plane = image.planes[0]
            val paddedWidth = captureWidth +
                (plane.rowStride - plane.pixelStride * captureWidth) / plane.pixelStride
            val padded = Bitmap.createBitmap(
                paddedWidth, captureHeight, Bitmap.Config.ARGB_8888)
            padded.copyPixelsFromBuffer(plane.buffer)
            val imageBitmap = Bitmap.createBitmap(
                padded, 0, 0, captureWidth, captureHeight)
            if (imageBitmap !== padded) padded.recycle()
            main.post { recognize(imageBitmap) }
        } catch (e: Exception) {
            busy = false
            Log.e("PageTranslator", "Unable to read frame", e)
        } finally {
            image.close()
        }
    }

    private fun recognize(bitmap: Bitmap) {
        val client = recognizer
        if (client == null) {
            busy = false
            bitmap.recycle()
            return
        }
        client.process(InputImage.fromBitmap(bitmap, 0)).addOnCompleteListener { task ->
            bitmap.recycle()
            if (!task.isSuccessful) {
                busy = false
                return@addOnCompleteListener
            }
            val items = task.result.textBlocks.mapNotNull { block ->
                val box = block.boundingBox ?: return@mapNotNull null
                val text = block.text.replace("\n", " ").trim()
                if (text.length < 4 || box.width() < 35 || box.height() < 10) null
                else box to text
            }.sortedWith(compareBy<Pair<Rect, String>> { it.first.top }
                .thenBy { it.first.left }).take(28)
            val current = items.joinToString("|") {
                "${it.first.left / 15}:${it.first.top / 15}:${it.second}"
            }
            if (current == signature) {
                busy = false
                return@addOnCompleteListener
            }
            signature = current
            translateNext(items, 0, mutableListOf())
        }
    }

    private fun translateNext(
        items: List<Pair<Rect, String>>,
        index: Int,
        output: MutableList<BubbleTranslation>
    ) {
        if (index >= items.size) {
            overlay?.update(output, captureWidth, captureHeight)
            busy = false
            return
        }
        val (bounds, english) = items[index]
        fun append(value: String) {
            output.add(BubbleTranslation(Rect(bounds), english, value))
            translateNext(items, index + 1, output)
        }
        val cached = cache[english]
        if (cached != null) { append(cached); return }
        val engine = translator
        if (engine == null) { busy = false; return }
        engine.translate(english)
            .addOnSuccessListener { translated ->
                cache[english] = translated
                append(translated)
            }
            .addOnFailureListener {
                append(english) // no invented translation
            }
    }

    private fun createChannel() {
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(
                CHANNEL, "PageTranslator — captura", NotificationManager.IMPORTANCE_LOW))
    }

    private fun notice(message: String): Notification {
        val stopIntent = Intent(this, ScreenTranslateService::class.java).apply {
            action = ACTION_STOP
        }
        val stop = PendingIntent.getService(this, 0, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_search)
            .setContentTitle("PageTranslator ativo")
            .setContentText(message)
            .setOngoing(true)
            .addAction(Notification.Action.Builder(
                android.R.drawable.ic_media_pause, "Parar", stop).build())
            .build()
    }

    private fun updateNotice(value: String) {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, notice(value))
    }

    override fun onDestroy() {
        reader?.setOnImageAvailableListener(null, null)
        virtualDisplay?.release()
        reader?.close()
        projection?.stop()
        overlay?.close()
        recognizer?.close()
        translator?.close()
        worker?.quitSafely()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N)
            stopForeground(STOP_FOREGROUND_REMOVE)
        else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        super.onDestroy()
    }
}
