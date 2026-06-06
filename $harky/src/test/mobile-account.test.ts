import { describe, it, expect, beforeEach } from 'vitest'
import { useFinance } from '@/store/finance'
import type { Account, Transaction } from '@/types'

const ACCOUNT: Omit<Account, 'id'> = {
  name: 'Test Bank', short: 'TBank', type: 'debit', color: '#5bc0ff', balance: 1000, last4: '1234',
}

const TX: Omit<Transaction, 'id'> = {
  type: 'expense', amount: 50, date: '2026-06-01', note: 'Lunch',
  categoryId: 'cat_food', accountId: '',
}

function clean() {
  useFinance.setState({
    accounts: [], transactions: [], categories: [],
    goals: [], goalContributions: [], currency: 'DOP',
  })
}

describe('deleteAccount', () => {
  beforeEach(clean)

  it('adds and then deletes a clean account', () => {
    const { addAccount, deleteAccount } = useFinance.getState()
    addAccount(ACCOUNT)
    const { accounts } = useFinance.getState()
    expect(accounts).toHaveLength(1)

    deleteAccount(accounts[0].id)
    expect(useFinance.getState().accounts).toHaveLength(0)
  })

  it('throws when account has transactions', () => {
    const { addAccount, addTx } = useFinance.getState()
    addAccount(ACCOUNT)
    const acctId = useFinance.getState().accounts[0].id

    addTx({ ...TX, accountId: acctId })
    expect(() => useFinance.getState().deleteAccount(acctId)).toThrow()
    expect(useFinance.getState().accounts).toHaveLength(1)
  })

  it('throws when account is used in goal contributions', () => {
    const { addAccount, addGoal } = useFinance.getState()
    addAccount({ ...ACCOUNT, balance: 500 })
    addGoal({ name: 'Vacation', target: 1000, saved: 0, color: '#35d0a2', icon: 'target' })

    const acctId = useFinance.getState().accounts[0].id
    const goalId = useFinance.getState().goals[0].id

    useFinance.getState().contribute(goalId, 100, acctId, 'First contrib')
    expect(() => useFinance.getState().deleteAccount(acctId)).toThrow()
  })
})

describe('updateAccount', () => {
  beforeEach(clean)

  it('updates account name and color', () => {
    const { addAccount, updateAccount } = useFinance.getState()
    addAccount(ACCOUNT)
    const id = useFinance.getState().accounts[0].id

    updateAccount(id, { name: 'Renamed', color: '#ff6b8a' })
    const updated = useFinance.getState().accounts[0]
    expect(updated.name).toBe('Renamed')
    expect(updated.color).toBe('#ff6b8a')
    expect(updated.type).toBe('debit')
  })
})
