import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface DismissalsState {
  /** Sugerencias de "suscripción detectada" que el usuario marcó como no relevantes. */
  dismissed: string[]
  /** Tarjetas concretas de Análisis ocultas (una sugerencia puntual). */
  hiddenInsights: string[]
  /** Tipos de tarjeta de Análisis ocultos por completo (`insight.id`). */
  hiddenInsightTypes: string[]
  dismiss: (key: string) => void
  hideInsight: (key: string) => void
  hideInsightType: (type: string) => void
  restoreAll: () => void
}

/** Todo lo que el usuario dijo "no me lo vuelvas a mostrar". */
export const useDismissals = create<DismissalsState>()(
  persist(
    (set, get) => ({
      dismissed: [],
      hiddenInsights: [],
      hiddenInsightTypes: [],
      dismiss: (key) => {
        if (get().dismissed.includes(key)) return
        set((state) => ({ dismissed: [...state.dismissed, key] }))
      },
      hideInsight: (key) => {
        if (get().hiddenInsights.includes(key)) return
        set((state) => ({ hiddenInsights: [...state.hiddenInsights, key] }))
      },
      hideInsightType: (type) => {
        if (get().hiddenInsightTypes.includes(type)) return
        set((state) => ({ hiddenInsightTypes: [...state.hiddenInsightTypes, type] }))
      },
      restoreAll: () => set({ dismissed: [], hiddenInsights: [], hiddenInsightTypes: [] }),
    }),
    {
      // El nombre conserva "subscription" a propósito: es la clave con la que
      // ya hay descartes guardados en los teléfonos de los usuarios, y
      // cambiarla los haría reaparecer todos de golpe.
      name: 'sharky-subscription-dismissals-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
