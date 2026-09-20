import { describe, expect, it } from 'vitest'
import { compareCategoryTotals, comparePeriods } from './comparisons'
import type { Category, Transaction } from '@/types'

const cats: Category[] = [
  { id: 'food', name: 'Comida', type: 'expense', color: '#f00', icon: 'food', budget: 0 },
  { id: 'trans', name: 'Transporte', type: 'expense', color: '#0f0', icon: 'car', budget: 0 },
]

function tx(over: Partial<Transaction>): Transaction {
  return { id: Math.random().toString(), type: 'expense', amount: 0, date: '2026-07-01', note: '', ...over }
}

describe('comparePeriods', () => {
  it('calcula delta y % de cambio de ingreso/gasto/neto', () => {
    const current = [
      tx({ type: 'income', amount: 1000 }),
      tx({ type: 'expense', amount: 400, categoryId: 'food' }),
    ]
    const previous = [
      tx({ type: 'income', amount: 800 }),
      tx({ type: 'expense', amount: 500, categoryId: 'food' }),
    ]
    const cmp = comparePeriods(current, previous, cats)
    expect(cmp.income).toEqual({ current: 1000, previous: 800, delta: 200, deltaPct: 25 })
    expect(cmp.expense).toEqual({ current: 400, previous: 500, delta: -100, deltaPct: -20 })
    expect(cmp.net.current).toBe(600)
    expect(cmp.net.previous).toBe(300)
  })

  it('deltaPct es null cuando el período anterior fue 0 (evita división por cero)', () => {
    const cmp = comparePeriods([tx({ type: 'income', amount: 500 })], [], cats)
    expect(cmp.income.deltaPct).toBeNull()
    expect(cmp.income.delta).toBe(500)
  })

  it('ambos períodos vacíos: todo en cero, sin errores', () => {
    const cmp = comparePeriods([], [], cats)
    expect(cmp.income).toEqual({ current: 0, previous: 0, delta: 0, deltaPct: null })
    expect(cmp.categories).toEqual([])
  })
})

describe('compareCategoryTotals', () => {
  it('respeta splits al sumar por categoría', () => {
    const current = [tx({
      amount: 300, categoryId: undefined,
      splits: [{ categoryId: 'food', amount: 200 }, { categoryId: 'trans', amount: 100 }],
    })]
    const rows = compareCategoryTotals(current, [], cats)
    const food = rows.find(r => r.category.id === 'food')
    const trans = rows.find(r => r.category.id === 'trans')
    expect(food?.current).toBe(200)
    expect(trans?.current).toBe(100)
  })

  it('ordena por magnitud del cambio, no por monto absoluto', () => {
    const current = [
      tx({ amount: 1000, categoryId: 'food' }),   // sin cambio (previous también 1000)
      tx({ amount: 150, categoryId: 'trans' }),    // +150 desde 0
    ]
    const previous = [tx({ amount: 1000, categoryId: 'food' })]
    const rows = compareCategoryTotals(current, previous, cats)
    expect(rows[0].category.id).toBe('trans') // mayor |delta| aunque food tenga más monto
  })

  it('incluye categorías que desaparecieron (gasto en el período anterior, cero ahora)', () => {
    const previous = [tx({ amount: 400, categoryId: 'trans' })]
    const rows = compareCategoryTotals([], previous, cats)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ current: 0, previous: 400, delta: -400 })
  })
})
