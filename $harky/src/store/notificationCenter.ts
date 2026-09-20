import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

// Recuerda las últimas ~200 notificaciones ya vistas para que el numerito de la
// campanita no reaparezca por avisos que el usuario ya revisó. Se poda para no
// crecer sin límite (los ids de presupuesto/recurrentes cambian cada mes).
const MAX_SEEN = 200

interface NotificationCenterState {
  seenIds: string[]
  /** Marca un lote de ids como vistos (unión con lo ya guardado). */
  markSeen: (ids: string[]) => void
}

export const useNotificationCenter = create<NotificationCenterState>()(
  persist(
    (set, get) => ({
      seenIds: [],
      markSeen: (ids) => {
        if (ids.length === 0) return
        const current = get().seenIds
        const merged = [...ids, ...current.filter(id => !ids.includes(id))]
        set({ seenIds: merged.slice(0, MAX_SEEN) })
      },
    }),
    {
      name: 'sharky-notification-center-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
