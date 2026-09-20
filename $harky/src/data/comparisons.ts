import { categoryParts, totals } from './helpers'
import type { Category, Transaction } from '@/types'

/** Valor actual vs anterior, con la diferencia y el % de cambio (null si el anterior era 0). */
export interface DeltaStat {
  current: number
  previous: number
  delta: number
  deltaPct: number | null
}

function delta(current: number, previous: number): DeltaStat {
  const d = current - previous
  const pct = previous !== 0 ? Math.round((d / Math.abs(previous)) * 100) : null
  return { current, previous, delta: d, deltaPct: pct }
}

export interface CategoryComparisonRow {
  category: Category
  current: number
  previous: number
  delta: number
  deltaPct: number | null
}

/** Gasto/ingreso por categoría en dos períodos, respetando splits (misma lógica que byCategory). */
function categoryTotalsByPeriod(txns: Transaction[], type: 'income' | 'expense'): Record<string, number> {
  const map: Record<string, number> = {}
  txns.forEach(tx => {
    if (tx.type !== type) return
    categoryParts(tx).forEach(part => {
      if (!part.categoryId) return
      map[part.categoryId] = (map[part.categoryId] ?? 0) + part.amount
    })
  })
  return map
}

export function compareCategoryTotals(
  currentTxns: Transaction[],
  previousTxns: Transaction[],
  categories: Category[],
  type: 'income' | 'expense' = 'expense',
): CategoryComparisonRow[] {
  const cur = categoryTotalsByPeriod(currentTxns, type)
  const prev = categoryTotalsByPeriod(previousTxns, type)
  const ids = new Set([...Object.keys(cur), ...Object.keys(prev)])
  return Array.from(ids)
    .map(id => {
      const category = categories.find(c => c.id === id)
      if (!category) return null
      const currentAmount = cur[id] ?? 0
      const previousAmount = prev[id] ?? 0
      return { category, ...delta(currentAmount, previousAmount) }
    })
    .filter((row): row is CategoryComparisonRow => row !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
}

export interface PeriodComparison {
  income: DeltaStat
  expense: DeltaStat
  net: DeltaStat
  categories: CategoryComparisonRow[]
}

/**
 * Compara dos períodos ya recortados (mes actual vs mes anterior, año actual
 * vs año anterior…) — quien llama decide qué transacciones caen en cada lado.
 */
export function comparePeriods(
  currentTxns: Transaction[],
  previousTxns: Transaction[],
  categories: Category[],
): PeriodComparison {
  const cur = totals(currentTxns)
  const prev = totals(previousTxns)
  return {
    income: delta(cur.income, prev.income),
    expense: delta(cur.expense, prev.expense),
    net: delta(cur.net, prev.net),
    categories: compareCategoryTotals(currentTxns, previousTxns, categories, 'expense'),
  }
}
