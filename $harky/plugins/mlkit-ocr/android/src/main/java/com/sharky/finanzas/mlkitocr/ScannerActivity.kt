package com.sharky.finanzas.mlkitocr

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import android.util.Size
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

private const val TAG = "ScannerActivity"
private const val CAMERA_PERMISSION_REQUEST = 4821
// Techo de fps para el OCR por frame (Fase 2): ML Kit en un frame de cámara
// suele tardar bastante menos que esto en gama media, pero limitarlo evita
// que un dispositivo rápido sature el hilo de análisis y la batería sin
// necesidad — el ojo no distingue 9fps de 30fps para este propósito.
private const val ANALYSIS_MIN_INTERVAL_MS = 110L
// Fase 4: cuánto tiempo debe verse el MISMO monto detectado, sin cambiar,
// antes de disparar la auto-captura ("~0.6s" del roadmap).
private const val STABILITY_MS = 600L

// Fase 5: región de interés central — se ignoran las cajas cuyo centro cae en
// el 15% más externo del frame por cada lado. Es un filtro lógico sobre las
// cajas que ya calculó ML Kit (barato), no un recorte de píxeles antes del
// OCR (más rápido de implementar, mismo objetivo: no distraerse con un
// recibo vecino o texto de fondo fuera de donde el usuario está apuntando).
private const val ROI_MARGIN = 0.15f
// Resolución objetivo del análisis en vivo — no la de la foto final. Gama
// baja gana más de esto que del throttling de fps: menos píxeles por frame.
private val ANALYSIS_TARGET_RESOLUTION = Size(960, 720)
// Si ML Kit falla tantas veces seguidas, algo estructural anda mal (Play
// Services desactualizado/ausente) — mejor rendirse limpio y dejar que JS
// caiga al `<input capture>` de siempre que seguir intentando en silencio.
private const val MAX_CONSECUTIVE_FAILURES = 8
// Si no se detectó ningún monto en este tiempo desde que se abrió la cámara,
// se sugiere el botón manual — nunca deja al usuario sin salida.
private const val NO_DETECTION_HINT_MS = 6000L

// Mismo criterio que `receiptOcr.ts` (extractAmount/extractCardLast4) — se
// duplica aquí a propósito (Fase 3 del roadmap) porque este regex corre por
// LÍNEA sobre cada frame en Kotlin, no sobre el texto completo en JS después
// de la foto; si se toca uno hay que revisar el otro.
private val AMOUNT_RE = Regex("""\d{1,3}(?:[.,]\d{3})*[.,]\d{2}""")
private val TOTAL_KEYWORDS_RE = Regex("""total|monto|importe|pagar|pago""", RegexOption.IGNORE_CASE)
private val CARD_LAST4_RE = Regex(
    """(?:tarjeta|card|cuenta|account)?[^\d]{0,20}?termin(?:a|ada|ó|o)\s+en\s+(\d{4})\b|\*{2,}[\s*]*(\d{4})\b|(?:xx|••|\.{2,})(\d{4})\b|\btarjeta\s+(?:\w+\s+)?(\d{4})\b""",
    RegexOption.IGNORE_CASE,
)
// Fase 4: mismo criterio que `receiptOcr.ts` (extractDate/extractMerchant),
// pero sobre el TEXTO COMPLETO del último frame estable — a diferencia de las
// regex de arriba, que corren por línea para ubicar la caja del recuadro azul.
private val DATE_RE_YMD = Regex("""\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b""")
private val DATE_RE_DMY = Regex("""\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b""")
private val NON_MERCHANT_LINE_RE = Regex(
    """^\s*(recibo|receipt|factura|invoice|ticket|comprobante|original|copia|copy|no\.?\s*\d|fecha|date|hora|time)\b""",
    RegexOption.IGNORE_CASE,
)

private data class Extraction(val amount: Double?, val date: String?, val cardLast4: String?, val merchant: String?)

