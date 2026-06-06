import { describe, it, expect, beforeEach } from 'vitest'
import { useFinance } from '@/store/finance'
import type { Account } from '@/types'

const ACCOUNT: Omit<Account, 'id'> = {
  name: 'Savings', short: 'SAV', type: 'savings', color: '#35d0a2', balance: 2000, last4: null,
}

function clean() {
  useFinance.setState({
    accounts: [], transactions: [], categories: [],
    goals: [], goalContributions: [], currency: 'DOP',
  })
}

describe('goal contribute', () => {
  beforeEach(clean)

  it('deducts amount from account balance and adds to goal saved', () => {
    const { addAccount, addGoal, contribute } = useFinance.getState()
    addAccount(ACCOUNT)
    addGoal({ name: 'Vacation', target: 5000, saved: 0, color: '#5bc0ff', icon: 'target' })

    const acctId = useFinance.getState().accounts[0].id
    const goalId = useFinance.getState().goals[0].id

    contribute(goalId, 300, acctId, 'First payment')

    const state = useFinance.getState()
    expect(state.accounts[0].balance).toBe(1700)
    expect(state.goals[0].saved).toBe(300)
    expect(state.goalContributions).toHaveLength(1)
    expect(state.goalContributions[0].amount).toBe(300)
  })

  it('creates a contribution record with correct fields', () => {
    const { addAccount, addGoal, contribute } = useFinance.getState()
    addAccount(ACCOUNT)
    addGoal({ name: 'Emergency fund', target: 10000, saved: 200, color: '#f59e0b', icon: 'target' })

    const acctId = useFinance.getState().accounts[0].id
    const goalId = useFinance.getState().goals[0].id

    contribute(goalId, 500, acctId, 'Monthly deposit')

    const contrib = useFinance.getState().goalContributions[0]
    expect(contrib.goalId).toBe(goalId)
    expect(contrib.fromAccountId).toBe(acctId)
    expect(contrib.amount).toBe(500)
    expect(contrib.note).toBe('Monthly deposit')
  })

  it('throws when amount exceeds account balance', () => {
    const { addAccount, addGoal } = useFinance.getState()
    addAccount(ACCOUNT)
    addGoal({ name: 'House', target: 100000, saved: 0, color: '#a78bfa', icon: 'target' })

    const acctId = useFinance.getState().accounts[0].id
    const goalId = useFinance.getState().goals[0].id

    expect(() => useFinance.getState().contribute(goalId, 5000, acctId, '')).toThrow()
    expect(useFinance.getState().accounts[0].balance).toBe(2000)
    expect(useFinance.getState().goals[0].saved).toBe(0)
  })

  it('throws when goal does not exist', () => {
    const { addAccount } = useFinance.getState()
    addAccount(ACCOUNT)
    const acctId = useFinance.getState().accounts[0].id

    expect(() => useFinance.getState().contribute('nonexistent', 100, acctId, '')).toThrow()
  })

  it('accumulates multiple contributions', () => {
    const { addAccount, addGoal, contribute } = useFinance.getState()
    addAccount(ACCOUNT)
    addGoal({ name: 'Car', target: 15000, saved: 0, color: '#ff6b8a', icon: 'target' })

    const acctId = useFinance.getState().accounts[0].id
    const goalId = useFinance.getState().goals[0].id

    contribute(goalId, 200, acctId, 'Jan')
    contribute(goalId, 300, acctId, 'Feb')
    contribute(goalId, 100, acctId, 'Mar')

    const state = useFinance.getState()
    expect(state.goals[0].saved).toBe(600)
    expect(state.accounts[0].balance).toBe(1400)
    expect(state.goalContributions).toHaveLength(3)
  })
})

describe('addGoal / deleteGoal', () => {
  beforeEach(clean)

  it('creates goal with correct fields', () => {
    useFinance.getState().addGoal({ name: 'Trip', target: 3000, saved: 0, color: '#5bc0ff', icon: 'target' })
    const goal = useFinance.getState().goals[0]
    expect(goal.name).toBe('Trip')
    expect(goal.target).toBe(3000)
    expect(goal.saved).toBe(0)
    expect(goal.id).toMatch(/^goal_/)
  })

  it('deletes goal and its contributions', () => {
    const { addAccount, addGoal } = useFinance.getState()
    addAccount(ACCOUNT)
    addGoal({ name: 'Delete me', target: 500, saved: 0, color: '#ffdd3d', icon: 'target' })

    const acctId = useFinance.getState().accounts[0].id
    const goalId = useFinance.getState().goals[0].id
    useFinance.getState().contribute(goalId, 50, acctId, 'test')

    useFinance.getState().deleteGoal(goalId)
    expect(useFinance.getState().goals).toHaveLength(0)
    expect(useFinance.getState().goalContributions).toHaveLength(0)
  })
})
