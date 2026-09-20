import { useEffect } from 'react'
import { toast } from '@/components/ui/Toast'
import { dateLocale, fmtCompact, localToday } from '@/data/helpers'
import { tt } from '@/i18n'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { firstRecurrenceDate } from './useRecurring'

const ALERTED_KEY = 'sharky-payment-alerts-v1'
const LOOKAHEAD_DAYS = 7

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return localToday(d)
}

function lacksFunds(account: { type: string; balance: number; limit?: number }, amount: number): boolean {
  if (account.type === 'credit') return account.balance - amount < -(account.limit ?? Infinity)
  return account.balance < amount
}

/**
 * Avisa con anticipación cuando un pago recurrente próximo (próximos
 * `LOOKAHEAD_DAYS` días) caería en una cuenta sin fondos suficientes.
 * Una sola vez por pago/fecha, con el mismo canal toast/notificación del
 * sistema que `useNotifications`.
 */
export function useUpcomingPaymentAlerts(): void {
  const { transactions, accounts, currency } = useFinance()
  const language = useSettings(state => state.language)

  useEffect(() => {
    const today = localToday()
    const horizon = addDays(today, LOOKAHEAD_DAYS)
    const locale = dateLocale(language)
    const alerted: string[] = JSON.parse(localStorage.getItem(ALERTED_KEY) ?? '[]')
    const alertedSet = new Set(alerted)

    const useSystem = document.hidden && 'Notification' in window && Notification.permission === 'granted'

    const due = transactions
      .filter(tx => tx.recurring && tx.type === 'expense' && tx.accountId)
      .map(tx => ({ tx, next: firstRecurrenceDate(tx) }))
      .filter(({ next }) => next >= today && next <= horizon)

    let changed = false
    due.forEach(({ tx, next }) => {
      const account = accounts.find(a => a.id === tx.accountId)
      if (!account || !lacksFunds(account, tx.amount)) return
      const key = `${tx.id}:${next}`
      if (alertedSet.has(key)) return
      alertedSet.add(key)
      changed = true

      const vars = {
        name: tx.note,
        account: account.name,
        amount: fmtCompact(tx.amount, currency),
        date: new Date(`${next}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      }
      if (useSystem) {
        new Notification(tt('lowFundsNotifTitle', { name: tx.note }), {
          body: tt('lowFundsAlertBody', vars),
          icon: '/icons/icon-192.png',
          tag: `lowfunds-${key}`,
        })
      } else {
        toast(tt('lowFundsAlertToast', vars), { icon: 'alert' })
      }
    })

    if (changed) {
      const validKeys = new Set(due.map(({ tx, next }) => `${tx.id}:${next}`))
      localStorage.setItem(ALERTED_KEY, JSON.stringify([...alertedSet].filter(k => validKeys.has(k))))
    }
  }, [transactions, accounts, currency, language])
}
