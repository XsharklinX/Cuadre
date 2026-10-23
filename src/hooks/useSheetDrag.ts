import { useEffect, useRef } from 'react'
import { playSoftHaptic } from '@/lib/sound'

/**
 * ARRASTRAR UNA HOJA HACIA ABAJO PARA CERRARLA.
 *
 * ── POR QUÉ ────────────────────────────────────────────────────────────
 * Es lo que todo el mundo intenta antes de buscar la X, porque es lo que hacen
 * las hojas de todas las apps del teléfono. Hasta ahora el gesto no hacía
 * nada, así que había que subir la mano hasta la esquina.
 *
 * Y mata una confusión real: la app ya tuvo un fallo porque un toque mientras
 * la hoja subía caía en el fondo oscuro y la cerraba sin querer. Cuando el
 * gesto de cerrar ES arrastrar la hoja, el gesto y su destino son el mismo
 * sitio y no hay nada que confundir.
 *
 * ── NO SE ESCRIBE UN `transform` PERMANENTE ────────────────────────────
 * Un `transform` fijo en la hoja crearía un bloque contenedor y encogería a
 * su caja todo lo que tenga dentro con `position: fixed`. Ya le pasó a esta
 * app con el tirar-para-recargar. Así que la hoja solo lleva transform
 * MIENTRAS se arrastra, marcada con una clase, y al soltar vuelve a no tener
 * ninguno.
 */

/** Cuánto hay que bajar para que se cierre. Menos cierra por accidente. */
const CLOSE_PX = 110
/** O soltarla con prisa: un gesto rápido y corto también quiere cerrar. */
const CLOSE_SPEED = 0.55

export function useSheetDrag<T extends HTMLElement>(onClose: () => void, active = true) {
  const ref = useRef<T>(null)
  const cerrar = useRef(onClose)
  cerrar.current = onClose

  useEffect(() => {
    if (!active) return
    const el = ref.current
    if (!el) return

    let y0 = 0
    let t0 = 0
    let dy = 0
    let arrastrando = false
    let pid = -1

    const fin = () => {
      el.classList.remove('m-dragging')
      el.style.removeProperty('--m-drag')
      arrastrando = false
      dy = 0
    }

    const abajo = (e: PointerEvent) => {
      // Solo con el dedo o el ratón sobre la propia hoja, y nunca empezando
      // sobre algo que se escribe: arrastrar un campo de texto es seleccionar.
      const destino = e.target as HTMLElement | null
      if (destino?.closest('input, textarea, select')) return
      /*
       * Y solo si la hoja está arriba de su scroll.
       *
       * Si no, bajar el dedo dentro de una lista larga cerraría la hoja en vez
       * de desplazarla, que es justo lo contrario de lo que se pide.
       */
      if (el.scrollTop > 2) return
      y0 = e.clientY
      t0 = e.timeStamp
      pid = e.pointerId
      arrastrando = true
    }

    const mueve = (e: PointerEvent) => {
      if (!arrastrando || e.pointerId !== pid) return
      const delta = e.clientY - y0
      // Hacia arriba no se mueve: la hoja ya está en su sitio.
      if (delta <= 0) {
        if (dy !== 0) fin()
        return
      }
      dy = delta
      el.classList.add('m-dragging')
      el.style.setProperty('--m-drag', `${delta}px`)
    }

    const suelta = (e: PointerEvent) => {
      if (!arrastrando || e.pointerId !== pid) return
      const recorrido = dy
      const velocidad = recorrido / Math.max(1, e.timeStamp - t0)
      fin()
      if (recorrido > CLOSE_PX || (recorrido > 28 && velocidad > CLOSE_SPEED)) {
        playSoftHaptic()
        cerrar.current()
      }
    }

    el.addEventListener('pointerdown', abajo)
    el.addEventListener('pointermove', mueve)
    el.addEventListener('pointerup', suelta)
    el.addEventListener('pointercancel', fin)

    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointermove', mueve)
      el.removeEventListener('pointerup', suelta)
      el.removeEventListener('pointercancel', fin)
      fin()
    }
  }, [active])

  return ref
}
