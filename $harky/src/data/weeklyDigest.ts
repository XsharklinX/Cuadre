/**
 * Resumen semanal proactivo: el gasto/ingreso de la SEMANA EN CURSO (de lunes a
 * hoy), la categoría donde más se fue el dinero y cómo va contra la semana
 * anterior. Semana calendario, no ventana móvil: cada lunes empieza en limpio,
 * que es lo natural — "esta semana" debe reiniciarse el lunes, no arrastrar los
 * días de la semana pasada. Puro y testeable.
 */
import type { Category, Transaction } from '@/types'

const MS_DAY = 86_400_000

export interface WeeklyDigest {
  /** ISO (YYYY-MM-DD) del lunes de la semana en curso — identifica la semana. */
  weekStart: string
  income: number
  expense: number
  net: number
  txCount: number
  topCategoryId?: string
  topCategoryAmount: number
  /** Variación del gasto vs la semana anterior completa (0.25 = +25%), o null si no hay base. */
  expenseDeltaPct: number | null
}

function shiftISO(iso: string, days: number): string {
  return new Date(new Date(`${iso}T00:00:00`).getTime() + days * MS_DAY).toISOString().slice(0, 10)
}

/** El lunes de la semana que contiene `todayISO` (lunes como primer día). */
function mondayOfWeek(todayISO: string): string {
  const dow = new Date(`${todayISO}T00:00:00`).getDay() // 0=Dom … 6=Sáb
  const daysSinceMonday = (dow + 6) % 7
  return shiftISO(todayISO, -daysSinceMonday)
}

/**
 * Digest de la semana en curso (lunes → hoy) comparado con la semana anterior
 * completa (lunes → domingo). `todayISO` es la fecha local de hoy (YYYY-MM-DD).
 */
export function weeklyDigest(transactions: Transaction[], categories: Category[], todayISO: string): WeeklyDigest {
  const weekStart = mondayOfWeek(todayISO)
  const prevStart = shiftISO(weekStart, -7)  // lunes de la semana pasada
  const prevEnd = shiftISO(weekStart, -1)    // domingo de la semana pasada

  let income = 0, expense = 0, txCount = 0, prevExpense = 0
  const byCategory = new Map<string, number>()

  for (const tx of transactions) {
    if (tx.type === 'transfer') continue
    const date = tx.date
    if (date >= weekStart && date <= todayISO) {
      txCount++
      if (tx.type === 'income') income += tx.amount
      else {
        expense += tx.amount
        if (tx.categoryId) byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + tx.amount)
      }
    } else if (date >= prevStart && date <= prevEnd && tx.type === 'expense') {
      prevExpense += tx.amount
    }
  }

  let topCategoryId: string | undefined
  let topCategoryAmount = 0
  for (const [id, amount] of byCategory) {
    if (amount > topCategoryAmount) { topCategoryId = id; topCategoryAmount = amount }
  }
  // Solo devolver una categoría que aún exista.
  if (topCategoryId && !categories.some(c => c.id === topCategoryId)) topCategoryId = undefined

  return {
    weekStart,
    income,
    expense,
    net: income - expense,
    txCount,
    topCategoryId,
    topCategoryAmount,
    expenseDeltaPct: prevExpense > 0 ? (expense - prevExpense) / prevExpense : null,
  }
}
