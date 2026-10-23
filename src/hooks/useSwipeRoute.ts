import { useEffect, useRef } from 'react'

/**
 * PASAR DE PESTAÑA CON EL DEDO.
 *
 * ── LO QUE FALTABA ────────────────────────────────────────────────────
 * La transición entre rutas ya existía —se desliza en la dirección en que
 * vas— pero solo se disparaba tocando la barra de abajo. Deslizar la pantalla
 * es como la gente ya espera moverse entre pestañas vecinas, y aquí no hacía
 * nada.
 *
 * ── LAS TRES COSAS QUE LO HACEN USABLE ────────────────────────────────
 * 1. **Horizontal de verdad.** Si el dedo baja más de lo que cruza, es un
 *    scroll y no se toca: lo contrario haría imposible leer una lista.
 * 2. **Nada de robar gestos ajenos.** Dentro de un carrusel, de una gráfica
 *    que se arrastra o de una fila que se desliza para cobrar, el gesto es de
 *    ellos. Se marcan con `data-noswipe` y aquí se respetan.
 * 3. **Solo desde el borde del recorrido.** Da igual dónde empiece, pero
 *    tiene que ser un trazo claro: 60px cruzando y el doble de horizontal
 *    que de vertical.
 */

/** Cuánto hay que cruzar para cambiar de pestaña. */
const MIN_X = 60
/** Cuánto más horizontal que vertical tiene que ser para contar como tal. */
const RATIO = 1.8

export function useSwipeRoute<T extends HTMLElement>(
  onNext: () => void,
  onPrev: () => void,
  active = true,
) {
  const ref = useRef<T>(null)
  const next = useRef(onNext)
  const prev = useRef(onPrev)
  next.current = onNext
  prev.current = onPrev

  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return

    let x0 = 0
    let y0 = 0
    let valido = false
    let pid = -1

    const abajo = (e: PointerEvent) => {
      // Solo el dedo: con el ratón, arrastrar la ventana no es cambiar de
      // pestaña, y en escritorio ya está la barra.
      if (e.pointerType !== 'touch') return
      const destino = e.target as HTMLElement | null
      if (destino?.closest('[data-noswipe], input, textarea, select')) return
      x0 = e.clientX
      y0 = e.clientY
      pid = e.pointerId
      valido = true
    }

    const suelta = (e: PointerEvent) => {
      if (!valido || e.pointerId !== pid) return
      valido = false
      const dx = e.clientX - x0
      const dy = Math.abs(e.clientY - y0)
      // Si baja más de lo que cruza, era un scroll.
      if (Math.abs(dx) < MIN_X || Math.abs(dx) < dy * RATIO) return
      if (dx < 0) next.current()
      else prev.current()
    }

    const cancela = () => { valido = false }

    el.addEventListener('pointerdown', abajo, { passive: true })
    el.addEventListener('pointerup', suelta, { passive: true })
    el.addEventListener('pointercancel', cancela, { passive: true })

    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointerup', suelta)
      el.removeEventListener('pointercancel', cancela)
    }
  }, [active])

  return ref
}
