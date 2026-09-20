import { firstRecurrenceDate } from '@/hooks/useRecurring'
import { amountForCategory, currentMonthKey, fmtCompact, localToday, txForMonth } from './helpers'
import { tt } from '@/i18n'
import type { Category, CurrencyCode, IconName, Transaction } from '@/types'

export type MobileAlertTarget =
  | { type: 'budget'; categoryId: string }
  | { type: 'recurring'; transactionId: string }

export interface MobileAlert {
  id:    string
  level: 'warn' | 'danger'
  icon:  IconName
  title: string
  text:  string
  /** A dónde debe llevar el toque en este aviso (campanita) — nunca es solo informativo. */
  target: MobileAlertTarget
}

const DUE_SOON_DAYS = 3

export function getMobileAlerts(
  transactions: Transaction[],
  categories: Category[],
  currency: CurrencyCode,
  todayStr = localToday(),
  locale = 'es-DO',
  dismissedAlerts: string[] = [],
  silencedRecurring: string[] = [],
): MobileAlert[] {
  const mkey = currentMonthKey()
  const monthTx = txForMonth(transactions, mkey)
  const alerts: MobileAlert[] = []

  categories.filter(c => c.type === 'expense' && c.budget > 0).forEach(cat => {
    const spent = monthTx
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + amountForCategory(tx, cat.id), 0)
    const pct = Math.round(spent / cat.budget * 100)
    if (pct > 100) {
      alerts.push({
        id:    `budget:${cat.id}:${mkey}:100`,
        level: 'danger',
        icon:  'alert',
        title: tt('budgetExceededAlertTitle', { name: cat.name }),
        text:  tt('budgetAlertProgress', { spent: fmtCompact(spent, currency), budget: fmtCompact(cat.budget, currency), pct }),
        target: { type: 'budget', categoryId: cat.id },
      })
    } else if (pct >= 80) {
      alerts.push({
        id:    `budget:${cat.id}:${mkey}:80`,
        level: 'warn',
        icon:  'alert',
        title: tt('budgetWarnAlertTitle', { pct, name: cat.name }),
        text:  tt('budgetAlertProgressShort', { spent: fmtCompact(spent, currency), budget: fmtCompact(cat.budget, currency) }),
        target: { type: 'budget', categoryId: cat.id },
      })
    }
  })

  const limit = new Date(`${todayStr}T00:00:00`)
  limit.setDate(limit.getDate() + DUE_SOON_DAYS)
  const limitStr = localToday(limit)

  // El silenciado va por plantilla, no por ocurrencia: descartar el aviso de
  // este mes no debe bastar para que no vuelva el mes que viene.
  const silenced = new Set(silencedRecurring)

  transactions.filter(tx => tx.recurring && !silenced.has(tx.id)).forEach(template => {
    const next = firstRecurrenceDate(template)
    if (next < todayStr || next > limitStr) return
    if (template.recurringEnd && next > template.recurringEnd) return
    const when = next === todayStr
      ? tt('dueTodayWord')
      : new Date(`${next}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    alerts.push({
      id:    `recurring:${template.id}:${next}`,
      level: 'warn',
      icon:  'calendar',
      title: tt('recurringDueTitle', { note: template.note || tt('noNoteWord') }),
      text:  tt('recurringDueText', { when, amount: fmtCompact(template.amount, currency) }),
      target: { type: 'recurring', transactionId: template.id },
    })
  })

  if (dismissedAlerts.length === 0) return alerts
  const dismissed = new Set(dismissedAlerts)
  return alerts.filter(a => !dismissed.has(a.id))
}
