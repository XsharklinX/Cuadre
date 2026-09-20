package com.sharky.finanzas.banknotifications

import android.app.Activity
import android.content.Intent
import android.provider.Settings
import android.webkit.WebView
import androidx.core.app.NotificationManagerCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONArray
import java.io.File

@TauriPlugin
class BankNotificationsPlugin(private val activity: Activity) : Plugin(activity) {

    override fun load(webView: WebView) {
        super.load(webView)
        NotificationBridge.listener = { pkg, title, text, postTime ->
            val data = JSObject()
            data.put("package", pkg)
            data.put("title", title ?: "")
            data.put("text", text ?: "")
            data.put("postTime", postTime)
            trigger("notification", data)
        }
    }

    /**
     * Estado real de la captura. Distingue dos cosas que NO son lo mismo:
     *  - `granted`   : el usuario concedió el acceso a notificaciones.
     *  - `connected` : el sistema tiene el listener VINCULADO ahora mismo.
     *
     * Tras actualizar el APK, Android desvincula el listener y no lo revincula
     * solo: quedaba `granted=true` pero `connected=false`, o sea, permiso OK y
     * cero detecciones. Aquí, si detectamos ese estado, pedimos el re-vínculo
     * para que se repare solo al abrir la app.
     */
    @Command
    fun hasAccess(invoke: Invoke) {
        val granted = NotificationManagerCompat.getEnabledListenerPackages(activity)
            .contains(activity.packageName)
        val connected = BankNotificationListenerService.isConnected

        if (granted && !connected) {
            BankNotificationListenerService.requestRebindNow(activity.applicationContext)
        }

        val ret = JSObject()
        ret.put("granted", granted)
        ret.put("connected", connected)
        invoke.resolve(ret)
    }

    @Command
    fun openSettings(invoke: Invoke) {
        activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
        invoke.resolve(JSObject())
    }

    /**
     * Devuelve TODOS los avisos bancarios capturados (incluidos los que llegaron
     * con la app cerrada) y limpia la cola. La app lo llama al abrir y al volver
     * al foreground; así ningún aviso se pierde por no tener la app abierta.
     */
    @Command
    fun takePending(invoke: Invoke) {
        val items = JSArray()
        synchronized(BankNotificationListenerService.FILE_LOCK) {
            try {
                val file = File(activity.applicationContext.filesDir, BankNotificationListenerService.PENDING_FILE)
                if (file.exists()) {
                    val stored = JSONArray(file.readText())
                    for (i in 0 until stored.length()) {
                        val o = stored.optJSONObject(i) ?: continue
                        items.put(JSObject().apply {
                            put("package", o.optString("package"))
                            put("title", o.optString("title"))
                            put("text", o.optString("text"))
                            put("postTime", o.optLong("postTime"))
                        })
                    }
                    file.delete()
                }
            } catch (_: Exception) {
                // Cola corrupta o ilegible: se ignora (no romper el arranque).
            }
        }
        val ret = JSObject()
        ret.put("items", items)
        invoke.resolve(ret)
    }
}
