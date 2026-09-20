import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { IgnoreReason } from '@/lib/bankNotificationParser'

const MAX_ENTRIES = 40

/**
 * Registro de diagnóstico de la detección de transacciones. Cada aviso que el
 * servicio nativo entrega al drenar se anota AQUÍ junto con el veredicto del
 * clasificador — se convirtió en movimiento o se descartó y por qué.
 *
 * Existe porque "no detecta nada" era una caja negra: los avisos rechazados se
 * tiraban en silencio, así que era imposible saber si el problema estaba en el
 * permiso/capa nativa (no llega NADA) o en el clasificador (llega pero se
 * descarta). Con este log el usuario y nosotros vemos exactamente qué pasa.
 */
export type DebugVerdict = 'added' | 'auto-added' | 'duplicate' | IgnoreReason

export interface BankDebugEntry {
  id: string
  postTime: number
  pkg: string
  title: string
  text: string
  verdict: DebugVerdict
}

interface BankNotificationsDebugState {
  entries: BankDebugEntry[]
  /** Total histórico de avisos capturados (no se recorta con el buffer). */
  totalCaptured: number
  /** Cuándo se revisó la cola nativa por última vez (ms epoch), 0 = nunca. */
  lastDrainAt: number
  /** Veces que se ha revisado la cola. */
  drainCount: number
  /** Cuántos avisos entregó el sistema en la última revisión. */
  lastPendingCount: number
  record: (entry: Omit<BankDebugEntry, 'id'>) => void
  /** Anota una revisión de la cola nativa y cuántos avisos entregó el sistema.
   *  Distingue "la app no revisa" de "revisa pero el sistema no entrega nada". */
  recordDrain: (pendingCount: number) => void
  clear: () => void
}

export const useBankNotificationsDebug = create<BankNotificationsDebugState>()(
  persist(
    (set) => ({
      entries: [],
      totalCaptured: 0,
      lastDrainAt: 0,
      drainCount: 0,
      lastPendingCount: 0,
      record: (entry) => set((state) => ({
        totalCaptured: state.totalCaptured + 1,
        entries: [
          { ...entry, id: `${entry.postTime}-${Math.random().toString(36).slice(2)}` },
          ...state.entries,
        ].slice(0, MAX_ENTRIES),
      })),
      recordDrain: (pendingCount) => set((state) => ({
        lastDrainAt: Date.now(),
        drainCount: state.drainCount + 1,
        lastPendingCount: pendingCount,
      })),
      clear: () => set({ entries: [], totalCaptured: 0 }),
    }),
    {
      name: 'sharky-bank-debug-v1',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
