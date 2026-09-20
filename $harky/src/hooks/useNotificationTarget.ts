import { useEffect, useState } from 'react'
import { isTauri } from './useTauri'

export type NotificationTargetType =
  | 'budget' | 'recurring' | 'lowfunds' | 'goal' | 'weekly' | 'fx' | 'anomaly' | 'activity'

const NOTIFICATION_PREFIX = 'sharky://notification/'
const TARGET_TYPES: NotificationTargetType[] =
  ['budget', 'recurring', 'lowfunds', 'goal', 'weekly', 'fx', 'anomaly', 'activity']

function isTargetType(id: string): id is NotificationTargetType {
  return (TARGET_TYPES as string[]).includes(id)
}

function parseTarget(url: string): NotificationTargetType | null {
  if (!url.startsWith(NOTIFICATION_PREFIX)) return null
  const id = url.slice(NOTIFICATION_PREFIX.length).replace(/\/$/, '')
  return isTargetType(id) ? id : null
}

function firstTarget(urls: string[] | null | undefined): NotificationTargetType | null {
  return urls?.map(parseTarget).find((t): t is NotificationTargetType => !!t) ?? null
}

/**
 * Detecta cuando $harky se abrió al tocar un aviso nativo (presupuesto,
 * resumen semanal, etc. — disparados por `ReminderWorker.kt`), para navegar
 * a la pantalla correspondiente en vez de quedarse en Inicio.
 *
 * Mismo mecanismo de dos caminos que `useAppShortcut` (ver su comentario):
 * deep link `sharky://notification/<tipo>` como camino principal, y
 * `take_pending_notification` (marcador que deja `MainActivity`) como red de
 * seguridad para los dispositivos donde el evento de deep link no llega en
 * warm-start.
 */
export function useNotificationTarget(): [NotificationTargetType | null, () => void] {
  const [target, setTarget] = useState<NotificationTargetType | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false

    const drainPendingNotification = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const id = await invoke<string | null>('take_pending_notification')
        if (id && !cancelled && isTargetType(id)) setTarget(id)
      } catch {
        // comando no disponible (build viejo) — el deep link sigue como camino principal
      }
    }

    void (async () => {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
      const initial = firstTarget(await getCurrent())
      if (initial && !cancelled) setTarget(initial)

      const stop = await onOpenUrl(urls => {
        const next = firstTarget(urls)
        if (next) setTarget(next)
      })
      if (cancelled) stop()
      else unlisten = stop

      await drainPendingNotification()
    })()

    const onVisible = () => { if (document.visibilityState === 'visible') void drainPendingNotification() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      unlisten?.()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return [target, () => setTarget(null)]
}
