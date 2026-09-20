import { describe, expect, it } from 'vitest'
import { currentTotalBalance, projectCashflow, safeToSpend, type CashflowProjection } from './cashflowProjection'
import type { Account, Goal, Transaction } from '@/types'

const account = (over: Partial<Account> = {}): Account => ({
  id: 'acc_1', name: 'Efectivo', short: 'Cash', type: 'cash',
  color: '#fff', balance: 1000, last4: null, ...over,
})

const recurringExpense = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_sub', type: 'expense', amount: 200, date: '2026-07-01',
  note: 'Netflix', accountId: 'acc_1', categoryId: 'cat_ocio',
  recurring: 'monthly', recurringNext: '2026-07-15', ...over,
})

describe('currentTotalBalance', () => {
  it('suma cuentas y respeta includeInTotal=false', () => {
    const accounts = [
      account(),
      account({ id: 'acc_2', balance: 500 }),
      account({ id: 'acc_3', balance: 9999, includeInTotal: false }),
    ]
    expect(currentTotalBalance(accounts)).toBe(1500)
  })
})

describe('projectCashflow', () => {
  it('proyecta cargos recurrentes futuros y el saldo resultante', () => {
    const projection = projectCashflow(
      [recurringExpense()], [account()], [], '2026-07-31', '2026-07-07',
    )
    expect(projection.startBalance).toBe(1000)
    expect(projection.days).toHaveLength(1)
    expect(projection.days[0].date).toBe('2026-07-15')
    expect(projection.days[0].net).toBe(-200)
    expect(projection.days[0].balance).toBe(800)
    expect(projection.endBalance).toBe(800)
  })

  it('genera múltiples ocurrencias semanales dentro del horizonte', () => {
    const weekly = recurringExpense({ recurring: 'weekly', recurringNext: '2026-07-10', amount: 100 })
    const projection = projectCashflow([weekly], [account()], [], '2026-07-31', '2026-07-07')
    // 10, 17, 24, 31 de julio
    expect(projection.days).toHaveLength(4)
    expect(projection.endBalance).toBe(600)
  })

  it('ignora ocurrencias saltadas, pasadas y posteriores a recurringEnd', () => {
    const tx = recurringExpense({
      recurring: 'weekly', recurringNext: '2026-07-10',
      skippedDates: ['2026-07-17'], recurringEnd: '2026-07-24',
    })
    const projection = projectCashflow([tx], [account()], [], '2026-07-31', '2026-07-07')
    expect(projection.days.map(d => d.date)).toEqual(['2026-07-10', '2026-07-24'])
  })

  it('incluye ingresos recurrentes y aportes automáticos a metas', () => {
    const salary = recurringExpense({
      id: 'tx_salary', type: 'income', amount: 5000, note: 'Salario', recurringNext: '2026-07-30',
    })
    const goal: Goal = {
      id: 'goal_1', name: 'Viaje', target: 10000, saved: 0, color: '#fff', icon: 'target',
      autoContribute: { amount: 300, frequency: 'monthly', fromAccountId: 'acc_1', nextDate: '2026-07-20' },
    }
    const projection = projectCashflow([salary], [account()], [goal], '2026-07-31', '2026-07-07')
    expect(projection.days.map(d => d.date)).toEqual(['2026-07-20', '2026-07-30'])
    expect(projection.endBalance).toBe(1000 - 300 + 5000)
    expect(projection.days[0].events[0].kind).toBe('goal')
  })

  it('detecta el punto más bajo de la proyección', () => {
    const rent = recurringExpense({ id: 'tx_rent', amount: 900, note: 'Renta', recurringNext: '2026-07-10' })
    const salary = recurringExpense({
      id: 'tx_salary', type: 'income', amount: 5000, note: 'Salario', recurringNext: '2026-07-28',
    })
    const projection = projectCashflow([rent, salary], [account()], [], '2026-07-31', '2026-07-07')
    expect(projection.minBalance).toBe(100)
    expect(projection.minDate).toBe('2026-07-10')
    expect(projection.endBalance).toBe(5100)
  })

  it('excluye transferencias recurrentes (no cambian el total)', () => {
    const transfer: Transaction = {
      id: 'tx_tr', type: 'transfer', amount: 500, date: '2026-07-01', note: 'Ahorro',
      fromAccount: 'acc_1', toAccount: 'acc_2', recurring: 'monthly', recurringNext: '2026-07-15',
    }
    const projection = projectCashflow([transfer], [account()], [], '2026-07-31', '2026-07-07')
    expect(projection.days).toHaveLength(0)
    expect(projection.endBalance).toBe(1000)
  })
})

describe('safeToSpend', () => {
  const ev = (date: string, note: string, amount: number, kind: 'income' | 'expense' | 'goal' = amount > 0 ? 'income' : 'expense') =>
    ({ date, note, amount, kind, sourceId: note })
  const projection: CashflowProjection = {
    startBalance: 10000,
    endBalance: 56900,
    minBalance: 7700,
    minDate: '2026-07-03',
    days: [
      { date: '2026-07-02', events: [ev('2026-07-02', 'Netflix', -300)], net: -300, balance: 9700 },
      { date: '2026-07-03', events: [ev('2026-07-03', 'Renta', -2000)], net: -2000, balance: 7700 },
      { date: '2026-07-06', events: [ev('2026-07-06', 'Nómina', 50000)], net: 50000, balance: 57700 },
      { date: '2026-07-10', events: [ev('2026-07-10', 'Gimnasio', -800)], net: -800, balance: 56900 },
    ],
    series: [
      { date: '2026-07-02', balance: 9700 }, { date: '2026-07-03', balance: 7700 },
      { date: '2026-07-06', balance: 57700 }, { date: '2026-07-10', balance: 56900 },
    ],
  }

  it('resta lo comprometido ANTES del próximo ingreso, no lo posterior', () => {
    const s = safeToSpend(projection, 0)
    expect(s.nextIncome?.note).toBe('Nómina')
    expect(s.committed).toBe(2300)          // Netflix + Renta, no el gimnasio (post-ingreso)
    expect(s.amount).toBe(7700)             // 10000 − 2300
    expect(s.bills.map(b => b.note)).toEqual(['Netflix', 'Renta'])
  })

  it('el colchón se aparta del gastable', () => {
    expect(safeToSpend(projection, 3000).amount).toBe(4700)
  })

  it('marca dipsNegative si el saldo caería bajo cero antes del ingreso', () => {
    const broke = { ...projection, series: [{ date: '2026-07-03', balance: -500 }, { date: '2026-07-06', balance: 100 }] }
    expect(safeToSpend(broke, 0).dipsNegative).toBe(true)
  })

  it('sin ingreso futuro, compromete todas las salidas del horizonte', () => {
    const noIncome = {
      ...projection,
      days: projection.days.filter(d => d.events.every(e => e.amount < 0)),
      series: projection.series,
    }
    const s = safeToSpend(noIncome, 0)
    expect(s.nextIncome).toBeNull()
    expect(s.committed).toBe(3100)          // Netflix + Renta + Gimnasio
  })
})
