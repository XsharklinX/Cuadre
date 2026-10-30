import { useEffect, useRef } from 'react'
import { playSoftHaptic } from '@/lib/sound'

/**
 * DESLIZAR UNA FILA PARA COBRAR.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────
 * Marcar «me pagó» es la acción que se hace veinte veces al mes, y pedía abrir
 * una hoja, revisar cuatro campos y guardar. El gesto de deslizar ya existe en
 * el correo y en los mensajes de cualquier teléfono, así que no hay nada que
 * aprender.
 *
 * ── CON DESHACER, PORQUE ESTO MUEVE DINERO ────────────────────────────
 * Un deslizamiento accidental que crea un ingreso en el libro no se puede
 * quedar hecho. Quien llame a esto tiene que ofrecer deshacer en su aviso; el
 * gesto solo avisa de que pasó, con un toque háptico, para que no se cobre
 * nada en silencio.
 *
 * ── EL `transform` SOLO MIENTRAS SE ARRASTRA ──────────────────────────
 * Igual que en las hojas: un transform permanente crearía un bloque
 * contenedor y encogería a su caja lo que lleve dentro con `position: fixed`.
 */

/** Cuánto hay que cruzar para que la acción cuente. */
const TRIGGER_PX = 78
/** Tope de lo que la fila se deja arrastrar: más allá no informa de nada. */
const MAX_PX = 104

export function useSwipeAction<T extends HTMLElement>(
  onAction: () => void,
  active = true,
  /**
   * L3 · LA IZQUIERDA, si hay algo que hacer con ella.
   * En la lista de clientes, deslizar a la izquierda prepara el recordatorio.
   * Sin esto la fila no se mueve hacia ese lado: un gesto que no hace nada
   * confundiría.
   */
  onLeft?: () => void,
) {
  const ref = useRef<T>(null)
  const accion = useRef(onAction)
  accion.current = onAction
  const izquierda = useRef(onLeft)
  izquierda.current = onLeft
  const conIzquierda = !!onLeft

  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return

    let x0 = 0
    let y0 = 0
    let dx = 0
    let activo = false
    let avisado = false
    let pid = -1

    const limpiar = () => {
      el.classList.remove('m-swiping', 'm-swipe-armed', 'm-swipe-left')
      el.style.removeProperty('--m-swipe')
      activo = false
      avisado = false
      dx = 0
    }

    const abajo = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      x0 = e.clientX
      y0 = e.clientY
      pid = e.pointerId
      activo = true
    }

    const mueve = (e: PointerEvent) => {
      if (!activo || e.pointerId !== pid) return
      const cx = e.clientX - x0
      const cy = Math.abs(e.clientY - y0)
      // Si baja más de lo que cruza, es un scroll y la fila no se mueve.
      if (cy > Math.abs(cx)) { if (dx !== 0) limpiar(); return }
      // A la izquierda solo si hay algo que hacer allí.
      if (cx <= 0 && !conIzquierda) { if (dx !== 0) limpiar(); return }

      dx = Math.max(-MAX_PX, Math.min(cx, MAX_PX))
      el.classList.add('m-swiping')
      el.classList.toggle('m-swipe-left', dx < 0)
      el.style.setProperty('--m-swipe', `${dx}px`)

      // El aviso táctil AL CRUZAR el umbral, una sola vez: así se sabe que
      // soltar ahí hace algo, antes de soltar.
      if (Math.abs(dx) >= TRIGGER_PX && !avisado) {
        avisado = true
        el.classList.add('m-swipe-armed')
        playSoftHaptic()
      } else if (Math.abs(dx) < TRIGGER_PX && avisado) {
        avisado = false
        el.classList.remove('m-swipe-armed')
      }
    }

    const suelta = (e: PointerEvent) => {
      if (!activo || e.pointerId !== pid) return
      const derecha = dx >= TRIGGER_PX
      const izq = dx <= -TRIGGER_PX
      limpiar()
      if (derecha) accion.current()
      else if (izq) izquierda.current?.()
    }

    el.addEventListener('pointerdown', abajo, { passive: true })
    el.addEventListener('pointermove', mueve)
    el.addEventListener('pointerup', suelta)
    el.addEventListener('pointercancel', limpiar)

    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointermove', mueve)
      el.removeEventListener('pointerup', suelta)
      el.removeEventListener('pointercancel', limpiar)
      limpiar()
    }
  }, [active, conIzquierda])

  return ref
}
