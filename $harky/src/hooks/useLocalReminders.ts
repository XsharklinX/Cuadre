import { useEffect, useRef } from 'react'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { cancelLocalReminders, requestReminderPermission, scheduleLocalReminders, syncNotificationHistory, syncReminderSnapshot } from '@/lib/localReminders'
import { setQuickAddNotification } from '@/lib/quickAddNotification'

/**
 * Mantiene sincronizado el snapshot que usa el worker nativo (WorkManager)
 * para mostrar recordatorios de pagos recurrentes y alertas de presupuesto
 * aunque la app esté cerrada. No-op fuera de Android+Tauri.
 */
export function useLocalReminders(): void {
  const transactions = useFinance(s => s.transactions)
  const categories = useFinance(s => s.categories)
  const currency = useFinance(s => s.currency)
  const language = useSettings(s => s.language)
  const dismissedAlerts = useSettings(s => s.dismissedAlerts)
  const silencedRecurring = useSettings(s => s.silencedRecurring)
  const remindersEnabled = useSettings(s => s.remindersEnabled)
  const quickAddNotification = useSettings(s => s.quickAddNotification)
  const isFirstSync = useRef(true)

  useEffect(() => {
    if (remindersEnabled) {
      void requestReminderPermission()
      void scheduleLocalReminders()
    } else {
      void cancelLocalReminders()
    }
  }, [remindersEnabled])

  // Notificación persistente de "agregar rápido": se re-postea al arrancar
  // (sobrevive a cerrar la app / reiniciar el teléfono cuando el usuario abre
  // la app) y reacciona al toggle. Pide el permiso de notificaciones si hace
  // falta, por si los recordatorios están apagados.
  useEffect(() => {
    if (quickAddNotification) void requestReminderPermission()
    void setQuickAddNotification(quickAddNotification)
  }, [quickAddNotification])

  useEffect(() => {
    if (!remindersEnabled) return
    const delay = isFirstSync.current ? 0 : 1500
    isFirstSync.current = false
    const id = setTimeout(() => { void syncReminderSnapshot() }, delay)
    return () => clearTimeout(id)
  }, [transactions, categories, currency, language, dismissedAlerts, silencedRecurring, remindersEnabled])

  // Trae al store los avisos nativos ya disparados (semanal, fx, actividad...)
  // para que la campanita los muestre — al arrancar y cada vez que la app
  // vuelve a primer plano (el worker puede haber notificado en segundo plano).
  useEffect(() => {
    void syncNotificationHistory()
    const onVisible = () => { if (document.visibilityState === 'visible') void syncNotificationHistory() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}
