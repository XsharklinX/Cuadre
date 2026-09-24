package com.sharky.finanzas.homewidget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

// Prefs compartidas entre el plugin (que escribe el snapshot) y los providers
// (que lo leen para pintar). Un solo sitio, un solo nombre.
const val PREFS_NAME = "sharky_home_widget"
const val SNAPSHOT_KEY = "snapshot"
const val SYNCED_AT_KEY = "synced_at"

@InvokeArg
class SyncSnapshotArgs {
    lateinit var snapshot: String
}

@InvokeArg
class RequestPinArgs {
    var widget: String? = null
}

/**
 * Puente entre la app (JS) y los widgets de pantalla de inicio.
 *
 * La app no puede pintar los widgets directamente: viven en el proceso del
 * launcher. En su lugar deja un snapshot JSON en SharedPreferences y pide un
 * refresco; cada `AppWidgetProvider` lee ese snapshot y se re-renderiza. Así el
 * widget muestra datos al día sin abrir la app.
 */
@TauriPlugin
class HomeWidgetPlugin(private val activity: Activity) : Plugin(activity) {

    /** Guarda el snapshot y repinta todos los widgets con datos dinámicos. */
    @Command
    fun syncSnapshot(invoke: Invoke) {
        val args = invoke.parseArgs(SyncSnapshotArgs::class.java)
        activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(SNAPSHOT_KEY, args.snapshot)
            .putLong(SYNCED_AT_KEY, System.currentTimeMillis())
            .apply()

        /*
         * Desde 1.9.8 no hay nada que repintar: el unico widget que queda es
         * el acceso rapido "+", que es un boton fijo y no lee el snapshot.
         *
         * El snapshot SE SIGUE guardando arriba a proposito: es barato, y si
         * mañana vuelve a haber un widget con datos, el dato ya esta ahi en
         * vez de aparecer vacio hasta la primera sincronizacion.
         */
        invoke.resolve(JSObject())
    }

    /** Estado real de los widgets según Android: soporte, cuántos hay puestos y frescura del snapshot. */
    @Command
    fun getDiagnostics(invoke: Invoke) {
        val manager = activity.getSystemService(Context.APPWIDGET_SERVICE) as AppWidgetManager
        val prefs = activity.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        fun installedCount(cls: Class<*>): Int =
            manager.getAppWidgetIds(ComponentName(activity, cls)).size

        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.isRequestPinAppWidgetSupported

        val result = JSObject()
        result.put("supported", supported)
        result.put("quickadd", installedCount(SharkyQuickAddWidgetProvider::class.java))
        result.put("lastSyncedAt", prefs.getLong(SYNCED_AT_KEY, 0))
        result.put("hasSnapshot", prefs.getString(SNAPSHOT_KEY, null) != null)
        invoke.resolve(result)
    }

    /**
     * "Actualizar ahora" de Ajustes.
     *
     * Ya no repinta nada —el "+" no muestra datos— pero el comando se mantiene:
     * lo llama la app y quitarlo obligaria a tocar el lado JS para no ganar
     * nada. Responde OK y no hace trabajo.
     */
    @Command
    fun refreshWidgets(invoke: Invoke) {
        invoke.resolve(JSObject())
    }

    /** Abre el diálogo nativo de "añadir widget" para el tipo pedido. */
    @Command
    fun requestPin(invoke: Invoke) {
        val args = invoke.parseArgs(RequestPinArgs::class.java)
        val manager = activity.getSystemService(Context.APPWIDGET_SERVICE) as AppWidgetManager

        // Solo queda uno. Cualquier valor cae en el mismo sitio en vez de
        // fallar: una app vieja que pida "balance" recibe el "+" en lugar de un
        // error sin explicacion.
        val providerClass = SharkyQuickAddWidgetProvider::class.java

        val supported = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            manager.isRequestPinAppWidgetSupported
        val requested = if (supported) {
            manager.requestPinAppWidget(ComponentName(activity, providerClass), null, null)
        } else {
            false
        }

        val result = JSObject()
        result.put("supported", supported)
        result.put("requested", requested)
        invoke.resolve(result)
    }
}
