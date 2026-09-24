/**
 * EL CALENDARIO DE UNA DEUDA.
 *
 * Hasta ahora una deuda era tres números sueltos (saldo, tasa, mínimo) y un
 * simulador encima. Eso responde "¿cuánto tardo en salir?", que es una
 * pregunta de sobremesa. La pregunta que la gente se hace de verdad, la que le
 * quita el sueño, es **"¿cuándo tengo que pagar y cuánto me falta?"** — y eso
 * la app no podía ni contestarlo ni recordarlo.
 *
 * Aquí viven las cuentas de calendario, sin React y sin estado, para poder
 * probarlas contra los casos que rompen: el 31 en febrero, la deuda vencida,
 * la última cuota.
 */

/** Día del mes en que vence la cuota. Fuera de 1–31 no significa nada. */
export const MIN_DUE_DAY = 1
export const MAX_DUE_DAY = 31

/** Desde cuántos días antes se considera que el pago "ya viene". */
export const DUE_SOON_DAYS = 5

export type DueStatus = 'none' | 'ok' | 'due-soon' | 'due-today' | 'overdue'

function parse(date: string): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Último día de ese mes: 28/29 en febrero, 30 o 31 en el resto. */
export function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate()
}

/**
 * El día 31 en un mes que no lo tiene.
 *
 * Un préstamo que vence "el 31" vence el 28 de febrero, no el 3 de marzo. Sin
 * este ajuste, `new Date(2026, 1, 31)` se desborda sola al mes siguiente y la
 * app avisaría tarde justo en el mes en que es más fácil olvidarse.
 */
export function clampDay(day: number, year: number, month0: number): number {
  return Math.min(Math.max(day, MIN_DUE_DAY), daysInMonth(year, month0))
}

/**
 * La próxima fecha de pago a partir del día del mes.
 *
 * Si hoy ES el día de pago, la próxima fecha es HOY: la cuota de este mes
 * todavía no está pagada. Devolver el mes que viene daría por buena una deuda
 * que vence en unas horas.
 */
export function nextDueDate(dueDay: number, today: string): string {
  const now = parse(today)
  const thisMonth = clampDay(dueDay, now.getFullYear(), now.getMonth())
  if (now.getDate() <= thisMonth) {
    return iso(new Date(now.getFullYear(), now.getMonth(), thisMonth))
  }
  const y = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear()
  const m = (now.getMonth() + 1) % 12
  return iso(new Date(y, m, clampDay(dueDay, y, m)))
}

/** Días entre dos fechas (negativo si la segunda ya pasó). */
export function daysBetween(from: string, to: string): number {
  const ms = parse(to).getTime() - parse(from).getTime()
  return Math.round(ms / 86_400_000)
}

/**
 * Cómo está el pago de este mes.
 *
 * `lastPaidOn` es la fecha del último pago registrado. Sin él no se puede
 * distinguir "vence el 5" de "vencía el 5 y ya lo pagaste": la app estaría
 * regañando a quien va al día, que es la forma más rápida de que alguien deje
 * de mirar los avisos.
 */
export function dueStatus(dueDay: number | undefined, today: string, lastPaidOn?: string): DueStatus {
  if (!dueDay) return 'none'
  const due = nextDueDate(dueDay, today)
  // Ya pagó en el ciclo que termina en esa fecha: no hay nada pendiente.
  if (lastPaidOn && lastPaidOn >= iso(new Date(parse(due).getFullYear(), parse(due).getMonth() - 1, parse(due).getDate()))) {
    if (lastPaidOn <= due) return 'ok'
  }
  const days = daysBetween(today, due)
  if (days < 0) return 'overdue'
  if (days === 0) return 'due-today'
  if (days <= DUE_SOON_DAYS) return 'due-soon'
  return 'ok'
}

/**
 * Cuotas que faltan hasta la fecha final, contando la de este mes.
 *
 * Devuelve 0 cuando la fecha ya pasó: no existe media cuota ni cuotas
 * negativas, y presentar un número negativo en la pantalla sería peor que no
 * presentar nada.
 */
export function installmentsLeft(endDate: string, today: string): number {
  const end = parse(endDate)
  const now = parse(today)
  if (end < now) return 0
  const months = (end.getFullYear() - now.getFullYear()) * 12 + (end.getMonth() - now.getMonth())
  // Si el día de la última cuota ya pasó dentro de su mes, ese mes no cuenta.
  return Math.max(0, months + (end.getDate() >= now.getDate() ? 1 : 0))
}

/**
 * La cuota que hay que pagar para liquidar `balance` en `months` meses.
 *
 * Es la fórmula de amortización francesa, la misma que usa el banco. Existe
 * para poder rellenar el mínimo solo cuando el usuario escribe el plazo: en un
 * préstamo de banco nadie sabe de memoria su "pago mínimo", pero todo el mundo
 * sabe que son 36 cuotas.
 */
export function paymentForTerm(balance: number, annualRatePct: number, months: number): number {
  if (balance <= 0 || months <= 0) return 0
  const i = annualRatePct / 100 / 12
  // Sin interés es una división simple; con la fórmula daría 0/0.
  const raw = i <= 0 ? balance / months : (balance * i) / (1 - Math.pow(1 + i, -months))
  return Math.round(raw * 100) / 100
}

/** La fecha final implícita si pagas `months` cuotas más desde hoy. */
export function endDateAfter(months: number, today: string): string {
  const now = parse(today)
  const y = now.getFullYear() + Math.floor((now.getMonth() + months) / 12)
  const m = (now.getMonth() + months) % 12
  return iso(new Date(y, m, clampDay(now.getDate(), y, m)))
}
