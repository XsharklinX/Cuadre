import { describe, expect, it } from 'vitest'
import { computeEnvelopeSummary, validateEnvelopeTransfer } from './envelopes'
import type { Category, Transaction } from '@/types'

function cat(id: string, budget: number, type: Category['type'] = 'expense'): Category {
  return { id, name: id, type, color: '#fff', budget, icon: 'cart' }
}

function tx(type: Transaction['type'], amount: number): Transaction {
  return { id: Math.random().toString(), type, amount, date: '2026-07-01', note: '' }
}

describe('computeEnvelopeSummary', () => {
  it('calcula ingreso, asignado y sin asignar', () => {
    const categories = [cat('a', 500), cat('b', 300), cat('c', 0)]
    const monthTx = [tx('income', 2000), tx('income', 500)]
    const summary = computeEnvelopeSummary(categories, monthTx)
    expect(summary.income).toBe(2500)
    expect(summary.assigned).toBe(800)
    expect(summary.unassigned).toBe(1700)
  })

  it('ignora categorías sin límite (budget 0) y de ingreso al sumar lo asignado', () => {
    const categories = [cat('a', 100), cat('b', 0), cat('income1', 999, 'income')]
    const summary = computeEnvelopeSummary(categories, [])
    expect(summary.assigned).toBe(100)
  })

  it('sin asignar puede ser negativo si se asignó más de lo que se ganó', () => {
    const categories = [cat('a', 1000)]
    const monthTx = [tx('income', 300)]
    const summary = computeEnvelopeSummary(categories, monthTx)
    expect(summary.unassigned).toBe(-700)
  })
})

describe('validateEnvelopeTransfer', () => {
  it('rechaza cuando falta alguna categoría', () => {
    expect(validateEnvelopeTransfer(undefined, cat('b', 100), 10)).toBe('notFound')
    expect(validateEnvelopeTransfer(cat('a', 100), undefined, 10)).toBe('notFound')
  })

  it('rechaza mover a la misma categoría', () => {
    const a = cat('a', 100)
    expect(validateEnvelopeTransfer(a, a, 10)).toBe('sameCategory')
  })

  it('rechaza montos inválidos', () => {
    expect(validateEnvelopeTransfer(cat('a', 100), cat('b', 0), 0)).toBe('invalidAmount')
    expect(validateEnvelopeTransfer(cat('a', 100), cat('b', 0), -5)).toBe('invalidAmount')
  })

  it('rechaza mover más de lo asignado en el sobre origen', () => {
    expect(validateEnvelopeTransfer(cat('a', 100), cat('b', 0), 150)).toBe('insufficientFunds')
  })

  it('acepta un traspaso válido', () => {
    expect(validateEnvelopeTransfer(cat('a', 100), cat('b', 0), 50)).toBeNull()
  })
})
