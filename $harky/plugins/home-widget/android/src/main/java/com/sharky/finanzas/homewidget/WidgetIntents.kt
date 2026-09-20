package com.sharky.finanzas.homewidget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Destinos a los que puede llevar un toque en un widget. El valor de cada uno
 * es el mismo id de atajo que ya entiende la app (`sharky://shortcut/<ruta>`,
 * ver useAppShortcut): así el widget reutiliza el ruteo de atajos en vez de
 * inventar uno propio.
 */
object WidgetRoute {
    const val ADD_EXPENSE = "add-expense"
    const val ADD_INCOME = "add-income"
    const val ACCOUNTS = "accounts"
    const val BUDGETS = "budgets"
    const val CONVERTER = "converter"
}

/**
 * PendingIntent que abre la app en la ruta indicada al tocar el widget.
 *
 * Va como deep link `sharky://shortcut/<route>` hacia MainActivity — el mismo
 * canal que usan los atajos del icono, con su red de seguridad
 * (`take_pending_shortcut`) para los dispositivos donde el deep link no llega
 * en warm-start.
 *
 * El `requestCode` se hace único por (widget, zona) con `appWidgetId * 10 +
 * slot`: sin eso, dos widgets o dos botones del mismo widget compartirían
 * PendingIntent y el sistema reciclaría el de otro destino.
 */
fun widgetPendingIntent(context: Context, appWidgetId: Int, slot: Int, route: String): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("sharky://shortcut/$route"))
        .setClassName(context.packageName, "${context.packageName}.MainActivity")
        .setFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    return PendingIntent.getActivity(
        context,
        appWidgetId * 10 + slot,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}
