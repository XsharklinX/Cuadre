import { convertCurrency } from './currencies'
import { localToday } from './helpers'
import type { Account, CurrencyCode } from '@/types'

/**
 * El motor de una tarjeta de crédito: ciclo de corte, pago mínimo y lo que de
 * verdad cuesta pagar el mínimo.
 *
 * Todo lo de aquí es puro y sin estado: recibe la cuenta y una fecha, devuelve
 * números. Eso lo hace verificable con tests, que es el punto — son cálculos
 * que el usuario va a usar para decidir cuánto pagar.
 */

/** Deuda usada de una tarjeta, como número POSITIVO. Un saldo >= 0 es deuda cero. */
export function creditUsed(balance: number): number {
  return Math.max(0, -balance)
}

/**
 * Deuda TOTAL de la tarjeta expresada en su divisa principal: el saldo local
 * más el saldo en divisa extranjera convertido.
 *
 * El límite de crédito es uno solo y lo consumen las dos deudas. Medir la
 * utilización solo contra el saldo local diría "45% usado" en una tarjeta que
 * de verdad está al 80%, que es exactamente el error que lleva a pasarse.
 */
export function creditUsedInPrimary(account: Account, base: CurrencyCode): number {
  const primary = creditUsed(account.balance)
  if (!hasSecondaryBalance(account)) return primary
  // Con cupo SEPARADO en divisa extranjera, esa linea no consume el limite
  // principal: se mide por su cuenta (`secondaryUtilization`). Sumarla aqui
  // la contaria dos veces contra dos limites distintos.
  if (account.secondaryLimit !== undefined && account.secondaryLimit > 0) return primary
  const secondary = creditUsed(account.secondaryBalance ?? 0)
  if (secondary === 0) return primary
  return primary + convertCurrency(secondary, account.secondaryCurrency!, account.currency ?? base)
}

/**
 * Utilizacion de la linea en divisa extranjera cuando tiene CUPO PROPIO.
 * `null` cuando el limite es compartido (lo normal): en ese caso la unica
 * utilizacion que existe es la de `creditUtilization`, que ya suma ambas.
 */
export function secondaryUtilization(account: Account): number | null {
  if (!hasSecondaryBalance(account)) return null
  if (account.secondaryLimit === undefined || account.secondaryLimit <= 0) return null
  return Math.min(1, creditUsed(account.secondaryBalance ?? 0) / account.secondaryLimit)
}

/** true si la tarjeta reparte cupos separados por divisa en vez de uno compartido. */
export function hasSplitLimits(account: Account): boolean {
  return hasSecondaryBalance(account)
    && account.secondaryLimit !== undefined && account.secondaryLimit > 0
}

/**
 * Fracción del límite consumida (0–1), contando ambas divisas. Sin límite
 * configurado no hay utilización que mostrar: `null`, no 0 — son cosas
 * distintas.
 */
export function creditUtilization(account: Account, base: CurrencyCode = 'DOP'): number | null {
  if (account.type !== 'credit' || !account.limit || account.limit <= 0) return null
  return Math.min(1, creditUsedInPrimary(account, base) / account.limit)
}

export type UtilizationBand = 'ok' | 'watch' | 'high'

/**
 * Tramo de utilización. Los umbrales son de riesgo CREDITICIO, no estéticos:
 * pasar del 30% es lo que empieza a golpear el score, mucho antes de acercarse
 * al límite. Un medidor que solo se alarma al 90% avisa cuando ya no sirve.
 */
export function utilizationBand(fraction: number): UtilizationBand {
  if (fraction >= 0.75) return 'high'
  if (fraction >= 0.30) return 'watch'
  return 'ok'
}

/** Último día real de un mes (28/29/30/31). */
function lastDayOfMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate()
}

/**
 * Siguiente ocurrencia de un día del mes, a partir de `from` (inclusive).
 *
 * Un día 31 NO desborda al mes siguiente: se recorta al último día real del
 * mes (31 → 28/30). Sin esto, una tarjeta que corta el 31 se saltaría febrero
 * entero — el mismo bug que ya se arregló en las recurrencias.
 */
export function nextMonthDay(day: number, from = new Date()): string | null {
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  for (let ahead = 0; ahead < 3; ahead++) {
    const year = from.getFullYear()
    const month = from.getMonth() + ahead
    const probe = new Date(year, month, 1)
    const clamped = Math.min(day, lastDayOfMonth(probe.getFullYear(), probe.getMonth()))
    const candidate = new Date(probe.getFullYear(), probe.getMonth(), clamped)
    if (localToday(candidate) >= localToday(from)) return localToday(candidate)
  }
  return null
}

export interface CreditCycle {
  /** Próxima fecha de corte (YYYY-MM-DD). */
  statementDate: string | null
  /** Próxima fecha límite de pago (YYYY-MM-DD). */
  paymentDate: string | null
  /** Días que faltan para el pago. Negativo = ya venció. */
  daysToPayment: number | null
  /** true dentro de los 5 días previos al pago: la UI lo marca en `oro`. */
  paymentSoon: boolean
}

const SOON_DAYS = 5

export function creditCycle(account: Account, from = new Date()): CreditCycle {
  const statementDate = account.statementDay ? nextMonthDay(account.statementDay, from) : null
  const paymentDate = account.paymentDay ? nextMonthDay(account.paymentDay, from) : null

  let daysToPayment: number | null = null
  if (paymentDate) {
    const target = new Date(`${paymentDate}T00:00:00`)
    const today = new Date(`${localToday(from)}T00:00:00`)
    daysToPayment = Math.round((target.getTime() - today.getTime()) / 86_400_000)
  }

  return {
    statementDate,
    paymentDate,
    daysToPayment,
    paymentSoon: daysToPayment !== null && daysToPayment >= 0 && daysToPayment <= SOON_DAYS,
  }
}

