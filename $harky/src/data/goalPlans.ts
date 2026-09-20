import { localToday } from './helpers'
import type { Goal, GoalContribution, RecurrenceFrequency } from '@/types'

/**
 * Matemática pura de los planes de ahorro de Metas (fijo y reto incremental)
 * y de la calculadora inversa. Sin dependencias de UI, para poder testearla.
 */

export interface RampPlan {
  /** Número de aportes hasta alcanzar (o superar) la meta. */
  periods: number
  /** Total acumulado tras esos aportes. */
  total: number
  /** Primeros 3 montos, para vista previa (50 → 75 → 100 → …). */
  first: [number, number, number]
}

const MAX_PERIODS = 520 // 10 años semanales — corta series que nunca llegan

/**
 * Reto incremental: aportes que crecen `increment` cada vez, empezando en
 * `firstAmount`, hasta cubrir `target`. Si `target <= 0` devuelve solo la
 * secuencia inicial (sin meta que alcanzar).
 */
export function rampPlan(firstAmount: number, increment: number, target: number): RampPlan | null {
  if (firstAmount <= 0) return null
  const first: [number, number, number] = [
    firstAmount,
    firstAmount + increment,
    firstAmount + 2 * increment,
  ]
  let periods = 0
  let total = 0
  while ((target <= 0 || total < target) && periods < MAX_PERIODS) {
    total += firstAmount + periods * increment
    periods += 1
    if (target <= 0 && periods >= 3) break
  }
  return { periods, total, first }
}

/** Próxima fecha (YYYY-MM-DD) que cae en `weekday` (0=Dom … 6=Sáb), nunca hoy. */
export function nextWeekdayDate(fromISO: string, weekday: number): string {
  const d = new Date(`${fromISO}T00:00:00`)
  const diff = ((weekday - d.getDay() + 7) % 7) || 7
  d.setDate(d.getDate() + diff)
  return localToday(d)
}

/** Último día real del mes que contiene `d` (28-31). */
function lastDayOfMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}

/**
 * Próxima fecha de cobro para un aporte automático MENSUAL con días fijos del
 * mes (`monthDays`, 1-31). Con 1 día = un pago al mes; con 2 días = dos pagos al
 * mes. Avanza al siguiente día de la lista dentro del mismo mes, y si ya pasaron
 * todos, salta al primer día del mes siguiente. Cada día se recorta al último
 * real del mes (31 → 28/30) para no saltarse meses cortos.
 */
export function nextMonthDayDate(fromISO: string, monthDays: number[]): string {
  const sorted = [...new Set(monthDays)].filter(n => n >= 1 && n <= 31).sort((a, b) => a - b)
  if (sorted.length === 0) return advanceMonth(fromISO)
  const d = new Date(`${fromISO}T00:00:00`)
  const curDay = d.getDate()
  const nextInMonth = sorted.find(day => day > curDay)
  if (nextInMonth != null) {
    d.setDate(Math.min(nextInMonth, lastDayOfMonth(d)))
    return localToday(d)
  }
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(sorted[0], lastDayOfMonth(d)))
  return localToday(d)
}

/** Avance mensual "seguro" (fija día 1 antes de sumar el mes y recorta al final). */
function advanceMonth(fromISO: string): string {
  const d = new Date(`${fromISO}T00:00:00`)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(day, lastDayOfMonth(d)))
  return localToday(d)
}

/**
 * Primera fecha de cobro (estrictamente futura, nunca hoy) para un aporte
 * mensual con días fijos: el primer día de la lista que caiga después de hoy,
 * este mes o el siguiente.
 */
export function firstMonthDayDate(fromISO: string, monthDays: number[]): string {
  const sorted = [...new Set(monthDays)].filter(n => n >= 1 && n <= 31).sort((a, b) => a - b)
  if (sorted.length === 0) return advanceMonth(fromISO)
  const d = new Date(`${fromISO}T00:00:00`)
  const curDay = d.getDate()
  const upcoming = sorted.find(day => day > curDay)
  if (upcoming != null) {
    d.setDate(Math.min(upcoming, lastDayOfMonth(d)))
    return localToday(d)
  }
  d.setDate(1)
  d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(sorted[0], lastDayOfMonth(d)))
  return localToday(d)
}

