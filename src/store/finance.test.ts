import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyImportedBalances, assertAvailableBalance, canDeleteAccount, canDeleteCategory, recomputeAccountBalances, recomputeGoalsSaved, restoreFinanceDataWithSnapshot, sanitizeFinanceData } from './finance'
import { accountMovementsTotal } from '@/data/helpers'
import { listRecoverySnapshots } from '@/data/recovery'
import type { Account, Goal, GoalContribution, Transaction } from '@/types'
import type { FinanceState } from './finance'

const accounts: Account[] = [
  { id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 500, last4: null },
  { id: 'credit', name: 'Tarjeta', short: 'Credito', type: 'credit', color: '#fff', balance: -100, last4: '1234', limit: 1000 },
]

function installMemoryStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  })
}

describe('assertAvailableBalance', () => {
  it('permite usar saldo disponible', () => {
    expect(() => assertAvailableBalance(accounts, 'cash', 500)).not.toThrow()
  })

  it('rechaza montos que exceden el saldo de una cuenta normal', () => {
    expect(() => assertAvailableBalance(accounts, 'cash', 501)).toThrow('Saldo insuficiente')
  })

  it('permite movimientos desde cuentas de credito dentro del limite', () => {
    expect(() => assertAvailableBalance(accounts, 'credit', 800)).not.toThrow()
  })

  it('rechaza movimientos que exceden el limite de credito', () => {
    expect(() => assertAvailableBalance(accounts, 'credit', 901)).toThrow('Límite de crédito excedido')
  })

  it('permite movimientos en cuentas de credito sin limite definido', () => {
    const noLimit: Account[] = [{ id: 'credit2', name: 'Tarjeta', short: 'Cred', type: 'credit', color: '#fff', balance: -100, last4: '1234' }]
    expect(() => assertAvailableBalance(noLimit, 'credit2', 999999)).not.toThrow()
  })

  it('rechaza cuentas inexistentes y montos invalidos', () => {
    expect(() => assertAvailableBalance(accounts, 'missing', 10)).toThrow('no existe')
    expect(() => assertAvailableBalance(accounts, 'cash', 0)).toThrow('mayor que cero')
  })
})

describe('canDeleteAccount', () => {
  it('bloquea cuentas referenciadas por movimientos', () => {
    const transactions: Transaction[] = [{ id: 'tx', type: 'expense', amount: 25, accountId: 'cash', date: '2026-05-31', note: 'Compra' }]
    expect(canDeleteAccount('cash', transactions)).toBe(false)
  })

  it('permite borrar cuentas sin movimientos', () => {
    expect(canDeleteAccount('cash', [])).toBe(true)
  })
})

describe('canDeleteCategory', () => {
  it('bloquea categorias referenciadas por movimientos', () => {
    const transactions: Transaction[] = [{ id: 'tx', type: 'expense', amount: 25, accountId: 'cash', categoryId: 'food', date: '2026-05-31', note: 'Compra' }]
    expect(canDeleteCategory('food', transactions)).toBe(false)
  })

  it('permite borrar categorias sin movimientos', () => {
    expect(canDeleteCategory('food', [])).toBe(true)
  })
})

describe('importTxs', () => {
  it('no aplica filas parciales cuando la politica de sobregiro bloquea el lote', () => {
    const rows: Transaction[] = [
      { id: 'valid', type: 'expense', amount: 100, accountId: 'cash', date: '2026-05-31', note: 'Compra valida' },
      { id: 'invalid', type: 'expense', amount: 600, accountId: 'cash', date: '2026-05-31', note: 'Compra invalida' },
    ]
    expect(() => applyImportedBalances(accounts, rows, 'block')).toThrow('Saldo insuficiente')
    expect(accounts.find(account => account.id === 'cash')?.balance).toBe(500)
  })
})

describe('sanitizeFinanceData', () => {
  it('migra datos persistidos legacy sin romper referencias validas', () => {
    const data = sanitizeFinanceData({
      accounts: [
        { id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 1000, last4: null },
        { id: '', name: 'Rota', short: 'Bad', type: 'cash', color: '#fff', balance: 100 },
      ],
      categories: [
        { id: 'food', name: 'Restaurantes', type: 'expense', color: '#f90', budget: 9000, icon: 'food' },
        { id: 'legacy', name: 'Vieja', type: 'expense', color: '#999', budget: 0, icon: 'unknown' },
      ],
      goals: [
        { id: 'goal', name: 'Fondo', target: 10000, saved: 500, color: '#22c55e', icon: 'wallet' },
      ],
      goalContributions: [
        { id: 'contrib', goalId: 'goal', amount: 100, fromAccountId: 'cash', date: '2026-06-02' },
        { id: 'broken', goalId: 'missing', amount: 100, fromAccountId: 'cash', date: '2026-06-02' },
      ],
      transactions: [
        { id: 'tx', type: 'expense', amount: 25, accountId: 'cash', categoryId: 'food', date: '2026-06-02', note: 'Cena' },
        { id: 'bad', type: 'expense', amount: 25, accountId: 'missing', categoryId: 'food', date: '2026-06-02', note: 'Dato viejo' },
      ],
      currency: 'DOP',
    })

    expect(data.accounts).toHaveLength(1)
    expect(data.categories).toHaveLength(2)
    expect(data.categories.find(category => category.id === 'legacy')?.icon).toBe('wallet')
    expect(data.goalContributions.map(contribution => contribution.id)).toEqual(['contrib'])
    expect(data.transactions.map(transaction => transaction.id)).toEqual(['tx'])
  })

  /*
   * La CATEGORIA corrupta se va; el MOVIMIENTO no. Antes se iban los dos, y
   * eso borraba un gasto real del usuario por un defecto en otro registro.
   * Perder la categoria de un gasto es molesto; perder el gasto es perder
   * dinero del libro.
   */
  it('descarta categorias corruptas pero RESCATA los movimientos que dependian de ellas', () => {
    const data = sanitizeFinanceData({
      accounts: [{ id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 500, last4: null }],
      categories: [
        { id: 'food', name: 'Comida', type: 'expense', color: '#fff', budget: 100, icon: 'food' },
        { id: 'broken', name: '1', type: 'expense', color: '#fff', budget: 0, icon: 'food' },
      ],
      goals: [],
      goalContributions: [],
      transactions: [
        { id: 'valid', type: 'expense', amount: 25, accountId: 'cash', categoryId: 'food', date: '2026-05-31', note: 'Compra' },
        { id: 'broken', type: 'expense', amount: 10, accountId: 'cash', categoryId: 'broken', date: '2026-05-31', note: 'Dato danado' },
      ],
      currency: 'DOP',
    })
    expect(data.categories.map(category => category.id)).toEqual(['food'])
    expect(data.transactions.map(transaction => transaction.id)).toEqual(['valid', 'broken'])
    expect(data.transactions.find(transaction => transaction.id === 'broken')?.categoryId).toBe('food')
  })
})

