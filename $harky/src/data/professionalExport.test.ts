import { describe, expect, it } from 'vitest'
import { createExecutiveSummary } from './professionalExport'
import type { FinanceState } from '@/store/finance'

const state = {
  accounts: [
    { id: 'cash', name: 'Principal', short: 'CTA', type: 'debit', color: '#fff', balance: 40000, last4: null },
    { id: 'save', name: 'Ahorro', short: 'AHO', type: 'savings', color: '#0f0', balance: 10000, last4: null, includeInTotal: false },
  ],
  categories: [
    { id: 'food', name: 'Restaurantes', type: 'expense', color: '#fff', budget: 0, icon: 'food' },
    { id: 'salary', name: 'Salario', type: 'income', color: '#fff', budget: 0, icon: 'wallet' },
  ],
  goals: [],
  goalContributions: [],
  transactions: [
    { id: 'income', type: 'income', amount: 50000, date: '2026-05-01', note: 'Nomina', categoryId: 'salary', accountId: 'cash' },
    { id: 'food', type: 'expense', amount: 10000, date: '2026-05-10', note: 'Cena', categoryId: 'food', accountId: 'cash' },
    { id: 'other', type: 'expense', amount: 5000, date: '2026-04-10', note: 'Otro', categoryId: 'food', accountId: 'cash' },
  ],
  currency: 'DOP',
} as unknown as FinanceState

describe('professional exports', () => {
  it('calcula resumen ejecutivo para un mes', () => {
    const summary = createExecutiveSummary(state, '2026-05')
    expect(summary).toMatchObject({
      income: 50000,
      expense: 10000,
      net: 40000,
      topCategory: 'Restaurantes',
      topCategoryAmount: 10000,
    })
    expect(summary.savingsRate).toBe(20)
    expect(summary.headline).toContain('Buen ritmo')
  })
})
