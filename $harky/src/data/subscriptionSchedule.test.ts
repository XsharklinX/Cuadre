import { describe, expect, it } from 'vitest'
import { initialRecurringDates, nextMonthlyChargeDate, nextWeekdayChargeDate } from './subscriptionSchedule'

describe('nextMonthlyChargeDate', () => {
  it('avanza al mismo día del próximo mes si ya pasó este mes', () => {
    expect(nextMonthlyChargeDate('2026-07-20', 5)).toBe('2026-08-05')
  })

  it('usa el día de este mes si todavía no ha pasado', () => {
    expect(nextMonthlyChargeDate('2026-07-01', 20)).toBe('2026-07-20')
  })

  it('si hoy es el día elegido, salta al próximo mes (nunca hoy)', () => {
    expect(nextMonthlyChargeDate('2026-07-15', 15)).toBe('2026-08-15')
  })

  it('clampa al último día del mes cuando el día elegido no existe (31 en febrero)', () => {
    expect(nextMonthlyChargeDate('2026-01-20', 31)).toBe('2026-01-31')
    expect(nextMonthlyChargeDate('2026-02-01', 31)).toBe('2026-02-28')
  })

  it('cruza de año correctamente', () => {
    expect(nextMonthlyChargeDate('2026-12-20', 5)).toBe('2027-01-05')
  })
})

describe('nextWeekdayChargeDate', () => {
  it('encuentra el próximo día de la semana, nunca hoy', () => {
    // 2026-07-12 es domingo (0)
    expect(nextWeekdayChargeDate('2026-07-12', 0)).toBe('2026-07-19')
    expect(nextWeekdayChargeDate('2026-07-12', 3)).toBe('2026-07-15')
  })
})

describe('initialRecurringDates', () => {
  it('sin día elegido, se comporta igual que antes (arranca hoy, ciclo +7d o +1m)', () => {
    const monthly = initialRecurringDates('monthly', null, null)
    const weekly = initialRecurringDates('weekly', null, null)
    expect(monthly.start).toBe(weekly.start)
    expect(monthly.next > monthly.start).toBe(true)
    expect(weekly.next > weekly.start).toBe(true)
  })

  it('con día de mes elegido, ancla el próximo cobro a ese día', () => {
    const { next } = initialRecurringDates('monthly', null, 5)
    expect(next.endsWith('-05')).toBe(true)
  })

  it('con día de semana elegido, ancla el próximo cobro a ese weekday', () => {
    const { next } = initialRecurringDates('weekly', 3, null)
    const weekday = new Date(`${next}T00:00:00`).getDay()
    expect(weekday).toBe(3)
  })
})
