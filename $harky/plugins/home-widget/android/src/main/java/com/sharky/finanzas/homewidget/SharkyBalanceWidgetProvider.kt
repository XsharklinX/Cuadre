package com.sharky.finanzas.homewidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget de saldo.
 *
 * Por defecto es un 2x2 que muestra UNA idea: cuanto tienes y como cambio este
 * mes. Si el usuario lo agranda, pasa a la variante ancha (4x2) con cuentas y
 * accesos de gasto/ingreso — crece a lo ancho, no a lo alto, que es lo que se
 * come la pantalla de inicio.
 *
 * En Android 12+ (API 31) la variante se elige sola con el mapa de tamanos de
 * RemoteViews; por debajo se decide con el ancho que reporta el sistema en las
 * opciones del widget.
 */
class SharkyBalanceWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    /** Re-render al redimensionar: sin esto el 2x2 estirado seguiria mostrando el layout compacto. */
    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle,
    ) {
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    companion object {
        /** A partir de este ancho cabe la variante con cuentas y botones. */
        private const val WIDE_BREAKPOINT_DP = 250

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                android.content.ComponentName(context, SharkyBalanceWidgetProvider::class.java),
            )
            for (id in ids) updateWidget(context, manager, id)
        }

        private fun updateWidget(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
            val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(SNAPSHOT_KEY, null)
            val snapshot = raw?.let { runCatching { JSONObject(it) }.getOrNull() }

            val views = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Android 12+: el sistema elige el layout segun el tamano real,
                // sin re-render nuestro al redimensionar.
                RemoteViews(
                    mapOf(
                        SizeF(110f, 110f) to buildCompact(context, appWidgetId, snapshot),
                        SizeF(WIDE_BREAKPOINT_DP.toFloat(), 110f) to buildWide(context, appWidgetId, snapshot),
                    ),
                )
            } else {
                val widthDp = manager.getAppWidgetOptions(appWidgetId)
                    .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0)
                if (widthDp >= WIDE_BREAKPOINT_DP) buildWide(context, appWidgetId, snapshot)
                else buildCompact(context, appWidgetId, snapshot)
            }

            manager.updateAppWidget(appWidgetId, views)
        }

        /** 2x2: etiqueta + saldo + variacion. Toda la superficie abre Cuentas. */
        private fun buildCompact(context: Context, appWidgetId: Int, snapshot: JSONObject?): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_balance)
            applyBalance(context, views, snapshot, useFullLabel = false)
            views.setOnClickPendingIntent(
                R.id.widget_root,
                widgetPendingIntent(context, appWidgetId, 0, WidgetRoute.ACCOUNTS),
            )
            return views
        }

        /** 4x2: lo anterior + cuentas en una linea + accesos a gasto/ingreso. */
        private fun buildWide(context: Context, appWidgetId: Int, snapshot: JSONObject?): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_balance_wide)
            applyBalance(context, views, snapshot, useFullLabel = true)

            // Cuentas como una sola linea de texto ("Efectivo 465 · Banreservas 759"),
            // en vez de tarjetas con borde propias.
            val accounts = snapshot?.optJSONArray("accounts")
            val line = buildString {
                val count = minOf(accounts?.length() ?: 0, 2)
                for (i in 0 until count) {
                    val account = accounts?.optJSONObject(i) ?: continue
                    if (isNotEmpty()) append("  ·  ")
                    append(account.optString("name"))
                    append(' ')
                    append(account.optString("balanceLabel"))
                }
            }
            if (line.isEmpty()) {
                views.setViewVisibility(R.id.widget_accounts_line, View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_accounts_line, View.VISIBLE)
                views.setTextViewText(R.id.widget_accounts_line, line)
            }

            // Tres zonas tactiles distintas, cada una a su destino.
            views.setOnClickPendingIntent(
                R.id.widget_body,
                widgetPendingIntent(context, appWidgetId, 0, WidgetRoute.ACCOUNTS),
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_expense,
                widgetPendingIntent(context, appWidgetId, 1, WidgetRoute.ADD_EXPENSE),
            )
            views.setOnClickPendingIntent(
                R.id.widget_btn_income,
                widgetPendingIntent(context, appWidgetId, 2, WidgetRoute.ADD_INCOME),
            )
            return views
        }

        /** Saldo + variacion mensual. Compartido por ambas variantes. */
        private fun applyBalance(
            context: Context,
            views: RemoteViews,
            snapshot: JSONObject?,
            useFullLabel: Boolean,
        ) {
            if (snapshot == null) {
                views.setTextViewText(R.id.widget_balance, "--")
                views.setTextViewText(R.id.widget_balance_label, context.getString(R.string.widget_empty_state))
                views.setViewVisibility(R.id.widget_delta, View.GONE)
                return
            }

            views.setTextViewText(R.id.widget_balance_label, context.getString(R.string.widget_balance_label))
            // La cifra completa solo en la variante ancha: en 2x2 se cortaria.
            val key = if (useFullLabel) "totalBalanceFullLabel" else "totalBalanceLabel"
            val balance = snapshot.optString(key).ifEmpty { snapshot.optString("totalBalanceLabel", "--") }
            views.setTextViewText(R.id.widget_balance, balance)

            // Sin mes anterior con datos el JS manda deltaPct = null: mostrar "0%"
            // seria inventar un dato.
            val direction = if (snapshot.isNull("deltaDirection")) null else snapshot.optString("deltaDirection")
            if (direction == null || snapshot.isNull("deltaPct")) {
                views.setViewVisibility(R.id.widget_delta, View.GONE)
                return
            }

            val pct = snapshot.optInt("deltaPct")
            val (text, color) = when (direction) {
                "up" -> context.getString(R.string.widget_delta_up, kotlin.math.abs(pct)) to 0xFF35D0A2.toInt()
                "down" -> context.getString(R.string.widget_delta_down, kotlin.math.abs(pct)) to 0xFFFF6B8A.toInt()
                else -> context.getString(R.string.widget_delta_flat) to 0xFF6E7688.toInt()
            }
            views.setViewVisibility(R.id.widget_delta, View.VISIBLE)
            views.setTextViewText(R.id.widget_delta, text)
            views.setTextColor(R.id.widget_delta, color)
        }
    }
}
