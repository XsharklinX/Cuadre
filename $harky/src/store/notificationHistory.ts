import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { NotificationTargetType } from '@/hooks/useNotificationTarget'

const MAX_HISTORY = 100

export interface NotificationHistoryEntry {
  id: string
  type: NotificationTargetType
  title: string
  body: string
  /** Epoch ms — viene tal cual de `ReminderWorker.kt` (System.currentTimeMillis()). */
  createdAt: number
}

interface NotificationHistoryState {
  entries: NotificationHistoryEntry[]
  /** Mezcla entradas nuevas del lado nativo (por id, más nuevas primero). */
  merge: (entries: NotificationHistoryEntry[]) => void
  remove: (id: string) => void
  clear: () => void
}

export const useNotificationHistory = create<NotificationHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      merge: (incoming) => {
        if (incoming.length === 0) return
        const current = get().entries
        const known = new Set(current.map(e => e.id))
        const fresh = incoming.filter(e => !known.has(e.id))
        if (fresh.length === 0) return
        const merged = [...fresh, ...current]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, MAX_HISTORY)
        set({ entries: merged })
      },
      remove: (id) => set({ entries: get().entries.filter(e => e.id !== id) }),
      clear: () => set({ entries: [] }),
    }),
    {
      name: 'sharky-notification-history-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
