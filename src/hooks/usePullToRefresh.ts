import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/**
 * TIRAR DE LA LISTA CON ELASTICIDAD.
 *
 * Al llegar arriba del todo la lista simplemente se paraba. Un tope seco se
 * siente roto aunque sea correcto, y es además el único sitio natural para
 * refrescar las tasas de cambio: hasta ahora solo se actualizaban solas cada
 * doce horas y no había forma de pedirlo.
 *
 * TRES DECISIONES DE IMPLEMENTACIÓN:
 *
 * · El arrastre NO pasa por el estado de React. Mover un `useState` en cada
 *   `touchmove` repinta la pantalla entera sesenta veces por segundo. La
 *   distancia se escribe en una variable CSS del contenedor y el navegador la
 *   compone sin volver a renderizar nada. Por React solo pasa la FASE, que
 *   cambia tres veces por gesto.
 *
 * · El listener se engancha a mano con `{ passive: false }`. React registra
 *   `touchmove` en modo pasivo, donde `preventDefault` no hace nada, y sin él
 *   el navegador se queda con el gesto y dibuja su propio rebote encima.
 *
 * · Hay resistencia. El dedo recorre más que la lista, como en cualquier
 *   rebote del sistema: sin eso el contenido persigue al dedo y se siente
 *   suelto en vez de elástico.
 */

/** Arrastre, en px, a partir del cual soltar refresca. */
const TRIGGER = 68
/** Tope del estiramiento, pase lo que pase. */
const MAX = 104
/** Cuánto de lo que recorre el dedo se traduce en movimiento. */
const RESISTANCE = 0.46
/** Movimiento horizontal a partir del cual esto es un gesto de otra cosa. */
const H_SLOP = 16

export type PullPhase = 'idle' | 'pulling' | 'armed' | 'busy'

export function usePullToRefresh(
  ref: RefObject<HTMLElement | null>,
  onRefresh: () => void | Promise<void>,
  enabled = true,
): PullPhase {
  const [phase, setPhase] = useState<PullPhase>('idle')
  // `onRefresh` suele ser una función nueva en cada render; guardarla en una
  // ref evita volver a enganchar los listeners en cada repintado.
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    let startY = 0
    let startX = 0
    let tracking = false
    let distance = 0

    const setDistance = (px: number) => {
      distance = px
      el.style.setProperty('--ptr', `${px}px`)
    }

    const reset = (animated: boolean) => {
      tracking = false
      // Al soltar, la vuelta la hace una transición CSS; mientras se arrastra
      // no debe haberla o el contenido iría con retraso respecto al dedo.
      el.classList.toggle('ptr-settling', animated)
      setDistance(0)
      if (animated) window.setTimeout(() => el.classList.remove('ptr-settling'), 320)
    }

    const onStart = (event: TouchEvent) => {
      // Solo desde arriba del todo, y solo con un dedo: dos dedos es un zoom.
      if (el.scrollTop > 0 || event.touches.length !== 1) return
      startY = event.touches[0].clientY
      startX = event.touches[0].clientX
      tracking = true
      el.classList.remove('ptr-settling')
    }

    const onMove = (event: TouchEvent) => {
      if (!tracking) return
      const touch = event.touches[0]
      if (!touch) return
      const dy = touch.clientY - startY
      const dx = Math.abs(touch.clientX - startX)

      // Hacia arriba, de lado, o la lista ya se movió: esto no es un tirón.
      if (dy <= 0 || dx > H_SLOP || el.scrollTop > 0) {
        if (distance > 0) reset(true)
        else tracking = false
        return
      }

      event.preventDefault()
      const px = Math.min(MAX, dy * RESISTANCE)
      setDistance(px)
      setPhase(px >= TRIGGER ? 'armed' : 'pulling')
    }

    const onEnd = () => {
      if (!tracking) return
      const disparar = distance >= TRIGGER
      reset(true)
      if (!disparar) { setPhase('idle'); return }

      setPhase('busy')
      // El resultado no importa aquí: si la red falla, el indicador se cierra
      // igual. Dejarlo girando para siempre sería peor que no refrescar.
      void Promise.resolve(refresh.current()).finally(() => setPhase('idle'))
    }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
      el.style.removeProperty('--ptr')
      el.classList.remove('ptr-settling')
    }
  }, [ref, enabled])

  return phase
}
