import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Transaction } from '@/types'

/**
 * EL HISTORIAL DE LOS PERIODOS CERRADOS.
 *
 * Cuando alguien «empieza de nuevo» (ver `data/periodClose.ts`), los
 * movimientos anteriores al corte SALEN del libro y vienen aquí. No se borra
 * nada: se pueden mirar, no cuentan para ningún saldo.
 *
 * ── POR QUÉ ESTO EN VEZ DE UNA FECHA DE CORTE ─────────────────────────
 * La alternativa era que los saldos solo contaran lo posterior al corte. Eso
 * obligaría a que TODOS los sitios que calculan un saldo respetaran la fecha:
 * el recálculo, el segundo libro de las tarjetas, Salud de datos, los aportes
 * a metas. Olvidar uno partiría la igualdad `saldo = apertura + movimientos` en
 * dos verdades, y ahí el libro deja de significar nada.
 *
 * Sacándolos de `transactions`, la igualdad se cumple exacta sin cambiar una
 * línea del cálculo. Cero riesgo sobre lo que ya funciona.
 *
 * ── EL TOPE, Y POR QUÉ EXISTE ─────────────────────────────────────────
 * Esto vive en `localStorage`, que tiene un límite duro por origen y donde
 * también vive el libro. Un archivo sin tope podría llenarlo y dejar la app sin
 * poder guardar NADA más — la forma más silenciosa de perderle los datos a
 * alguien. Se guardan los tres cierres más recientes; al cuarto, el más viejo
 * se suelta.
 */

/** Cuántos cierres se conservan. */
export const MAX_PERIODS = 3

export interface ArchivedPeriod {
  /** Fecha de corte: lo anterior a esto se archivó. */
  cutoff: string
  /** Cuándo se cerró, en ms. */
  closedAt: number
  transactions: Transaction[]
}

interface ArchiveState {
  periods: ArchivedPeriod[]
  push: (transactions: Transaction[], cutoff: string) => void
  clear: () => void
}

function sanitize(raw: unknown): ArchivedPeriod[] {
  const data = (raw && typeof raw === 'object' ? raw : {}) as { periods?: unknown }
  if (!Array.isArray(data.periods)) return []
  return data.periods
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter(p => typeof p.cutoff === 'string' && Array.isArray(p.transactions))
    .map((p): ArchivedPeriod => ({
      cutoff: String(p.cutoff),
      closedAt: typeof p.closedAt === 'number' && Number.isFinite(p.closedAt) ? p.closedAt : 0,
      // Solo se exige que tengan id y fecha: esto es historial de solo lectura,
      // no alimenta ningún saldo, así que no hace falta el rigor del libro.
      transactions: (p.transactions as unknown[])
        .filter((t): t is Transaction => !!t && typeof t === 'object'
          && typeof (t as Transaction).id === 'string'
          && typeof (t as Transaction).date === 'string'),
    }))
    .sort((a, b) => b.closedAt - a.closedAt)
    .slice(0, MAX_PERIODS)
}

export const useArchive = create<ArchiveState>()(
  persist(
    (set) => ({
      periods: [],

      push: (transactions, cutoff) => {
        // Un cierre sin nada que archivar no merece una entrada: ensuciaría la
        // lista y gastaría una de las tres plazas.
        if (!transactions.length) return
        set(s => ({
          periods: [{ cutoff, closedAt: Date.now(), transactions }, ...s.periods].slice(0, MAX_PERIODS),
        }))
      },

      clear: () => set({ periods: [] }),
    }),
    {
      name: 'cuadre-archive-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({ ...current, periods: sanitize(persisted) }),
    },
  ),
)
