import { useEffect, useState } from 'react'
import { useFinance } from '@/store/finance'
import { useDev } from '@/store/dev'
import { useRating } from '@/store/rating'

/** Retraso antes de mostrar el diálogo, para no atropellar el arranque. */
const SETTLE_MS = 2500

/**
 * Decide si mostrar el diálogo de valoración en esta sesión.
 *
 * Se evalúa UNA vez, al arrancar y con retraso: preguntar en medio de una
 * tarea (mientras registras un gasto, mientras revisas un saldo) es lo que
 * convierte una pregunta razonable en una interrupción.
 */
export function useRatingPrompt(suppressed = false): { open: boolean; close: () => void; rated: () => void } {
  const [open, setOpen] = useState(false)
  const noteLaunch = useRating(s => s.noteLaunch)
  const markRated = useRating(s => s.markRated)
  const markSnoozed = useRating(s => s.markSnoozed)

  useEffect(() => {
    /*
     * Forzado desde el modo desarrollador: abre y punto, sin reglas ni
     * espera. Probar este dialogo de otra forma exige siete dias de uso,
     * ocho arranques y quince movimientos — o sea, no se probaba.
     *
     * La bandera se apaga al consumirla: se fuerza una vez, no para siempre.
     */
    if (useDev.getState().forceRating) {
      useDev.getState().setForceRating(false)
      setOpen(true)
      return
    }

    noteLaunch()
    // El conteo se lee DESPUÉS del retraso, no ahora: en el arranque el store
    // puede no haber hidratado todavía y saldría 0.
    const id = setTimeout(() => {
      // Nunca encima de las Novedades: quien acaba de actualizar ya tiene un
      // dialogo abierto, y apilar una peticion de valoracion sobre el es la
      // forma mas rapida de conseguir una estrella.
      if (suppressed) return
      if (useRating.getState().shouldAsk(useFinance.getState().transactions.length)) {
        setOpen(true)
      }
    }, SETTLE_MS)
    return () => clearTimeout(id)
    // Solo al montar: una sola evaluación por sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed])

  return {
    open,
    close: () => { markSnoozed(); setOpen(false) },
    rated: () => { markRated(); setOpen(false) },
  }
}
