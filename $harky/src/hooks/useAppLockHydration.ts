import { useEffect, useState } from 'react'
import { loadAppLock, saveAppLock } from '@/lib/appLockStorage'
import { isAndroidTauri } from '@/lib/secureBlob'
import { useSettings } from '@/store/settings'

/**
 * Carga el PIN/patrón cifrados con Android Keystore antes de mostrar la app.
 * Fuera de Android+Tauri, `hydrated` es `true` desde el primer render (no-op).
 */
export function useAppLockHydration(): { hydrated: boolean } {
  const [hydrated, setHydrated] = useState(() => !isAndroidTauri())

  useEffect(() => {
    if (!isAndroidTauri()) return

    let cancelled = false
    loadAppLock().then(({ pin, pattern }) => {
      if (cancelled) return

      if (pin != null || pattern != null) {
        useSettings.setState({ appPin: pin, appPattern: pattern })
      } else {
        // Migración: si ya había un PIN/patrón en texto plano de una versión
        // anterior (persistido en sharky-settings-v2), cifrarlo ahora.
        const current = useSettings.getState()
        if (current.appPin || current.appPattern) {
          void saveAppLock(current.appPin, current.appPattern)
        }
      }

      setHydrated(true)
    })

    return () => { cancelled = true }
  }, [])

  return { hydrated }
}
