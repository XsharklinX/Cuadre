import { describe, expect, it } from 'vitest'
import { businessForecast, weakestMonth } from './businessForecast'
import type { Service } from './business'
import type { Client } from './clients'

const HOY = '2026-10-24'

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: `c${Math.random()}`, name: 'X', concept: '', amount: 350, cycle: 'monthly', dueDay: 1,
    accountId: 'a', categoryId: 'c', active: true, createdAt: 0, ...over,
  }
}
const NETFLIX: Service = { id: 's1', businessId: 'b', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0, payDay: 12 }
const DISNEY: Service = { id: 's2', businessId: 'b', name: 'Disney', cost: 3000, costCycle: 'annual', createdAt: 0, payAnchor: '2026-03-15' }

describe('businessForecast', () => {
  it('empieza el mes que viene y cuenta lo que entra y sale', () => {
    const r = businessForecast([cliente(), cliente()], [NETFLIX], [], HOY, 3, 'DOP')
    expect(r.map(m => m.mkey)).toEqual(['2026-11', '2026-12', '2027-01'])
    expect(r[0]).toMatchObject({ income: 700, costs: 600, net: 100 })
  })

  it('EL PAGO ANUAL cae en su mes y lo hace distinto', () => {
    const r = businessForecast([cliente(), cliente()], [NETFLIX, DISNEY], [], HOY, 6, 'DOP')
    const marzo = r.find(m => m.mkey === '2027-03')!
    expect(marzo.costs).toBe(3600)
    expect(marzo.big.map(b => b.service.name)).toEqual(['Disney'])
    expect(weakestMonth(r)?.mkey).toBe('2027-03')
  })

  it('con estrellas, cobra con el descuento', () => {
    const r = businessForecast([cliente()], [], [], HOY, 1, 'DOP', () => 10)
    expect(r[0].income).toBe(315)
  })

  it('pausados, borrados y montos variables no se prevén', () => {
    const r = businessForecast(
      [cliente({ active: false }), cliente({ deletedAt: 1 }), cliente({ variableAmount: true })],
      [], [], HOY, 1, 'DOP',
    )
    expect(r[0].income).toBe(0)
  })

  it('sin día de pago, usa la fecha del último pago como ancla', () => {
    const sinDia = { ...NETFLIX, payDay: undefined }
    const pago = { id: 'p', type: 'expense', amount: 600, date: '2026-10-07', note: '', accountId: 'a', categoryId: 'c', paidService: 's1' } as const
    const r = businessForecast([], [sinDia], [pago], HOY, 1, 'DOP')
    expect(r[0].costs).toBe(600)
  })
})

describe('weakestMonth', () => {
  it('sin uno que destaque, no hay frase', () => {
    expect(weakestMonth([
      { mkey: 'a', income: 0, costs: 0, net: 100, big: [] },
      { mkey: 'b', income: 0, costs: 0, net: 95, big: [] },
    ])).toBeNull()
  })
})
