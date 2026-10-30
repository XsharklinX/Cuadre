import { describe, expect, it } from 'vitest'
import { accountProfits, clientProfits, makeOwner, serviceBreakdown, serviceSplit } from './attribution'
import { businessMonth, businessRunRate, type Business, type Service } from './business'
import type { Charge, Client } from './clients'
import type { Transaction } from '@/types'

const NETFLIX_BIZ: Business = {
  id: 'b1', name: 'Netflix', color: '#e50914', icon: 'tv',
  incomeCategoryIds: ['cobros'], expenseCategoryIds: ['subs'], createdAt: 0,
}
const STREAMING: Business = {
  id: 'b2', name: 'Streaming', color: '#5bc0ff', icon: 'play',
  incomeCategoryIds: ['cobros2'], expenseCategoryIds: [], createdAt: 0,
}
const NETFLIX: Service = { id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0, capacity: 4 }
const DISNEY: Service = { id: 's2', businessId: 'b1', name: 'Disney', cost: 300, costCycle: 'monthly', createdAt: 0, capacity: 4 }

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: 'c1', name: 'María', concept: '', amount: 350, cycle: 'monthly', dueDay: 1,
    accountId: 'a1', categoryId: 'otra', active: true, createdAt: 0, businessId: 'b1', serviceId: 's1', ...over,
  }
}
let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return { id: `t${n}`, type: 'income', amount: 350, date: '2026-10-05', note: '', categoryId: 'otra', accountId: 'a1', ...over } as Transaction
}
function cobro(clientId: string, txIds: string[]): Charge {
  return { id: `ch${clientId}`, clientId, dueDate: '2026-10-01', amount: 350, paid: 350, txIds, paidAt: 1 }
}

describe('makeOwner · de quién es cada movimiento', () => {
  it('un cobro de un cliente es de su negocio, aunque la categoría no sea del negocio', () => {
    const pago = tx({ id: 'p1' })
    const owner = makeOwner({ businesses: [NETFLIX_BIZ], services: [NETFLIX], clients: [cliente()], charges: [cobro('c1', ['p1'])] })
    expect(owner(pago)).toMatchObject({ businessId: 'b1', serviceId: 's1', clientId: 'c1', via: 'client' })
  })

  it('un gasto marcado con su servicio es del negocio del servicio', () => {
    const owner = makeOwner({ businesses: [NETFLIX_BIZ], services: [NETFLIX], clients: [], charges: [] })
    expect(owner(tx({ type: 'expense', paidService: 's1', categoryId: 'cualquiera' })))
      .toMatchObject({ businessId: 'b1', serviceId: 's1', via: 'service' })
  })

  it('LO VIEJO SIN MARCA sigue contando por categoría', () => {
    const owner = makeOwner({ businesses: [NETFLIX_BIZ], services: [], clients: [], charges: [] })
    expect(owner(tx({ categoryId: 'cobros' }))).toMatchObject({ businessId: 'b1', via: 'category' })
    expect(owner(tx({ type: 'expense', categoryId: 'subs' }))).toMatchObject({ businessId: 'b1', via: 'category' })
    expect(owner(tx({ categoryId: 'salario' }))).toBeNull()
  })

  it('una transferencia no es de nadie', () => {
    const owner = makeOwner({ businesses: [NETFLIX_BIZ], services: [], clients: [], charges: [] })
    expect(owner(tx({ type: 'transfer', categoryId: 'cobros' }))).toBeNull()
  })

  it('dos negocios con la misma categoría ya no se reparten el mismo peso', () => {
    const otro = { ...STREAMING, incomeCategoryIds: ['cobros'] }
    const owner = makeOwner({ businesses: [NETFLIX_BIZ, otro], services: [], clients: [], charges: [] })
    expect(owner(tx({ categoryId: 'cobros' }))?.businessId).toBe('b1')
  })
})

describe('MOVER UN SERVICIO SE LLEVA SU DINERO (el fallo de la 2.3.0)', () => {
  const pago = tx({ id: 'cobro', categoryId: 'cobros' })
  const gasto = tx({ id: 'gasto', type: 'expense', amount: 600, paidService: 's1', categoryId: 'subs' })
  const libro = [pago, gasto]

  it('antes de mover, todo es de Netflix', () => {
    const owner = makeOwner({ businesses: [NETFLIX_BIZ, STREAMING], services: [NETFLIX], clients: [cliente()], charges: [cobro('c1', ['cobro'])] })
    expect(businessMonth(NETFLIX_BIZ, libro, '2026-10', owner)).toMatchObject({ collected: 350, costs: 600 })
    expect(businessMonth(STREAMING, libro, '2026-10', owner)).toMatchObject({ collected: 0, costs: 0 })
  })

  it('después de mover, el dinero está en Streaming aunque la categoría siga siendo de Netflix', () => {
    const movido = { ...NETFLIX, businessId: 'b2' }
    const owner = makeOwner({
      businesses: [NETFLIX_BIZ, STREAMING], services: [movido],
      clients: [cliente({ businessId: 'b2' })], charges: [cobro('c1', ['cobro'])],
    })
    expect(businessMonth(STREAMING, libro, '2026-10', owner)).toMatchObject({ collected: 350, costs: 600 })
    expect(businessMonth(NETFLIX_BIZ, libro, '2026-10', owner)).toMatchObject({ collected: 0, costs: 0 })
  })

  it('SIN owner se comporta como siempre, por categoría', () => {
    expect(businessMonth(NETFLIX_BIZ, libro, '2026-10')).toMatchObject({ collected: 350, costs: 600 })
  })
})

