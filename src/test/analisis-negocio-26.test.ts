import { describe, expect, it } from 'vitest'
import { categoryHistory, dailySeries, fixedVsVariable, monthPace, topConcepts, weekdayStats } from '@/data/analyticsViews'
import { bizToday, clientProfit, freeSlotsValue, punctuality } from '@/data/bizToday'
import { sortClients } from '@/data/clientList'
import type { Transaction } from '@/types'
import type { Charge, Client } from '@/data/clients'
import type { Service } from '@/data/business'

const tx = (id: string, date: string, amount: number, over: Partial<Transaction> = {}): Transaction => ({
  id, type: 'expense', amount, date, note: 'Super', categoryId: 'c1', accountId: 'a1', ...over,
} as Transaction)

describe('Análisis 2.6: cuentas', () => {
  const sept = [tx('s1', '2026-09-02', 1000), tx('s2', '2026-09-10', 2000), tx('s3', '2026-09-25', 3000)]
  const oct = [tx('o1', '2026-10-01', 1500), tx('o2', '2026-10-05', 2500), tx('o3', '2026-10-05', 500, { type: 'income' })]

  it('dailySeries pone cada gasto en su día y marca los que no han llegado', () => {
    const d = dailySeries(oct, '2026-10', '2026-10-06')
    expect(d).toHaveLength(31)
    expect(d[0].expense).toBe(1500)
    expect(d[4].expense).toBe(2500)
    expect(d[4].income).toBe(500)
    expect(d[6].future).toBe(true)
  })

  it('el ritmo compara contra el mes pasado el MISMO día y proyecta el cierre', () => {
    const p = monthPace(dailySeries(oct, '2026-10', '2026-10-10'), dailySeries(sept, '2026-09', '2026-10-10'), '2026-10-10')!
    expect(p.day).toBe(10)
    expect(p.current).toBe(4000)
    expect(p.previousAtDay).toBe(3000)
    expect(p.delta).toBe(1000)
    expect(p.projected).toBeCloseTo(4000 / 10 * 31)
  })

  it('un mes que ya pasó no proyecta', () => {
    const p = monthPace(dailySeries(sept, '2026-09', '2026-10-10'), [], '2026-10-10')!
    expect(p.projected).toBeNull()
    expect(p.current).toBe(6000)
  })

  it('días de la semana: cuenta los días sin gasto en la media', () => {
    const s = weekdayStats(dailySeries(sept, '2026-09', '2026-10-10'))!
    // 25 sept 2026 es viernes: el día con más gasto.
    expect(s.top).toBe(5)
    expect(s.avg.reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
  })

  it('fijo contra variable reconoce las repeticiones por su firma', () => {
    const plantilla = tx('r', '2026-08-01', 900, { recurring: 'monthly', note: 'Netflix', categoryId: 'c9' })
    const repe = tx('r2', '2026-10-01', 900, { note: 'Netflix', categoryId: 'c9' })
    const r = fixedVsVariable([repe, ...oct], [plantilla, repe, ...oct])
    expect(r.fixed).toBe(900)
    expect(r.variable).toBe(4000)
  })

  it('historia de una categoría: seis meses, el más viejo primero', () => {
    const h = categoryHistory([...sept, ...oct], 'c1', '2026-10', 6)
    expect(h.map(x => x.mkey)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'])
    expect(h[4].amount).toBe(6000)
    expect(h[5].amount).toBe(4000)
  })

  it('en qué se fue: agrupa conceptos iguales', () => {
    const c = topConcepts([tx('a', '2026-10-01', 100, { note: 'La Sirena' }), tx('b', '2026-10-02', 50, { note: 'la sirena ' }), tx('c', '2026-10-02', 70, { note: 'Bravo' })], 'c1')
    expect(c[0]).toMatchObject({ amount: 150, count: 2 })
  })
})

const client = (id: string, over: Partial<Client> = {}): Client => ({
  id, name: id, concept: 'Netflix', amount: 350, cycle: 'monthly', dueDay: 1, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0, ...over,
})
const charge = (id: string, clientId: string, dueDate: string, over: Partial<Charge> = {}): Charge => ({
  id, clientId, dueDate, amount: 350, paid: 0, txIds: [], paidAt: 0, ...over,
})

describe('Negocio 2.6: «Hoy»', () => {
  it('separa los que pagan hoy de los atrasados, uno por cliente', () => {
    const r = bizToday([
      charge('h1', 'ana', '2026-10-29'),
      charge('l1', 'jose', '2026-09-29'),
      charge('l2', 'jose', '2026-10-15'),
      charge('u1', 'luis', '2026-11-03'),
    ], [client('ana'), client('jose'), client('luis')], '2026-10-29')
    expect(r.dueToday.map(c => c.id)).toEqual(['h1'])
    expect(r.late).toHaveLength(1)
    expect(r.late[0]).toMatchObject({ owed: 700, maxDays: 30 })
    expect(r.upcoming.map(c => c.id)).toEqual(['u1'])
  })

  it('no cuenta los clientes borrados ni los cobros perdonados', () => {
    const r = bizToday([charge('x', 'gone', '2026-10-01'), charge('w', 'ana', '2026-10-01', { waived: true })], [client('gone', { deletedAt: 1 }), client('ana')], '2026-10-29')
    expect(r.late).toHaveLength(0)
  })

  it('plazas libres valen lo que pagan de media los que ya están', () => {
    const svc = { id: 's1', businessId: 'b', name: 'Netflix', cost: 600, costCycle: 'monthly', accounts: [{ id: 'k', name: '1', capacity: 5 }] } as unknown as Service
    const r = freeSlotsValue([svc], [client('a', { serviceId: 's1' }), client('b', { serviceId: 's1' }), client('c', { serviceId: 's1' })])
    expect(r.slots).toBe(2)
    expect(r.perMonth).toBe(700)
  })

  it('quién te deja más resta lo que cuesta su plaza', () => {
    const svc = { id: 's1', businessId: 'b', name: 'Netflix', cost: 600, costCycle: 'monthly' } as unknown as Service
    const r = clientProfit([client('a', { serviceId: 's1' }), client('b', { serviceId: 's1', amount: 500 })], [svc])
    expect(r[0]).toMatchObject({ profit: 200 })
    expect(r[1]).toMatchObject({ profit: 50 })
  })

  it('puntualidad: hacen falta dos cobros pagados', () => {
    const paid = (d: string, late: number) => charge(d, 'a', d, { paid: 350, paidAt: new Date(`${d}T00:00:00`).getTime() + late * 86_400_000 })
    expect(punctuality([paid('2026-09-01', 0)])).toBeNull()
    expect(punctuality([paid('2026-09-01', 0), paid('2026-10-01', 1)])!.kind).toBe('onTime')
    expect(punctuality([paid('2026-09-01', 8), paid('2026-10-01', 12)])!.kind).toBe('late')
  })

  it('ordenar por puntualidad pone primero a los que más se atrasan', () => {
    const lista = sortClients([client('a'), client('b'), client('c')], 'late', new Map(), new Map([['a', 1], ['b', 9]]))
    expect(lista.map(c => c.id)).toEqual(['b', 'a', 'c'])
  })
})
