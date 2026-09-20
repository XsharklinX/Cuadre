import { useEffect, useRef } from 'react'
import { isTauri } from '@/hooks/useTauri'
import { log } from '@/lib/logger'

// Global stack for Tauri back button handlers
const tauriDismissStack: (() => void)[] = []
let unlistenTauriBack: { unregister(): Promise<void> } | null = null
let isRegistering = false

// Handler RAÍZ: se ejecuta cuando el botón atrás se pulsa y NO hay overlays que
// cerrar (estás en la pantalla principal). Lo usa `useExitConfirm` para el
// "pulsa de nuevo para salir". Mientras exista, el listener de Tauri se mantiene
// registrado siempre — así interceptamos el atrás raíz en vez de dejar que el
// sistema cierre la app de golpe.
let rootBackHandler: (() => void) | null = null
export function setRootBackHandler(fn: (() => void) | null): void {
  rootBackHandler = fn
  void updateTauriBackButtonListener()
}

// ── Camino navegador/PWA ────────────────────────────────────────────────────
// UN solo listener `popstate` global + una pila de overlays (igual que el
// camino de Tauri de arriba).
//
// Antes había un listener POR overlay y una sola bandera de supresión. Como un
// `popstate` dispara TODOS los listeners registrados, solo el primero quedaba
// suprimido y los demás ejecutaban su cierre: al abrir el numpad sobre el
// editor de un ítem se cerraban el numpad Y la lista entera (el numpad ni
// llegaba a verse). Con una pila, un `popstate` real cierra solo el overlay de
// arriba, y los `history.back()` que provocamos nosotros se cuentan para no
// confundirlos con el botón "atrás" del usuario.
interface BrowserOverlay { id: number; dismiss: () => void }
const browserDismissStack: BrowserOverlay[] = []
let browserOverlayId = 0
let programmaticBacks = 0
let popStateBound = false

function onBrowserPopState() {
  // `history.back()` disparado por nosotros al desmontar un overlay: no es el
  // usuario pulsando atrás, así que no debe cerrar nada.
  if (programmaticBacks > 0) {
    programmaticBacks -= 1
    return
  }
  browserDismissStack.pop()?.dismiss()
}

function ensurePopStateBound() {
  if (popStateBound || typeof window === 'undefined') return
  window.addEventListener('popstate', onBrowserPopState)
  popStateBound = true
}

async function updateTauriBackButtonListener() {
  // Se mantiene el listener si hay overlays que cerrar O un handler raíz (salir).
  const shouldListen = tauriDismissStack.length > 0 || rootBackHandler !== null
  if (shouldListen) {
    if (!unlistenTauriBack && !isRegistering) {
      isRegistering = true
      try {
        const { onBackButtonPress } = await import('@tauri-apps/api/app')
        unlistenTauriBack = await onBackButtonPress(() => {
          // Prioridad: cerrar el overlay de arriba. Si no hay ninguno, el handler
          // raíz decide (doble-atrás para salir). En ambos casos consumimos el
          // evento, evitando que el sistema cierre la app sin avisar.
          const handler = tauriDismissStack.pop()
          if (handler) handler()
          else rootBackHandler?.()
          void updateTauriBackButtonListener()
        })
      } catch (err) {
        log.error('Error listening to Tauri back button', err)
      } finally {
        isRegistering = false
      }
    }
  } else {
    if (unlistenTauriBack) {
      const listener = unlistenTauriBack
      unlistenTauriBack = null
      try {
        await listener.unregister()
      } catch (err) {
        log.error('Error unregistering Tauri back button listener', err)
      }
    }
  }
}

export function useMobileBackDismiss(active: boolean, onDismiss: () => void) {
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss

  useEffect(() => {
    if (!active) return

    if (isTauri()) {
      const handler = () => dismissRef.current()
      tauriDismissStack.push(handler)
      void updateTauriBackButtonListener()

      return () => {
        const idx = tauriDismissStack.indexOf(handler)
        if (idx !== -1) {
          tauriDismissStack.splice(idx, 1)
        }
        void updateTauriBackButtonListener()
      }
    } else {
      // Browser PWA fallback using history state
      ensurePopStateBound()
      const overlayId = ++browserOverlayId
      const entry: BrowserOverlay = { id: overlayId, dismiss: () => dismissRef.current() }
      browserDismissStack.push(entry)
      window.history.pushState({ sharkyOverlay: overlayId }, '')

      return () => {
        const index = browserDismissStack.indexOf(entry)
        if (index !== -1) browserDismissStack.splice(index, 1)
        // Si nuestra entrada sigue siendo la actual, consumirla — contándola
        // para que el listener no la tome por un "atrás" del usuario.
        if (window.history.state?.sharkyOverlay === overlayId) {
          programmaticBacks += 1
          window.history.back()
        }
      }
    }
  }, [active])
}
