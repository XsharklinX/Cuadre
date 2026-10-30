import { describe, expect, it } from 'vitest'
import {
  duePayments, isLongCycle, matchingDueKey, paidManually, payKey, payWindowDays,
  serviceDueDates, trimHandled, upcomingPayments,
} from './autopay'
import { serviceAccounts, type Service } from './business'
import type { Transaction } from '@/types'

const HOY = '2026-10-24'

function servicio(over: Partial<Service> = {}): Service {
  return {
    id: 's1', businessId: 'b1', name: 'Netflix', cost: 14.99, costCycle: 'monthly',
    createdAt: Date.parse('2026-01-01T00:00:00'), payMode: 'auto', payDay: 12, payFrom: '2026-10-01', ...over,
  }
}
const unica = (s: Service) => serviceAccounts(s)[0]

describe('serviceDueDates · el mismo calendario que los cobros', () => {
  it('mensual: el día que toca cada mes', () => {
    expect(serviceDueDates(servicio(), unica(servicio()), '2026-09-01', '2026-11-30'))
      .toEqual(['2026-09-12', '2026-10-12', '2026-11-12'])
  })

  it('el 31 se recorta al fin de mes, como en los cobros', () => {
    const s = servicio({ payDay: 31 })
    expect(serviceDueDates(s, unica(s), '2026-02-01', '2026-02-28')).toEqual(['2026-02-28'])
  })

  it('anual: una vez al año, en el mes del ancla', () => {
    const s = servicio({ costCycle: 'annual', payDay: undefined, payAnchor: '2026-03-15' })
    expect(serviceDueDates(s, unica(s), '2026-01-01', '2027-12-31')).toEqual(['2026-03-15', '2027-03-15'])
  })

  it('cada cuenta puede pagarse un día distinto', () => {
    const s = servicio({ accounts: [{ id: 'a', cost: 14.99 }, { id: 'b', cost: 14.99, payDay: 20 }] })
    const [a, b] = serviceAccounts(s)
    expect(serviceDueDates(s, a, '2026-10-01', '2026-10-31')).toEqual(['2026-10-12'])
    expect(serviceDueDates(s, b, '2026-10-01', '2026-10-31')).toEqual(['2026-10-20'])
  })

  it('sin día ni ancla no hay fechas: no se automatiza a ciegas', () => {
    const s = servicio({ payDay: undefined })
    expect(serviceDueDates(s, unica(s), '2026-01-01', '2026-12-31')).toEqual([])
  })
})

describe('duePayments · lo que toca y nadie ha resuelto', () => {
  it('el de este mes, ya pasado', () => {
    const r = duePayments([servicio()], HOY)
    expect(r.map(p => p.date)).toEqual(['2026-10-12'])
  })

  it('NUNCA ANTES DE payFrom: configurarlo hoy no rellena el pasado', () => {
    expect(duePayments([servicio({ payFrom: HOY })], HOY)).toEqual([])
  })

  it('los resueltos no vuelven', () => {
    const s = servicio({ payHandled: [payKey('s1:single', '2026-10-12')] })
    expect(duePayments([s], HOY)).toEqual([])
  })

  it('«mañana» lo aparta hasta mañana', () => {
    const s = servicio({ paySnooze: { [payKey('s1:single', '2026-10-12')]: '2026-10-25' } })
    expect(duePayments([s], HOY)).toEqual([])
    expect(duePayments([s], '2026-10-25').length).toBe(1)
  })

  it('a mano no se automatiza', () => {
    expect(duePayments([servicio({ payMode: 'manual' })], HOY)).toEqual([])
  })

  it('un servicio archivado no se paga', () => {
    expect(duePayments([servicio({ archivedAt: 1 })], HOY)).toEqual([])
  })

  it('con dos cuentas son dos pagos', () => {
    const s = servicio({ accounts: [{ id: 'a', cost: 14.99 }, { id: 'b', cost: 14.99 }] })
    expect(duePayments([s], HOY).map(p => p.key)).toEqual(['a|2026-10-12', 'b|2026-10-12'])
  })
})

describe('paidManually · si ya lo pagaste, no se repite', () => {
  const gasto = (over: Partial<Transaction>): Transaction =>
    ({ id: 'g', type: 'expense', amount: 880, date: '2026-10-10', note: 'Netflix', accountId: 'x', categoryId: 'c', paidService: 's1', ...over }) as Transaction

  it('un pago a mano cerca de la fecha cuenta', () => {
    const s = servicio()
    expect(paidManually(s, unica(s), '2026-10-12', [gasto({})])).toBe(true)
  })

  it('uno de otro mes no', () => {
    const s = servicio()
    expect(paidManually(s, unica(s), '2026-10-12', [gasto({ date: '2026-09-12' })])).toBe(false)
  })

  it('con dos cuentas, solo el de ESA cuenta', () => {
    const s = servicio({ accounts: [{ id: 'a', cost: 1 }, { id: 'b', cost: 1 }] })
    const [a, b] = serviceAccounts(s)
    const pagoA = gasto({ paidAccount: 'a' })
    expect(paidManually(s, a, '2026-10-12', [pagoA])).toBe(true)
    expect(paidManually(s, b, '2026-10-12', [pagoA])).toBe(false)
  })

  it('lo que registró la app sola no cuenta como pagado a mano', () => {
    const s = servicio()
    expect(paidManually(s, unica(s), '2026-10-12', [gasto({ autoPaid: true })])).toBe(false)
  })
})

describe('matchingDueKey · pagar el 9 resuelve el del 12', () => {
  it('encuentra el pago más cercano', () => {
    const s = servicio()
    expect(matchingDueKey(s, unica(s), '2026-10-09')).toBe('s1:single|2026-10-12')
  })
  it('sin programar, nada que resolver', () => {
    const s = servicio({ payDay: undefined })
    expect(matchingDueKey(s, unica(s), '2026-10-09')).toBeNull()
  })
})

describe('upcomingPayments', () => {
  it('los de los próximos días, sin hoy', () => {
    const r = upcomingPayments([servicio({ payDay: 25 }), servicio({ id: 's2', payDay: 24 })], HOY, 3)
    expect(r.map(p => p.date)).toEqual(['2026-10-25'])
  })
})

describe('utilidades', () => {
  it('ventana: la mitad del ciclo, con tope', () => {
    expect(payWindowDays(servicio())).toBe(15)
    expect(payWindowDays(servicio({ costCycle: 'weekly' }))).toBe(3)
  })
  it('ciclo largo', () => {
    expect(isLongCycle(servicio({ costCycle: 'annual' }))).toBe(true)
    expect(isLongCycle(servicio())).toBe(false)
  })
  it('recorta claves viejas', () => {
    expect(trimHandled(['a|2024-01-01', 'a|2026-10-12'], HOY)).toEqual(['a|2026-10-12'])
  })
})
