import { describe, expect, it } from 'vitest'
import {
  daysUntil, howToFix, nextPaymentDate, servicePayments, slotEconomics, totalPaid,
} from './serviceEconomics'
import type { Service } from './business'
import type { Client } from './clients'
import type { Transaction } from '@/types'

const SVC: Service = {
  id: 'svc1', businessId: 'b1', name: 'Netflix',
  cost: 600, costCycle: 'monthly', capacity: 4, createdAt: 0,
}

let n = 0
function cliente(over: Partial<Client> = {}): Client {
  n += 1
  return {
    id: `c${n}`, name: 'X', concept: '', amount: 300, cycle: 'monthly',
    dueDay: 5, accountId: 'a1', categoryId: 'cat1', active: true, createdAt: 0,
    serviceId: 'svc1', ...over,
  }
}

function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'expense', amount: 600, date: '2026-10-01',
    note: 'Netflix', categoryId: 'cat_subs', accountId: 'a1', ...over,
  } as Transaction
}

describe('slotEconomics · el número que decide', () => {
  it('reparte el coste entre las plazas y el ingreso entre los clientes', () => {
    const r = slotEconomics(SVC, [cliente(), cliente(), cliente()])
    expect(r.slots).toBe(4)
    expect(r.costPerSlot).toBe(150)
    expect(r.pricePerSlot).toBe(300)
    expect(r.marginPerSlot).toBe(150)
  })

  it('SIN TOPE no se puede dividir, y no se inventa', () => {
    /*
     * Dividir el coste entre «las plazas que hay» cuando no se sabe cuántas
     * hay daría un coste por plaza inventado, y es el número con el que se
     * decide el precio.
     */
    const sinTope: Service = { ...SVC, capacity: 0 }
    const r = slotEconomics(sinTope, [cliente()])
    expect(r.slots).toBeNull()
    expect(r.costPerSlot).toBeNull()
    expect(r.marginPerSlot).toBeNull()
  })

  it('sin clientes no hay precio medio del que partir', () => {
    const r = slotEconomics(SVC, [])
    expect(r.pricePerSlot).toBeNull()
    expect(r.marginPerSlot).toBeNull()
    // Pero el coste por plaza sí se sabe: depende del plan, no de la gente.
    expect(r.costPerSlot).toBe(150)
  })

  it('SUMA LAS PLAZAS DE TODAS LAS CUENTAS', () => {
    // Es lo que hace que «Netflix Sub» y «Netflix Sub 2» puedan ser uno.
    const dos: Service = {
      ...SVC,
      accounts: [
        { id: 'a', cost: 600, capacity: 4 },
        { id: 'b', cost: 600, capacity: 5 },
      ],
    }
    expect(slotEconomics(dos, []).slots).toBe(9)
  })

  it('una cuenta sin tope hace ilimitado el conjunto', () => {
    const mixto: Service = {
      ...SVC,
      accounts: [{ id: 'a', cost: 600, capacity: 4 }, { id: 'b', cost: 600 }],
    }
    expect(slotEconomics(mixto, []).slots).toBeNull()
  })

  it('un cliente pausado no ocupa plaza ni aporta', () => {
    const r = slotEconomics(SVC, [cliente(), cliente({ active: false, amount: 9_999 })])
    expect(r.pricePerSlot).toBe(300)
  })

  it('normaliza al mes: un servicio anual no cuesta su precio entero', () => {
    const anual: Service = { ...SVC, cost: 6_000, costCycle: 'annual', capacity: 5 }
    expect(slotEconomics(anual, []).costPerSlot).toBe(100)
  })
})