/** Aportes (semanales o mensuales) que caben entre `fromISO` y `deadlineISO`, ambos exclusive-hoy/inclusive-fecha. */
export function periodsUntil(fromISO: string, deadlineISO: string, frequency: RecurrenceFrequency): number {
  const from = new Date(`${fromISO}T00:00:00`).getTime()
  const to = new Date(`${deadlineISO}T00:00:00`).getTime()
  if (to <= from) return 0
  const days = Math.floor((to - from) / 86400000)
  return frequency === 'weekly' ? Math.floor(days / 7) : Math.floor(days / 30)
}

/**
 * Calculadora inversa: cuánto aportar por período para llegar a `target`
 * partiendo de `saved`, antes de `deadlineISO`. `null` si ya se alcanzó la
 * meta o si no cabe ni un aporte antes de la fecha.
 */
export function requiredContribution(
  target: number,
  saved: number,
  deadlineISO: string,
  frequency: RecurrenceFrequency,
  fromISO: string,
): { amount: number; periods: number } | null {
  const remaining = target - saved
  if (remaining <= 0) return null
  const periods = periodsUntil(fromISO, deadlineISO, frequency)
  if (periods <= 0) return null
  // Redondeo hacia arriba al entero: mejor sobrar un poco que quedarse corto.
  return { amount: Math.ceil(remaining / periods), periods }
}

const MS_DAY = 86_400_000

/**
 * Ritmo mensual estimado de ahorro de una meta. Prioriza el aporte automático
 * (es la intención declarada); si no hay, promedia los aportes reales de los
 * últimos ~3 meses. Devuelve 0 si no hay señal — ahí no se puede proyectar.
 */
export function estimatedMonthlyRate(goal: Goal, contributions: GoalContribution[], today = localToday()): number {
  if (goal.autoContribute && goal.autoContribute.amount > 0) {
    const { amount, frequency, monthDays } = goal.autoContribute
    if (frequency === 'weekly') return amount * (52 / 12)
    // Mensual: `amount` se cobra en cada día elegido (1 o 2 al mes).
    const paymentsPerMonth = monthDays && monthDays.length ? monthDays.length : 1
    return amount * paymentsPerMonth
  }
  const cutoff = new Date(`${today}T00:00:00`)
  cutoff.setMonth(cutoff.getMonth() - 3)
  const cutoffISO = localToday(cutoff)
  const recent = contributions.filter(c => c.goalId === goal.id && c.date >= cutoffISO)
  if (recent.length === 0) return 0
  const sum = recent.reduce((s, c) => s + c.amount, 0)
  const first = recent.reduce((min, c) => (c.date < min ? c.date : min), today)
  const daysSpan = Math.max(1, Math.round((new Date(`${today}T00:00:00`).getTime() - new Date(`${first}T00:00:00`).getTime()) / MS_DAY))
  const months = Math.max(1, daysSpan / 30)
  return sum / months
}

/**
 * Proyección «a tu ritmo»: cuántos meses y en qué fecha se alcanza la meta si
 * sigues aportando `monthlyRate` al mes. `reached` si ya se cumplió; `null` si
 * no hay ritmo con el que proyectar.
 */
export function projectArrival(
  goal: Goal,
  monthlyRate: number,
  today = localToday(),
): { months: number; dateISO: string; reached: boolean } | null {
  const remaining = goal.target - goal.saved
  if (remaining <= 0) return { months: 0, dateISO: today, reached: true }
  if (monthlyRate <= 0) return null
  const months = Math.ceil(remaining / monthlyRate)
  if (months > 600) return null
  const d = new Date(`${today}T00:00:00`)
  d.setMonth(d.getMonth() + months, 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { months, dateISO: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, reached: false }
}
