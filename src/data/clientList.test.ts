import { describe, expect, it } from 'vitest'
import {
  filterCounts, matchesFilter, matchesQuery, owedByClient, reminderMessage, sortClients, visibleClients,
} from './clientList'
import { clientTimeline } from './clientTimeline'
import type { Charge, Client } from './clients'

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: `c${Math.random()}`, name: 'María Rodríguez', concept: 'Netflix', amount: 350, cycle: 'monthly',
    dueDay: 1, accountId: 'a', categoryId: 'c', active: true, createdAt: 0, ...over,
  }
}
function cobro(over: Partial<Charge> = {}): Charge {
  return { id: `ch${Math.random()}`, clientId: 'm', dueDate: '2026-10-01', amount: 350, paid: 0, txIds: [], paidAt: 0, ...over }
}

describe('lista de clientes', () => {
  const maria = cliente({ id: 'm', phone: '809-555-1234', stars: [{ at: 1 }] })
  const juan = cliente({ id: 'j', name: 'Juan Pérez', amount: 500, serviceId: 's2' })
  const ana = cliente({ id: 'a', name: 'Ana López', active: false })
  const owed = owedByClient([
    cobro(), cobro({ clientId: 'j', paid: 350 }), cobro({ clientId: 'a', waived: true }),
    // Uno que todavía no vence no es deuda.
    cobro({ clientId: 'j', dueDate: '2026-11-01' }),
  ], '2026-10-24')

  it('lo que debe cada uno, sin lo pagado ni lo perdonado', () => {
    expect([...owed]).toEqual([['m', 350]])
  })

  it('busca por nombre sin acentos, por concepto y por teléfono', () => {
    expect(matchesQuery(maria, 'rodriguez')).toBe(true)
    expect(matchesQuery(maria, 'netf')).toBe(true)
    expect(matchesQuery(maria, '5551')).toBe(true)
    expect(matchesQuery(juan, 'maría')).toBe(false)
  })

  it('filtra y cuenta', () => {
    expect(matchesFilter(maria, 'owe', owed)).toBe(true)
    expect(matchesFilter(ana, 'paused', owed)).toBe(true)
    expect(matchesFilter(maria, 'stars', owed)).toBe(true)
    expect(matchesFilter(juan, 'svc:s2', owed)).toBe(true)
    expect(filterCounts([maria, juan, ana], owed)).toEqual({ all: 3, owe: 1, paused: 1, stars: 1 })
  })

  it('ordena por lo que deben y por lo que pagan', () => {
    expect(sortClients([juan, maria], 'owe', owed).map(c => c.id)).toEqual(['m', 'j'])
    expect(sortClients([maria, juan], 'pays', owed).map(c => c.id)).toEqual(['j', 'm'])
    expect(sortClients([maria, ana], 'az', owed).map(c => c.id)).toEqual(['a', 'm'])
  })

  it('los borrados con su historial no se enseñan', () => {
    expect(visibleClients([maria, cliente({ deletedAt: 1 })])).toEqual([maria])
  })

  it('el recordatorio usa el nombre de pila', () => {
    expect(reminderMessage('Hola {nombre}, te recuerdo los {monto} de {servicio}', {
      name: 'María Rodríguez', amount: 'RD$350', service: 'Netflix', months: 1,
    })).toBe('Hola María, te recuerdo los RD$350 de Netflix')
  })
})

describe('clientTimeline · su historia', () => {
  const t = (d: string) => Date.parse(`${d}T12:00:00`)

  it('pagos, atrasos, cambios de precio y estrellas, del más nuevo al más viejo', () => {
    const c = cliente({
      id: 'm', amount: 350, createdAt: t('2026-05-01'),
      priceLog: [{ at: t('2026-08-01'), amount: 300 }],
      stars: [{ at: t('2026-09-20'), referredId: 'j' }],
    })
    const r = clientTimeline(c, [
      cobro({ dueDate: '2026-10-01', paid: 350, paidAt: t('2026-10-01') }),
      cobro({ dueDate: '2026-09-01', paid: 350, paidAt: t('2026-09-05') }),
    ])
    expect(r.map(e => e.kind)).toEqual(['paid', 'star', 'late-paid', 'price', 'joined'])
    expect(r.find(e => e.kind === 'late-paid')?.days).toBe(4)
    expect(r.find(e => e.kind === 'price')).toMatchObject({ from: 300, amount: 350 })
  })

  it('quien llegó recomendado lo dice', () => {
    const r = clientTimeline(cliente({ createdAt: t('2026-05-01'), referredBy: 'x' }), [])
    expect(r[0]).toMatchObject({ kind: 'referred', otherId: 'x' })
  })

  it('un pago a medias es parcial', () => {
    const r = clientTimeline(cliente({ id: 'm' }), [cobro({ paid: 100, paidAt: t('2026-10-01') })])
    expect(r[0].kind).toBe('partial')
  })
})