/**
 * Cámara en vivo para escanear recibos.
 * - Fase 1: preview fluido, flash, tap-to-focus, captura.
 * - Fase 2: OCR en vivo por frame vía `ImageAnalysis` + ML Kit, throttleado.
 * - Fase 3: recuadro azul sobre el monto detectado (y uno verde sobre la
 *   tarjeta, si aparece), dibujado por `overlayView` en tiempo real.
 * - Fase 4: cuando el monto detectado se mantiene estable ~0.6s, vibra y
 *   captura sola — sin tocar el botón. Cualquier captura (automática o
 *   manual) corre la extracción completa (monto, fecha, tarjeta, comercio)
 *   sobre el texto del último frame analizado y la devuelve junto a la foto,
 *   para que React no tenga que volver a hacer OCR.
 * - Fase 5 (actual): región de interés central, resolución de análisis más
 *   baja para no quemar batería en gama baja, se rinde limpio (cierra la
 *   pantalla y JS cae al `<input capture>`) si ML Kit falla repetido, y
 *   sugiere el botón manual si no detecta nada en unos segundos.
 * Devuelve la foto final ya comprimida guardada en un archivo del caché de la
 * app — NUNCA los bytes por el Intent de resultado, porque cruzan el límite
 * de tamaño del Binder (~1MB) y una foto de cámara lo supera fácilmente. El
 * plugin (`onScannerResult`) lee ese archivo, lo pasa a base64 para el puente
 * JS (que no tiene ese límite) y lo borra.
 */
class ScannerActivity : AppCompatActivity() {
    private lateinit var previewView: PreviewView
    private lateinit var permissionMessage: TextView
    private lateinit var topBar: FrameLayout
    private lateinit var bottomBar: FrameLayout
    private lateinit var closeButton: ImageButton
    private lateinit var flashButton: ImageButton
    private lateinit var captureButton: ImageButton
    private lateinit var captureProgress: ProgressBar
    private lateinit var overlayView: ScannerOverlayView
    private lateinit var manualHintLabel: TextView

    private var camera: Camera? = null
    private var imageCapture: ImageCapture? = null
    private var torchOn = false
    private lateinit var cameraExecutor: ExecutorService
    private lateinit var analysisExecutor: ExecutorService
    private val textRecognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    // Evita que dos frames se analicen a la vez: si ML Kit todavía está
    // procesando el anterior, el frame nuevo simplemente se descarta (junto
    // con STRATEGY_KEEP_ONLY_LATEST de ImageAnalysis, que ya se queda solo
    // con el frame más reciente cuando el consumidor va lento).
    private val analyzing = AtomicBoolean(false)
    private var lastAnalysisAt = 0L

    // Fase 4: estabilidad del monto para la auto-captura, y snapshot del
    // último texto reconocido — se usa como fuente de la extracción completa
    // al capturar (manual o automática), sin volver a correr OCR.
    private var lastRecognizedText: Text? = null
    private var stableAmountText: String? = null
    private var stableSince = 0L
    private var autoCaptureTriggered = false

