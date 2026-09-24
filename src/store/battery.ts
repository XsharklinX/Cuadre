import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { EMPTY_BATTERY_STATE, type BatteryPromptState } from '@/data/batteryGuide'

/**
 * Lo que la app recuerda sobre la exención de batería.
 *
 * Va aparte de los ajustes normales a propósito: no es una preferencia, es el
 * historial de una conversación con el usuario, y **no debe viajar en un
 * respaldo**. Quien restaura sus datos en un teléfono nuevo tiene que volver a
 * conceder la exención en ESE teléfono, así que heredar un "ya lo hice" del
 * anterior sería justo lo contrario de lo que hace falta.
 */
interface BatteryStore extends BatteryPromptState {
  /** El usuario dice que ya lo concedió: no se vuelve a preguntar. */
  markDone: () => void
  /** "Ahora no": se calla dos semanas, hasta tres veces. */
  markSnoozed: () => void
  /**
   * Android retiró la exención (pasa al reinstalar o al limpiar ajustes).
   * Se olvida el "ya lo hice" para poder volver a pedirlo.
   */
  reset: () => void
}

export const useBattery = create<BatteryStore>()(
  persist(
    (set) => ({
      ...EMPTY_BATTERY_STATE,
      markDone: () => set({ done: true }),
      markSnoozed: () => set(state => ({
        lastAskedAt: Date.now(),
        timesAsked: state.timesAsked + 1,
      })),
      reset: () => set({ ...EMPTY_BATTERY_STATE }),
    }),
    {
      name: 'cuadre-battery-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
