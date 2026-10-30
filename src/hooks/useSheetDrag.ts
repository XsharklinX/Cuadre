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

/**
 * Si lo que se desplaza bajo el dedo está arriba del todo.
 *
 * Sube desde donde se tocó hasta la hoja buscando el primer elemento que de
 * verdad se desplaza. Si encuentra uno y no está en su tope, el gesto es
 * suyo: arrastrar ahí es leer, no cerrar.
 */
function scrollerAlTope(desde: HTMLElement | null, limite: HTMLElement): boolean {
  let nodo: HTMLElement | null = desde
  while (nodo && nodo !== limite.parentElement) {
    if (nodo.scrollHeight > nodo.clientHeight + 1) return nodo.scrollTop <= 2
    nodo = nodo.parentElement
  }
  return true
}

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
       * Y solo si LO QUE SE DESPLAZA bajo el dedo está arriba del todo.
       *
       * Mirar el `scrollTop` de la hoja no bastaba: quien se desplaza es un
       * div interno —el cuerpo del formulario—, así que la hoja siempre
       * estaba en cero y el arrastre se enganchaba SIEMPRE. Bajar el dedo
       * para leer el formulario movía la hoja entera y destapaba la pantalla
       * de atrás, que es lo que se veía como «se ve el fondo detrás».
       */
      if (scrollerAlTope(destino, el) === false) return
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

    // Marca para que el arrastre global (`lib/sheetMotion`) no se enganche también.
    el.dataset.sheetDrag = ''
    el.addEventListener('pointerdown', abajo)
    el.addEventListener('pointermove', mueve)
    el.addEventListener('pointerup', suelta)
    el.addEventListener('pointercancel', fin)

    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointermove', mueve)
      el.removeEventListener('pointerup', suelta)
      el.removeEventListener('pointercancel', fin)
      delete el.dataset.sheetDrag
      fin()
    }
  }, [active])

  return ref
}
