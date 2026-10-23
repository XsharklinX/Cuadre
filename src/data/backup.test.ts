import { afterEach, describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from './backup'
import { useNotes } from '@/store/notes'
import { sanitizeBusinessData, useBusiness } from '@/store/business'
import { useCaprices } from '@/store/caprices'
import type { FinanceState } from '@/store/finance'
import type { Note } from '@/data/notes'

const cashAccount = {
  id: 'cash',
  name: 'Efectivo',
  short: 'Cash',
  type: 'cash',
  color: '#fff',
  balance: 500,
  last4: null,
} as const

const foodCategory = {
  id: 'food',
  name: 'Restaurantes',
  type: 'expense',
  color: '#f90',
  budget: 9000,
  icon: 'food',
} as const

const goal = {
  id: 'goal',
  name: 'Fondo',
  target: 10000,
  saved: 1000,
  color: '#22c55e',
  icon: 'wallet',
} as const

const shoppingNote: Note = {
  id: 'note1', title: 'Compra del súper', type: 'shopping', color: '#35d0a2', icon: 'cart',
  categoryId: 'food', accountId: 'cash', createdAt: 1, updatedAt: 1,
  items: [{ id: 'it1', text: 'Arroz', done: true, price: 380, qty: 2 }],
}

describe('backup JSON', () => {
  afterEach(() => { useNotes.setState({ notes: [] }) })

  it('serializa y restaura los datos financieros', () => {
    const state = { accounts: [], categories: [], goals: [], transactions: [], currency: 'DOP' } as unknown as FinanceState
    expect(parseBackup(JSON.stringify(createBackup(state)))).toEqual({
      accounts: [],
      categories: [],
      goals: [],
      goalContributions: [],
      transactions: [],
      currency: 'DOP',
    })
  })

  it('migra backups v1 antiguos sin aportes a metas', () => {
    const legacyBackup = {
      version: 1,
      exportedAt: '2026-06-02T00:00:00.000Z',
      data: {
        accounts: [cashAccount],
        categories: [foodCategory],
        goals: [goal],
        transactions: [],
        currency: 'DOP',
      },
    }

    expect(parseBackup(JSON.stringify(legacyBackup)).goalContributions).toEqual([])
  })

  it('rechaza archivos ajenos a $harky', () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow('backup')
  })

  it('rechaza referencias inexistentes en transacciones', () => {
    const state = {
      accounts: [],
      categories: [],
      goals: [],
      transactions: [{ id: 'tx', type: 'expense', amount: 25, accountId: 'missing', categoryId: 'food', date: '2026-05-31', note: 'Compra' }],
      currency: 'DOP',
    } as unknown as FinanceState
    expect(() => parseBackup(JSON.stringify(createBackup(state)))).toThrow('referencias inexistentes')
  })

  it('rechaza aportes a metas con referencias inexistentes', () => {
    const backup = {
      version: 1,
      exportedAt: '2026-06-02T00:00:00.000Z',
      data: {
        accounts: [cashAccount],
        categories: [foodCategory],
        goals: [goal],
        goalContributions: [{
          id: 'contribution',
          goalId: 'missing-goal',
          amount: 250,
          fromAccountId: 'cash',
          date: '2026-06-02',
        }],
        transactions: [],
        currency: 'DOP',
      },
    }

    expect(() => parseBackup(JSON.stringify(backup))).toThrow('aportes a metas')
  })

  it('rechaza identificadores duplicados', () => {
    const state = { accounts: [cashAccount, cashAccount], categories: [], goals: [], transactions: [], currency: 'DOP' } as unknown as FinanceState
    expect(() => parseBackup(JSON.stringify(createBackup(state)))).toThrow('cuentas duplicadas')
  })

  it('acepta fixtures legacy anonimizados de versiones tempranas', () => {
    const fixtures = [
      {
        version: 1,
        exportedAt: '2026-01-15T10:00:00.000Z',
        data: {
          accounts: [cashAccount],
          categories: [foodCategory],
          goals: [],
          transactions: [{
            id: 'tx_v03_1',
            type: 'expense',
            amount: 450,
            accountId: 'cash',
            categoryId: 'food',
            date: '2026-01-14',
            note: 'POS RESTAURANTE ANONIMO',
          }],
          currency: 'DOP',
        },
      },
      {
        version: 1,
        exportedAt: '2026-03-20T10:00:00.000Z',
        data: {
          accounts: [cashAccount],
          categories: [foodCategory],
          goals: [goal],
          goalContributions: [{
            id: 'contrib_v05_1',
            goalId: 'goal',
            amount: 100,
            fromAccountId: 'cash',
            date: '2026-03-19',
            note: 'Aporte anonimo',
          }],
          transactions: [],
          currency: 'DOP',
        },
      },
      {
        version: 1,
        exportedAt: '2026-05-12T10:00:00.000Z',
        data: {
          accounts: [cashAccount],
          categories: [foodCategory],
          goals: [goal],
          goalContributions: [],
          transactions: [{
            id: 'tx_v07_1',
            type: 'expense',
            amount: 1200,
            accountId: 'cash',
            categoryId: 'food',
            date: '2026-05-10',
            note: 'BANCO POPULAR POS ANONIMO REF 0000',
            tags: ['importado'],
          }],
          currency: 'DOP',
        },
      },
    ]

    expect(fixtures.map(fixture => parseBackup(JSON.stringify(fixture)).transactions.length)).toEqual([1, 0, 1])
  })

  it('rechaza backups JSON corruptos sin cambiar datos', () => {
    expect(() => parseBackup('{"version":1,"data":')).toThrow('JSON')
  })

  it('round-trip: conserva todos los campos v2 sin pérdida (moneda de cuenta, splits, toAmount, serviceId, incremento)', () => {
    const usdAccount = { ...cashAccount, id: 'usd', currency: 'USD' as const }
    const savingsAccount = { id: 'sav', name: 'Ahorros', short: 'Ahorros', type: 'savings', color: '#0f0', balance: 300, last4: null, currency: 'DOP' as const }
    const goalWithAuto = {
      ...goal,
      autoContribute: { amount: 50, frequency: 'weekly' as const, fromAccountId: 'cash', nextDate: '2026-07-20', increment: 5 },
    }
    const splitTx = {
      id: 'tx_split', type: 'expense' as const, amount: 100, accountId: 'cash', categoryId: 'food',
      date: '2026-07-01', note: 'Super', splits: [{ categoryId: 'food', amount: 60 }, { categoryId: 'food', amount: 40 }],
    }
    const transferTx = {
      id: 'tx_transfer', type: 'transfer' as const, amount: 100, fromAccount: 'cash', toAccount: 'usd',
      date: '2026-07-02', note: 'Transferencia', toAmount: 1.7,
    }
    const subscriptionTx = {
      id: 'tx_sub', type: 'expense' as const, amount: 15, accountId: 'cash', categoryId: 'food',
      date: '2026-07-03', note: 'Netflix', serviceId: 'netflix',
    }

    const state = {
      accounts: [cashAccount, usdAccount, savingsAccount],
      categories: [foodCategory],
      goals: [goalWithAuto],
      goalContributions: [],
      transactions: [splitTx, transferTx, subscriptionTx],
      currency: 'DOP',
    } as unknown as FinanceState

    const restored = parseBackup(JSON.stringify(createBackup(state)))
    expect(restored).toEqual({
      accounts: state.accounts,
      categories: state.categories,
      goals: state.goals,
      goalContributions: [],
      transactions: state.transactions,
      currency: 'DOP',
    })
  })

  it('rechaza splits cuya suma no coincide con el monto de la transacción', () => {
    const state = {
      accounts: [cashAccount],
      categories: [foodCategory],
      goals: [],
      transactions: [{
        id: 'tx', type: 'expense', amount: 100, accountId: 'cash', categoryId: 'food',
        date: '2026-07-01', note: 'Super', splits: [{ categoryId: 'food', amount: 60 }, { categoryId: 'food', amount: 30 }],
      }],
      currency: 'DOP',
    } as unknown as FinanceState
    expect(() => parseBackup(JSON.stringify(createBackup(state)))).toThrow('divisiones')
  })

  it('las listas viajan en el backup cuando hay alguna', () => {
    useNotes.setState({ notes: [shoppingNote] })
    const state = { accounts: [cashAccount], categories: [foodCategory], goals: [], transactions: [], currency: 'DOP' } as unknown as FinanceState
    const backup = createBackup(state)
    // La version subio a 4 al incluir clientes, negocios y cobros. Lo que este
    // test vigila es otra cosa y sigue igual: que las listas viajen y se
    // puedan volver a leer.
    expect(backup.version).toBe(4)
    expect(backup.data.notes).toEqual([shoppingNote])
    expect(parseBackup(JSON.stringify(backup)).notes).toEqual([shoppingNote])
  })

  it('sin listas, el backup omite el campo notes (compatibilidad con v1/v2 sin cambios)', () => {
    useNotes.setState({ notes: [] })
    const state = { accounts: [], categories: [], goals: [], transactions: [], currency: 'DOP' } as unknown as FinanceState
    const backup = createBackup(state)
    expect(backup.data).not.toHaveProperty('notes')
  })

  it('un backup v2 sin notes se restaura igual, notes queda undefined', () => {
    const legacyV2 = {
      version: 2,
      data: { accounts: [], categories: [], goals: [], goalContributions: [], transactions: [], currency: 'DOP' },
    }
    const restored = parseBackup(JSON.stringify(legacyV2))
    expect(restored.notes).toBeUndefined()
  })

  it('rechaza una lista con ítem malformado (precio negativo)', () => {
    const badNote = { ...shoppingNote, items: [{ id: 'it1', text: 'x', done: false, price: -5 }] }
    const backup = { version: 3, data: { accounts: [], categories: [], goals: [], goalContributions: [], transactions: [], currency: 'DOP', notes: [badNote] } }
    expect(() => parseBackup(JSON.stringify(backup))).toThrow()
  })
})

