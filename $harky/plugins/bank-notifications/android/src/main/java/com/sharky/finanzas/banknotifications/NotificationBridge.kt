package com.sharky.finanzas.banknotifications

/**
 * Puente entre [BankNotificationListenerService] (que corre fuera del ciclo
 * de vida de la Activity) y [BankNotificationsPlugin] (que reenvia eventos a JS).
 */
object NotificationBridge {
    var listener: ((pkg: String, title: String?, text: String?, postTime: Long) -> Unit)? = null
}
