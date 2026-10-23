import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

/**
 * LA TARJETA SE INCLINA AL DESLIZARLA.
 *
 * El carrusel de tarjetas desplazaba rectángulos planos de lado. Una tarjeta
 * de verdad gira un poco cuando la empujas, y el brillo se mueve con ella: es
 * la diferencia entre objetos que ruedan y estampas que resbalan. Es además
 * el único sitio de la app donde una tarjeta puede comportarse como una
 * tarjeta.
 *
 * Se mide la VELOCIDAD, no la posición: lo que inclina un objeto es el empuje,
 * así que la tarjeta se ladea mientras el dedo arrastra y vuelve a plano sola
 * cuando el carrusel frena. Mapear la posición daría una inclinación fija por
 * tarjeta, que se ve como un error de maquetación y no como un gesto.
 *
 * Todo pasa por UNA variable CSS en el contenedor, sin estado de React: el
 * navegador compone la rotación sin repintar la pantalla, y apagarlo es
 * quitar una regla de CSS.
 */

/** Inclinación máxima. Más que esto se ve como un error de perspectiva. */
const MAX_DEG = 11
/** Px de desplazamiento por fotograma que dan la inclinación máxima. */
const FULL_SPEED = 26
/** Cuánto se conserva de la inclinación en cada fotograma al soltar. */
const DECAY = 0.86
/** Por debajo de esto ya está plana; se para el bucle para no gastar batería. */
const FLAT = 0.05

export function useCarouselTilt(ref: RefObject<HTMLElement | null>, enabled = true): void {
  // La animación corre fuera de React; sus variables no pueden vivir en el
  // cuerpo del componente o se reiniciarían en cada render.
  const raf = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return

    // Quien prefiere menos movimiento no quiere tarjetas girando.
    const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (quieto?.matches) return

    let lastLeft = el.scrollLeft
    let deg = 0
    let running = false

    const paint = () => {
      el.style.setProperty('--tilt', `${deg.toFixed(2)}deg`)
      /*
       * La clase marca «ahora mismo se está inclinando», y el CSS cuelga de
       * ella el `transform`. No es decoración: un `transform` permanente,
       * aunque valga cero grados, convierte cada tarjeta en bloque contenedor
       * de sus descendientes `position: fixed` y deja `will-change` activo en
       * todas a la vez. En reposo no debe haber ninguna regla puesta.
       */
      el.classList.toggle('tilting', deg !== 0)
    }

    const frame = () => {
      const left = el.scrollLeft
      const delta = left - lastLeft
      lastLeft = left

      if (delta !== 0) {
        // Empuja hacia el valor que pide la velocidad actual, sin saltar: un
        // salto se vería como un tirón en vez de como inercia.
        const objetivo = Math.max(-1, Math.min(1, delta / FULL_SPEED)) * -MAX_DEG
        deg += (objetivo - deg) * 0.4
      } else {
        deg *= DECAY
      }

      if (Math.abs(deg) < FLAT && delta === 0) {
        deg = 0
        paint()
        running = false
        return
      }

      paint()
      raf.current = requestAnimationFrame(frame)
    }

    const onScroll = () => {
      if (running) return
      running = true
      raf.current = requestAnimationFrame(frame)
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf.current)
      el.style.removeProperty('--tilt')
      el.classList.remove('tilting')
    }
  }, [ref, enabled])
}
