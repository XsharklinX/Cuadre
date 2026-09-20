import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFinance } from './finance'
import { useDebt } from './debt'
import { useNotes } from './notes'
import type { Account, Goal, GoalContribution } from '@/types'

// La red de seguridad del «Deshacer» depende de que restaurar reponga EXACTO lo
// borrado. Estos tests fijan ese contrato: un borrado seguido de su restore
// deja el store como estaba, sin duplicar si se toca «Deshacer» dos veces.

function installMemoryStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  })
}

const acc: Account = { id: 'acc_x', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 1000, last4: null }
const goal: Goal = { id: 'goal_x', name: 'Viaje', target: 5000, saved: 300, openingSaved: 0, color: '#fff', icon: 'target' }
const contrib: GoalContribution = { id: 'contrib_x', goalId: 'goal_x', amount: 300, fromAccountId: 'acc_x', date: '2026-07-01' }

describe('restore de cuentas y metas (Deshacer)', () => {
  beforeEach(() => {
    installMemoryStorage()
    useFinance.setState({ accounts: [acc], transactions: [], goals: [goal], goalContributions: [contrib] })
  })

  it('restoreAccount repone una cuenta borrada con su mismo id', () => {
    // Una cuenta solo se borra si no tiene movimientos ni aportes (ver
    // deleteAccount), así que se aísla sin el aporte del beforeEach.
    useFinance.setState({ accounts: [acc], transactions: [], goals: [], goalContributions: [] })
    const store = useFinance.getState()
    store.deleteAccount('acc_x')
    expect(useFinance.getState().accounts).toHaveLength(0)

    store.restoreAccount(acc)
    expect(useFinance.getState().accounts).toEqual([acc])
  })

  it('restoreAccount no duplica si se invoca dos veces', () => {
    useFinance.setState({ accounts: [acc], transactions: [], goals: [], goalContributions: [] })
    const store = useFinance.getState()
    store.deleteAccount('acc_x')
    store.restoreAccount(acc)
    store.restoreAccount(acc)
    expect(useFinance.getState().accounts).toHaveLength(1)
  })

  it('restoreGoal repone la meta junto con sus aportes', () => {
    const store = useFinance.getState()
    store.deleteGoal('goal_x')
    expect(useFinance.getState().goals).toHaveLength(0)
    expect(useFinance.getState().goalContributions).toHaveLength(0)

    store.restoreGoal(goal, [contrib])
    const s = useFinance.getState()
    expect(s.goals).toEqual([goal])
    expect(s.goalContributions).toEqual([contrib])
  })
})

describe('restore de deudas y listas (Deshacer)', () => {
  beforeEach(() => installMemoryStorage())

  it('restoreDebt repone una deuda borrada', () => {
    const debt = { id: 'debt_x', name: 'Préstamo', balance: 2000, rate: 12, minPayment: 100, color: '#fff' }
    useDebt.setState({ debts: [debt], extraPayment: 0 })
    useDebt.getState().deleteDebt('debt_x')
    expect(useDebt.getState().debts).toHaveLength(0)

    useDebt.getState().restoreDebt(debt)
    expect(useDebt.getState().debts).toEqual([debt])
    // No duplica en un segundo «Deshacer».
    useDebt.getState().restoreDebt(debt)
    expect(useDebt.getState().debts).toHaveLength(1)
  })

  it('restoreNote repone una lista borrada al principio', () => {
    const note = {
      id: 'note_x', title: 'Súper', type: 'checklist' as const, items: [],
      color: '#fff', icon: 'list' as const, createdAt: 1, updatedAt: 1,
    }
    useNotes.setState({ notes: [note] })
    useNotes.getState().deleteNote('note_x')
    expect(useNotes.getState().notes).toHaveLength(0)

    useNotes.getState().restoreNote(note)
    expect(useNotes.getState().notes).toEqual([note])
  })
})
