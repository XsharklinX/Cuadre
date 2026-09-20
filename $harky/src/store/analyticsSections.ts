import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Secciones plegables de Análisis. El id viaja al store, así que no se renombra a la ligera. */
export type AnalyticsSectionId = 'metrics' | 'trends' | 'evolution' | 'networth' | 'categories'

interface AnalyticsSectionsState {
  open: Partial<Record<AnalyticsSectionId, boolean>>
  toggle: (id: AnalyticsSectionId) => void
  isOpen: (id: AnalyticsSectionId) => boolean
}

/**
 * Qué secciones de Análisis dejó abiertas el usuario. Se persiste porque el
 * valor de plegar está justo en que la pantalla arranque como cada quien la
 * dejó: quien quiera la vista completa la abre una vez y no vuelve a tocarla.
 *
 * Todas arrancan CERRADAS. La pantalla tenía siete paneles abiertos a la vez y
 * el problema no era el scroll, era que nada destacaba — abrir por defecto
 * cualquiera de ellas reintroduce ese ruido.
 */
export const useAnalyticsSections = create<AnalyticsSectionsState>()(
  persist(
    (set, get) => ({
      open: {},
      toggle: (id) => set(state => ({ open: { ...state.open, [id]: !state.open[id] } })),
      isOpen: (id) => get().open[id] === true,
    }),
    {
      name: 'sharky-analytics-sections-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
