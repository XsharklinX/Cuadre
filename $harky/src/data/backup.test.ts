import { afterEach, describe, expect, it } from 'vitest'
import { createBackup, parseBackup } from './backup'
import { useNotes } from '@/store/notes'
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

  it('las listas viajan en el backup (v3) cuando hay alguna', () => {
    useNotes.setState({ notes: [shoppingNote] })
    const state = { accounts: [cashAccount], categories: [foodCategory], goals: [], transactions: [], currency: 'DOP' } as unknown as FinanceState
    const backup = createBackup(state)
    expect(backup.version).toBe(3)
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
