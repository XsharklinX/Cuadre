import type { Transaction } from '@/types'

/*
 * A5 · PREGUNTAS RÁPIDAS (2.8).
 *
 * Lo que la gente suma a mano con la calculadora: cuánto llevo en un comercio
 * este año, cuál fue mi mes más caro. Funciones puras; la pantalla pone el
 * texto.
 */

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

export interface MerchantTotal { note: string; total: number; count: number }

/** Gasto por comercio (el concepto del movimiento) en un año, de más compras a menos. */
export function merchantTotals(txs: Transaction[], year: number): MerchantTotal[] {
  const map = new Map<string, MerchantTotal>()
  const prefix = String(year)
  for (const tx of txs) {
    if (tx.type !== 'expense' || !tx.date.startsWith(prefix) || !tx.note.trim()) continue
    const key = norm(tx.note)
    const row = map.get(key) ?? { note: tx.note.trim(), total: 0, count: 0 }
    row.total += tx.amount
    row.count += 1
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.total - a.total)
}

/** El mes con más gasto de un año, o `null` si no hubo gasto. */
export function priciestMonth(txs: Transaction[], year: number): { mkey: string; expense: number } | null {
  const byMonth = new Map<string, number>()
  for (const tx of txs) {
    if (tx.type !== 'expense' || !tx.date.startsWith(String(year))) continue
    const mkey = tx.date.slice(0, 7)
    byMonth.set(mkey, (byMonth.get(mkey) ?? 0) + tx.amount)
  }
  let best: { mkey: string; expense: number } | null = null
  for (const [mkey, expense] of byMonth) if (!best || expense > best.expense) best = { mkey, expense }
  return best
}

/** El gasto más grande de un mes: la razón de que ese mes fuera caro. */
export function biggestExpense(txs: Transaction[], mkey: string): Transaction | null {
  let top: Transaction | null = null
  for (const tx of txs) if (tx.type === 'expense' && tx.date.startsWith(mkey) && (!top || tx.amount > top.amount)) top = tx
  return top
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * A9 · LA SEMANA NORMAL: lo que gastas de media en una semana, mirando las
 * ocho anteriores a `weekStart`. Las semanas sin ningún movimiento no cuentan
 * (la app pudo no existir aún), para no bajar la media con ceros falsos.
 */
export function normalWeekExpense(txs: Transaction[], weekStart: string, weeks = 8): number | null {
  const totals: number[] = []
  for (let w = 1; w <= weeks; w++) {
    const from = addDays(weekStart, -7 * w)
    const to = addDays(from, 6)
    const inWeek = txs.filter(tx => tx.date >= from && tx.date <= to)
    if (!inWeek.length) continue
    totals.push(inWeek.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0))
  }
  if (totals.length < 2) return null
  return totals.reduce((a, b) => a + b, 0) / totals.length
}
