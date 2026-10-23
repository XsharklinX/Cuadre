package com.sharky.finanzas.mlkitocr

import android.app.Activity
import android.content.Intent
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File

@InvokeArg
class RecognizeArgs {
    lateinit var imageBase64: String
}

@TauriPlugin
class MlkitOcrPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun recognizeText(invoke: Invoke) {
        val args = invoke.parseArgs(RecognizeArgs::class.java)

        val bytes = try {
            Base64.decode(args.imageBase64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            invoke.reject("Imagen en base64 inválida")
            return
        }

        val bitmap = decodeSampled(bytes)
        if (bitmap == null) {
            invoke.reject("No se pudo decodificar la imagen")
            return
        }

        val image = InputImage.fromBitmap(bitmap, 0)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
            .addOnSuccessListener { visionText ->
                val ret = JSObject()
                ret.put("text", visionText.text)
                ret.put("imageWidth", bitmap.width)
                ret.put("imageHeight", bitmap.height)
                ret.put("blocks", blocksToJson(visionText.textBlocks))
                invoke.resolve(ret)
            }
            .addOnFailureListener { e ->
                invoke.reject(e.message ?: "Error al reconocer el texto")
            }
    }

    /**
     * Decodifica la foto SIN cargarla entera en memoria.
     *
     * El camino normal ya llega reducido: `receiptOcr.ts` encoge a 1600 px
     * antes de enviar. Pero su propio comentario avisa de que, si esa
     * reducción falla, el llamador manda LA IMAGEN ORIGINAL — y la foto de un
     * móvil de 12 MP ocupa unos 48 MB como ARGB_8888. En un teléfono modesto
     * eso es el proceso muerto por falta de memoria justo cuando el usuario
     * fotografía un recibo.
     *
     * Primero se leen las dimensiones sin reservar píxeles
     * (`inJustDecodeBounds`), y solo después se decodifica con el factor de
     * reducción que haga falta. El tope de 2048 va POR ENCIMA de los 1600 de
     * JS a propósito: así el camino normal entra sin reducirse otra vez y la
     * calidad del OCR no cambia; esto solo actúa en el caso de respaldo.
     */
    private fun decodeSampled(bytes: ByteArray, maxDim: Int = 2048): android.graphics.Bitmap? {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)

        var sample = 1
        val mayor = maxOf(bounds.outWidth, bounds.outHeight)
        // Potencias de dos: es lo que BitmapFactory redondea internamente, así
        // que pedir otra cosa daría un tamaño distinto del esperado.
        while (mayor / sample > maxDim) sample *= 2

        val options = BitmapFactory.Options().apply { inSampleSize = sample }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
    }

    // Lanza la pantalla de cámara nativa (Fase 1 del roadmap) en vez del
    // `<input capture>` del WebView — permite preview fluido, flash y
    // tap-to-focus, y deja el terreno listo para el OCR en vivo (Fase 2-3).
    @Command
    fun openScanner(invoke: Invoke) {
        val intent = Intent(activity, ScannerActivity::class.java)
        startActivityForResult(invoke, intent, "onScannerResult")
    }

    @ActivityCallback
    fun onScannerResult(invoke: Invoke, result: ActivityResult) {
        val data = result.data
        val path = data?.getStringExtra("photoPath")
        if (result.resultCode != Activity.RESULT_OK || path == null) {
            invoke.resolve(JSObject().put("cancelled", true))
            return
        }

        val file = File(path)
        try {
            val bytes = file.readBytes()
            val ret = JSObject()
            ret.put("cancelled", false)
            ret.put("photoBase64", Base64.encodeToString(bytes, Base64.NO_WRAP))
            // Fase 4: extracción hecha en la propia cámara (monto/fecha/tarjeta/
            // comercio) sobre el último frame analizado — evita que el JS tenga
            // que correr OCR otra vez sobre la foto ya capturada.
            if (data.hasExtra("amount")) ret.put("amount", data.getDoubleExtra("amount", 0.0))
            data.getStringExtra("date")?.let { ret.put("date", it) }
            data.getStringExtra("cardLast4")?.let { ret.put("cardLast4", it) }
            data.getStringExtra("merchant")?.let { ret.put("merchant", it) }
            invoke.resolve(ret)
        } catch (e: Exception) {
            invoke.reject(e.message ?: "No se pudo leer la foto capturada")
        } finally {
            file.delete()
        }
    }

    // ML Kit calcula una caja delimitadora por bloque (y por línea/palabra) pero
    // el JS solo veía `text` — se descartaba. Se expone aquí para que la Fase 3
    // (recuadro azul en vivo sobre el monto) pueda dibujar sobre el bloque
    // correcto sin volver a correr OCR. `boundingBox` puede ser null si ML Kit no
    // logra calcularla para ese bloque (raro, pero documentado en su API).
    private fun blocksToJson(blocks: List<Text.TextBlock>): JSArray {
        val out = JSArray()
        for (block in blocks) {
            val obj = JSObject()
            obj.put("text", block.text)
            val box = block.boundingBox
            if (box != null) {
                val rect = JSObject()
                rect.put("left", box.left)
                rect.put("top", box.top)
                rect.put("right", box.right)
                rect.put("bottom", box.bottom)
                obj.put("boundingBox", rect)
            }
            out.put(obj)
        }
        return out
    }
}
