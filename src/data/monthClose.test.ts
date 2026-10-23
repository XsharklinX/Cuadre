import { describe, expect, it } from 'vitest'
import { lastMonthClose, monthCloseAlertId } from './monthClose'
import type { Transaction } from '@/types'

let n = 0
function tx(date: string, type: 'income' | 'expense', amount: number): Transaction {
  n += 1
  return {
    id: `t${n}`, type, date, amount,
    note: 'x', categoryId: 'c1', accountId: 'a1',
  } as Transaction
}

/** Un mes normal: un sueldo y tres gastos. `gasto` es el total gastado. */
function mesCon(key: string, ingreso: number, gasto: number): Transaction[] {
  return [
    tx(`${key}-01`, 'income', ingreso),
    tx(`${key}-05`, 'expense', gasto / 2),
    tx(`${key}-12`, 'expense', gasto / 4),
    tx(`${key}-21`, 'expense', gasto / 4),
  ]
}

describe('lastMonthClose', () => {
  it('cuenta lo que sobró el mes pasado', () => {
    const r = lastMonthClose(mesCon('2026-02', 60_000, 40_000), '2026-03-03')
    expect(r).not.toBeNull()
    expect(r!.monthKey).toBe('2026-02')
    expect(r!.income).toBe(60_000)
    expect(r!.expense).toBe(40_000)
    expect(r!.net).toBe(20_000)
  })

  it('se calla cuando el mes salió en rojo', () => {
    expect(lastMonthClose(mesCon('2026-02', 40_000, 60_000), '2026-03-03')).toBeNull()
  })

  it('se calla cuando el mes quedó exactamente a cero', () => {
    expect(lastMonthClose(mesCon('2026-02', 50_000, 50_000), '2026-03-03')).toBeNull()
  })

  it('solo habla durante los primeros días del mes nuevo', () => {
    const txns = mesCon('2026-02', 60_000, 40_000)
    expect(lastMonthClose(txns, '2026-03-01')).not.toBeNull()
    expect(lastMonthClose(txns, '2026-03-07')).not.toBeNull()
    expect(lastMonthClose(txns, '2026-03-08')).toBeNull()
    expect(lastMonthClose(txns, '2026-03-23')).toBeNull()
  })

  it('un mes casi vacío no «cierra en verde»', () => {
    const casiVacio = [tx('2026-02-10', 'income', 50_000)]
    expect(lastMonthClose(casiVacio, '2026-03-02')).toBeNull()
  })

  it('no cuenta los movimientos del mes en curso', () => {
    const txns = [...mesCon('2026-02', 60_000, 40_000), tx('2026-03-01', 'expense', 500_000)]
    expect(lastMonthClose(txns, '2026-03-02')!.net).toBe(20_000)
  })

  it('cruza el cambio de año', () => {
    const r = lastMonthClose(mesCon('2025-12', 80_000, 50_000), '2026-01-04')
    expect(r!.monthKey).toBe('2025-12')
    expect(r!.net).toBe(30_000)
  })

  it('compara con el mes anterior a ése', () => {
    const txns = [...mesCon('2026-01', 60_000, 50_000), ...mesCon('2026-02', 60_000, 40_000)]
    const r = lastMonthClose(txns, '2026-03-02')!
    expect(r.net).toBe(20_000)
    expect(r.prevNet).toBe(10_000)
  })

  it('sin mes anterior con datos, no hay con qué comparar', () => {
    expect(lastMonthClose(mesCon('2026-02', 60_000, 40_000), '2026-03-02')!.prevNet).toBeNull()
  })

  it('cuenta los meses seguidos en verde', () => {
    const txns = [
      ...mesCon('2025-12', 60_000, 50_000),
      ...mesCon('2026-01', 60_000, 45_000),
      ...mesCon('2026-02', 60_000, 40_000),
    ]
    expect(lastMonthClose(txns, '2026-03-02')!.greenRun).toBe(3)
  })

  it('la racha de meses se corta en el primero que salió en rojo', () => {
    const txns = [
      ...mesCon('2025-12', 60_000, 50_000),
      ...mesCon('2026-01', 40_000, 70_000),
      ...mesCon('2026-02', 60_000, 40_000),
    ]
    expect(lastMonthClose(txns, '2026-03-02')!.greenRun).toBe(1)
  })

  it('un solo mes en verde es una racha de uno', () => {
    expect(lastMonthClose(mesCon('2026-02', 60_000, 40_000), '2026-03-02')!.greenRun).toBe(1)
  })

  it('las transferencias no cuentan como ingreso ni como gasto', () => {
    const txns = [
      ...mesCon('2026-02', 60_000, 40_000),
      { id: 'tr', type: 'transfer', date: '2026-02-15', amount: 900_000, note: 'x',
        fromAccount: 'a1', toAccount: 'a2' } as Transaction,
    ]
    expect(lastMonthClose(txns, '2026-03-02')!.net).toBe(20_000)
  })

  it('sin movimientos no hay informe', () => {
    expect(lastMonthClose([], '2026-03-02')).toBeNull()
  })
})

describe('monthCloseAlertId', () => {
  it('descartar un mes no descarta el siguiente', () => {
    expect(monthCloseAlertId('2026-02')).toBe('month-close-2026-02')
    expect(monthCloseAlertId('2026-02')).not.toBe(monthCloseAlertId('2026-03'))
  })
})
