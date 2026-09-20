import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui/Toast'
import { localToday } from '@/data/helpers'
import { tt } from '@/i18n'
import { useFinance } from '@/store/finance'
import { nextMonthDayDate } from '@/data/goalPlans'
import { advanceRecurrenceDate } from './useRecurring'

/**
 * Genera GoalContributions pendientes para las metas con aporte automático
 * activado, desde `autoContribute.nextDate` hasta hoy. Se detiene si la meta
 * se completa o si una transferencia falla por saldo insuficiente.
 */
export function useGoalAutoContributions(): void {
  const { goals, contribute, updateGoal } = useFinance()
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const today = localToday()
    let created = 0
    let skipped = 0

    goals.filter(g => g.autoContribute).forEach(goal => {
      const auto = goal.autoContribute!
      let next = auto.nextDate
      let amount = auto.amount
      let saved = goal.saved
      let generated = 0
      while (next <= today && saved < goal.target && generated < 24) {
        try {
          contribute(goal.id, amount, auto.fromAccountId, undefined, next)
          saved += amount
          created++
          // Reto incremental: el siguiente aporte sube `increment`.
          if (auto.increment) amount += auto.increment
        } catch {
          skipped++
        }
        // Mensual con días fijos (1 o 2 al mes) recorre esos días; si no, cadencia normal.
        next = auto.frequency === 'monthly' && auto.monthDays && auto.monthDays.length
          ? nextMonthDayDate(next, auto.monthDays)
          : advanceRecurrenceDate(next, auto.frequency)
        generated++
      }
      if (next !== auto.nextDate || amount !== auto.amount) {
        updateGoal(goal.id, { autoContribute: { ...auto, nextDate: next, amount } })
      }
    })

    if (created > 0) toast(
      tt(created > 1 ? 'goalAutoContribGeneratedMany' : 'goalAutoContribGeneratedOne', { n: created }),
      { icon: 'piggy', type: 'ok' },
    )
    if (skipped > 0) toast(
      tt(skipped > 1 ? 'goalAutoContribSkippedMany' : 'goalAutoContribSkippedOne', { n: skipped }),
      { icon: 'alert' },
    )
  }, [contribute, goals, updateGoal])
}
