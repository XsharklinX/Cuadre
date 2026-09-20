package com.sharky.finanzas.localreminders

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.net.Uri
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

private const val PREFS_NAME = "sharky_local_reminders"
private const val NOTIFIED_KEY = "notified_ids"
private const val MAX_NOTIFIED = 300
private const val HISTORY_FILE = "notification_history.json"
private const val MAX_HISTORY = 100
/**
 * IDs de canal en v2.
 *
 * Android IGNORA un cambio de importancia sobre un canal que ya existe: una
 * vez creado, solo el usuario puede bajarlo o subirlo desde Ajustes. Como la
 * correccion de esta version es justamente reasignar importancias, los canales
 * viejos (todos en DEFAULT) tienen que quedar atras y crearse unos nuevos. Los
 * antiguos se borran en `ensureChannels` para no dejar duplicados en la lista
 * de notificaciones del sistema.
 */
private const val CHANNEL_BUDGET = "sharky_budget_alerts_v2"
private const val CHANNEL_RECURRING = "sharky_payment_reminders_v2"
private const val CHANNEL_ACTIVITY = "sharky_activity_reminders_v2"
private const val CHANNEL_LOWFUNDS = "sharky_lowfunds_alerts_v2"
private const val CHANNEL_GOALS = "sharky_goal_reminders_v2"
private const val CHANNEL_WEEKLY = "sharky_weekly_summary_v2"
private const val CHANNEL_FX = "sharky_fx_alerts_v2"
private const val CHANNEL_ANOMALY = "sharky_anomaly_alerts_v2"

/** Canales de la v1, borrados al arrancar para no duplicar la lista. */
private val LEGACY_CHANNELS = listOf(
    "sharky_budget_alerts", "sharky_payment_reminders", "sharky_activity_reminders",
    "sharky_lowfunds_alerts", "sharky_goal_reminders", "sharky_weekly_summary",
    "sharky_fx_alerts", "sharky_anomaly_alerts",
)
private const val DUE_SOON_DAYS = 3
private const val EVENING_HOUR = 19
private const val INACTIVITY_DAYS = 3
// Acento de $harky: mismo azul del punto en el ícono de la app (public/icon.svg),
// para que todas las notificaciones se tiñan igual sin importar qué las genera.
private val ACCENT_COLOR = 0xFF4D82FF.toInt()
/** Tamano al que Android dibuja el icono grande de una notificacion. */
private const val LARGE_ICON_DP = 64f

class ReminderWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val file = File(applicationContext.filesDir, SNAPSHOT_FILE)
        if (!file.exists()) return Result.success()

        val snapshot = try { JSONObject(file.readText()) } catch (e: Exception) { return Result.success() }

        ensureChannels()

        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        val todayStr = sdf.format(Date())
        val monthKey = todayStr.substring(0, 7)
        val cal = Calendar.getInstance()
        cal.add(Calendar.DAY_OF_MONTH, DUE_SOON_DAYS)
        val limitStr = sdf.format(cal.time)

        // Textos ya traducidos por el lado JS. Antes estaban escritos en espanol
        // aqui dentro, asi que un usuario en ingles recibia sus notificaciones
        // en espanol. El fallback conserva el texto viejo por si llega un
        // snapshot de una version anterior a este cambio.
        val strings = snapshot.optJSONObject("strings")
        fun s(key: String, fallback: String, vararg pairs: Pair<String, String>): String {
            var out = strings?.optString(key)?.takeIf { it.isNotBlank() } ?: fallback
            for ((k, v) in pairs) out = out.replace("{$k}", v)
            return out
        }

        val dismissed = jsonArrayToSet(snapshot.optJSONArray("dismissedAlerts"))
        val notified = loadNotified()
        var notifiedChanged = false

        val categories = snapshot.optJSONArray("categories") ?: JSONArray()
        for (i in 0 until categories.length()) {
            val cat = categories.getJSONObject(i)
            if (cat.optString("monthKey") != monthKey) continue
            val pct = cat.optInt("pct", 0)
            val threshold = when {
                pct > 100 -> 100
                pct >= 80 -> 80
                else -> null
            } ?: continue

            val catId = cat.optString("id")
            val alertId = "budget:$catId:$monthKey:$threshold"
            if (alertId in dismissed || alertId in notified) continue

            val name = cat.optString("name")
            val spentLabel = cat.optString("spentLabel")
            val budgetLabel = cat.optString("budgetLabel")
            val (title, text) = if (threshold == 100) {
                s("budgetOverTitle", "Te pasaste en {name}", "name" to name) to
                    s("budgetOverText", "Llevas {spent} de {budget} ({pct}%).",
                        "spent" to spentLabel, "budget" to budgetLabel, "pct" to pct.toString())
            } else {
                s("budgetNearTitle", "{name} va en {pct}%", "name" to name, "pct" to pct.toString()) to
                    s("budgetNearText", "Llevas {spent} de {budget} este mes.",
                        "spent" to spentLabel, "budget" to budgetLabel)
            }
            notify(CHANNEL_BUDGET, alertId, title, text, "budget")
            notified.add(alertId)
            notifiedChanged = true
        }

        val recurring = snapshot.optJSONArray("recurring") ?: JSONArray()
        for (i in 0 until recurring.length()) {
            val item = recurring.getJSONObject(i)
            val next = item.optString("nextDate")
            if (next.isEmpty() || next < todayStr || next > limitStr) continue
            val recurringEnd = item.optString("recurringEnd", "")
            if (recurringEnd.isNotEmpty() && next > recurringEnd) continue

            val alertId = "recurring:${item.optString("id")}:$next"
            if (alertId in dismissed || alertId in notified) continue

            val whenLabel = if (next == todayStr) s("today", "hoy") else item.optString("dateLabel")
            val note = item.optString("note").ifBlank { "—" }
            val amountLabel = item.optString("amountLabel")
            val title = if (next == todayStr)
                s("recurringTodayTitle", "Hoy se cobra {note}", "note" to note)
            else
                s("recurringSoonTitle", "Se acerca: {note}", "note" to note)
            val text = s("recurringText", "{amount} · vence {when}. Ten el saldo listo.",
                "amount" to amountLabel, "when" to whenLabel)

            notify(CHANNEL_RECURRING, alertId, title, text, "recurring")
            notified.add(alertId)
            notifiedChanged = true

            if (item.optBoolean("lowFunds", false)) {
                val lowFundsId = "lowfunds:${item.optString("id")}:$next"
                if (lowFundsId !in dismissed && lowFundsId !in notified) {
                    val accountName = item.optString("accountName").ifBlank { "tu cuenta" }
                    val lfTitle = s("lowFundsTitle", "Saldo bajo para {note}", "note" to note)
                    val lfText = s("lowFundsText", "{account} no alcanza para {amount} (vence {when}).",
                        "account" to accountName, "amount" to amountLabel, "when" to whenLabel)
                    notify(CHANNEL_LOWFUNDS, lowFundsId, lfTitle, lfText, "lowfunds")
                    notified.add(lowFundsId)
                    notifiedChanged = true
                }
            }
        }

        // Metas con aporte automático: aviso el día en que toca aportar.
        val goals = snapshot.optJSONArray("goals") ?: JSONArray()
        for (i in 0 until goals.length()) {
            val goal = goals.getJSONObject(i)
            val next = goal.optString("nextDate")
            // Vencido o justo hoy (aún no se ha aportado): un solo aviso por fecha.
            if (next.isEmpty() || next > todayStr) continue

            val alertId = "goalcharge:${goal.optString("id")}:$next"
            if (alertId in dismissed || alertId in notified) continue

            val name = goal.optString("name").ifBlank { "tu meta" }
            val amountLabel = goal.optString("amountLabel")
            notify(
                CHANNEL_GOALS, alertId,
                s("goalTitle", "Hora de ahorrar"),
                s("goalText", "Aporta {amount} a \"{name}\".", "amount" to amountLabel, "name" to name),
                "goal",
            )
            notified.add(alertId)
            notifiedChanged = true
        }

        // Resumen semanal: los domingos por la tarde/noche.
        val nowCal = Calendar.getInstance()
        if (nowCal.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY && nowCal.get(Calendar.HOUR_OF_DAY) >= EVENING_HOUR) {
            val weekly = snapshot.optJSONObject("weekly")
            val alertId = "weekly:$todayStr"
            if (weekly != null && alertId !in dismissed && alertId !in notified) {
                val expense = weekly.optString("expenseLabel")
                val income = weekly.optString("incomeLabel")
                val topCat = weekly.optString("topCategory")
                val topLabel = weekly.optString("topCategoryLabel")
                val text = buildString {
                    append("Gastaste $expense e ingresaste $income")
                    if (topCat.isNotBlank()) append(". Lo que más pesó: $topCat ($topLabel)")
                    append(". Toca para ver el detalle.")
                }
                notify(CHANNEL_WEEKLY, alertId, s("weeklyTitle", "Tu semana en Sharky"), text, "weekly")
                notified.add(alertId)
                notifiedChanged = true
            }
        }

        // Alerta de tasa de cambio: la condición (umbral cruzado) ya viene
        // evaluada del lado de la app; el worker solo dispara el aviso, como
        // mucho una vez por día mientras se mantenga.
        val fx = snapshot.optJSONObject("fx")
        if (fx != null) {
            val alertId = "fxalert:${fx.optString("currency")}:$todayStr"
            if (alertId !in dismissed && alertId !in notified) {
                val flag = fx.optString("currencyFlag")
                val currencyCode = fx.optString("currency")
                val rateLabel = fx.optString("rateLabel")
                val verb = if (fx.optString("direction") == "above") "subió sobre" else "bajó de"
                notify(CHANNEL_FX, alertId, "$flag El $currencyCode $verb tu límite", "1 $currencyCode = $rateLabel ahora mismo. Buen momento para revisar.", "fx")
                notified.add(alertId)
                notifiedChanged = true
            }
        }

        // Gasto inusual: se evalúa del lado de la app (con la sensibilidad
        // elegida por el usuario); el worker solo dispara un aviso por
        // transacción, deduplicado por su id.
        val anomalies = snapshot.optJSONArray("anomalies") ?: JSONArray()
        for (i in 0 until anomalies.length()) {
            val item = anomalies.getJSONObject(i)
            val alertId = "anomaly:${item.optString("txId")}"
            if (alertId in dismissed || alertId in notified) continue

            val note = item.optString("note").ifBlank { "un gasto" }
            val amountLabel = item.optString("amountLabel")
            val baselineLabel = item.optString("baselineLabel")
            notify(
                CHANNEL_ANOMALY, alertId,
                s("anomalyTitle", "Gasto fuera de lo normal"),
                s("anomalyText", "{note}: {amount}, y sueles gastar ~{baseline}.",
                    "note" to note, "amount" to amountLabel, "baseline" to baselineLabel),
                "anomaly",
            )
            notified.add(alertId)
            notifiedChanged = true
        }

        if (Calendar.getInstance().get(Calendar.HOUR_OF_DAY) >= EVENING_HOUR) {
            val alertId = "activity:$todayStr"
            if (alertId !in dismissed && alertId !in notified) {
                val lastTxDate = snapshot.optString("lastTransactionDate", "")
                val daysSince = if (lastTxDate.isEmpty()) null else try {
                    val last = sdf.parse(lastTxDate)
                    val today = sdf.parse(todayStr)
                    if (last != null && today != null) ((today.time - last.time) / (24 * 60 * 60 * 1000)).toInt() else null
                } catch (e: Exception) { null }

                val pair = when {
                    lastTxDate.isEmpty() -> "👋 Empecemos" to "Agrega tu primer movimiento y toma el control de tu dinero."
                    daysSince != null && daysSince >= INACTIVITY_DAYS ->
                        "📝 $daysSince días sin anotar nada" to "Ponte al día en un minuto para no perderle el hilo a tus gastos."
                    daysSince != null && daysSince >= 1 ->
                        "📝 ¿Gastaste algo hoy?" to "Anótalo antes de que se te olvide — toma 10 segundos."
                    else -> null
                }

                if (pair != null) {
                    notify(CHANNEL_ACTIVITY, alertId, pair.first, pair.second, "activity")
                    notified.add(alertId)
                    notifiedChanged = true
                }
            }
        }

        if (notifiedChanged) saveNotified(notified)
        return Result.success()
    }

    private fun jsonArrayToSet(arr: JSONArray?): Set<String> {
        if (arr == null) return emptySet()
        val set = mutableSetOf<String>()
        for (i in 0 until arr.length()) set.add(arr.getString(i))
        return set
    }

    private fun loadNotified(): MutableSet<String> {
        val prefs = applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(NOTIFIED_KEY, null) ?: return mutableSetOf()
        return try {
            val arr = JSONArray(raw)
            (0 until arr.length()).map { arr.getString(it) }.toMutableSet()
        } catch (e: Exception) {
            mutableSetOf()
        }
    }

    private fun saveNotified(set: MutableSet<String>) {
        val trimmed = if (set.size > MAX_NOTIFIED) set.toList().takeLast(MAX_NOTIFIED).toMutableSet() else set
        val arr = JSONArray()
        trimmed.forEach { arr.put(it) }
        applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putString(NOTIFIED_KEY, arr.toString()).apply()
    }

    /**
     * Los ocho canales, cada uno con la importancia que MERECE.
     *
     * Antes los ocho eran IMPORTANCE_DEFAULT: el resumen semanal interrumpia
     * con sonido y banner exactamente igual de fuerte que "te quedaste sin
     * saldo para un pago de manana". Cuando todo grita igual, el usuario
     * aprende a ignorarlo todo — y entonces el aviso que si importaba tampoco
     * se ve.
     *
     * HIGH  = actua hoy o te cuesta dinero.
     * DEFAULT = te conviene saberlo, suena una vez.
     * LOW   = informativo: aparece en la bandeja, sin sonido ni banner.
     */
    private fun ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = applicationContext.getSystemService(NotificationManager::class.java)

        // Los canales v1 se van: si se quedaran, el usuario veria cada canal
        // dos veces en los ajustes de notificaciones del sistema.
        for (old in LEGACY_CHANNELS) {
            try { manager.deleteNotificationChannel(old) } catch (e: Exception) { /* ya no existe */ }
        }

        fun channel(id: String, name: String, importance: Int, description: String? = null) {
            val ch = NotificationChannel(id, name, importance)
            if (description != null) ch.description = description
            // Solo los urgentes vibran. Un resumen semanal que vibra es ruido.
            ch.enableVibration(importance >= NotificationManager.IMPORTANCE_HIGH)
            manager.createNotificationChannel(ch)
        }

        // Cuesta dinero si no actuas hoy.
        channel(CHANNEL_LOWFUNDS, "Fondos insuficientes", NotificationManager.IMPORTANCE_HIGH,
            "Cuando un pago que vence no tiene saldo que lo cubra.")
        channel(CHANNEL_RECURRING, "Pagos recurrentes", NotificationManager.IMPORTANCE_HIGH,
            "Cuando se acerca o vence un pago programado.")

        // Conviene saberlo, suena una vez.
        channel(CHANNEL_BUDGET, "Alertas de presupuesto", NotificationManager.IMPORTANCE_DEFAULT,
            "Cuando una categoria se acerca o pasa su presupuesto.")
        channel(CHANNEL_ANOMALY, "Gastos inusuales", NotificationManager.IMPORTANCE_DEFAULT,
            "Cuando un gasto se sale mucho de tu patron habitual.")

        // Informativo: bandeja, sin sonido ni banner.
        channel(CHANNEL_GOALS, "Aportes de metas", NotificationManager.IMPORTANCE_LOW,
            "Recordatorio suave para aportar a una meta.")
        channel(CHANNEL_WEEKLY, "Resumen semanal", NotificationManager.IMPORTANCE_LOW,
            "Tu resumen de la semana.")
        channel(CHANNEL_FX, "Alertas de tasa de cambio", NotificationManager.IMPORTANCE_LOW,
            "Cuando una divisa cruza el limite que fijaste.")
        // "Vuelve a la app" nunca es urgente. Es el canal que mas molesta y el
        // que menos valor da, asi que entra en lo mas bajo que existe.
        channel(CHANNEL_ACTIVITY, "Recordatorios de actividad", NotificationManager.IMPORTANCE_MIN,
            "Recordatorio de que hace dias que no registras nada.")
    }

    /** Agrupa por canal para que varios avisos no llenen la bandeja por separado. */
    private fun groupOf(channelId: String): String = "sharky.$channelId"

    /**
     * @param type Categoría del aviso ("budget", "weekly", etc.) — viaja como
     *   `sharky://notification/<type>` en el intent, para que al tocar el
     *   aviso la app abra la pantalla correspondiente en vez de quedarse en
     *   Inicio (ver `MainActivity.handleNotificationIntent` +
     *   `take_pending_notification` en Rust + `useNotificationTarget` en JS).
     */
    private fun notify(channelId: String, alertId: String, title: String, text: String, type: String) {
        val deepLinkIntent = Intent(Intent.ACTION_VIEW, Uri.parse("sharky://notification/$type"))
            .setPackage(applicationContext.packageName)
            .apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP }
        val pendingIntent = PendingIntent.getActivity(
            applicationContext, alertId.hashCode(), deepLinkIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        val builder = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(smallIconRes())
            .setColor(ACCENT_COLOR)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            // Agrupados por canal: tres avisos de presupuesto se apilan en uno
            // en vez de ocupar tres filas de la bandeja.
            .setGroup(groupOf(channelId))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            // Los no urgentes no suenan aunque el canal lo permitiera en una
            // instalacion antigua (los canales ya creados no cambian solos).
            .setSilent(channelId != CHANNEL_LOWFUNDS && channelId != CHANNEL_RECURRING)

        appIconBitmap()?.let { builder.setLargeIcon(it) }

        try {
            NotificationManagerCompat.from(applicationContext).notify(alertId.hashCode(), builder.build())
            logHistory(alertId, type, title, text)
        } catch (e: SecurityException) {
            // POST_NOTIFICATIONS no concedido — no se puede notificar.
        }
    }

    /**
     * Registra el aviso en `{filesDir}/notification_history.json` para que el
     * centro de notificaciones en la app (la campanita) pueda mostrarlo —
     * hasta ahora los avisos nativos (semanal, fx, actividad...) se disparaban
     * y desaparecían sin dejar rastro dentro de la app. El lado JS lee este
     * archivo y hace merge por id contra su propio store (no se borra aquí,
     * solo se capa el tamaño).
     */
    private fun logHistory(alertId: String, type: String, title: String, text: String) {
        try {
            val file = File(applicationContext.filesDir, HISTORY_FILE)
            val entries = if (file.exists()) {
                try { JSONArray(file.readText()) } catch (e: Exception) { JSONArray() }
            } else JSONArray()

            val entry = JSONObject().apply {
                put("id", alertId)
                put("type", type)
                put("title", title)
                put("body", text)
                put("createdAt", System.currentTimeMillis())
            }

            val next = JSONArray()
            next.put(entry)
            for (i in 0 until entries.length()) next.put(entries.getJSONObject(i))

            val trimmed = JSONArray()
            for (i in 0 until minOf(next.length(), MAX_HISTORY)) trimmed.put(next.getJSONObject(i))

            file.writeText(trimmed.toString())
        } catch (e: Exception) {
            // Historial best-effort — si falla, el aviso ya se mostró igual.
        }
    }

    /**
     * Icono pequeño (barra de estado): silueta monocroma dedicada. Sin ella,
     * Android aplana el icono de launcher a color en un círculo/cuadro blanco
     * feo. Si por alguna razón el drawable no está, cae al icono de la app.
     */
    private fun smallIconRes(): Int {
        val id = applicationContext.resources.getIdentifier(
            "ic_stat_sharky", "drawable", applicationContext.packageName)
        return if (id != 0) id else applicationContext.applicationInfo.icon
    }

    /** Icono a todo color de la app, para mostrarlo grande a la derecha del aviso. */
    /**
     * Icono grande del aviso, escalado al tamano que Android realmente usa.
     *
     * Antes se cargaba a resolucion completa: en un telefono xxxhdpi el icono
     * de la app puede ser 432x432 y se retenia entero en memoria por cada
     * notificacion, para dibujarse a ~64dp. Ahora se rasteriza directamente al
     * tamano de destino, que es la version de `inSampleSize` que aplica cuando
     * la fuente es un drawable y no un archivo.
     */
    private fun appIconBitmap(): Bitmap? = try {
        val density = applicationContext.resources.displayMetrics.density
        val target = (LARGE_ICON_DP * density).toInt().coerceAtLeast(1)
        val drawable = applicationContext.packageManager
            .getApplicationIcon(applicationContext.packageName)

        val source = (drawable as? BitmapDrawable)?.bitmap
        if (source != null && (source.width > target || source.height > target)) {
            Bitmap.createScaledBitmap(source, target, target, true)
        } else if (source != null) {
            source
        } else {
            val bitmap = Bitmap.createBitmap(target, target, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            drawable.setBounds(0, 0, canvas.width, canvas.height)
            drawable.draw(canvas)
            bitmap
        }
    } catch (e: Exception) {
        null
    }
}
