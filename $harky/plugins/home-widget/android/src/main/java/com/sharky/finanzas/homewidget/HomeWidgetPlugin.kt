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

        val context = activity.applicationContext
        SharkyBalanceWidgetProvider.refreshAll(context)
        SharkyBudgetWidgetProvider.refreshAll(context)
        SharkyConverterWidgetProvider.refreshAll(context)
        // El de acceso rápido (+) no lee el snapshot: es un botón fijo, no hay
        // nada que repintar.
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
        result.put("balance", installedCount(SharkyBalanceWidgetProvider::class.java))
        result.put("budgets", installedCount(SharkyBudgetWidgetProvider::class.java))
        result.put("converter", installedCount(SharkyConverterWidgetProvider::class.java))
        result.put("quickadd", installedCount(SharkyQuickAddWidgetProvider::class.java))
        result.put("lastSyncedAt", prefs.getLong(SYNCED_AT_KEY, 0))
        result.put("hasSnapshot", prefs.getString(SNAPSHOT_KEY, null) != null)
        invoke.resolve(result)
    }

    /** "Actualizar ahora" de Ajustes: fuerza el repintado con lo ya guardado. */
    @Command
    fun refreshWidgets(invoke: Invoke) {
        val context = activity.applicationContext
        SharkyBalanceWidgetProvider.refreshAll(context)
        SharkyBudgetWidgetProvider.refreshAll(context)
        SharkyConverterWidgetProvider.refreshAll(context)
        invoke.resolve(JSObject())
    }

    /** Abre el diálogo nativo de "añadir widget" para el tipo pedido. */
    @Command
    fun requestPin(invoke: Invoke) {
        val args = invoke.parseArgs(RequestPinArgs::class.java)
        val manager = activity.getSystemService(Context.APPWIDGET_SERVICE) as AppWidgetManager

        val providerClass = when (args.widget) {
            "budgets" -> SharkyBudgetWidgetProvider::class.java
            "converter" -> SharkyConverterWidgetProvider::class.java
            "quickadd" -> SharkyQuickAddWidgetProvider::class.java
            else -> SharkyBalanceWidgetProvider::class.java
        }

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
