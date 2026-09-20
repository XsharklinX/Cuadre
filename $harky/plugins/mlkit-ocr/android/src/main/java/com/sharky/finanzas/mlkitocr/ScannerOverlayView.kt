package com.sharky.finanzas.mlkitocr

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PointF
import android.graphics.Rect
import android.graphics.RectF
import android.util.AttributeSet
import android.view.View

/** Caja de ML Kit (coordenadas de la imagen analizada) + la etiqueta a mostrar. */
data class DetectedBox(val box: Rect, val label: String)

/**
 * Dibuja el recuadro azul sobre el monto detectado (y uno verde sobre los
 * últimos 4 dígitos de la tarjeta, si aparecen) — Fase 3 del roadmap.
 *
 * Traduce las cajas de ML Kit (coordenadas de la imagen que analiza
 * `ImageAnalysis`, en la orientación del sensor, sin rotar) a coordenadas de
 * esta vista. Asume que `PreviewView` usa su scaleType por defecto,
 * `FILL_CENTER` (recorta el sobrante para llenar la vista) — si algún día se
 * cambia el scaleType del preview, este mapeo hay que actualizarlo junto.
 */
class ScannerOverlayView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
) : View(context, attrs) {

    private data class Item(val rect: RectF, val label: String, val color: Int)

    private var items: List<Item> = emptyList()

    private val density = context.resources.displayMetrics.density

    private val boxPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = density * 3f
    }
    private val labelBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.WHITE
        textSize = density * 13f
        isFakeBoldText = true
    }

    /** Se llama en el hilo principal desde `ScannerActivity` tras cada frame analizado. */
    fun update(imageWidth: Int, imageHeight: Int, rotationDegrees: Int, amount: DetectedBox?, card: DetectedBox?) {
        if (width == 0 || height == 0) { items = emptyList(); invalidate(); return }
        val next = mutableListOf<Item>()
        amount?.let { next.add(Item(mapRect(it.box, imageWidth, imageHeight, rotationDegrees), "${it.label} detectado", AMOUNT_COLOR)) }
        card?.let { next.add(Item(mapRect(it.box, imageWidth, imageHeight, rotationDegrees), "Tarjeta ····${it.label}", CARD_COLOR)) }
        items = next
        invalidate()
    }

    // Mismo cálculo que CameraX hace internamente para FILL_CENTER: escala por
    // el eje que más recorta y centra el sobrante. La rotación se aplica ANTES
    // de escalar, porque las cajas de ML Kit vienen en el espacio del sensor
    // (por ejemplo, 4032x3024 aunque el teléfono esté en vertical), no en el
    // espacio ya "de pie" que ve el usuario.
    private fun mapRect(box: Rect, imageWidth: Int, imageHeight: Int, rotationDegrees: Int): RectF {
        val rotatedW = if (rotationDegrees == 90 || rotationDegrees == 270) imageHeight else imageWidth
        val rotatedH = if (rotationDegrees == 90 || rotationDegrees == 270) imageWidth else imageHeight
        if (rotatedW <= 0 || rotatedH <= 0) return RectF()

        val scale = maxOf(width.toFloat() / rotatedW, height.toFloat() / rotatedH)
        val offsetX = (width - rotatedW * scale) / 2f
        val offsetY = (height - rotatedH * scale) / 2f

        fun rotatePoint(x: Int, y: Int): PointF = when (rotationDegrees) {
            90 -> PointF((imageHeight - y).toFloat(), x.toFloat())
            180 -> PointF((imageWidth - x).toFloat(), (imageHeight - y).toFloat())
            270 -> PointF(y.toFloat(), (imageWidth - x).toFloat())
            else -> PointF(x.toFloat(), y.toFloat())
        }

        val p1 = rotatePoint(box.left, box.top)
        val p2 = rotatePoint(box.right, box.bottom)
        return RectF(
            minOf(p1.x, p2.x) * scale + offsetX,
            minOf(p1.y, p2.y) * scale + offsetY,
            maxOf(p1.x, p2.x) * scale + offsetX,
            maxOf(p1.y, p2.y) * scale + offsetY,
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        for (item in items) {
            boxPaint.color = item.color
            canvas.drawRoundRect(item.rect, 6f * density, 6f * density, boxPaint)

            val padding = 8f * density
            val textWidth = labelPaint.measureText(item.label)
            val chipHeight = labelPaint.textSize + padding
            val chipTop = (item.rect.top - chipHeight - 6f * density).coerceAtLeast(0f)
            val chipRect = RectF(item.rect.left, chipTop, item.rect.left + textWidth + padding * 2, chipTop + chipHeight)

            labelBgPaint.color = item.color
            canvas.drawRoundRect(chipRect, 4f * density, 4f * density, labelBgPaint)
            canvas.drawText(item.label, chipRect.left + padding, chipRect.bottom - padding / 2, labelPaint)
        }
    }

    companion object {
        private val AMOUNT_COLOR = Color.parseColor("#4D82FF")
        private val CARD_COLOR = Color.parseColor("#35D0A2")
    }
}
