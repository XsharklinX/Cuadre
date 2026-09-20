import { useEffect } from 'react'
import { initNotificationActionTypes, isTauri, onNotificationAction } from './useTauri'
import { useSettings } from '@/store/settings'

/**
 * Activa los botones de acción de las notificaciones nativas (Android/desktop)
 * y reacciona cuando el usuario los presiona — "Descartar" cierra la alerta
 * de presupuesto correspondiente; "Ver" simplemente trae la app al frente
 * (lo resuelve `foreground: true` en el tipo de acción registrado).
 */
export function useNotificationActions(): void {
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    void initNotificationActionTypes()
    void onNotificationAction((actionId, extra) => {
      if (actionId !== 'dismiss') return
      const alertId = extra.alertId
      if (typeof alertId === 'string') useSettings.getState().dismissAlert(alertId)
    }).then(fn => { unlisten = fn })
    return () => unlisten?.()
  }, [])
}
