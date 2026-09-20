import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { dateLocale, fmtCompact, transactionsForTotals, txForMonth } from '@/data/helpers'
import { advanceRecurrenceDate, firstRecurrenceDate } from '@/hooks/useRecurring'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { MobileTransactionList } from './MobileTransactionList'
import type { Transaction } from '@/types'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function weekdayLabels(locale: string): string[] {
  // Monday-first week
  return Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }))
}

function monthLabels(locale: string): string[] {
  return Array.from({ length: 12 }, (_, i) => capitalize(new Date(2024, i, 1).toLocaleDateString(locale, { month: 'long' })))
}

function prevMonth(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}
function nextMonth(year: number, month: number) {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
}
function mkey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function MobileCalendar({
  mkey: initialMkey,
  onEditTx,
  onDeleteTx,
}: {
  mkey: string
  onEditTx: (tx: Transaction) => void
  onDeleteTx?: (id: string) => void
}) {
  const { transactions, categories, accounts, currency } = useFinance()
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const DAYS = weekdayLabels(locale)
  const MONTHS = monthLabels(locale)
  const [year,  setYear]  = useState(Number(initialMkey.slice(0, 4)))
  const [month, setMonth] = useState(Number(initialMkey.slice(5, 7)))
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const mk = mkey(year, month)
  const daysInMonth = new Date(year, month, 0).getDate()

  // Presupuesto diario = suma de presupuestos de categorías de gasto / días.
  const dailyBudget = useMemo(() => {
    const total = categories.filter(c => c.type === 'expense').reduce((s, c) => s + c.budget, 0)
    return total > 0 ? total / daysInMonth : 0
  }, [categories, daysInMonth])

  // Agrupación por día y totales del mes: se recalculaban en CADA render (incl.
  // al tocar un día). Memoizados sobre [transactions, mk] para no barrer todas
  // las transacciones cada vez que solo cambia la selección.
  const { byDay, monthIncome, monthExpense } = useMemo(() => {
    // Los montos se convierten a la divisa base ANTES de sumar: sin esto un
    // gasto de US$25 contaba como 25 PESOS en el total del dia y del mes.
    const monthTx = txForMonth(transactionsForTotals(transactions, accounts, currency), mk)
    const grouped = monthTx.reduce<Record<number, Transaction[]>>((acc, tx) => {
      const d = Number(tx.date.slice(8, 10))
      ;(acc[d] ??= []).push(tx)
      return acc
    }, {})
    let inc = 0, exp = 0
    for (const tx of monthTx) {
      if (tx.type === 'income') inc += tx.amount
      else if (tx.type === 'expense') exp += tx.amount
    }
    return { byDay: grouped, monthIncome: inc, monthExpense: exp }
  }, [transactions, accounts, currency, mk])

  // Cobros PREVISTOS del mes: ocurrencias futuras de los pagos recurrentes que
  // caen en el mes mostrado. Es lo que faltaba — el calendario ahora mira hacia
  // adelante, no solo al pasado. Se agrupan por día para marcarlos en azul.
  const upcoming = useMemo(() => {
    const map: Record<number, { note: string; amount: number }[]> = {}
    for (const tpl of transactions) {
      if (!tpl.recurring || tpl.type !== 'expense') continue
      let d = firstRecurrenceDate(tpl)
      let guard = 0
      while (d.slice(0, 7) <= mk && guard < 60) {
        if (tpl.recurringEnd && d > tpl.recurringEnd) break
        // No mostrar como "previsto" una ocurrencia que el usuario ya saltó.
        if (d.slice(0, 7) === mk && !tpl.skippedDates?.includes(d)) {
          const day = Number(d.slice(8, 10))
          ;(map[day] ??= []).push({ note: tpl.note, amount: tpl.amount })
        }
        d = advanceRecurrenceDate(d, tpl.recurring)
        guard++
      }
    }
    return map
  }, [transactions, mk])

  // First weekday of month (Monday-first)
  const firstDow = (new Date(year, month - 1, 1).getDay() + 6) % 7

  // Build calendar grid cells
  const cells: Array<number | null> = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = (d: number) =>
    d === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear()

  const dayTxs = selectedDay !== null ? (byDay[selectedDay] ?? []) : []

  const goBack = () => {
    const p = prevMonth(year, month)
    setYear(p.year); setMonth(p.month); setSelectedDay(null)
  }
  const goNext = () => {
    const n = nextMonth(year, month)
    setYear(n.year); setMonth(n.month); setSelectedDay(null)
  }

  return (
    <div className="mcal-root">
      {/* Header nav */}
      <div className="mcal-header">
        <button className="mcal-nav" aria-label={t('prevMonth')} onClick={goBack}>
          <Icon name="arrowUp" size={16} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <span className="mcal-month-label">{MONTHS[month - 1]} {year}</span>
        <button className="mcal-nav" aria-label={t('nextMonth')} onClick={goNext}>
          <Icon name="arrowUp" size={16} style={{ transform: 'rotate(90deg)' }} />
        </button>
      </div>

      {/* Totales del mes */}
      <div className="mcal-totals">
        <div><small>{t('incomes')}</small><strong className="mcal-t-inc">{fmtCompact(monthIncome, currency)}</strong></div>
        <div><small>{t('expenses')}</small><strong className="mcal-t-exp">{fmtCompact(monthExpense, currency)}</strong></div>
      </div>

      {/* Day headers */}
      <div className="mcal-grid">
        {DAYS.map(d => <span key={d} className="mcal-dow">{d}</span>)}

        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} className="mcal-empty" />
          const txs = byDay[day] ?? []
          const expense = txs.reduce((s, tx) => s + (tx.type === 'expense' ? tx.amount : 0), 0)
          const income  = txs.reduce((s, tx) => s + (tx.type === 'income'  ? tx.amount : 0), 0)
          const hasBill = !!upcoming[day]?.length
          const overBudget = dailyBudget > 0 ? expense > dailyBudget : expense > income && expense > 0
          const selected = selectedDay === day

          return (
            <button
              key={day}
              className={[
                'mcal-day',
                isToday(day) ? 'today' : '',
                selected ? 'selected' : '',
                overBudget ? 'over' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setSelectedDay(prev => prev === day ? null : day)}
            >
              <span className="mcal-day-num">{day}</span>
              {/* Puntos: verde ingreso, rojo gasto, azul cobro previsto. Se leen
                  de un vistazo; el detalle sale al tocar el día. */}
              <span className="mcal-dots">
                {income > 0 && <i className="mcal-dot inc" />}
                {expense > 0 && <i className="mcal-dot exp" />}
                {hasBill && <i className="mcal-dot bill" />}
              </span>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <div className="mcal-footer">
        {dailyBudget > 0 && (
          <span className="mcal-budget-label">
            {t('avgDailyBudgetLabel')}:&nbsp;
            <strong>{fmtCompact(dailyBudget, currency)}</strong>
          </span>
        )}
        <div className="mcal-legend">
          <span><i className="mcal-dot inc" />{t('incomes')}</span>
          <span><i className="mcal-dot exp" />{t('expenses')}</span>
          <span><i className="mcal-dot bill" />{t('upcomingChargeLegend')}</span>
        </div>
      </div>

      {/* Cobros previstos del día seleccionado (recurrentes que aún no ocurren). */}
      {selectedDay !== null && upcoming[selectedDay]?.length > 0 && (
        <div className="mcal-upcoming">
          <span className="mcal-upcoming-title">{t('upcomingChargesTitle')}</span>
          {upcoming[selectedDay].map((bill, i) => (
            <div key={`${bill.note}:${i}`} className="mcal-upcoming-row">
              <span className="mcal-dot bill" />
              <span className="mcal-upcoming-note">{bill.note || t('recurring')}</span>
              <strong className="mcal-upcoming-amt">−{fmtCompact(bill.amount, currency)}</strong>
            </div>
          ))}
        </div>
      )}

      {/* Day detail */}
      {selectedDay !== null && dayTxs.length > 0 && (
        <div className="mcal-detail">
          <MobileTransactionList
            transactions={dayTxs}
            onEdit={onEditTx}
            onDelete={onDeleteTx}
            compact
          />
        </div>
      )}
      {selectedDay !== null && dayTxs.length === 0 && !upcoming[selectedDay]?.length && (
        <p className="mcal-empty-day">{t('noMovementsOnDay').replace('{day}', String(selectedDay))}</p>
      )}
    </div>
  )
}
