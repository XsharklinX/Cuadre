import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** Secciones plegables de Análisis. El id viaja al store, así que no se renombra a la ligera. */
export type AnalyticsSectionId = 'metrics' | 'trends' | 'evolution' | 'networth' | 'categories'

interface AnalyticsSectionsState {
  open: Partial<Record<AnalyticsSectionId, boolean>>
  /**
   * Cuántas veces se ha ABIERTO cada una. Es lo que ordena los acordeones:
   * los que más usas arriba, en vez de un orden fijo que no sabe nada de ti.
   */
  opens: Partial<Record<AnalyticsSectionId, number>>
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
      opens: {},
      toggle: (id) => set(state => {
        const abriendo = !state.open[id]
        return {
          open: { ...state.open, [id]: abriendo },
          // Solo cuenta ABRIR: cerrar no dice que te interese.
          opens: abriendo ? { ...state.opens, [id]: (state.opens[id] ?? 0) + 1 } : state.opens,
        }
      }),
      isOpen: (id) => get().open[id] === true,
    }),
    {
      name: 'sharky-analytics-sections-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
