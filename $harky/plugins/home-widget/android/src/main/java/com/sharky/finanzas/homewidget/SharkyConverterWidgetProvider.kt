package com.sharky.finanzas.homewidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * Widget conversor 4x2: hasta 3 divisas con su tasa en vivo (1 USD = X en tu
 * moneda). El encabezado dice "1 unidad en <tu moneda>", así que cada fila
 * muestra solo el código (USD) y la cifra — la bandera y el "1 " delante eran
 * ruido. Las tasas ya vienen convertidas en el snapshot con el mismo motor que
 * usa la app.
 */
class SharkyConverterWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    companion object {
        /** (contenedor de la fila, código, valor) para las tres filas del layout. */
        private val ROWS = arrayOf(
            Triple(R.id.widget_conv_row_1, R.id.widget_conv_code_1, R.id.widget_conv_value_1),
            Triple(R.id.widget_conv_row_2, R.id.widget_conv_code_2, R.id.widget_conv_value_2),
            Triple(R.id.widget_conv_row_3, R.id.widget_conv_code_3, R.id.widget_conv_value_3),
        )

        fun refreshAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, SharkyConverterWidgetProvider::class.java),
            )
            for (id in ids) updateWidget(context, manager, id)
        }

        private fun updateWidget(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_converter)
            val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(SNAPSHOT_KEY, null)
            val snapshot = raw?.let { runCatching { JSONObject(it) }.getOrNull() }
            val rates = snapshot?.optJSONArray("rates")

            if (rates == null || rates.length() == 0) {
                views.setTextViewText(R.id.widget_conv_title, context.getString(R.string.widget_converter_title))
                views.setViewVisibility(R.id.widget_conv_empty, View.VISIBLE)
                for ((container, _, _) in ROWS) views.setViewVisibility(container, View.GONE)
            } else {
                // "1 unidad en DOP" — el código de la moneda base, no la bandera.
                val base = snapshot.optString("ratesBase")
                views.setTextViewText(R.id.widget_conv_title, context.getString(R.string.widget_converter_base, base))
                views.setViewVisibility(R.id.widget_conv_empty, View.GONE)
                for (i in ROWS.indices) {
                    val (container, codeId, valueId) = ROWS[i]
                    val obj = rates.optJSONObject(i)
                    if (obj == null) {
                        views.setViewVisibility(container, View.GONE)
                        continue
                    }
                    views.setViewVisibility(container, View.VISIBLE)
                    views.setTextViewText(codeId, obj.optString("code"))
                    views.setTextViewText(valueId, obj.optString("valueLabel"))
                }
            }

            views.setOnClickPendingIntent(
                R.id.widget_conv_root,
                widgetPendingIntent(context, appWidgetId, 0, WidgetRoute.CONVERTER),
            )
            manager.updateAppWidget(appWidgetId, views)
        }
    }
}
