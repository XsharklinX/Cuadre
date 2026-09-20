import { useEffect, useState } from 'react'
import { APP_VERSION } from '@/data/release'
import { isTauri } from './useTauri'

const VERSION_MANIFEST_URL = 'https://xsharklinx.github.io/Sharky-Coin/version.json'

export interface AvailableUpdate {
  version: string
  url:     string
}

function isNewer(remote: string, current: string): boolean {
  const a = remote.split('.').map(Number)
  const b = current.split('.').map(Number)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

/** Consulta el manifiesto público de versión (GitHub Pages) una vez por
 *  arranque, solo en Android nativo — en desktop/web no hay Play Store al
 *  que enviar al usuario. */
export function useUpdateCheck(): AvailableUpdate | null {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null)

  useEffect(() => {
    const isAndroid = /android/i.test(navigator.userAgent)
    if (!isTauri() || !isAndroid) return

    void (async () => {
      try {
        const res = await fetch(VERSION_MANIFEST_URL, { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { android?: { version?: string; url?: string } }
        const version = data.android?.version
        const url = data.android?.url
        if (version && url && isNewer(version, APP_VERSION)) {
          setUpdate({ version, url })
        }
      } catch {
        // Sin conexión o manifiesto no disponible: no molestamos al usuario
      }
    })()
  }, [])

  return update
}
