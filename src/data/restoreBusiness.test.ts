import { describe, expect, it } from 'vitest'
import { describeBackup, hasChanges, reconcileBusinessData, type BusinessData } from './restoreBusiness'
import type { Caprice } from './caprices'
import type { Charge, Client } from './clients'
import type { Business, Service } from './business'
import type { Transaction } from '@/types'

function tx(id: string): Transaction {
  return {
    id, type: 'expense', amount: 100, date: '2026-10-01',
    note: 'x', categoryId: 'c1', accountId: 'a1',
  } as Transaction
}

function cliente(id = 'cli1'): Client {
  return {
    id, name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
    accountId: 'a1', categoryId: 'cat1', active: true, createdAt: 0,
  }
}

function cobro(over: Partial<Charge> = {}): Charge {
  return {
    id: 'chg1', clientId: 'cli1', dueDate: '2026-10-05', amount: 250,
    paid: 0, txIds: [], paidAt: 0, ...over,
  }
}

function bote(over: Partial<Caprice> = {}): Caprice {
  return { id: 'cap1', txId: 'tx_gasto', amount: 3_200, note: 'X', createdAt: 0, payments: [], ...over }
}

const NEGOCIO: Business = {
  id: 'biz1', name: 'Streaming', color: '#35d0a2', icon: 'play',
  incomeCategoryIds: [], expenseCategoryIds: [], createdAt: 0,
}

describe('reconcileBusinessData · cobros', () => {
  it('un cobro cuyo movimiento sigue vivo se queda tal cual', () => {
    const pagado = cobro({ paid: 250, txIds: ['tx_pago'], paidAt: 123 })
    const r = reconcileBusinessData(
      { clients: [cliente()], charges: [pagado] },
      [tx('tx_pago')],
    )
    expect(r.data.charges[0]).toBe(pagado)
    expect(hasChanges(r.report)).toBe(false)
  })

  it('UN COBRO CUYO MOVIMIENTO NO ESTÁ VUELVE A PENDIENTE, no se borra', () => {
    // El cobro sigue siendo cierto: ese cliente te debía ese dinero ese día.
    // Lo que se perdió es la prueba de que llegó.
    const r = reconcileBusinessData(
      { clients: [cliente()], charges: [cobro({ paid: 250, txIds: ['tx_borrado'], paidAt: 123 })] },
      [tx('tx_otro')],
    )
    expect(r.data.charges).toHaveLength(1)
    expect(r.data.charges[0].paid).toBe(0)
    expect(r.data.charges[0].txIds).toEqual([])
    expect(r.data.charges[0].paidAt).toBe(0)
    expect(r.report.chargesUnlinked).toBe(1)
  })

  it('un cobro con dos pagos y uno perdido vuelve entero a pendiente', () => {
    // El cobro guarda la suma, no el desglose: no hay forma de saber cuánto
    // aportaba el perdido, y afirmar un parcial inventado sería peor.
    const r = reconcileBusinessData(
      { clients: [cliente()], charges: [cobro({ paid: 250, txIds: ['tx_a', 'tx_b'], paidAt: 9 })] },
      [tx('tx_a')],
    )
    expect(r.data.charges[0].paid).toBe(0)
    expect(r.data.charges[0].txIds).toEqual(['tx_a'])
  })

  it('un cobro sin su cliente se descarta: no hay dónde enseñarlo', () => {
    const r = reconcileBusinessData({ clients: [], charges: [cobro()] }, [])
    expect(r.data.charges).toEqual([])
    expect(r.report.chargesOrphaned).toBe(1)
  })
})

describe('reconcileBusinessData · caprichos', () => {
  it('UN CAPRICHO SIN SU GASTO SE DESCARTA', () => {
    // Al contrario que un cobro: un capricho ES la referencia a un gasto. Sin
    // el gasto no queda nada que recuperar ni nada que entender.
    const r = reconcileBusinessData({ caprices: [bote()] }, [tx('tx_otro')])
    expect(r.data.caprices).toEqual([])
    expect(r.report.capricesDropped).toBe(1)
  })

  it('un capricho con su gasto vivo se conserva', () => {
    const b = bote()
    const r = reconcileBusinessData({ caprices: [b] }, [tx('tx_gasto')])
    expect(r.data.caprices[0]).toBe(b)
  })

  it('un aporte cuyo movimiento no está se cae, y el bote sobrevive', () => {
    const r = reconcileBusinessData(
      {
        caprices: [bote({
          payments: [
            { txId: 'tx_vivo', amount: 1_000, at: 1 },
            { txId: 'tx_muerto', amount: 500, at: 2 },
          ],
        })],
      },
      [tx('tx_gasto'), tx('tx_vivo')],
    )
    expect(r.data.caprices).toHaveLength(1)
    expect(r.data.caprices[0].payments.map(p => p.txId)).toEqual(['tx_vivo'])
    expect(r.report.capricePaymentsDropped).toBe(1)
  })
})

