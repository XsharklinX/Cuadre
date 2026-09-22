import { useEffect, useState } from 'react'
import { detectionHealth, type DetectionHealth } from '@/data/detectionHealth'
import { getNotificationAccessStatus } from '@/lib/bankNotifications'
import { useBankNotificationsDebug } from '@/store/bankNotificationsDebug'
import { useBankSuggestions } from '@/store/bankSuggestions'
import { isTauri } from '@/hooks/useTauri'

/**
 * Estado de la detección de transacciones, listo para pintar.
 *
 * Pide el estado al lado nativo, lo que de paso PIDE EL RE-VÍNCULO si Android
 * había soltado el servicio — así que montar esto ya intenta la reparación.
 *
 * Devuelve `null` mientras no se sabe: un aviso de "no funciona" que parpadea
 * en cada arranque antes de tener la respuesta es peor que no avisar.
 */
export function useDetectionHealth(): DetectionHealth | null {
  const enabled = useBankSuggestions(s => s.enabled)
  const enabledSince = useBankSuggestions(s => s.enabledSince)
  const lastCapturedAt = useBankNotificationsDebug(s => s.lastCapturedAt)
  const [access, setAccess] = useState<{ granted: boolean; connected: boolean } | null>(null)

  useEffect(() => {
    if (!isTauri() || !enabled) { setAccess(null); return }
    let cancelled = false
    getNotificationAccessStatus().then(status => {
      if (!cancelled) setAccess(status)
    })
    return () => { cancelled = true }
  }, [enabled])

  if (!isTauri() || !enabled || !access) return null

  return detectionHealth({
    enabled,
    granted: access.granted,
    connected: access.connected,
    lastCapturedAt,
    enabledSince,
    now: Date.now(),
  })
}
