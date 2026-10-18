package br.com.pagetranslator

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {
    private val projectionManager by lazy { getSystemService(MediaProjectionManager::class.java) }
    private val notificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* optional */ }

    private val capturePermission =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val data = result.data
            if (result.resultCode == Activity.RESULT_OK && data != null) {
                val startIntent = Intent(this, ScreenTranslateService::class.java).apply {
                    action = ScreenTranslateService.ACTION_START
                    putExtra(ScreenTranslateService.EXTRA_RESULT_CODE, result.resultCode)
                    putExtra(ScreenTranslateService.EXTRA_RESULT_DATA, data)
                }
                ContextCompat.startForegroundService(this, startIntent)
                message("PageTranslator iniciado. Volte para sua HQ.")
            } else {
                message("A captura não foi autorizada.")
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(24), dp(40), dp(24), dp(20))
            setBackgroundColor(0xFFF6F7FB.toInt())
        }
        fun addText(value: String, fontSize: Float) {
            root.addView(TextView(this).apply {
                text = value
                textSize = fontSize
                setTextColor(0xFF202735.toInt())
                setPadding(0, dp(8), 0, dp(16))
            })
        }
        fun addButton(value: String, click: () -> Unit) {
            root.addView(Button(this).apply {
                text = value
                setOnClickListener { click() }
            }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)).apply {
                bottomMargin = dp(12)
            })
        }
        addText("PageTranslator", 30f)
        addText("Leia HQs em inglês e consulte traduções sobre a tela. OCR e tradução são locais; o modelo é baixado na primeira execução.", 16f)
        addButton("1. Autorizar janela flutuante") {
            if (Settings.canDrawOverlays(this)) message("Já autorizado.")
            else startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")))
        }
        addButton("2. Iniciar tradução") {
            if (!Settings.canDrawOverlays(this)) message("Primeiro autorize a janela flutuante.")
            else capturePermission.launch(projectionManager.createScreenCaptureIntent())
        }
        addButton("Parar tradução") {
            startService(Intent(this, ScreenTranslateService::class.java).apply {
                action = ScreenTranslateService.ACTION_STOP
            })
        }
        addText("Durante a leitura, toque no botão EN → PT para ligar ou desligar a tradução. Pare a captura antes de abrir apps privados. O OCR analisa os blocos visíveis a cada ~2 segundos.", 14f)
        setContentView(root)
    }

    private fun message(value: String) =
        Toast.makeText(this, value, Toast.LENGTH_LONG).show()

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}
