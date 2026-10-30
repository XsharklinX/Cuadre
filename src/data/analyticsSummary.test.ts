import { describe, expect, it } from 'vitest'
import { businessIncome, foldOrder, spendShares } from './analyticsSummary'
import type { Business } from './business'
import type { Category, Transaction } from '@/types'

const cat = (id: string, name = id): Category =>
  ({ id, name, type: 'expense', color: '#888', budget: 0, icon: 'wallet' }) as Category

const CATS = ['comida', 'subs', 'transp', 'juegos', 'ropa', 'salud', 'otro'].map(id => cat(id))

let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'expense', amount: 100, date: '2026-10-05',
    note: 'x', categoryId: 'comida', accountId: 'a1', ...over,
  } as Transaction
}

describe('spendShares · a dónde se fue el mes', () => {
  it('ordena por lo que más pesa', () => {
    const r = spendShares([
      tx({ categoryId: 'subs', amount: 200 }),
      tx({ categoryId: 'comida', amount: 700 }),
      tx({ categoryId: 'transp', amount: 100 }),
    ], CATS)
    expect(r.map(s => s.category?.id)).toEqual(['comida', 'subs', 'transp'])
    expect(r.map(s => s.pct)).toEqual([70, 20, 10])
  })

  it('LOS PORCENTAJES SUMAN 100 EXACTO', () => {
    // Redondear cada uno por su cuenta da 99 o 101, y una barra que suma 101
    // hace dudar de todo lo demás de la pantalla.
    const r = spendShares([
      tx({ categoryId: 'comida', amount: 1 }),
      tx({ categoryId: 'subs', amount: 1 }),
      tx({ categoryId: 'transp', amount: 1 }),
    ], CATS)
    expect(r.reduce((a, s) => a + s.pct, 0)).toBe(100)
  })

  it('junta lo que pasa de cinco en «lo demás»', () => {
    const r = spendShares(CATS.map((c, i) => tx({ categoryId: c.id, amount: 100 + i })), CATS)
    expect(r).toHaveLength(6)
    expect(r[5].category).toBeNull()
    expect(r.reduce((a, s) => a + s.pct, 0)).toBe(100)
  })

  it('sin «lo demás» si no sobra nada', () => {
    const r = spendShares([tx({ categoryId: 'comida' })], CATS)
    expect(r.every(s => s.category !== null)).toBe(true)
  })

  it('ignora ingresos y transferencias', () => {
    const r = spendShares([
      tx({ categoryId: 'comida', amount: 100 }),
      tx({ type: 'income', categoryId: 'subs', amount: 9_999 }),
      tx({ type: 'transfer', categoryId: undefined, amount: 9_999 }),
    ], CATS)
    expect(r).toHaveLength(1)
    expect(r[0].pct).toBe(100)
  })

  it('sin gastos, nada que repartir', () => {
    expect(spendShares([], CATS)).toEqual([])
  })
})

describe('businessIncome · cuánto de lo que entra viene del negocio', () => {
  const NEGOCIO = {
    id: 'b1', name: 'Streaming', color: '#35d0a2', icon: 'play',
    incomeCategoryIds: ['cobros'], expenseCategoryIds: [], createdAt: 0,
  } as Business

  it('separa lo del negocio del total', () => {
    const r = businessIncome([
      tx({ type: 'income', categoryId: 'cobros', amount: 2_000 }),
      tx({ type: 'income', categoryId: 'salario', amount: 8_000 }),
      tx({ categoryId: 'comida', amount: 500 }),
    ], [NEGOCIO])
    expect(r).toEqual({ fromBusiness: 2_000, total: 10_000, pct: 20 })
  })

  it('sin ingresos no hay parte que sacar, y no es cero', () => {
    expect(businessIncome([], [NEGOCIO]).pct).toBeNull()
  })

  it('sin negocios, todo es personal', () => {
    const r = businessIncome([tx({ type: 'income', categoryId: 'cobros', amount: 500 })], [])
    expect(r.pct).toBe(0)
  })
})

describe('foldOrder · los que más abres, arriba', () => {
  const IDS = ['metrics', 'trends', 'evolution', 'networth', 'categories'] as const

  it('ordena por veces abierto', () => {
    expect(foldOrder([...IDS], { categories: 9, networth: 3 }))
      .toEqual(['categories', 'networth', 'metrics', 'trends', 'evolution'])
  })

  it('SIN USO TODAVÍA, el orden de siempre', () => {
    // La pantalla no se baraja sola el primer día.
    expect(foldOrder([...IDS], {})).toEqual([...IDS])
  })

  it('a igualdad, manda el orden de diseño', () => {
    expect(foldOrder([...IDS], { trends: 2, networth: 2 }))
      .toEqual(['trends', 'networth', 'metrics', 'evolution', 'categories'])
  })
})
