import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface QuickAddsState {
  /** Rápidos fijados: van primero, por encima del orden por frecuencia. */
  pinned: string[]
  /** Rápidos ocultos: no vuelven a proponerse aunque se repitan. */
  hidden: string[]
  togglePinned: (key: string) => void
  toggleHidden: (key: string) => void
}

/**
 * Preferencias del usuario sobre los «Rápidos». La lista en sí se deriva del
 * historial en cada render (ver data/quickAdds.ts) — aquí solo vive lo que el
 * usuario decidió a mano, que es lo único que no se puede recalcular.
 */
export const useQuickAdds = create<QuickAddsState>()(
  persist(
    (set) => ({
      pinned: [],
      hidden: [],
      togglePinned: key => set(s => ({
        pinned: s.pinned.includes(key) ? s.pinned.filter(k => k !== key) : [...s.pinned, key],
      })),
      toggleHidden: key => set(s => ({
        hidden: s.hidden.includes(key) ? s.hidden.filter(k => k !== key) : [...s.hidden, key],
      })),
    }),
    { name: 'sharky-quickadds-v1', storage: createJSONStorage(() => localStorage) },
  ),
)
