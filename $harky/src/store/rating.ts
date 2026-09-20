import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import {
  EMPTY_RATING_STATE, recordLaunch, recordRated, recordSnooze,
  shouldAskForRating, type RatingState,
} from '@/data/ratingPrompt'

interface RatingStore extends RatingState {
  /** Cuenta un arranque. Idempotente por sesión: lo llama App una sola vez. */
  noteLaunch: () => void
  markRated: () => void
  markSnoozed: () => void
  /** ¿Toca preguntar ahora, con este número de movimientos? */
  shouldAsk: (transactionCount: number) => boolean
}

/**
 * Lo que la app recuerda sobre la valoración. Se persiste aparte de los
 * ajustes a propósito: no es una preferencia del usuario, es historial de la
 * relación con la app, y no debe viajar en un backup ni restaurarse — quien
 * restaura un backup en un teléfono nuevo no quiere que le vuelvan a preguntar.
 */
export const useRating = create<RatingStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_RATING_STATE,
      noteLaunch: () => set(state => recordLaunch(state, Date.now())),
      markRated: () => set(state => recordRated(state)),
      markSnoozed: () => set(state => recordSnooze(state, Date.now())),
      shouldAsk: (transactionCount) => shouldAskForRating({
        state: get(),
        transactionCount,
        now: Date.now(),
      }),
    }),
    {
      name: 'sharky-rating-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
