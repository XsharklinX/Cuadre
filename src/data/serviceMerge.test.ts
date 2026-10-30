import { describe, expect, it } from 'vitest'
import {
  brandKey, businessMergePlan, serviceMergePlan, similarBusinesses, similarServices, unmarkedPayments,
} from './serviceMerge'
import type { Business, Service } from './business'
import type { Client } from './clients'
import type { Transaction } from '@/types'

const SUB: Service = { id: 's1', businessId: 'b1', name: 'Netflix Sub', cost: 600, costCycle: 'monthly', createdAt: 0, capacity: 4 }
const SUB2: Service = { id: 's2', businessId: 'b2', name: 'Netflix Sub 2', cost: 600, costCycle: 'monthly', createdAt: 0, capacity: 4 }

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: `c${Math.random()}`, name: 'X', concept: '', amount: 350, cycle: 'monthly', dueDay: 1,
    accountId: 'a', categoryId: 'c', active: true, createdAt: 0, ...over,
  }
}

describe('serviceMergePlan · el segundo pasa a ser la cuenta 2', () => {
  it('las cuentas del que se une se suman a las del que queda', () => {
    const r = serviceMergePlan(SUB, SUB2, [], [])
    expect(r.accounts.map(a => a.id)).toEqual(['s1:single', 's2:single'])
    expect(r.accounts.map(a => a.capacity)).toEqual([4, 4])
  })

  it('sus clientes pasan al que queda, en SU cuenta', () => {
    const ana = cliente({ id: 'ana', serviceId: 's2', businessId: 'b2' })
    const r = serviceMergePlan(SUB, SUB2, [ana], [])
    expect(r.clientChanges.get('ana')).toEqual({ serviceId: 's1', businessId: 'b1', serviceAccountId: 's2:single' })
  })

  it('los del que queda no se tocan', () => {
    const r = serviceMergePlan(SUB, SUB2, [cliente({ id: 'x', serviceId: 's1' })], [])
    expect(r.clientChanges.size).toBe(0)
  })

  it('quien tenía los dos se queda con uno y la suma', () => {
    const doble = cliente({ id: 'd', serviceShares: [{ serviceId: 's1', amount: 300 }, { serviceId: 's2', amount: 300 }] })
    const r = serviceMergePlan(SUB, SUB2, [doble], [])
    expect(r.clientChanges.get('d')?.serviceShares).toEqual([{ serviceId: 's1', amount: 600 }])
  })

  it('sus pagos del libro pasan a marcarse con el que queda', () => {
    const pagos = [
      { id: 'p1', type: 'expense', paidService: 's2' },
      { id: 'p2', type: 'expense', paidService: 's1' },
    ] as Transaction[]
    expect(serviceMergePlan(SUB, SUB2, [], pagos).paymentIds).toEqual(['p1'])
  })

  it('UNA CUENTA ANUAL unida a un servicio mensual sigue costando lo mismo al mes', () => {
    const anual: Service = { ...SUB2, cost: 6000, costCycle: 'annual' }
    const r = serviceMergePlan(SUB, anual, [], [])
    expect(r.accounts[1].cost).toBe(500)
  })
})

describe('businessMergePlan · tus varios Netflix en uno', () => {
  const A: Business = { id: 'b1', name: 'Netflix', color: '', icon: 'tv', incomeCategoryIds: ['i1'], expenseCategoryIds: ['e1'], createdAt: 0 }
  const B: Business = { id: 'b2', name: 'Netflix 2', color: '', icon: 'tv', incomeCategoryIds: ['i2', 'i1'], expenseCategoryIds: [], createdAt: 0 }

  it('suma categorías sin repetir y se lleva servicios y clientes', () => {
    const r = businessMergePlan(A, [B], [SUB, SUB2], [cliente({ id: 'k', businessId: 'b2' })])
    expect(r).toEqual({ incomeCategoryIds: ['i1', 'i2'], expenseCategoryIds: ['e1'], serviceIds: ['s2'], clientIds: ['k'] })
  })

  it('propone unir los que venden la misma marca', () => {
    expect(similarBusinesses([A, B], [SUB, SUB2]).map(g => g.map(b => b.id))).toEqual([['b1', 'b2']])
  })
})

describe('se reconocen los repetidos', () => {
  it('«Netflix Sub 2» y «Netflix» son la misma marca', () => {
    expect(brandKey('Netflix Sub 2')).toBe(brandKey('Netflix'))
  })
  it('nombres sin marca: sin números ni «cuenta»', () => {
    expect(brandKey('Clases cuenta 2')).toBe(brandKey('Clases'))
  })
  it('agrupa los parecidos y deja fuera los archivados', () => {
    const otro: Service = { ...SUB, id: 's3', name: 'Spotify' }
    expect(similarServices([SUB, SUB2, otro]).map(g => g.map(s => s.id))).toEqual([['s1', 's2']])
    expect(similarServices([SUB, { ...SUB2, archivedAt: 1 }])).toEqual([])
  })
})

describe('unmarkedPayments · los pagos viejos que parecen de este servicio', () => {
  const NEG: Business = { id: 'b1', name: 'N', color: '', icon: 'tv', incomeCategoryIds: [], expenseCategoryIds: ['subs'], createdAt: 0 }
  const tx = (over: Partial<Transaction>) => ({ id: 'x', type: 'expense', amount: 1, date: '2026-01-01', note: 'Netflix', accountId: 'a', categoryId: 'subs', ...over }) as Transaction

  it('sin marca, en su categoría y con su nombre', () => {
    const r = unmarkedPayments(SUB, NEG, [tx({ id: 'si' }), tx({ id: 'marcado', paidService: 's9' }), tx({ id: 'otro', note: 'Comida' }), tx({ id: 'fuera', categoryId: 'ocio' })])
    expect(r.map(t => t.id)).toEqual(['si'])
  })

  it('un pago cuya nota es el nombre de OTRO servicio de la marca no se propone', () => {
    // «Netflix Sub 2» es Netflix, pero ese pago es de Sub 2, no de Sub.
    const r = unmarkedPayments(SUB, NEG, [tx({ id: 'de-sub2', note: 'Netflix Sub 2' }), tx({ id: 'mio', note: 'Netflix' })], [SUB, SUB2])
    expect(r.map(t => t.id)).toEqual(['mio'])
  })
})
