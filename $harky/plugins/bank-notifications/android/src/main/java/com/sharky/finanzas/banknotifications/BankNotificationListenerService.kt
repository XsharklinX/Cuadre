package com.sharky.finanzas.banknotifications

import android.app.Notification
import android.content.ComponentName
import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Con el acceso especial de notificaciones concedido, reenvia via
 * [NotificationBridge] los avisos que PODRIAN ser un movimiento bancario. El
 * filtrado fino (rechazar promos, OTP, telecom; separar ingreso/gasto) vive en
 * JS (`bankNotificationParser`), que es testeable y se actualiza sin recompilar.
 * Aqui priorizamos NO perder avisos:
 *
 *  - Se lee TODO el texto disponible, no solo EXTRA_TEXT: los correos (Gmail,
 *    Outlook) ponen el cuerpo con el monto en EXTRA_BIG_TEXT / EXTRA_TEXT_LINES,
 *    asi que antes se descartaban por "no traer monto".
 *  - Se reconoce el banco por PAQUETE o por REMITENTE (titulo): un aviso de
 *    Banreservas reenviado por Gmail llega con paquete "com.google.android.gm"
 *    pero el banco esta en el titulo.
 *  - Se reenvia si hay un banco reconocido O el contenido trae un monto en
 *    moneda; el resto (chats, redes) se descarta aqui mismo.
 */
class BankNotificationListenerService : NotificationListenerService() {

    companion object {
        // Cola persistida: los avisos capturados se guardan aquí para que NO se
        // pierdan cuando la app está cerrada (el bridge a JS solo existe con la
        // app abierta). La app los drena al abrir/volver al foreground vía el
        // comando `take_pending`. FILE_LOCK serializa lecturas/escrituras entre
        // el servicio (que escribe) y el plugin (que lee y limpia).
        internal const val PENDING_FILE = "bank_pending.json"
        internal val FILE_LOCK = Any()
        private const val MAX_PENDING = 60

        /**
         * ¿El sistema tiene el listener VINCULADO ahora mismo?
         *
         * Ojo: "permiso concedido" y "servicio vinculado" son cosas distintas.
         * Al actualizar/reinstalar el APK, Android desvincula el listener y NO
         * lo revincula solo, aunque el permiso siga concedido — el servicio deja
         * de recibir avisos en silencio y Ajustes seguía diciendo "concedido".
         * Esta bandera permite detectar ese estado y repararlo.
         */
        @Volatile
        internal var isConnected: Boolean = false

        /**
         * Pide al sistema volver a vincular el listener (API 24+; minSdk = 24).
         *
         * Se llama al static de NotificationListenerService de forma explícita:
         * sin cualificar, el nombre chocaría con esta misma función dentro del
         * companion object.
         */
        internal fun requestRebindNow(context: Context) {
            try {
                NotificationListenerService.requestRebind(
                    ComponentName(context, BankNotificationListenerService::class.java),
                )
            } catch (_: Exception) {
                // Si el sistema lo rechaza, queda el camino manual (Ajustes).
            }
        }

        // Bancos, cooperativas y billeteras (RD) + wallets internacionales.
        private val BANK_HINTS = listOf(
            "banreservas", "reservas", "qik", "tpago", "popular", "bhd", "scotiabank",
            "scotia", "promerica", "apap", "banesco", "ademi", "lafise", "bdi",
            "motor credito", "motorcredito", "vimenca", "santa cruz", "santacruz",
            "bancaribe", "caribe", "citibank", "citi", "alaver", "banco ", "cooperativa",
            "asociacion", "financiera", "paypal", "zelle", "wise", "remitly", "remesas",
            "visa", "mastercard", "amex", "american express",
        )

        // Monto en moneda, en cualquier orden. Debe existir un marcador de moneda
        // para no confundir los 4 digitos de la tarjeta o una fecha con un monto.
        private val AMOUNT_RE = Regex(
            "(?:RD\\\$|US\\\$|U\\\$D|DOP|USD|\\\$)\\s?\\d[\\d.,]*|\\d[\\d.,]*\\s?(?:DOP|USD|RD\\\$|US\\\$|pesos?|d[oó]lares?)",
            RegexOption.IGNORE_CASE,
        )

        private fun looksLikeBankNotification(packageName: String, source: String, content: String): Boolean {
            val src = "$packageName $source".lowercase()
            if (BANK_HINTS.any { src.contains(it) }) return true
            return AMOUNT_RE.containsMatchIn(content)
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        isConnected = true
    }

    /**
     * Android desvincula el listener al actualizar el APK (y en algunas limpiezas
     * del sistema). Sin pedir el re-vínculo aquí, el servicio queda muerto para
     * siempre aunque el permiso siga concedido: ese era el motivo de que las
     * transacciones dejaran de detectarse tras cada reinstalación.
     */
    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        isConnected = false
        requestRebindNow(applicationContext)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == applicationContext.packageName) return

        val extras = sbn.notification.extras
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()

        // Reúne todo el texto disponible: los correos y las notificaciones
        // expandibles guardan el cuerpo (con el monto) en big text / text lines.
        val parts = mutableListOf<String?>()
        parts.add(extras.getCharSequence(Notification.EXTRA_TEXT)?.toString())
        parts.add(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString())
        parts.add(extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString())
        parts.add(extras.getCharSequence(Notification.EXTRA_SUMMARY_TEXT)?.toString())
        parts.add(extras.getCharSequence(Notification.EXTRA_INFO_TEXT)?.toString())
        extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { parts.add(it?.toString()) }

        val text = parts.filterNotNull().distinct().joinToString("\n").trim()

        if (!looksLikeBankNotification(sbn.packageName, title.orEmpty(), "${title.orEmpty()}\n$text")) return

        // 1) Persistir SIEMPRE (sobreviva o no la app abierta).
        persistPending(sbn.packageName, title.orEmpty(), text, sbn.postTime)
        // 2) Si la app está abierta, "despertar" al JS para que drene ya mismo.
        NotificationBridge.listener?.invoke(sbn.packageName, title, text, sbn.postTime)
    }

    private fun persistPending(pkg: String, title: String, text: String, postTime: Long) {
        synchronized(FILE_LOCK) {
            try {
                val file = File(applicationContext.filesDir, PENDING_FILE)
                val arr = if (file.exists()) JSONArray(file.readText()) else JSONArray()
                // Dedup: el sistema puede re-emitir la misma notificación (updates).
                for (i in 0 until arr.length()) {
                    val o = arr.optJSONObject(i) ?: continue
                    if (o.optLong("postTime") == postTime && o.optString("text") == text) return
                }
                arr.put(JSONObject().apply {
                    put("package", pkg)
                    put("title", title)
                    put("text", text)
                    put("postTime", postTime)
                })
                while (arr.length() > MAX_PENDING) arr.remove(0)
                file.writeText(arr.toString())
            } catch (_: Exception) {
                // Si no se puede persistir, el camino en vivo (app abierta) sigue.
            }
        }
    }
}
