import type { Transaction } from '@/types'

/*
 * S1 · EL BUSCADOR AGRUPA POR COMERCIO (2.8).
 *
 * Treinta filas de «Supermercado Nacional» no contestan nada; una tarjeta con
 * «24 compras · RD$48,300 · unos RD$4,800 al mes» sí.
 */
export interface MerchantGroup {
  key: string
  note: string
  txs: Transaction[]
  count: number
  expense: number
  income: number
  /** La categoría que más se repite en el grupo: su icono representa al comercio. */
  categoryId?: string
  /** Meses distintos en que aparece, para sacar la media al mes. */
  months: number
}

const keyOf = (note: string) => note.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ')

/** Agrupa movimientos por su concepto, de más movimientos a menos (y por monto). */
export function groupByMerchant(txs: Transaction[]): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>()
  for (const tx of txs) {
    if (tx.type === 'transfer' || !tx.note.trim()) continue
    const key = keyOf(tx.note)
    const g = map.get(key) ?? { key, note: tx.note.trim(), txs: [], count: 0, expense: 0, income: 0, months: 0 }
    g.txs.push(tx)
    g.count += 1
    if (tx.type === 'expense') g.expense += tx.amount
    if (tx.type === 'income') g.income += tx.amount
    map.set(key, g)
  }
  for (const g of map.values()) {
    const cats = new Map<string, number>()
    for (const tx of g.txs) if (tx.categoryId) cats.set(tx.categoryId, (cats.get(tx.categoryId) ?? 0) + 1)
    g.categoryId = [...cats.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    g.months = new Set(g.txs.map(tx => tx.date.slice(0, 7))).size
  }
  return [...map.values()].sort((a, b) => b.count - a.count || (b.expense + b.income) - (a.expense + a.income))
}

/** Las claves `YYYY-MM` de los últimos `n` meses, empezando por `mkey`. */
export function monthsBackKeys(mkey: string, n: number): string[] {
  const [y, m] = mkey.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}
