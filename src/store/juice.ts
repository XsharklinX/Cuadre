import { create } from 'zustand'

/**
 * LA CIFRA ATERRIZA EN SU SITIO.
 *
 * Al guardar, la hoja se cerraba y el movimiento YA estaba en la lista, sin
 * transición: se veía como si siempre hubiera estado ahí. Que la fila nueva
 * caiga desde arriba y se asiente cierra el gesto — ves dónde fue a parar lo
 * que acabas de anotar.
 *
 * Esto es lo único que hace falta para conseguirlo: saber qué fila es la
 * recién llegada. Vive fuera del store de finanzas a propósito:
 *
 * · NO se guarda en disco. Es un estado de medio segundo; persistirlo haría
 *   que la fila volviera a caer cada vez que abres la app.
 * · NO toca `sharky-finance-v2`. Añadir un campo al store persistido obliga a
 *   pensar en migraciones y en el formato de las copias de seguridad, y esto
 *   no merece ese riesgo.
 */

/** Cuánto dura la marca. Un poco más que la animación, por si el render tarda. */
const LANDING_MS = 1200

interface JuiceState {
  /** Id del movimiento recién guardado, o `null`. */
  landedTxId: string | null
  markLanded: (id: string) => void
}

let clearTimer: ReturnType<typeof setTimeout> | undefined

export const useJuice = create<JuiceState>()((set, get) => ({
  landedTxId: null,
  markLanded: (id) => {
    clearTimeout(clearTimer)
    set({ landedTxId: id })
    clearTimer = setTimeout(() => {
      // Solo se limpia si sigue siendo el mismo: guardar dos movimientos
      // seguidos no debe dejar al segundo sin su aterrizaje.
      if (get().landedTxId === id) set({ landedTxId: null })
    }, LANDING_MS)
  },
}))
