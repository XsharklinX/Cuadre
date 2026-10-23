import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { addIncident, newIncident, sanitizeIncidents, type Incident } from '@/data/incidents'
import type { Transaction } from '@/types'

/**
 * Los fallos que perdieron datos del usuario, con su propia clave.
 *
 * PERSISTIDO a propósito: el caso que esto resuelve es justamente el del fallo
 * que no se llegó a leer. Si se borrara al cerrar la app, el fallo de las
 * 7:02 de la mañana —que es cuando el teléfono se bloqueó antes de que
 * pudieras mirarlo— volvería a desaparecer sin dejar rastro.
 *
 * Aparte de `sharky-finance-v2`, como la papelera: esto no es el libro, y un
 * intento fallido no justifica tocar la forma del libro.
 */

interface IncidentsState {
  items: Incident[]
  /** Apunta un guardado que no se pudo hacer. */
  recordSaveFailure: (tx: Transaction, message: string) => void
  /** Lo saca de la lista y lo devuelve, para reintentarlo. */
  take: (id: string) => Incident | null
  dismiss: (id: string) => void
  clear: () => void
}

export const useIncidents = create<IncidentsState>()(
  persist(
    (set, get) => ({
      items: [],

      recordSaveFailure: (tx, message) => set(s => ({
        items: addIncident(s.items, newIncident('save-tx', message, tx)),
      })),

      take: (id) => {
        const found = get().items.find(i => i.id === id) ?? null
        if (found) set(s => ({ items: s.items.filter(i => i.id !== id) }))
        return found
      },

      dismiss: (id) => set(s => ({ items: s.items.filter(i => i.id !== id) })),

      clear: () => set({ items: [] }),
    }),
    {
      name: 'cuadre-incidents-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({
        ...current,
        items: sanitizeIncidents((persisted as { items?: unknown } | undefined)?.items),
      }),
    },
  ),
)
