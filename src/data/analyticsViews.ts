import { amountForCategory } from './helpers'
import type { Transaction } from '@/types'

/*
 * LAS CUENTAS DE ANÁLISIS 2.6.
 *
 * Funciones puras sobre una lista de movimientos ya filtrada (por periodo y,
 * si toca, por dueño: personal o negocio). Ninguna lee del almacén: así se
 * pueden probar con cuatro movimientos escritos a mano.
 */

const pad = (n: number) => String(n).padStart(2, '0')

export function daysInMonth(mkey: string): number {
  const [y, m] = mkey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export interface DayPoint { date: string; day: number; expense: number; income: number; future: boolean }

/**
 * Gasto e ingreso de cada día del mes. Los días que aún no han llegado se
 * marcan `future` para pintarlos vacíos en vez de como días sin gasto.
 */
export function dailySeries(txns: Transaction[], mkey: string, today: string): DayPoint[] {
  const n = daysInMonth(mkey)
  const out: DayPoint[] = Array.from({ length: n }, (_, i) => {
    const date = `${mkey}-${pad(i + 1)}`
    return { date, day: i + 1, expense: 0, income: 0, future: date > today }
  })
  for (const tx of txns) {
    if (!tx.date.startsWith(mkey)) continue
    const p = out[Number(tx.date.slice(8, 10)) - 1]
    if (!p) continue
    if (tx.type === 'expense') p.expense += tx.amount
    else if (tx.type === 'income') p.income += tx.amount
  }
  return out
}

/** Gasto acumulado día a día (índice 0 = día 1). */
export function cumulativeExpense(points: DayPoint[]): number[] {
  let acc = 0
  return points.map(p => (acc += p.expense))
}

export interface Pace {
  /** Día del mes con el que se compara (hoy, o el último del mes si ya pasó). */
  day: number
  current: number
  previousAtDay: number
  /** current − previousAtDay: positivo = vas gastando más. */
  delta: number
  /** Cierre del mes si sigues al ritmo de hoy. Null si el mes ya terminó. */
  projected: number | null
}

/**
 * EL RITMO: lo gastado hasta hoy contra lo que llevabas el mes pasado el
 * mismo día. Comparar 20 días contra un mes entero siempre sale bonito; por
 * eso se corta el mes pasado en el mismo día (o en su último, si era corto).
 */
export function monthPace(cur: DayPoint[], prev: DayPoint[], today: string): Pace | null {
  if (!cur.length) return null
  const isCurrent = cur.some(p => p.date === today)
  const day = isCurrent ? Number(today.slice(8, 10)) : cur.length
  const cumCur = cumulativeExpense(cur)
  const cumPrev = cumulativeExpense(prev)
  const current = cumCur[day - 1] ?? 0
  const previousAtDay = cumPrev.length ? cumPrev[Math.min(day, cumPrev.length) - 1] : 0
  return {
    day,
    current,
    previousAtDay,
    delta: current - previousAtDay,
    projected: isCurrent && day > 0 ? (current / day) * cur.length : null,
  }
}

export interface WeekdayStats {
  /** Media de gasto por día de la semana, 0 = domingo … 6 = sábado. */
  avg: number[]
  /** El día de la semana con la media más alta. */
  top: number
  weekendAvg: number
  weekdayAvg: number
}

/**
 * QUÉ DÍAS GASTAS MÁS. La media sale de los días que YA pasaron, contando los
 * que no tuvieron gasto: si no, un sábado con un solo café pesaría igual que
 * cinco sábados de compras.
 */
export function weekdayStats(points: DayPoint[]): WeekdayStats | null {
  const past = points.filter(p => !p.future)
  if (past.length < 7) return null
  const sum = Array(7).fill(0), count = Array(7).fill(0)
  for (const p of past) {
    const wd = new Date(`${p.date}T00:00:00`).getDay()
    sum[wd] += p.expense
    count[wd] += 1
  }
  const avg = sum.map((s, i) => (count[i] ? s / count[i] : 0))
  const top = avg.reduce((best, v, i) => (v > avg[best] ? i : best), 0)
  const mean = (idx: number[]) => {
    const c = idx.reduce((n, i) => n + count[i], 0)
    return c ? idx.reduce((s, i) => s + sum[i], 0) / c : 0
  }
  return { avg, top, weekendAvg: mean([0, 6]), weekdayAvg: mean([1, 2, 3, 4, 5]) }
}

/** La firma con la que se reconoce un gasto que se repite (la misma que usa la lista). */
export function recurringSignature(tx: Pick<Transaction, 'type' | 'note' | 'categoryId' | 'accountId'>): string {
  return `${tx.type}|${tx.note}|${tx.categoryId ?? ''}|${tx.accountId ?? ''}`
}

/**
 * EL PISO: lo que se paga sí o sí (gastos recurrentes y sus repeticiones)
 * contra lo que depende de lo que decidas. Las repeticiones que genera la
 * app no llevan `recurring`; se reconocen por la firma de su plantilla.
 */
export function fixedVsVariable(periodTx: Transaction[], allTx: Transaction[]): { fixed: number; variable: number } {
  const signatures = new Set(allTx.filter(tx => tx.recurring && tx.type === 'expense').map(recurringSignature))
  let fixed = 0, variable = 0
  for (const tx of periodTx) {
    if (tx.type !== 'expense') continue
    if (tx.recurring || signatures.has(recurringSignature(tx))) fixed += tx.amount
    else variable += tx.amount
  }
  return { fixed, variable }
}

/** Gasto de una categoría en los últimos `n` meses hasta `endMkey` (el más viejo primero). */
export function categoryHistory(txns: Transaction[], categoryId: string, endMkey: string, n = 6): { mkey: string; amount: number }[] {
  const [y, m] = endMkey.split('-').map(Number)
  const keys = Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  })
  const totals = new Map(keys.map(k => [k, 0]))
  for (const tx of txns) {
    if (tx.type !== 'expense') continue
    const k = tx.date.slice(0, 7)
    if (!totals.has(k)) continue
    const a = amountForCategory(tx, categoryId)
    if (a > 0) totals.set(k, totals.get(k)! + a)
  }
  return keys.map(k => ({ mkey: k, amount: totals.get(k)! }))
}

/**
 * DÓNDE SE FUE, DENTRO DE UNA CATEGORÍA: los conceptos que más pesan.
 * «Supermercado Nacional» y «supermercado nacional » son el mismo sitio.
 */
export function topConcepts(txns: Transaction[], categoryId: string, limit = 4): { note: string; amount: number; count: number }[] {
  const groups = new Map<string, { note: string; amount: number; count: number }>()
  for (const tx of txns) {
    if (tx.type !== 'expense') continue
    const a = amountForCategory(tx, categoryId)
    if (a <= 0) continue
    const key = tx.note.trim().toLowerCase()
    const g = groups.get(key) ?? { note: tx.note.trim(), amount: 0, count: 0 }
    g.amount += a
    g.count += 1
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
}