describe('howToFix · qué arregla la pérdida', () => {
  it('dice cuántos clientes faltan y a qué precio subir', () => {
    // Cuesta 600, cuatro clientes a 100 dan 400: faltan 200.
    const baratos = [0, 1, 2, 3].map(() => cliente({ amount: 100 }))
    const r = howToFix(SVC, baratos)!
    expect(r.clientsNeeded).toBe(2)
    expect(r.priceNeeded).toBe(150)
  })

  it('si ya gana dinero no hay nada que arreglar', () => {
    const buenos = [0, 1, 2].map(() => cliente({ amount: 300 }))
    expect(howToFix(SVC, buenos)).toBeNull()
  })

  it('SIN CLIENTES no hay precio medio del que partir', () => {
    // Suponer uno sería inventarse el dato más importante de la decisión.
    const r = howToFix(SVC, [])!
    expect(r.clientsNeeded).toBeNull()
    expect(r.priceNeeded).toBeNull()
  })

  it('justo en el punto de equilibrio tampoco hay nada que arreglar', () => {
    const justos = [0, 1].map(() => cliente({ amount: 300 }))
    expect(howToFix(SVC, justos)).toBeNull()
  })
})

describe('nextPaymentDate · cuándo toca', () => {
  const pago = (date: string) => tx({ date, paidService: 'svc1' })

  it('un mes después del último pago', () => {
    expect(nextPaymentDate(SVC, [pago('2026-09-29')])).toBe('2026-10-29')
  })

  it('se recorta al último día del mes', () => {
    // Alguien que paga el 31 paga el 28 en febrero.
    expect(nextPaymentDate(SVC, [pago('2026-01-31')])).toBe('2026-02-28')
  })

  it('un servicio anual salta doce meses', () => {
    const anual: Service = { ...SVC, costCycle: 'annual' }
    expect(nextPaymentDate(anual, [pago('2026-03-15')])).toBe('2027-03-15')
  })

  it('SIN NINGÚN PAGO no se puede saber desde cuándo contar', () => {
    expect(nextPaymentDate(SVC, [])).toBeNull()
  })

  it('un ciclo que no se repite no tiene próximo pago', () => {
    const unico: Service = { ...SVC, costCycle: 'once' }
    expect(nextPaymentDate(unico, [pago('2026-09-29')])).toBeNull()
  })

  it('cuenta desde el ÚLTIMO pago, no desde el primero', () => {
    expect(nextPaymentDate(SVC, [pago('2026-07-10'), pago('2026-09-10')])).toBe('2026-10-10')
  })
})

describe('servicePayments y totalPaid', () => {
  it('solo los gastos marcados con este servicio', () => {
    const libro = [
      tx({ amount: 600, date: '2026-09-01', paidService: 'svc1' }),
      tx({ amount: 600, date: '2026-10-01', paidService: 'svc1' }),
      tx({ amount: 9_999, date: '2026-10-02' }),
      tx({ amount: 9_999, date: '2026-10-03', paidService: 'otro' }),
      tx({ type: 'income', amount: 500, date: '2026-10-04', paidService: 'svc1' }),
    ]
    expect(servicePayments(SVC, libro)).toHaveLength(2)
    expect(totalPaid(SVC, libro)).toBe(1_200)
  })

  it('el más reciente primero', () => {
    const libro = [
      tx({ date: '2026-08-01', paidService: 'svc1' }),
      tx({ date: '2026-10-01', paidService: 'svc1' }),
      tx({ date: '2026-09-01', paidService: 'svc1' }),
    ]
    expect(servicePayments(SVC, libro).map(t => t.date)).toEqual(['2026-10-01', '2026-09-01', '2026-08-01'])
  })

  it('sin pagos marcados, cero y lista vacía', () => {
    expect(servicePayments(SVC, [tx()])).toEqual([])
    expect(totalPaid(SVC, [tx()])).toBe(0)
  })
})

describe('daysUntil', () => {
  it('cuenta los días que faltan', () => {
    expect(daysUntil('2026-10-29', '2026-10-23')).toBe(6)
  })

  it('ya pasado da negativo', () => {
    expect(daysUntil('2026-10-20', '2026-10-23')).toBe(-3)
  })

  it('hoy es cero', () => {
    expect(daysUntil('2026-10-23', '2026-10-23')).toBe(0)
  })
})