describe('recomputeGoalsSaved', () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({
    id: 'goal', name: 'Viaje', target: 1000, saved: 0, color: '#fff', icon: 'target', ...over,
  } as Goal)
  const aportes: GoalContribution[] = [
    { id: 'c1', goalId: 'goal', fromAccountId: 'bank', amount: 200, date: '2026-01-01' },
    { id: 'c2', goalId: 'otra', fromAccountId: 'bank', amount: 999, date: '2026-01-02' },
  ]

  it('reconcilia lo ahorrado contra apertura + aportes de ESA meta', () => {
    const [r] = recomputeGoalsSaved([goal({ openingSaved: 50, saved: 7777 })], aportes)
    expect(r.saved).toBe(250)
  })

  /* Sin apertura guardada se back-deriva, para no inventar un ahorro que el
     usuario nunca tuvo al abrir la meta. */
  it('back-deriva la apertura cuando falta', () => {
    const [r] = recomputeGoalsSaved([goal({ saved: 300 })], aportes)
    expect(r.openingSaved).toBe(100)
    expect(r.saved).toBe(300)
  })

  it('es idempotente', () => {
    const una = recomputeGoalsSaved([goal({ openingSaved: 50, saved: 7777 })], aportes)
    expect(recomputeGoalsSaved(una, aportes)[0].saved).toBe(una[0].saved)
  })
})

describe('accountMovementsTotal / recomputeAccountBalances', () => {
  const accs: Account[] = [
    { id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 0, last4: null, openingBalance: 100 },
    { id: 'bank', name: 'Banco', short: 'Bank', type: 'debit', color: '#fff', balance: 0, last4: null, openingBalance: 0 },
  ]
  const txns: Transaction[] = [
    { id: 't1', type: 'income',  amount: 50, date: '2026-01-01', note: 'sueldo', accountId: 'cash', categoryId: 'c1' },
    { id: 't2', type: 'expense', amount: 30, date: '2026-01-02', note: 'café',   accountId: 'cash', categoryId: 'c2' },
    { id: 't3', type: 'transfer', amount: 20, date: '2026-01-03', note: 'mov', fromAccount: 'cash', toAccount: 'bank' },
  ] as Transaction[]
  const contribs: GoalContribution[] = [
    { id: 'g1', goalId: 'goal', fromAccountId: 'bank', amount: 5, date: '2026-01-04' },
  ]

  it('suma el efecto neto de los movimientos por cuenta', () => {
    expect(accountMovementsTotal('cash', txns, contribs)).toBe(0)   // +50 −30 −20
    expect(accountMovementsTotal('bank', txns, contribs)).toBe(15)  // +20 −5
  })

  it('recalcula el saldo desde apertura + movimientos', () => {
    const fixed = recomputeAccountBalances(accs, txns, contribs)
    expect(fixed.find(a => a.id === 'cash')!.balance).toBe(100) // 100 + 0
    expect(fixed.find(a => a.id === 'bank')!.balance).toBe(15)  // 0 + 15
  })

  it('corrige un saldo derivado y back-deriva opening si falta', () => {
    const drifted: Account[] = [
      { id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 999, last4: null, openingBalance: 100 },
      { id: 'bank', name: 'Banco', short: 'Bank', type: 'debit', color: '#fff', balance: 15, last4: null }, // sin openingBalance
    ]
    const fixed = recomputeAccountBalances(drifted, txns, contribs)
    expect(fixed.find(a => a.id === 'cash')!.balance).toBe(100)        // corregido desde 999
    const bank = fixed.find(a => a.id === 'bank')!
    expect(bank.openingBalance).toBe(0)                                // back-derivado: 15 − 15
    expect(bank.balance).toBe(15)                                      // sin cambio neto
  })
})

describe('restoreFinanceDataWithSnapshot', () => {
  beforeEach(installMemoryStorage)

  it('crea un punto de recuperacion antes de reemplazar datos', () => {
    const current = {
      accounts: [{ id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 1000, last4: null }],
      categories: [],
      goals: [],
      goalContributions: [],
      transactions: [],
      currency: 'DOP',
    } as unknown as FinanceState

    const next = restoreFinanceDataWithSnapshot(current, {
      accounts: [],
      categories: [],
      goals: [],
      goalContributions: [],
      transactions: [],
      currency: 'USD',
    })

    expect(next.currency).toBe('USD')
    expect(listRecoverySnapshots()[0]).toMatchObject({
      reason: 'pre-restore',
      backup: { data: { accounts: current.accounts } },
    })
  })
})
