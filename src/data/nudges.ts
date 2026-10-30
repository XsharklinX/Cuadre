import type { Wish } from './wishes'
import type { CashflowProjection } from './cashflowProjection'

/*
 * AVISOS PUNTUALES (2.7).
 *
 * Lo que merece un aviso del teléfono UNA vez, nunca algo fijo en pantalla:
 *  · C2  un antojo cuya espera terminó: «¿todavía quieres…?».
 *  · D3  la cuota de una deuda, dos días antes de que venza.
 *  · F2  el día del mes en que el flujo se queda en rojo, con tiempo.
 *
 * Función pura: la app decide qué y cuándo y manda el texto traducido; el
 * worker nativo solo lo muestra el día que toca (`date`), una vez por `id`.
 */
export interface Nudge {
  id: string
  /** El día a partir del cual se avisa, `YYYY-MM-DD`. */
  date: string
  title: string
  text: string
  type: 'caprice' | 'debt' | 'cashflow' | 'subscription'
}

/** U3 (2.8) · Una suscripción con «Avísame antes» encendido. */
export interface NudgeSub { id: string; name: string; amount: number; next: string }

export interface NudgeDebt { id: string; name: string; balance: number; minPayment: number; dueDay?: number; owed: boolean }

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** El próximo día de pago de una cuota (hoy incluido), recortado al último del mes. */
export function nextDueDate(dueDay: number, today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const clamp = (yy: number, mm: number) => Math.min(dueDay, new Date(yy, mm, 0).getDate())
  if (clamp(y, m) >= d) return `${y}-${pad(m)}-${pad(clamp(y, m))}`
  const n = new Date(y, m, 1)
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(clamp(n.getFullYear(), n.getMonth() + 1))}`
}

export function buildNudges(input: {
  today: string
  now: number
  wishes: Wish[]
  debts: NudgeDebt[]
  cashflow: CashflowProjection | null
  subs?: NudgeSub[]
  money: (n: number) => string
  dayLabel: (iso: string) => string
  t: {
    wishTitle: string; wishText: string
    debtTitle: string; debtText: string
    cashTitle: string; cashText: string
    subTitle?: string; subText?: string
  }
}): Nudge[] {
  const { today, now, money, dayLabel, t } = input
  const out: Nudge[] = []

  for (const w of input.wishes) {
    if (w.resolvedAt || w.decideAt > now) continue
    out.push({
      id: `wish:${w.id}`,
      date: today,
      title: t.wishTitle.replace('{name}', w.name),
      text: t.wishText.replace('{name}', w.name).replace('{amount}', money(w.amount)),
      type: 'caprice',
    })
  }

  for (const d of input.debts) {
    if (!d.owed || !d.dueDay || d.balance <= 0) continue
    const due = nextDueDate(d.dueDay, today)
    const notify = new Date(`${due}T00:00:00`)
    notify.setDate(notify.getDate() - 2)
    out.push({
      id: `debtdue:${d.id}:${due}`,
      date: iso(notify),
      title: t.debtTitle.replace('{name}', d.name).replace('{day}', dayLabel(due)),
      text: t.debtText.replace('{amount}', money(Math.min(d.minPayment || d.balance, d.balance))),
      type: 'debt',
    })
  }

  // U3 · La suscripción con «Avísame antes»: dos días antes de su cobro.
  for (const sb of input.subs ?? []) {
    if (!t.subTitle || !t.subText || sb.next < today) continue
    const notify = new Date(`${sb.next}T00:00:00`)
    notify.setDate(notify.getDate() - 2)
    out.push({
      id: `subdue:${sb.id}:${sb.next}`,
      date: iso(notify) < today ? today : iso(notify),
      title: t.subTitle.replace('{name}', sb.name).replace('{day}', dayLabel(sb.next)),
      text: t.subText.replace('{amount}', money(sb.amount)),
      type: 'subscription',
    })
  }

  const cf = input.cashflow
  if (cf && cf.minBalance < 0 && cf.minDate > today) {
    out.push({
      id: `cashlow:${cf.minDate}`,
      date: today,
      title: t.cashTitle.replace('{day}', dayLabel(cf.minDate)),
      text: t.cashText.replace('{amount}', money(cf.minBalance)).replace('{day}', dayLabel(cf.minDate)),
      type: 'cashflow',
    })
  }

  return out
}
