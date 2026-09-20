import { localToday } from './helpers'
import type { RecurrenceFrequency } from '@/types'

/**
 * Próxima fecha (YYYY-MM-DD) que cae en el día `dayOfMonth` del mes, nunca
 * hoy. Si el mes no tiene ese día (ej. 31 en febrero), usa el último día del
 * mes en vez de desbordar al mes siguiente.
 */
export function nextMonthlyChargeDate(fromISO: string, dayOfMonth: number): string {
  const d = new Date(`${fromISO}T00:00:00`)
  const clampDay = (year: number, month: number, day: number) => Math.min(day, new Date(year, month + 1, 0).getDate())

  let year = d.getFullYear()
  let month = d.getMonth()
  let candidate = new Date(year, month, clampDay(year, month, dayOfMonth))
  if (candidate <= d) {
    month += 1
    if (month > 11) { month = 0; year += 1 }
    candidate = new Date(year, month, clampDay(year, month, dayOfMonth))
  }
  return localToday(candidate)
}

/** Próxima fecha (YYYY-MM-DD) que cae en `weekday` (0=Dom … 6=Sáb), nunca hoy. */
export function nextWeekdayChargeDate(fromISO: string, weekday: number): string {
  const d = new Date(`${fromISO}T00:00:00`)
  const diff = ((weekday - d.getDay() + 7) % 7) || 7
  d.setDate(d.getDate() + diff)
  return localToday(d)
}

/**
 * Fecha de inicio y próximo cobro para una suscripción nueva. Si el usuario
 * eligió un día de cobro explícito, ancla el ciclo a ese día; si no, arranca
 * "hoy" — mismo comportamiento que tenía la app antes de poder elegir fecha.
 */
export function initialRecurringDates(
  frequency: RecurrenceFrequency,
  chargeWeekday: number | null,
  chargeMonthDay: number | null,
): { start: string; next: string } {
  const start = localToday()
  if (frequency === 'weekly' && chargeWeekday !== null) {
    return { start, next: nextWeekdayChargeDate(start, chargeWeekday) }
  }
  if (frequency === 'monthly' && chargeMonthDay !== null) {
    return { start, next: nextMonthlyChargeDate(start, chargeMonthDay) }
  }
  const next = new Date(`${start}T00:00:00`)
  if (frequency === 'weekly') next.setDate(next.getDate() + 7)
  else next.setMonth(next.getMonth() + 1)
  return { start, next: localToday(next) }
}
