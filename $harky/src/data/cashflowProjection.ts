import { advanceRecurrenceDate, firstRecurrenceDate } from '@/hooks/useRecurring'
import { accountBalanceInBase, localToday } from '@/data/helpers'
import { convertCurrency } from '@/data/currencies'
import type { Account, CurrencyCode, Goal, Transaction } from '@/types'

export interface CashflowEvent {
  date: string               // YYYY-MM-DD
  note: string
  /** Positivo = entra dinero, negativo = sale. */
  amount: number
  kind: 'income' | 'expense' | 'goal'
  sourceId: string           // tx template id o goal id
  categoryId?: string
}

export interface CashflowDay {
  date: string
  events: CashflowEvent[]
  net: number
  /** Saldo total proyectado al cierre de este día. */
  balance: number
}

export interface CashflowProjection {
  startBalance: number
  endBalance: number
  /** Punto más bajo de la proyección y el día en que ocurre. */
  minBalance: number
  minDate: string
  /** Solo días con eventos, en orden cronológico. */
  days: CashflowDay[]
  /** Serie completa día a día (incluye días sin eventos) para graficar. */
  series: { date: string; balance: number }[]
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localToday(d)
}

export interface SafeToSpend {
  /** Lo que se puede gastar hoy sin quedarse corto para lo que viene. */
  amount: number
  /** Colchón que se reserva aparte (no forma parte de lo gastable). */
  buffer: number
  /** Suma de los cargos comprometidos antes del próximo ingreso. */
  committed: number
  /** Próximo ingreso previsto, o null si no hay ninguno en el horizonte. */
  nextIncome: { date: string; note: string; amount: number } | null
  daysUntilIncome: number | null
  /** Cargos (salidas) que hay que cubrir antes del próximo ingreso, en orden. */
  bills: CashflowEvent[]
  /** true si el saldo proyectado cae por debajo de cero antes del ingreso. */
  dipsNegative: boolean
}

/**
 * «¿Cuánto puedo gastar tranquilo?» — el número que la pantalla de flujo no
 * daba. Toma la proyección ya calculada y responde: saldo de hoy menos lo que
 * tienes comprometido antes de tu próximo ingreso, menos el colchón que quieras
 * reservar. Es puro: solo lee la proyección.
 */
export function safeToSpend(projection: CashflowProjection, buffer = 0): SafeToSpend {
  // Primer ingreso futuro (entra dinero). Marca la frontera: lo que caiga antes
  // hay que cubrirlo con el saldo de hoy; lo de después ya lo cubre el ingreso.
  let nextIncome: SafeToSpend['nextIncome'] = null
  for (const day of projection.days) {
    const inc = day.events.find(e => e.amount > 0)
    if (inc) { nextIncome = { date: day.date, note: inc.note, amount: inc.amount }; break }
  }

  const boundary = nextIncome?.date ?? null
  const bills = projection.days
    .filter(day => !boundary || day.date < boundary)
    .flatMap(day => day.events.filter(e => e.amount < 0))

  const committed = bills.reduce((sum, e) => sum + Math.abs(e.amount), 0)
  const amount = projection.startBalance - committed - buffer

  const dipsNegative = projection.series
    .filter(point => !boundary || point.date < boundary)
    .some(point => point.balance < 0)

  const daysUntilIncome = nextIncome
    ? Math.max(0, Math.round((new Date(`${nextIncome.date}T00:00:00`).getTime() - new Date(`${projection.series[0]?.date ?? nextIncome.date}T00:00:00`).getTime()) / 86_400_000) + 1)
    : null

  return { amount, buffer, committed, nextIncome, daysUntilIncome, bills, dipsNegative }
}

/** Saldo agregado actual: mismas reglas que los totales del Home (convertido a base si aplica). */
export function currentTotalBalance(accounts: Account[], base?: CurrencyCode): number {
  return accounts
    .filter(account => account.includeInTotal !== false)
    .reduce((sum, account) => sum + (base ? accountBalanceInBase(account, base) : account.balance), 0)
}

/**
 * Proyecta el saldo total día a día desde mañana hasta `horizon` (inclusive),
 * usando las plantillas recurrentes (suscripciones y movimientos fijos) y los
 * aportes automáticos a metas. Responde "¿me alcanza hasta X?".
 */
export function projectCashflow(
  transactions: Transaction[],
  accounts: Account[],
  goals: Goal[],
  horizon: string,
  today = localToday(),
  base?: CurrencyCode,
): CashflowProjection {
  const startBalance = currentTotalBalance(accounts, base)
  const events: CashflowEvent[] = []
  // Tasa de conversión a base para montos de cuentas con divisa propia
  const rateFor = (accountId?: string): number => {
    if (!base || !accountId) return 1
    const cur = accounts.find(a => a.id === accountId)?.currency
    return cur && cur !== base ? convertCurrency(1, cur, base) : 1
  }

  // Ocurrencias futuras de plantillas recurrentes (las suscripciones son
  // transacciones recurrentes, así que quedan incluidas automáticamente).
  for (const template of transactions) {
    if (!template.recurring || template.type === 'transfer') continue
    let next = firstRecurrenceDate(template)
    let guard = 0
    while (next <= horizon && (!template.recurringEnd || next <= template.recurringEnd) && guard < 120) {
      if (next > today && !(template.skippedDates?.includes(next) ?? false)) {
        const converted = template.amount * rateFor(template.accountId)
        events.push({
          date: next,
          note: template.note,
          amount: template.type === 'income' ? converted : -converted,
          kind: template.type === 'income' ? 'income' : 'expense',
          sourceId: template.id,
          categoryId: template.categoryId,
        })
      }
      next = advanceRecurrenceDate(next, template.recurring)
      guard++
    }
  }

  // Aportes automáticos a metas: salen del saldo líquido hacia la meta.
  for (const goal of goals) {
    const auto = goal.autoContribute
    if (!auto || auto.amount <= 0) continue
    let next = auto.nextDate
    let guard = 0
    while (next <= horizon && guard < 120) {
      if (next > today) {
        events.push({
          date: next,
          note: goal.name,
          amount: -auto.amount * rateFor(auto.fromAccountId),
          kind: 'goal',
          sourceId: goal.id,
        })
      }
      next = advanceRecurrenceDate(next, auto.frequency)
      guard++
    }
  }

  const byDate = new Map<string, CashflowEvent[]>()
  for (const event of events) {
    const list = byDate.get(event.date)
    if (list) list.push(event)
    else byDate.set(event.date, [event])
  }

  const days: CashflowDay[] = []
  const series: { date: string; balance: number }[] = [{ date: today, balance: startBalance }]
  let balance = startBalance
  let minBalance = startBalance
  let minDate = today

  for (let date = addDays(today, 1); date <= horizon; date = addDays(date, 1)) {
    const dayEvents = byDate.get(date) ?? []
    const net = dayEvents.reduce((sum, event) => sum + event.amount, 0)
    balance += net
    series.push({ date, balance })
    if (balance < minBalance) {
      minBalance = balance
      minDate = date
    }
    if (dayEvents.length > 0) {
      dayEvents.sort((a, b) => a.amount - b.amount)
      days.push({ date, events: dayEvents, net, balance })
    }
  }

  return { startBalance, endBalance: balance, minBalance, minDate, days, series }
}
