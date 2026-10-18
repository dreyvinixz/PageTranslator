package br.com.pagetranslator

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import kotlin.math.max
import kotlin.math.min

data class BubbleTranslation(val bounds: Rect, val original: String, val translated: String)

/** A non-touchable transparent overlay, plus one separate toggle control. */
class TranslationOverlay(private val context: Context, onToggle: (Boolean) -> Unit) {
    private val manager = context.getSystemService(WindowManager::class.java)
    private val layer = TranslationCanvas(context)
    private var shown = true
    private val toggle = TextView(context).apply {
        text = "EN → PT · ON"
        setTextColor(Color.WHITE)
        textSize = 12f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        setPadding(dp(12), dp(10), dp(12), dp(10))
        background = GradientDrawable().apply {
            setColor(0xFF252B3A.toInt())
            cornerRadius = dp(16).toFloat()
        }
        setOnClickListener {
            shown = !shown
            layer.visibility = if (shown) View.VISIBLE else View.INVISIBLE
            text = if (shown) "EN → PT · ON" else "EN → PT · OFF"
            onToggle(shown)
        }
    }
    init {
        val layerFlags = WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_SECURE
        manager.addView(layer, WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY, layerFlags,
            android.graphics.PixelFormat.TRANSLUCENT
        ).apply { gravity = Gravity.TOP or Gravity.START })
        manager.addView(toggle, WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_SECURE,
            android.graphics.PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = dp(14)
            y = dp(90)
        })
    }

    fun update(entries: List<BubbleTranslation>, sourceWidth: Int, sourceHeight: Int) {
        layer.entries = entries
        layer.sourceWidth = sourceWidth
        layer.sourceHeight = sourceHeight
        layer.invalidate()
    }

    fun close() {
        runCatching { manager.removeViewImmediate(toggle) }
        runCatching { manager.removeViewImmediate(layer) }
    }

    private fun dp(value: Int): Int = (value * context.resources.displayMetrics.density).toInt()

    private class TranslationCanvas(context: Context) : View(context) {
        var entries: List<BubbleTranslation> = emptyList()
        var sourceWidth = 1
        var sourceHeight = 1
        private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xF6FFFFFF.toInt() }
        private val outline = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF42558D.toInt()
            style = Paint.Style.STROKE
            strokeWidth = 1.5f * resources.displayMetrics.density
        }
        private val letters = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
            color = 0xFF152039.toInt()
            typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
            textSize = 13f * resources.displayMetrics.scaledDensity
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            if (width <= 0 || height <= 0 || sourceWidth <= 0 || sourceHeight <= 0) return
            val sx = width.toFloat() / sourceWidth
            val sy = height.toFloat() / sourceHeight
            val pad = 4f * resources.displayMetrics.density
            val maxTextWidth = (width * 0.62f).toInt()
            for (entry in entries) {
                val translation = entry.translated.trim()
                if (translation.isEmpty()) continue
                val desired = max((entry.bounds.width() * sx + 2 * pad).toInt(), 100)
                val lineWidth = min(maxTextWidth, desired - (2 * pad).toInt()).coerceAtLeast(70)
                val textLayout = StaticLayout.Builder.obtain(
                    translation, 0, translation.length, letters, lineWidth
                ).setAlignment(Layout.Alignment.ALIGN_NORMAL)
                    .setIncludePad(false).setMaxLines(6).build()
                val left = (entry.bounds.left * sx - pad)
                    .coerceIn(0f, max(0f, width - lineWidth - 2 * pad))
                val top = (entry.bounds.top * sy - pad)
                    .coerceIn(0f, max(0f, height - textLayout.height - 2 * pad))
                val region = RectF(left, top, left + lineWidth + 2 * pad,
                    top + textLayout.height + 2 * pad)
                canvas.drawRoundRect(region, pad * 5, pad * 5, fill)
                canvas.drawRoundRect(region, pad * 5, pad * 5, outline)
                canvas.save()
                canvas.translate(left + pad, top + pad)
                textLayout.draw(canvas)
                canvas.restore()
            }
        }
    }
}
