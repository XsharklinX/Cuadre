import { useEffect } from 'react'
import { toast } from '@/components/ui/Toast'
import { isTauri } from '@/hooks/useTauri'
import { tt } from '@/i18n'
import { log } from '@/lib/logger'
import { setRootBackHandler } from './useMobileBackDismiss'

const EXIT_WINDOW_MS = 2000

/**
 * "Pulsa de nuevo para salir": en la pantalla principal (sin overlays abiertos),
 * el primer atrás NO cierra la app — muestra un aviso; el segundo atrás dentro de
 * la ventana de 2 s sí sale. Evita cerrar la app por un toque accidental, que era
 * lo molesto. Solo en Android/Tauri; en web/PWA no aplica.
 */
export function useExitConfirm(): void {
  useEffect(() => {
    if (!isTauri()) return

    let armed = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const exitApp = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        await getCurrentWindow().close()
      } catch (err) {
        log.error('No se pudo salir de la app', err)
      }
    }

    setRootBackHandler(() => {
      if (armed) {
        if (timer) clearTimeout(timer)
        void exitApp()
        return
      }
      armed = true
      toast(tt('pressAgainToExit'), { icon: 'info' })
      timer = setTimeout(() => { armed = false }, EXIT_WINDOW_MS)
    })

    return () => {
      if (timer) clearTimeout(timer)
      setRootBackHandler(null)
    }
  }, [])
}
