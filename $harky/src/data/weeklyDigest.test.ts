import { describe, expect, it } from 'vitest'
import { weeklyDigest } from './weeklyDigest'
import type { Category, Transaction } from '@/types'

const cats: Category[] = [
  { id: 'comida', name: 'Comida', icon: 'food', type: 'expense', color: '#f00', budget: 0 },
  { id: 'trans', name: 'Transporte', icon: 'car', type: 'expense', color: '#0f0', budget: 0 },
]
const tx = (over: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36), type: 'expense', amount: 100, date: '2026-07-26', note: 'x', ...over,
})

// "Hoy" = 2026-07-26 (domingo). Semana en curso = lun 20 … dom 26.
// Semana previa = lun 13 … dom 19.
const today = '2026-07-26'

describe('weeklyDigest (semana calendario, empieza el lunes)', () => {
  it('el lunes es el inicio de la semana', () => {
    expect(weeklyDigest([], cats, '2026-07-26').weekStart).toBe('2026-07-20') // dom → lunes 20
    expect(weeklyDigest([], cats, '2026-07-27').weekStart).toBe('2026-07-27') // lunes → él mismo
    expect(weeklyDigest([], cats, '2026-07-22').weekStart).toBe('2026-07-20') // miércoles → lunes 20
  })

  it('el lunes empieza en limpio: no arrastra la semana pasada', () => {
    const monday = weeklyDigest([
      tx({ amount: 999, date: '2026-07-26' }), // domingo pasado
      tx({ amount: 150, date: '2026-07-27' }), // este lunes
    ], cats, '2026-07-27')
    expect(monday.expense).toBe(150) // solo el lunes, NO el domingo anterior
    expect(monday.weekStart).toBe('2026-07-27')
  })

  it('suma ingresos y gastos de la semana en curso', () => {
    const d = weeklyDigest([
      tx({ type: 'income', amount: 5000, date: '2026-07-25' }),
      tx({ amount: 640, date: '2026-07-26', categoryId: 'comida' }),
      tx({ amount: 200, date: '2026-07-20', categoryId: 'trans' }),
    ], cats, today)
    expect(d.income).toBe(5000)
    expect(d.expense).toBe(840)
    expect(d.net).toBe(4160)
    expect(d.txCount).toBe(3)
    expect(d.weekStart).toBe('2026-07-20')
  })

  it('excluye lo de la semana anterior (antes del lunes)', () => {
    const d = weeklyDigest([
      tx({ amount: 999, date: '2026-07-19' }),   // domingo pasado → previa
      tx({ amount: 100, date: '2026-07-26' }),
    ], cats, today)
    expect(d.expense).toBe(100)
  })

  it('la categoría top es la de mayor gasto de la semana', () => {
    const d = weeklyDigest([
      tx({ amount: 300, date: '2026-07-21', categoryId: 'comida' }),
      tx({ amount: 500, date: '2026-07-22', categoryId: 'trans' }),
      tx({ amount: 100, date: '2026-07-23', categoryId: 'comida' }),
    ], cats, today)
    expect(d.topCategoryId).toBe('trans')
    expect(d.topCategoryAmount).toBe(500)
  })

  it('calcula la variación vs la semana anterior', () => {
    const d = weeklyDigest([
      tx({ amount: 1000, date: '2026-07-24' }),  // esta semana
      tx({ amount: 800, date: '2026-07-15' }),   // semana previa
    ], cats, today)
    expect(d.expenseDeltaPct).toBeCloseTo(0.25) // (1000-800)/800
  })

  it('sin base la semana previa → delta null (no divide por cero)', () => {
    const d = weeklyDigest([tx({ amount: 100, date: '2026-07-26' })], cats, today)
    expect(d.expenseDeltaPct).toBeNull()
  })

  it('ignora transferencias y categorías borradas', () => {
    const d = weeklyDigest([
      tx({ type: 'transfer', amount: 9999, date: '2026-07-26' }),
      tx({ amount: 100, date: '2026-07-26', categoryId: 'no-existe' }),
    ], cats, today)
    expect(d.expense).toBe(100)
    expect(d.topCategoryId).toBeUndefined()
  })
})
