import { useEffect, useRef } from 'react'

/*
 * LA PILA DE DIÁLOGOS ABIERTOS.
 *
 * Cada diálogo escucha `keydown` en `window`, así que un Escape llegaba a
 * TODOS los montados a la vez: con una hoja abierta encima de otra —la ficha
 * de un cliente y su formulario de editar— una sola tecla cerraba las dos y
 * te devolvía a la lista en vez de a donde estabas.
 *
 * El botón atás de Android ya se resolvía con una pila (ver
 * `useMobileBackDismiss`); esto es la misma idea para el teclado: solo el de
 * arriba se cierra.
 */
const dialogStack: object[] = []

let mobileContentLockCount = 0
let previousMobileContentOverflow = ''

function lockMobileContent() {
  const scroller = document.querySelector<HTMLElement>('.mobile-content')
  if (!scroller) return

  if (mobileContentLockCount === 0) {
    previousMobileContentOverflow = scroller.style.overflow
    scroller.classList.add('mobile-content-locked')
    scroller.style.overflow = 'hidden'
  }

  mobileContentLockCount += 1
}

function unlockMobileContent() {
  const scroller = document.querySelector<HTMLElement>('.mobile-content')
  mobileContentLockCount = Math.max(0, mobileContentLockCount - 1)

  if (!scroller || mobileContentLockCount > 0) return

  scroller.classList.remove('mobile-content-locked')
  scroller.style.overflow = previousMobileContentOverflow
  previousMobileContentOverflow = ''
}

/**
 * Initial focus, Escape close, focus restore, and background scroll lock for
 * mobile dialogs/sheets. `active` supports mounted nested dialogs.
 *
 * `autoFocus` (default true) mueve el foco al primer elemento enfocable al
 * abrir — bueno para accesibilidad, pero si ese primer elemento es un `input`
 * abre el teclado solo (molesto en hojas donde escribir es opcional, como el
 * detalle de una lista). Pasar `false` conserva Escape + bloqueo de scroll sin
 * robar el foco.
 */
export function useDialogA11y<T extends HTMLElement>(onClose: () => void, active = true, autoFocus = true) {
  const ref = useRef<T>(null)

  // `onClose` casi siempre llega como flecha inline (nueva referencia en cada
  // render del padre). Si estuviera en las dependencias del efecto, este se
  // re-ejecutaría en CADA render —incluido cada tecla mientras escribes dentro
  // de la hoja— y su cleanup (`previous?.focus()`) le robaría el foco al input
  // al instante: por eso no se podía escribir el título de una lista. Guardarlo
  // en un ref hace que el handler de Escape lea siempre la última versión sin
  // que el efecto dependa de su identidad.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (autoFocus) {
      const firstFocusable = ref.current?.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      firstFocusable?.focus()
    }

    const token = {}
    dialogStack.push(token)

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      // Solo el de arriba. Los de debajo siguen escuchando, pero callados.
      if (dialogStack[dialogStack.length - 1] !== token) return
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown)
    lockMobileContent()

    return () => {
      const idx = dialogStack.indexOf(token)
      if (idx !== -1) dialogStack.splice(idx, 1)
      window.removeEventListener('keydown', onKeyDown)
      previous?.focus()
      unlockMobileContent()
    }
  }, [active, autoFocus])

  return ref
}