/**
 * Pago mínimo del mes. Sin porcentaje configurado no se inventa uno: `null`.
 * El piso (`minPaymentFloor`) gana sobre el porcentaje, pero nunca puede pedir
 * más que la deuda entera — cobrar un piso de RD$500 sobre una deuda de RD$200
 * sería un número falso.
 */
export function minimumPayment(account: Account): number | null {
  const used = creditUsed(account.balance)
  if (used <= 0) return 0
  if (!account.minPaymentPct || account.minPaymentPct <= 0) return null

  const byPct = used * (account.minPaymentPct / 100)
  const floor = account.minPaymentFloor ?? 0
  return Math.min(used, Math.max(byPct, floor))
}

export interface MinimumPayoffProjection {
  months: number
  totalInterest: number
  /** true si al ritmo del mínimo la deuda no se liquida nunca (interés >= abono). */
  never: boolean
}

const MAX_MONTHS = 600

/**
 * Lo que cuesta pagar SOLO el mínimo: cuántos meses y cuánto interés.
 *
 * Se simula mes a mes en vez de usar una fórmula cerrada porque el mínimo es
 * un porcentaje del saldo VIVO: baja cada mes, y por eso la cola es tan larga.
 * Esa cola es justo el dato que el usuario no intuye.
 *
 * Devuelve `never: true` cuando el interés mensual se come el abono — pasa de
 * verdad con tasas altas y mínimos del 2-3%, y es la advertencia más útil que
 * la app puede dar.
 */
export function projectMinimumPayoff(account: Account): MinimumPayoffProjection | null {
  const used = creditUsed(account.balance)
  if (used <= 0) return { months: 0, totalInterest: 0, never: false }
  if (!account.apr || account.apr <= 0) return null
  if (!account.minPaymentPct || account.minPaymentPct <= 0) return null

  const monthlyRate = account.apr / 100 / 12
  const pct = account.minPaymentPct / 100
  const floor = account.minPaymentFloor ?? 0

  let balance = used
  let totalInterest = 0
  let months = 0

  while (balance > 0.01 && months < MAX_MONTHS) {
    const interest = balance * monthlyRate
    const payment = Math.min(balance + interest, Math.max(balance * pct, floor))
    // El abono no cubre ni el interés: la deuda crece y no se liquida nunca.
    if (payment <= interest) return { months: MAX_MONTHS, totalInterest: Infinity, never: true }
    totalInterest += interest
    balance = balance + interest - payment
    months++
  }

  return { months, totalInterest, never: months >= MAX_MONTHS }
}

/** Divisa secundaria efectiva de una tarjeta, o null si no tiene segundo saldo. */
export function secondaryCurrencyOf(account: Account): CurrencyCode | null {
  if (account.type !== 'credit') return null
  return account.secondaryCurrency ?? null
}

/**
 * true si la tarjeta lleva un segundo saldo configurado. Se pregunta por la
 * DIVISA, no por el monto: una tarjeta en dólares recién configurada tiene
 * saldo 0 y sigue siendo de dos divisas.
 */
export function hasSecondaryBalance(account: Account): boolean {
  return secondaryCurrencyOf(account) !== null
}

/**
 * Las tarjetas de crédito vistas como DEUDAS, para que el simulador de
 * amortización (snowball / avalanche) trabaje sobre las tarjetas reales del
 * usuario en vez de sobre datos tecleados aparte.
 *
 * Hasta ahora `store/debt.ts` y las cuentas de crédito eran dos silos que no
 * se hablaban: había un motor de payoff completo que no podía leer ni una
 * tarjeta. Esto es el puente.
 *
 * Solo entran las tarjetas con deuda Y con tasa configurada: sin `apr` el
 * simulador no puede ordenar por avalanche ni calcular interés, y meterla con
 * tasa 0 la pondría falsamente de primera en el orden.
 */
export interface CardAsDebt {
  id: string
  name: string
  balance: number
  rate: number
  minPayment: number
  color: string
  /**
   * No se rastrea: la app no sabe con cuanta deuda "empezo" una tarjeta, que
   * es un saldo revolvente sin punto de partida. Dejarlo ausente hace que el
   * progreso salga 0% — honesto — en vez de inventar un origen.
   */
  originalBalance?: number
  /**
   * Dia limite de pago de la tarjeta, si esta configurado.
   *
   * La tarjeta ya lo guardaba (`paymentDay`) y la pantalla de Deuda no lo
   * miraba: la unica deuda con fecha de verdad conocida era justo la que salia
   * sin fecha.
   */
  dueDay?: number
  /** Marca de origen: esta deuda NO se edita a mano, se deriva de la cuenta. */
  fromAccountId: string
}

export function creditCardsAsDebts(accounts: Account[], base: CurrencyCode = 'DOP'): CardAsDebt[] {
  return accounts
    .filter(a => a.type === 'credit' && a.apr && a.apr > 0)
    .map(a => ({ account: a, used: creditUsedInPrimary(a, base) }))
    .filter(({ used }) => used > 0.01)
    .map(({ account, used }) => ({
      id: `card:${account.id}`,
      name: account.name,
      balance: used,
      rate: account.apr!,
      // Sin mínimo configurado se asume 5%, que es el suelo típico del mercado
      // dominicano. A diferencia del interés (que NO se inventa), aquí un
      // mínimo ausente solo afecta la velocidad simulada, no un número que se
      // le presente al usuario como suyo.
      minPayment: minimumPayment(account) ?? used * 0.05,
      color: account.color,
      dueDay: account.paymentDay,
      fromAccountId: account.id,
    }))
}