/**
 * LO QUE FALTABA EN LA COPIA, Y POR QUE ERA PEOR QUE NO GUARDARLO.
 *
 * Clientes, negocios, servicios, cobros y caprichos viven en almacenes propios
 * y la copia no los incluia. Eso no era solo «no se guardan»: al restaurar, el
 * libro se reemplazaba y esos almacenes se quedaban, asi que sus cobros
 * apuntaban a movimientos borrados y las limpiezas del arranque los daban por
 * basura. Restaurar DESTRUIA datos en silencio.
 */
describe('la copia lleva los datos de negocio', () => {
  afterEach(() => {
    useBusiness.setState({ clients: [], businesses: [], services: [], charges: [] })
    useCaprices.setState({ items: [] })
  })

  const estado = () => ({
    accounts: [cashAccount], categories: [foodCategory], goals: [],
    transactions: [], currency: 'DOP',
  } as unknown as FinanceState)

  it('incluye clientes, negocios, servicios, cobros y caprichos', () => {
    const cli = useBusiness.getState().addClient({
      name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
      accountId: cashAccount.id, categoryId: foodCategory.id, active: true,
    })
    const biz = useBusiness.getState().addBusiness({
      name: 'Streaming', color: '#35d0a2', icon: 'play',
      incomeCategoryIds: [], expenseCategoryIds: [],
    })
    useBusiness.getState().addService({
      businessId: biz, name: 'Netflix', cost: 600, costCycle: 'monthly',
    })
    useBusiness.getState().addCharge(cli, '2026-10-05', 250)
    useCaprices.getState().open('tx_cap', 3_200, 'Audifonos')

    const backup = createBackup(estado())
    expect(backup.data.clients).toHaveLength(1)
    expect(backup.data.businesses).toHaveLength(1)
    expect(backup.data.services).toHaveLength(1)
    expect(backup.data.charges).toHaveLength(1)
    expect(backup.data.caprices).toHaveLength(1)
  })

  it('y se pueden volver a leer', () => {
    useBusiness.getState().addClient({
      name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
      accountId: cashAccount.id, categoryId: foodCategory.id, active: true,
    })
    const leido = parseBackup(JSON.stringify(createBackup(estado())))
    // `clients` llega sin tipar a proposito: a ese nivel no esta validado (ver
    // el comentario en `FinanceBackup`). Para comprobar el contenido se pasa
    // por el saneador de verdad, que es lo que hace la app al restaurar.
    expect(sanitizeBusinessData({ clients: leido.clients }).clients[0].name).toBe('Juan')
  })

  it('sin datos de negocio, la copia queda IDENTICA a la de antes', () => {
    // Quien no usa la funcion no debe encontrarse claves vacias que no dicen
    // nada, ni un archivo distinto al que tenia.
    const backup = createBackup(estado())
    expect(backup.data.clients).toBeUndefined()
    expect(backup.data.businesses).toBeUndefined()
    expect(backup.data.charges).toBeUndefined()
    expect(backup.data.caprices).toBeUndefined()
  })

  it('una copia v3 (sin negocio) sigue siendo valida', () => {
    // Es lo que tiene en el teléfono quien no haya actualizado todavia.
    const vieja = {
      version: 3,
      exportedAt: new Date().toISOString(),
      data: { accounts: [cashAccount], categories: [foodCategory], goals: [], goalContributions: [], transactions: [], currency: 'DOP' },
    }
    expect(() => parseBackup(JSON.stringify(vieja))).not.toThrow()
  })

  it('un cliente con un campo raro NO invalida la copia entera', () => {
    // El libro se valida con rigor porque un movimiento malo descuadra un
    // saldo. Un cliente raro se corrige en dos toques, y tirar la copia
    // completa por eso le costaria al usuario sus movimientos.
    const conBasura = {
      version: 4,
      exportedAt: new Date().toISOString(),
      data: {
        accounts: [cashAccount], categories: [foodCategory], goals: [], goalContributions: [],
        transactions: [], currency: 'DOP',
        clients: [{ id: 'c1', name: 'Juan', cycle: 'inventado', amount: 'mucho' }],
      },
    }
    expect(() => parseBackup(JSON.stringify(conBasura))).not.toThrow()
  })
})
