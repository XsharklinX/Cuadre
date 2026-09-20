import { totals } from './helpers'
import type { Category, Transaction } from '@/types'

export interface EnvelopeSummary {
  income: number
  assigned: number
  unassigned: number
}

/**
 * Ingreso del mes vs. total asignado a sobres (categorías de gasto con
 * budget > 0). "Sin asignar" es la pieza central del envelope budgeting:
 * cuánto de lo que ganaste este mes todavía no tiene un sobre destinado.
 * Puramente derivado — no hay ningún saldo persistido que pueda desincronizarse.
 */
export function computeEnvelopeSummary(categories: Category[], monthTx: Transaction[]): EnvelopeSummary {
  const income = totals(monthTx).income
  const assigned = categories
    .filter(c => c.type === 'expense' && c.budget > 0)
    .reduce((sum, c) => sum + c.budget, 0)
  return { income, assigned, unassigned: income - assigned }
}

export type EnvelopeTransferError = 'sameCategory' | 'invalidAmount' | 'insufficientFunds' | 'notFound'

/** Valida un traspaso entre sobres antes de aplicarlo. null = válido. */
export function validateEnvelopeTransfer(
  from: Category | undefined,
  to: Category | undefined,
  amount: number,
): EnvelopeTransferError | null {
  if (!from || !to) return 'notFound'
  if (from.id === to.id) return 'sameCategory'
  if (!(amount > 0)) return 'invalidAmount'
  if (from.budget < amount) return 'insufficientFunds'
  return null
}
