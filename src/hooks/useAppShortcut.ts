import { useEffect, useState } from 'react'
import { isTauri } from './useTauri'

export type AppShortcut = 'add-expense' | 'add-income' | 'reports' | 'converter' | 'accounts' | 'budgets'

const SHORTCUT_PREFIX = 'sharky://shortcut/'
const SHORTCUT_IDS: AppShortcut[] = ['add-expense', 'add-income', 'reports', 'converter', 'accounts', 'budgets']

function isShortcutId(id: string): id is AppShortcut {
  return (SHORTCUT_IDS as string[]).includes(id)
}

function parseShortcut(url: string): AppShortcut | null {
  if (!url.startsWith(SHORTCUT_PREFIX)) return null
  const id = url.slice(SHORTCUT_PREFIX.length).replace(/\/$/, '')
  return isShortcutId(id) ? id : null
}

function firstShortcut(urls: string[] | null | undefined): AppShortcut | null {
  return urls?.map(parseShortcut).find((s): s is AppShortcut => !!s) ?? null
}

/**
 * Detecta cuando $harky se abrió desde un acceso directo del ícono (mantener
 * presionado) o desde un widget de la pantalla de inicio.
 *
 * Dos caminos, porque el deep link solo no basta:
 *  1) El plugin `deep-link` (getCurrent + onOpenUrl). Es el camino principal,
 *     pero en warm-start hay dispositivos donde el evento NO llega — la app
 *     pasa a primer plano y se queda en Inicio.
 *  2) Red de seguridad: `take_pending_shortcut` lee un marcador que
 *     `MainActivity` escribe al recibir el intent, con el mismo mecanismo que
 *     ya usa "compartir recibo" (probado fiable). Se consulta al montar y cada
 *     vez que la app recupera el foco.
 */
/**
 * Cada entrega lleva un NUMERO DE SERIE, no solo el id.
 *
 * React descarta un `setState` que guarda el mismo valor que ya habia, asi que
 * pedir "add-expense" dos veces seguidas no repintaba nada y el efecto que
 * abre la pantalla no se volvia a ejecutar. Sintoma exacto que se reporto:
 * desde la notificacion fija, "Ingreso" abria y "Gasto" no — porque "Gasto"
 * era el valor que ya estaba puesto, e "Ingreso" cambiaba.
 *
 * Con el contador, dos peticiones identicas son dos objetos distintos y cada
 * una dispara su efecto.
 */
export interface ShortcutRequest {
  id: AppShortcut
  /** Sube en cada entrega; solo sirve para que el objeto sea nuevo. */
  serial: number
}

export function useAppShortcut(): [ShortcutRequest | null, () => void] {
  const [shortcut, setShortcutState] = useState<ShortcutRequest | null>(null)
  const setShortcut = (id: AppShortcut) =>
    setShortcutState(prev => ({ id, serial: (prev?.serial ?? 0) + 1 }))

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false

    // Red de seguridad: consume el marcador que dejo MainActivity.
    const drainPendingShortcut = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        const id = await invoke<string | null>('take_pending_shortcut')
        if (id && !cancelled && isShortcutId(id)) setShortcut(id)
      } catch {
        // comando no disponible (build viejo) — el deep link sigue como camino principal
      }
    }

    void (async () => {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
      const initial = firstShortcut(await getCurrent())
      if (initial && !cancelled) setShortcut(initial)

      const stop = await onOpenUrl(urls => {
        const next = firstShortcut(urls)
        if (next) setShortcut(next)
      })
      if (cancelled) stop()
      else unlisten = stop

      await drainPendingShortcut()
    })()

    // Al volver del segundo plano (el caso que falla con el deep link): el
    // intent ya llego a MainActivity, asi que el marcador esta listo.
    const onVisible = () => { if (document.visibilityState === 'visible') void drainPendingShortcut() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      unlisten?.()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return [shortcut, () => setShortcutState(null)]
}