describe('reconcileBusinessData · servicios y negocios', () => {
  it('un servicio sin su negocio se descarta', () => {
    const svc: Service = {
      id: 's1', businessId: 'fantasma', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
    }
    const r = reconcileBusinessData({ businesses: [], services: [svc] }, [])
    expect(r.data.services).toEqual([])
    expect(r.report.servicesOrphaned).toBe(1)
  })

  it('con su negocio presente se conserva', () => {
    const svc: Service = {
      id: 's1', businessId: 'biz1', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
    }
    const r = reconcileBusinessData({ businesses: [NEGOCIO], services: [svc] }, [])
    expect(r.data.services).toHaveLength(1)
  })
})

describe('reconcileBusinessData · una copia vieja', () => {
  it('sin datos de negocio devuelve todo vacío y nada que informar', () => {
    // Una copia v1-v3 no trae nada. Lo correcto es vaciar, no conservar lo
    // actual: conservarlo dejaría clientes de un libro que ya no existe.
    const r = reconcileBusinessData({}, [tx('t1')])
    expect(r.data).toEqual({ clients: [], businesses: [], services: [], charges: [], caprices: [] })
    expect(hasChanges(r.report)).toBe(false)
  })

  it('con el libro vacío, todo lo que dependía de él se reconcilia', () => {
    const r = reconcileBusinessData(
      {
        clients: [cliente()],
        charges: [cobro({ paid: 250, txIds: ['tx_a'], paidAt: 1 })],
        caprices: [bote()],
      },
      [],
    )
    expect(r.data.clients).toHaveLength(1)
    expect(r.data.charges[0].paid).toBe(0)
    expect(r.data.caprices).toEqual([])
    expect(hasChanges(r.report)).toBe(true)
  })
})

describe('describeBackup', () => {
  it('cuenta lo que trae la copia, para poder decirlo ANTES de restaurar', () => {
    const r = describeBackup({
      transactions: [tx('a'), tx('b')],
      accounts: [{}, {}, {}],
      clients: [cliente()],
      businesses: [NEGOCIO],
      charges: [cobro()],
      caprices: [bote()],
    } as never, 0)
    expect(r).toMatchObject({
      transactions: 2, accounts: 3, clients: 1, businesses: 1, charges: 1, caprices: 1,
    })
  })

  it('AVISA cuando la copia no trae negocio y el usuario sí tiene', () => {
    // Este es el aviso que faltaba: restaurar una copia vieja te deja sin
    // clientes y hasta ahora no lo decía nadie.
    const r = describeBackup({ transactions: [tx('a')] } as never, 14)
    expect(r.missingBusiness).toBe(true)
  })

  it('no avisa si el usuario tampoco tiene clientes', () => {
    const r = describeBackup({ transactions: [tx('a')] } as never, 0)
    expect(r.missingBusiness).toBe(false)
  })

  it('no avisa si la copia SÍ trae clientes', () => {
    const r = describeBackup({ transactions: [], clients: [cliente()] } as never, 14)
    expect(r.missingBusiness).toBe(false)
  })

  it('una copia sin ninguna clave no revienta', () => {
    expect(() => describeBackup({} as never, 0)).not.toThrow()
    expect(describeBackup({} as never, 0).transactions).toBe(0)
  })
})

describe('hasChanges', () => {
  it('distingue un informe limpio de uno con cambios', () => {
    const limpio = reconcileBusinessData({}, []).report
    expect(hasChanges(limpio)).toBe(false)
    expect(hasChanges({ ...limpio, chargesUnlinked: 1 })).toBe(true)
  })
})

describe('la forma de los datos restaurados', () => {
  it('siempre devuelve las cinco listas, nunca undefined', () => {
    // Quien llama hace `setState` con esto; un `undefined` dejaría el almacén
    // sin esa lista y la pantalla reventaría al iterarla.
    const r = reconcileBusinessData({}, [])
    const claves: Array<keyof BusinessData> = ['clients', 'businesses', 'services', 'charges', 'caprices']
    for (const clave of claves) expect(Array.isArray(r.data[clave])).toBe(true)
  })
})