    // Fase 5: cuenta fallos consecutivos de ML Kit (para rendirse limpio) y
    // recuerda si YA se detectó algún monto (para el aviso de botón manual).
    private var consecutiveFailures = 0
    private var everDetectedAmount = false
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_scanner)
        cameraExecutor = Executors.newSingleThreadExecutor()
        analysisExecutor = Executors.newSingleThreadExecutor()

        previewView = findViewById(R.id.previewView)
        permissionMessage = findViewById(R.id.permissionMessage)
        topBar = findViewById(R.id.topBar)
        bottomBar = findViewById(R.id.bottomBar)
        closeButton = findViewById(R.id.closeButton)
        flashButton = findViewById(R.id.flashButton)
        captureButton = findViewById(R.id.captureButton)
        captureProgress = findViewById(R.id.captureProgress)
        overlayView = findViewById(R.id.overlayView)
        manualHintLabel = findViewById(R.id.manualHintLabel)

        applyEdgeToEdgeInsets()

        closeButton.setOnClickListener { finishCancelled() }
        flashButton.setOnClickListener { toggleTorch() }
        captureButton.setOnClickListener { capturePhoto() }
        previewView.setOnTouchListener { _, event -> handleTapToFocus(event) }

        mainHandler.postDelayed({ if (!everDetectedAmount) showManualHint() }, NO_DETECTION_HINT_MS)

        if (hasCameraPermission()) {
            startCamera()
        } else {
            requestCameraPermission()
        }
    }

    private fun showManualHint() {
        manualHintLabel.text = "¿No se ve el monto? Toca el botón para tomar la foto"
        manualHintLabel.visibility = View.VISIBLE
    }

    // Los botones flotan sobre el preview a pantalla completa — sin este ajuste
    // quedan debajo de la barra de estado/gestos en la mayoría de teléfonos.
    private fun applyEdgeToEdgeInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(topBar) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(top = bars.top + view.paddingLeft)
            insets
        }
        ViewCompat.setOnApplyWindowInsetsListener(bottomBar) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.updatePadding(bottom = bars.bottom + view.paddingLeft)
            insets
        }
    }

    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermission() {
        requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != CAMERA_PERMISSION_REQUEST) return
        if (grantResults.firstOrNull() == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            showPermissionDenied()
        }
    }

    private fun showPermissionDenied() {
        mainHandler.removeCallbacksAndMessages(null)
        previewView.visibility = View.GONE
        captureButton.visibility = View.GONE
        flashButton.visibility = View.GONE
        manualHintLabel.visibility = View.GONE
        permissionMessage.visibility = View.VISIBLE
        permissionMessage.text = "\$harky necesita acceso a la cámara para escanear el recibo. Puedes concederlo en Ajustes del sistema."
    }

    @OptIn(ExperimentalGetImage::class)
    private fun startCamera() {
        val providerFuture = ProcessCameraProvider.getInstance(this)
        providerFuture.addListener({
            try {
                val provider = providerFuture.get()
                val preview = Preview.Builder().build().also {
                    it.setSurfaceProvider(previewView.surfaceProvider)
                }
                val capture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()
                imageCapture = capture

                // Fase 5: resolución más baja SOLO para el análisis en vivo (la
                // foto final sigue capturándose a resolución completa vía
                // `capture` arriba) — menos píxeles por frame es lo que más
                // ayuda en gama baja, más que el throttling de fps por sí solo.
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .setResolutionSelector(
                        ResolutionSelector.Builder()
                            .setResolutionStrategy(
                                ResolutionStrategy(ANALYSIS_TARGET_RESOLUTION, ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER),
                            )
                            .build(),
                    )
                    .build()
                analysis.setAnalyzer(analysisExecutor) { proxy -> analyzeFrame(proxy) }

                provider.unbindAll()
                camera = provider.bindToLifecycle(
                    this,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    capture,
                    analysis,
                )
            } catch (e: Exception) {
                Log.e(TAG, "No se pudo iniciar la cámara", e)
                finishCancelled()
            }
        }, ContextCompat.getMainExecutor(this))
    }

    private fun toggleTorch() {
        val cam = camera ?: return
        if (cam.cameraInfo.hasFlashUnit()) {
            torchOn = !torchOn
            cam.cameraControl.enableTorch(torchOn)
            flashButton.imageTintList = android.content.res.ColorStateList.valueOf(
                if (torchOn) 0xFFFFDD3D.toInt() else 0xFFFFFFFF.toInt(),
            )
        }
    }

    private fun handleTapToFocus(event: MotionEvent): Boolean {
        if (event.action != MotionEvent.ACTION_UP) return true
        val cam = camera ?: return true
        val factory = previewView.meteringPointFactory
        val point = factory.createPoint(event.x, event.y)
        val action = FocusMeteringAction.Builder(point).build()
        cam.cameraControl.startFocusAndMetering(action)
        return true
    }

    // Corre en `analysisExecutor` (hilo de fondo), un frame a la vez. Cada
    // ImageProxy DEBE cerrarse siempre (éxito, error o frame saltado) o
    // CameraX deja de entregar frames nuevos — de ahí el try/finally y el
    // addOnCompleteListener en vez de success/failure por separado.
    @ExperimentalGetImage
    private fun analyzeFrame(proxy: ImageProxy) {
        // El chequeo de intervalo va ANTES del CAS a propósito: si fuera al
        // revés, un frame descartado por llegar demasiado pronto dejaría
        // `analyzing` en `true` para siempre (nadie lo resetearía), y el
        // análisis se congelaría en el primer frame throttleado.
        val now = System.currentTimeMillis()
        if (now - lastAnalysisAt < ANALYSIS_MIN_INTERVAL_MS) {
            proxy.close()
            return
        }
        if (!analyzing.compareAndSet(false, true)) {
            proxy.close()
            return
        }
        lastAnalysisAt = now

        val mediaImage = proxy.image
        if (mediaImage == null) {
            analyzing.set(false)
            proxy.close()
            return
        }

        // Se capturan ANTES de despachar el análisis async — el ImageProxy se
        // cierra en cuanto termine el listener y no hay garantía de que
        // `mediaImage` siga vivo si se leyeran dentro del callback.
        val imageWidth = mediaImage.width
        val imageHeight = mediaImage.height
        val rotationDegrees = proxy.imageInfo.rotationDegrees

        val input = InputImage.fromMediaImage(mediaImage, rotationDegrees)
        textRecognizer.process(input)
            .addOnSuccessListener { text ->
                consecutiveFailures = 0
                onFrameTextRecognized(text, imageWidth, imageHeight, rotationDegrees)
            }
            .addOnFailureListener { e ->
                Log.w(TAG, "OCR de frame falló (se ignora, sigue con el siguiente)", e)
                // Fase 5: unos pocos fallos sueltos son normales (frame movido,
                // luz cambiando). Muchos SEGUIDOS suelen significar que algo
                // estructural falla (Play Services desactualizado o ausente) —
                // mejor rendirse limpio que reintentar en silencio para siempre.
                consecutiveFailures++
                if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                    Log.w(TAG, "Demasiados fallos de OCR seguidos, se cae al flujo de foto normal")
                    runOnUiThread { finishCancelled() }
                }
            }
            .addOnCompleteListener {
                analyzing.set(false)
                proxy.close()
            }
    }

    // Fase 3: busca el monto (prioriza líneas con "TOTAL"/"MONTO"/etc, igual
    // que `receiptOcr.ts`) y los últimos 4 dígitos de tarjeta, línea por línea
    // — la línea (no el bloque completo) da una caja más ajustada al número.
    // Fase 5: solo cuenta lo que cae en la región central del frame.
    private fun onFrameTextRecognized(text: Text, imageWidth: Int, imageHeight: Int, rotationDegrees: Int) {
        val (amount, card) = findDetections(text, imageWidth, imageHeight)
        lastRecognizedText = text
        if (amount != null && !everDetectedAmount) {
            everDetectedAmount = true
            runOnUiThread { manualHintLabel.visibility = View.GONE }
        }
        updateStability(amount?.label)
        runOnUiThread { overlayView.update(imageWidth, imageHeight, rotationDegrees, amount, card) }
    }

    // Fase 4: corre en el hilo de análisis (serializado por `analyzing`, sin
    // carrera posible). Si el mismo texto de monto se repite ~0.6s seguidos,
    // dispara la auto-captura UNA sola vez (guardada por `autoCaptureTriggered`
    // — la actividad se cierra al capturar, así que no hace falta resetearla).
    private fun updateStability(amountText: String?) {
        if (amountText == null) {
            stableAmountText = null
            return
        }
        if (amountText == stableAmountText) {
            if (!autoCaptureTriggered && System.currentTimeMillis() - stableSince >= STABILITY_MS) {
                autoCaptureTriggered = true
                runOnUiThread { triggerAutoCapture() }
            }
        } else {
            stableAmountText = amountText
            stableSince = System.currentTimeMillis()
        }
    }

    private fun triggerAutoCapture() {
        vibrate()
        capturePhoto()
    }

    private fun vibrate() {
        val vibrator = getVibrator() ?: return
        if (!vibrator.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(80)
        }
    }

    private fun getVibrator(): Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    private fun findDetections(text: Text, imageWidth: Int, imageHeight: Int): Pair<DetectedBox?, DetectedBox?> {
        var bestAmount: DetectedBox? = null
        var bestAmountValue = -1.0
        var bestTotalAmount: DetectedBox? = null
        var bestTotalValue = -1.0
        var card: DetectedBox? = null

        for (block in text.textBlocks) {
            for (line in block.lines) {
                val box = line.boundingBox ?: continue
                if (!isInCentralRegion(box, imageWidth, imageHeight)) continue
                val lineText = line.text
                val isTotalLine = TOTAL_KEYWORDS_RE.containsMatchIn(lineText)

                for (match in AMOUNT_RE.findAll(lineText)) {
                    val value = parseAmount(match.value)
                    if (value <= 0) continue
                    if (isTotalLine && value > bestTotalValue) {
                        bestTotalValue = value
                        bestTotalAmount = DetectedBox(box, match.value)
                    }
                    if (value > bestAmountValue) {
                        bestAmountValue = value
                        bestAmount = DetectedBox(box, match.value)
                    }
                }

                if (card == null) {
                    val cardMatch = CARD_LAST4_RE.find(lineText)
                    val last4 = cardMatch?.groupValues?.drop(1)?.firstOrNull { it.isNotEmpty() }
                    if (last4 != null) card = DetectedBox(box, last4)
                }
            }
        }
        return (bestTotalAmount ?: bestAmount) to card
    }

    // Fase 5: ¿el centro de esta caja cae dentro del 70% central del frame?
    // Filtro lógico sobre cajas que ML Kit ya calculó — evita distraerse con
    // un recibo vecino o texto de fondo fuera de donde el usuario apunta, sin
    // el costo/riesgo de recortar píxeles antes de correr el OCR.
    private fun isInCentralRegion(box: Rect, imageWidth: Int, imageHeight: Int): Boolean {
        val marginX = imageWidth * ROI_MARGIN
        val marginY = imageHeight * ROI_MARGIN
        val centerX = (box.left + box.right) / 2f
        val centerY = (box.top + box.bottom) / 2f
        return centerX in marginX..(imageWidth - marginX) && centerY in marginY..(imageHeight - marginY)
    }

    private fun parseAmount(raw: String): Double {
        val cleaned = raw.filter { it.isDigit() || it == '.' || it == ',' }
        val lastComma = cleaned.lastIndexOf(',')
        val lastDot = cleaned.lastIndexOf('.')
        val normalized = when {
            lastComma > lastDot -> cleaned.replace(".", "").replace(',', '.')
            lastDot > lastComma -> cleaned.replace(",", "")
            else -> cleaned
        }
        return normalized.toDoubleOrNull() ?: -1.0
    }

    private fun capturePhoto() {
        // Guarda contra doble disparo: la auto-captura (hilo de análisis, vía
        // runOnUiThread) y un toque manual casi simultáneo podrían llamar aquí
        // dos veces antes de que `isEnabled = false` surta efecto visualmente.
        if (!captureButton.isEnabled) return
        val capture = imageCapture ?: return
        captureButton.isEnabled = false
        captureProgress.visibility = View.VISIBLE

        // Snapshot de la extracción en el momento del disparo (Fase 4): usa el
        // texto del último frame analizado en vez de volver a correr OCR sobre
        // la foto final — más simple, y ya demostró ser confiable (fue justo
        // lo que disparó la auto-captura, o lo que el usuario ve al tocar).
        val extraction = lastRecognizedText?.let { extractFields(it.text) }

        val outputFile = File(cacheDir, "scan_${System.currentTimeMillis()}.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(outputFile).build()

        capture.takePicture(
            options,
            cameraExecutor,
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(output: ImageCapture.OutputFileResults) {
                    val finalPath = downscaleInPlace(outputFile)
                    runOnUiThread { finishWithPhoto(finalPath, extraction) }
                }

                override fun onError(exception: ImageCaptureException) {
                    Log.e(TAG, "Error al capturar la foto", exception)
                    runOnUiThread {
                        captureButton.isEnabled = true
                        captureProgress.visibility = View.GONE
                    }
                }
            },
        )
    }

    private fun extractFields(text: String): Extraction = Extraction(
        amount = extractAmount(text),
        date = extractDate(text),
        cardLast4 = extractCardLast4(text),
        merchant = extractMerchant(text),
    )

    private fun extractAmount(text: String): Double? {
        var best: Double? = null
        var bestFromTotalLine: Double? = null
        for (line in text.lines()) {
            val isTotalLine = TOTAL_KEYWORDS_RE.containsMatchIn(line)
            for (match in AMOUNT_RE.findAll(line)) {
                val value = parseAmount(match.value)
                if (value <= 0) continue
                if (isTotalLine && (bestFromTotalLine == null || value > bestFromTotalLine!!)) bestFromTotalLine = value
                if (best == null || value > best!!) best = value
            }
        }
        return bestFromTotalLine ?: best
    }

    private fun extractCardLast4(text: String): String? {
        val match = CARD_LAST4_RE.find(text) ?: return null
        return match.groupValues.drop(1).firstOrNull { it.isNotEmpty() }
    }

    private fun pad(n: Int) = n.toString().padStart(2, '0')

    private fun extractDate(text: String): String? {
        val ymd = DATE_RE_YMD.find(text)
        if (ymd != null) {
            val (y, m, d) = ymd.destructured
            if (m.toInt() <= 12 && d.toInt() <= 31) return "$y-${pad(m.toInt())}-${pad(d.toInt())}"
        }
        val dmy = DATE_RE_DMY.find(text)
        if (dmy != null) {
            val (d, m, yRaw) = dmy.destructured
            val y = if (yRaw.length == 2) "20$yRaw" else yRaw
            val dn = d.toInt()
            val mn = m.toInt()
            if (mn <= 12 && dn <= 31) return "$y-${pad(mn)}-${pad(dn)}"
            if (dn <= 12 && mn <= 31) return "$y-${pad(dn)}-${pad(mn)}"
        }
        return null
    }

    private fun extractMerchant(text: String): String? {
        for (raw in text.lines()) {
            val line = raw.trim()
            if (line.length < 3) continue
            if (NON_MERCHANT_LINE_RE.containsMatchIn(line)) continue
            val digitRatio = line.count { it.isDigit() }.toFloat() / line.length
            if (digitRatio > 0.4f) continue
            return if (line.length > 40) line.substring(0, 40).trim() else line
        }
        return null
    }

    // Misma razón que el downscale que ya hace el lado JS para las fotos de
    // galería: acelera el OCR y evita mandar varios MB por el puente — aquí
    // además evita acercarse al límite del Binder si algún día se decide
    // devolver bytes en vez de un path.
    private fun downscaleInPlace(file: File, maxDim: Int = 1600): String {
        try {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            BitmapFactory.decodeFile(file.absolutePath, bounds)
            val scale = maxOf(1, maxOf(bounds.outWidth, bounds.outHeight) / maxDim)
            val opts = BitmapFactory.Options().apply { inSampleSize = scale }
            val bitmap = BitmapFactory.decodeFile(file.absolutePath, opts) ?: return file.absolutePath
            val resized = if (maxOf(bitmap.width, bitmap.height) > maxDim) {
                val ratio = maxDim.toFloat() / maxOf(bitmap.width, bitmap.height)
                Bitmap.createScaledBitmap(bitmap, (bitmap.width * ratio).toInt(), (bitmap.height * ratio).toInt(), true)
            } else bitmap
            FileOutputStream(file).use { out -> resized.compress(Bitmap.CompressFormat.JPEG, 85, out) }
        } catch (e: Exception) {
            Log.e(TAG, "No se pudo reducir la foto, se usa la original", e)
        }
        return file.absolutePath
    }

    private fun finishWithPhoto(path: String, extraction: Extraction?) {
        val intent = android.content.Intent()
        intent.putExtra("photoPath", path)
        extraction?.amount?.let { intent.putExtra("amount", it) }
        extraction?.date?.let { intent.putExtra("date", it) }
        extraction?.cardLast4?.let { intent.putExtra("cardLast4", it) }
        extraction?.merchant?.let { intent.putExtra("merchant", it) }
        setResult(RESULT_OK, intent)
        finish()
    }

    private fun finishCancelled() {
        setResult(RESULT_CANCELED)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        mainHandler.removeCallbacksAndMessages(null)
        cameraExecutor.shutdown()
        analysisExecutor.shutdown()
        textRecognizer.close()
    }
}
