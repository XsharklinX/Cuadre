import { describe, expect, it } from 'vitest'
import { computeTrends, detectSpendingAnomalies, detectSubscriptions, generateFinancialIntelligence, projectCashflow } from '@/data/financeIntelligence'
import type { Category, Transaction } from '@/types'

const categories: Category[] = [
  { id: 'cat_serv', name: 'Servicios', type: 'expense', color: '#fff', budget: 0, icon: 'bolt' },
  { id: 'cat_food', name: 'Restaurantes', type: 'expense', color: '#fff', budget: 0, icon: 'food' },
  { id: 'cat_salary', name: 'Salario', type: 'income', color: '#fff', budget: 0, icon: 'wallet' },
]

const txns: Transaction[] = [
  ...['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05'].map((date, index) => ({
    id: `netflix-${index}`, type: 'expense' as const, amount: 650 + index * 5, date, note: 'Netflix mensual', categoryId: 'cat_serv', accountId: 'cash',
  })),
  { id: 'salary-1', type: 'income', amount: 50000, date: '2026-04-01', note: 'Nomina', categoryId: 'cat_salary', accountId: 'cash' },
  { id: 'salary-2', type: 'income', amount: 50000, date: '2026-05-01', note: 'Nomina', categoryId: 'cat_salary', accountId: 'cash' },
  { id: 'food-1', type: 'expense', amount: 900, date: '2026-02-10', note: 'Restaurante Local', categoryId: 'cat_food', accountId: 'cash' },
  { id: 'food-2', type: 'expense', amount: 950, date: '2026-03-10', note: 'Restaurante Local', categoryId: 'cat_food', accountId: 'cash' },
  { id: 'food-3', type: 'expense', amount: 1000, date: '2026-04-10', note: 'Restaurante Local', categoryId: 'cat_food', accountId: 'cash' },
  { id: 'food-4', type: 'expense', amount: 4200, date: '2026-05-10', note: 'Restaurante Local', categoryId: 'cat_food', accountId: 'cash' },
]

describe('finance intelligence', () => {
  it('detecta suscripciones por comercio y recurrencia mensual', () => {
    expect(detectSubscriptions(txns, '2026-05')[0]).toMatchObject({ merchant: 'netflix mensual', months: 4, accountId: 'cash' })
  })

  it('proyecta flujo de caja a 30, 60 y 90 dias', () => {
    const projections = projectCashflow(txns, '2026-05', 10000)
    expect(projections.map(item => item.horizonDays)).toEqual([30, 60, 90])
    expect(projections[0].projectedBalance).toBeGreaterThan(10000)
  })

  it('detecta gastos atipicos frente al patron historico', () => {
    expect(detectSpendingAnomalies(txns, '2026-05')[0].tx.id).toBe('food-4')
  })

  it('permite ajustar la sensibilidad de gastos atipicos', () => {
    const moderate = txns.map(tx => tx.id === 'food-4' ? { ...tx, amount: 1900 } : tx)
    expect(detectSpendingAnomalies(moderate, '2026-05', 'strict')).toHaveLength(1)
    expect(detectSpendingAnomalies(moderate, '2026-05', 'relaxed')).toHaveLength(0)
  })

  it('genera acciones mensuales concretas', () => {
    const result = generateFinancialIntelligence({ txns, categories, mkey: '2026-05', currentBalance: 10000 })
    expect(result.monthlyActions.length).toBeGreaterThan(0)
    expect(result.recommendedMonthlySavings).toBeGreaterThan(0)
  })

  it('computeTrends: el delta de categoria compara contra el promedio anterior, no solo repite el monto (bug corregido)', () => {
    const trends = computeTrends(txns, categories, '2026-05')
    const foodTrend = trends.find(item => item.kind === 'category' && item.label === 'Restaurantes')
    expect(foodTrend).toBeDefined()
    // Antes: delta === amount (4200). Ahora: amount - promedio(900,950,1000)/3... => 4200 - 950
    expect(foodTrend!.previousAvg).toBeCloseTo((900 + 950 + 1000) / 3, 1)
    expect(foodTrend!.delta).toBeCloseTo(4200 - (900 + 950 + 1000) / 3, 1)
    expect(foodTrend!.delta).not.toBe(foodTrend!.amount)
  })

  it('computeTrends: comerciante nuevo (sin historial) tiene previousAvg 0 y delta === amount', () => {
    const withNewMerchant: Transaction[] = [
      ...txns,
      { id: 'new-1', type: 'expense', amount: 300, date: '2026-05-15', note: 'Comercio Nuevo', categoryId: 'cat_food', accountId: 'cash' },
    ]
    const trends = computeTrends(withNewMerchant, categories, '2026-05')
    const newTrend = trends.find(item => item.kind === 'merchant' && item.label === 'comercio nuevo')
    expect(newTrend).toMatchObject({ previousAvg: 0, delta: 300, amount: 300 })
  })
})

describe('detectSubscriptions — subida de precio', () => {
  const base = (amounts: number[]): Transaction[] =>
    ['2026-01-08', '2026-02-08', '2026-03-08', '2026-04-08'].map((date, i) => ({
      id: `spotify-${i}`, type: 'expense' as const, amount: amounts[i], date,
      note: 'Spotify', categoryId: 'cat_serv', accountId: 'cash',
    }))

  it('marca priceIncrease cuando el último cargo sube >5%', () => {
    const insight = detectSubscriptions(base([199, 199, 199, 299]), '2026-04')
      .find(s => s.merchant === 'spotify')
    expect(insight?.priceIncrease).toEqual({ from: 199, to: 299, pct: 50 })
  })

  it('ignora variaciones pequeñas (redondeo / cambio de divisa)', () => {
    const insight = detectSubscriptions(base([199, 199, 199, 203]), '2026-04')
      .find(s => s.merchant === 'spotify')
    expect(insight?.priceIncrease).toBeUndefined()
  })

  it('no marca subida si el precio bajó', () => {
    const insight = detectSubscriptions(base([299, 299, 299, 199]), '2026-04')
      .find(s => s.merchant === 'spotify')
    expect(insight?.priceIncrease).toBeUndefined()
  })
})
