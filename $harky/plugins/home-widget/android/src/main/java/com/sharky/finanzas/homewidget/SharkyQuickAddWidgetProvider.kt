package com.sharky.finanzas.homewidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

/**
 * Widget de acceso rápido 1x1: un botón que abre directo el flujo de "agregar
 * gasto". No lee el snapshot — no muestra datos, solo dispara la acción — así
 * que no necesita `refreshAll`: con el `onUpdate` inicial basta.
 */
class SharkyQuickAddWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) updateWidget(context, appWidgetManager, id)
    }

    companion object {
        private fun updateWidget(context: Context, manager: AppWidgetManager, appWidgetId: Int) {
            val views = RemoteViews(context.packageName, R.layout.widget_quickadd)
            views.setOnClickPendingIntent(
                R.id.widget_quickadd_root,
                widgetPendingIntent(context, appWidgetId, 0, WidgetRoute.ADD_EXPENSE),
            )
            manager.updateAppWidget(appWidgetId, views)
        }
    }
}
