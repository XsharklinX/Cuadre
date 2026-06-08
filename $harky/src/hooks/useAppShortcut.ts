import { useEffect, useState } from 'react'
import { isTauri } from './useTauri'

export type AppShortcut = 'add-expense' | 'add-income' | 'reports'

const SHORTCUT_PREFIX = 'sharky://shortcut/'

function parseShortcut(url: string): AppShortcut | null {
  if (!url.startsWith(SHORTCUT_PREFIX)) return null
  const id = url.slice(SHORTCUT_PREFIX.length).replace(/\/$/, '')
  return id === 'add-expense' || id === 'add-income' || id === 'reports' ? id : null
}

function firstShortcut(urls: string[] | null | undefined): AppShortcut | null {
  return urls?.map(parseShortcut).find((s): s is AppShortcut => !!s) ?? null
}

/**
 * Detecta cuando $harky se abrió desde un acceso directo del ícono
 * (mantener presionado — ver res/xml/shortcuts.xml). Revisa el deep link
 * inicial (app cerrada en frío) y los que llegan en caliente.
 */
export function useAppShortcut(): [AppShortcut | null, () => void] {
  const [shortcut, setShortcut] = useState<AppShortcut | null>(null)

  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    let cancelled = false

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
    })()

    return () => { cancelled = true; unlisten?.() }
  }, [])

  return [shortcut, () => setShortcut(null)]
}