describe('serviceSplit', () => {
  it('reparte por lo que paga por cada servicio', () => {
    const c = cliente({ serviceShares: [{ serviceId: 's1', amount: 250 }, { serviceId: 's2', amount: 150 }] })
    expect(serviceSplit(c)).toEqual([{ serviceId: 's1', share: 0.625 }, { serviceId: 's2', share: 0.375 }])
  })
  it('sin servicios, nada', () => expect(serviceSplit(cliente({ serviceId: undefined }))).toEqual([]))
})

describe('serviceBreakdown · la ganancia servicio por servicio', () => {
  it('cada servicio con lo cobrado a los suyos menos lo que cuesta', () => {
    const maria = cliente({ id: 'm' })
    const ana = cliente({ id: 'a', serviceId: 's2', amount: 200 })
    const libro = [tx({ id: 'pm' }), tx({ id: 'pa', amount: 200 }), tx({ id: 'suelto', categoryId: 'cobros', amount: 100 })]
    const owner = makeOwner({
      businesses: [NETFLIX_BIZ], services: [NETFLIX, DISNEY], clients: [maria, ana],
      charges: [cobro('m', ['pm']), cobro('a', ['pa'])],
    })
    const r = serviceBreakdown(NETFLIX_BIZ, [NETFLIX, DISNEY], [maria, ana], libro, '2026-10', owner)
    expect(r.rows.map(x => [x.service.id, x.collected, x.monthlyCost, x.profit])).toEqual([
      ['s1', 350, 600, -250],
      ['s2', 200, 300, -100],
    ])
    expect(r.otherCollected).toBe(100)
  })

  it('LA SUMA CUADRA con la cabecera del negocio', () => {
    const maria = cliente({ id: 'm' })
    const libro = [tx({ id: 'pm' }), tx({ id: 'x', categoryId: 'cobros', amount: 90 })]
    const owner = makeOwner({ businesses: [NETFLIX_BIZ], services: [NETFLIX, DISNEY], clients: [maria], charges: [cobro('m', ['pm'])] })
    const r = serviceBreakdown(NETFLIX_BIZ, [NETFLIX, DISNEY], [maria], libro, '2026-10', owner)
    const cabecera = businessRunRate(NETFLIX_BIZ, [NETFLIX, DISNEY], libro, '2026-10', undefined, owner)
    const suma = r.rows.reduce((s, x) => s + x.profit, 0) + r.otherCollected
    expect(Math.round(suma * 100) / 100).toBe(cabecera.profit)
  })

  it('un servicio archivado no cuesta', () => {
    const owner = makeOwner({ businesses: [NETFLIX_BIZ], services: [], clients: [], charges: [] })
    const r = serviceBreakdown(NETFLIX_BIZ, [{ ...NETFLIX, archivedAt: 1 }], [], [], '2026-10', owner)
    expect(r.rows).toEqual([])
  })
})

describe('G3 · lo que deja cada cliente y cada cuenta', () => {
  it('lo que paga menos lo que cuesta su plaza', () => {
    const r = clientProfits(NETFLIX, [cliente()], () => 0)
    expect(r[0]).toMatchObject({ pays: 350, slotCost: 150, profit: 200 })
  })
  it('si debe, su plaza la pagas tú', () => {
    const r = clientProfits(NETFLIX, [cliente()], () => 350)
    expect(r[0].profit).toBe(-150)
  })
  it('por cuenta: lo que cobran sus clientes menos lo que cuesta', () => {
    const svc: Service = { ...NETFLIX, accounts: [{ id: 'ac1', cost: 600, capacity: 4 }, { id: 'ac2', cost: 600, capacity: 4 }] }
    const clientes = [cliente({ id: 'x', serviceAccountId: 'ac1' }), cliente({ id: 'y', serviceAccountId: 'ac1' })]
    const r = accountProfits(svc, clientes)
    expect(r.map(a => [a.accountId, a.revenue, a.cost, a.profit])).toEqual([['ac1', 700, 600, 100], ['ac2', 0, 600, -600]])
  })
})
