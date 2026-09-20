package com.sharky.finanzas.homewidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget de presupuestos 4x2: hasta 3 categorías, ordenadas por urgencia (lo
 * más pasado de límite arriba — ese orden lo resuelve el JS en el snapshot).
 *
 * Cada fila lleva su nombre, el % gastado y una barra cuyo COLOR significa
 * estado (ok / warn / over): un presupuesto al 160% no puede verse igual que
 * uno al 32%. Como RemoteViews no deja cambiar el color de un ProgressBar en
 * caliente de forma portable, el layout apila tres barras (una por estado) y
 * aquí se muestra solo la que aplica.
 */
class SharkyBudgetWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    companion object {
        /** Ids de las tres filas del layout. El índice = posición en el snapshot. */
        private data class Row(
            val container: Int,
            val name: Int,
            val pct: Int,
            val barOk: Int,
            val barWarn: Int,
            val barOver: Int,
        )

        private val ROWS = arrayOf(
            Row(R.id.widget_budget_row_1, R.id.widget_budget_name_1, R.id.widget_budget_pct_1,
                R.id.widget_budget_bar_ok_1, R.id.widget_budget_bar_warn_1, R.id.widget_budget_bar_over_1),
            Row(R.id.widget_budget_row_2, R.id.widget_budget_name_2, R.id.widget_budget_pct_2,
                R.id.widget_budget_bar_ok_2, R.id.widget_budget_bar_warn_2, R.id.widget_budget_bar_over_2),
            Row(R.id.widget_budget_row_3, R.id.widget_budget_name_3, R.id.widget_budget_pct_3,
                R.id.widget_budget_bar_ok_3, R.id.widget_budget_bar_warn_3, R.id.widget_budget_bar_over_3),
        )

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, SharkyBudgetWidgetProvider::class.java),
            )
            for (id in ids) updateWidget(context, manager, id)
        }

        private fun updateWidget(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_budgets)
            val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(SNAPSHOT_KEY, null)
            val snapshot = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
            val budgets = snapshot?.optJSONArray("topBudgets")

            if (budgets == null || budgets.length() == 0) {
                views.setViewVisibility(R.id.widget_budgets_empty, View.VISIBLE)
                for (row in ROWS) views.setViewVisibility(row.container, View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_budgets_empty, View.GONE)
                for (i in ROWS.indices) {
                    val row = ROWS[i]
                    val obj = budgets.optJSONObject(i)
                    if (obj == null) {
                        views.setViewVisibility(row.container, View.GONE)
                        continue
                    }
                    val pct = obj.optInt("pct")
                    val status = obj.optString("status", "ok")
                    views.setViewVisibility(row.container, View.VISIBLE)
                    views.setTextViewText(row.name, obj.optString("name"))
                    views.setTextViewText(row.pct, "$pct%")
                    views.setTextColor(row.pct, statusColor(status))
                    applyBar(views, row, status, pct)
                }
            }

            views.setOnClickPendingIntent(
                R.id.widget_budgets_root,
                widgetPendingIntent(context, appWidgetId, 0, WidgetRoute.BUDGETS),
            )
            manager.updateAppWidget(appWidgetId, views)
        }

        /** Muestra solo la barra del estado actual (las otras dos ocultas) y le fija el progreso. */
        private fun applyBar(views: RemoteViews, row: Row, status: String, pct: Int) {
            val activeBar = when (status) {
                "over" -> row.barOver
                "warn" -> row.barWarn
                else -> row.barOk
            }
            views.setViewVisibility(row.barOk, if (activeBar == row.barOk) View.VISIBLE else View.GONE)
            views.setViewVisibility(row.barWarn, if (activeBar == row.barWarn) View.VISIBLE else View.GONE)
            views.setViewVisibility(row.barOver, if (activeBar == row.barOver) View.VISIBLE else View.GONE)
            views.setProgressBar(activeBar, 100, pct.coerceIn(0, 100), false)
        }

        /** Color del % según estado — el mismo criterio que el color de la barra. */
        private fun statusColor(status: String): Int = when (status) {
            "over" -> 0xFFFF6B8A.toInt()
            "warn" -> 0xFFFFD84D.toInt()
            else -> 0xFF6E7688.toInt()
        }
    }
}
