import { describe, it, expect } from 'vitest'
import { accountActivity, accountBalanceInBase, accountMovementsTotal, accountSavingsRate, amountForCategory, availableBalanceInBase, byCategory, categoryParts, categoryRollover, convertTxAmountsToBase, creditCardsOwedInBase, getAccount, getCategory, monthlyAccountSeries, netWorthBreakdown, netWorthSeries, rollingNetWorthSeries, savingsBalance, totalBalanceInBase, visibleAccounts, transactionsForTotals } from './helpers'
import type { Account, Category, Transaction } from '@/types'

const TXNS: Transaction[] = [
  { id: '1', type: 'income',   amount: 500, date: '2026-06-05', note: 'Salary',  accountId: 'acc1' },
  { id: '2', type: 'expense',  amount: 50,  date: '2026-06-10', note: 'Lunch',   accountId: 'acc1' },
  { id: '3', type: 'expense',  amount: 30,  date: '2026-05-20', note: 'Coffee',  accountId: 'acc1' },
  { id: '4', type: 'transfer', amount: 100, date: '2026-06-15', note: 'Move',    fromAccount: 'acc1', toAccount: 'acc2' },
  { id: '5', type: 'expense',  amount: 20,  date: '2026-06-12', note: 'Other',   accountId: 'acc2' },
]

describe('accountActivity', () => {
  it('returns transactions touching the account via accountId, fromAccount or toAccount', () => {
    expect(accountActivity(TXNS, 'acc1').map(t => t.id)).toEqual(['1', '2', '3', '4'])
    expect(accountActivity(TXNS, 'acc2').map(t => t.id)).toEqual(['4', '5'])
  })
})

describe('monthlyAccountSeries', () => {
  it('returns 6 monthly buckets ending at mkey with inflow/outflow for the account', () => {
    const series = monthlyAccountSeries(TXNS, 'acc1', '2026-06')
    expect(series).toHaveLength(6)
    expect(series[series.length - 1].key).toBe('2026-06')
    expect(series[series.length - 2].key).toBe('2026-05')

    const june = series[series.length - 1]
    expect(june.inflow).toBe(500)
    expect(june.outflow).toBe(150) // 50 expense + 100 transfer out

    const may = series[series.length - 2]
    expect(may.inflow).toBe(0)
    expect(may.outflow).toBe(30)
  })

  it('counts incoming transfers for the destination account', () => {
    const series = monthlyAccountSeries(TXNS, 'acc2', '2026-06')
    const june = series[series.length - 1]
    expect(june.inflow).toBe(100)
    expect(june.outflow).toBe(20)
  })
})

const ACCOUNTS: Account[] = [
  { id: 'acc1', name: 'Cuenta', short: 'CTA', type: 'debit', color: '#fff', balance: 1000, last4: null },
  { id: 'acc2', name: 'Ahorros', short: 'AHO', type: 'savings', color: '#0f0', balance: 500, last4: null, includeInTotal: false },
]

describe('visibleAccounts', () => {
  it('excludes accounts with includeInTotal: false', () => {
    expect(visibleAccounts(ACCOUNTS).map(a => a.id)).toEqual(['acc1'])
  })

  it('includes all accounts when none are excluded', () => {
    expect(visibleAccounts([ACCOUNTS[0]]).map(a => a.id)).toEqual(['acc1'])
  })
})

describe('savings helpers', () => {
  it('counts savings accounts even when excluded from total balance', () => {
    expect(savingsBalance(ACCOUNTS)).toBe(500)
    expect(accountSavingsRate(ACCOUNTS)).toBeCloseTo(500 / 1500 * 100)
  })
})

describe('transactionsForTotals', () => {
  it('filters out transactions belonging to excluded accounts', () => {
    const result = transactionsForTotals(TXNS, ACCOUNTS)
    expect(result.map(t => t.id)).toEqual(['1', '2', '3', '4'])
  })

  it('returns all transactions unchanged when no accounts are excluded', () => {
    const result = transactionsForTotals(TXNS, [ACCOUNTS[0]])
    expect(result).toEqual(TXNS)
  })
})

describe('splits (transacciones divididas)', () => {
  const splitTx: Transaction = {
    id: 's1', type: 'expense', amount: 500, date: '2026-06-10', note: 'Supermercado',
    accountId: 'acc1', categoryId: 'cat_food',
    splits: [
      { categoryId: 'cat_food', amount: 300 },
      { categoryId: 'cat_clean', amount: 200 },
    ],
  }
  const plainTx: Transaction = {
    id: 's2', type: 'expense', amount: 100, date: '2026-06-11', note: 'Café',
    accountId: 'acc1', categoryId: 'cat_food',
  }

  it('categoryParts devuelve los splits o la categoría única', () => {
    expect(categoryParts(splitTx)).toEqual(splitTx.splits)
    expect(categoryParts(plainTx)).toEqual([{ categoryId: 'cat_food', amount: 100 }])
  })

  it('amountForCategory atribuye el monto correcto por categoría', () => {
    expect(amountForCategory(splitTx, 'cat_food')).toBe(300)
    expect(amountForCategory(splitTx, 'cat_clean')).toBe(200)
    expect(amountForCategory(splitTx, 'cat_other')).toBe(0)
    expect(amountForCategory(plainTx, 'cat_food')).toBe(100)
  })

  it('byCategory expande los splits en el total por categoría', () => {
    const cats = [
      { id: 'cat_food', name: 'Comida', type: 'expense', color: '#fff', budget: 0, icon: 'food' },
      { id: 'cat_clean', name: 'Limpieza', type: 'expense', color: '#fff', budget: 0, icon: 'home' },
    ] as const
    const result = byCategory([splitTx, plainTx], 'expense', cats as unknown as Category[])
    expect(result.find(r => r.category.id === 'cat_food')?.amount).toBe(400)
    expect(result.find(r => r.category.id === 'cat_clean')?.amount).toBe(200)
  })
})

describe('multi-moneda', () => {
  const usdAccount: Account = {
    id: 'acc_usd', name: 'Dólares', short: 'USD', type: 'savings',
    color: '#fff', balance: 100, last4: null, currency: 'USD',
  }
  const dopAccount: Account = {
    id: 'acc_dop', name: 'Pesos', short: 'DOP', type: 'cash',
    color: '#fff', balance: 1000, last4: null,
  }

  it('accountBalanceInBase convierte con la tasa vigente', () => {
    // rateToUSD de DOP = 58.5 por defecto → 100 USD = 5850 DOP
    expect(accountBalanceInBase(usdAccount, 'DOP')).toBeCloseTo(5850)
    expect(accountBalanceInBase(dopAccount, 'DOP')).toBe(1000)
  })

  it('totalBalanceInBase suma cuentas convertidas y respeta exclusiones', () => {
    const hidden: Account = { ...usdAccount, id: 'acc_h', includeInTotal: false }
    expect(totalBalanceInBase([usdAccount, dopAccount, hidden], 'DOP')).toBeCloseTo(6850)
  })

  it('el dinero disponible NO incluye tarjetas de crédito; la deuda va aparte', () => {
    const debtCard: Account = { id: 'cc', name: 'Visa', short: 'V', type: 'credit', color: '#fff', balance: -1500, last4: null, limit: 50000 }
    const freshCard: Account = { id: 'cc2', name: 'MC', short: 'M', type: 'credit', color: '#fff', balance: 0, last4: null, limit: 30000 }
    const accts = [dopAccount, debtCard, freshCard]
    // Disponible = solo el efectivo (1000). Las tarjetas NO suman ni restan.
    expect(availableBalanceInBase(accts, 'DOP')).toBe(1000)
    // Patrimonio (totalBalanceInBase) sí resta la deuda: 1000 − 1500 = −500.
    expect(totalBalanceInBase(accts, 'DOP')).toBe(-500)
    // Adeudado en tarjetas = 1500 (la fresca no debe nada).
    expect(creditCardsOwedInBase(accts, 'DOP')).toBe(1500)
  })

  it('convertTxAmountsToBase convierte montos y splits de cuentas foráneas', () => {
    const tx: Transaction = {
      id: 't1', type: 'expense', amount: 10, date: '2026-07-01', note: 'Compra USD',
      accountId: 'acc_usd', categoryId: 'cat_a',
      splits: [{ categoryId: 'cat_a', amount: 6 }, { categoryId: 'cat_b', amount: 4 }],
    }
    const local: Transaction = {
      id: 't2', type: 'expense', amount: 100, date: '2026-07-01', note: 'Compra DOP', accountId: 'acc_dop',
    }
    const [converted, untouched] = convertTxAmountsToBase([tx, local], [usdAccount, dopAccount], 'DOP')
    expect(converted.amount).toBeCloseTo(585)
    expect(converted.splits![0].amount).toBeCloseTo(351)
    expect(untouched).toBe(local)
  })

  it('accountMovementsTotal usa toAmount en transferencias entre divisas', () => {
    const transfer: Transaction = {
      id: 't3', type: 'transfer', amount: 5850, date: '2026-07-01', note: 'Cambio',
      fromAccount: 'acc_dop', toAccount: 'acc_usd', toAmount: 100,
    }
    expect(accountMovementsTotal('acc_dop', [transfer])).toBe(-5850)
    expect(accountMovementsTotal('acc_usd', [transfer])).toBe(100)
  })
})

describe('netWorthSeries / rollingNetWorthSeries', () => {
  const acc: Account = { id: 'acc1', name: 'Cuenta', short: 'C', type: 'debit', color: '#fff', balance: 1000, openingBalance: 500, last4: null }
  const txns: Transaction[] = [
    { id: 't1', type: 'income', amount: 500, date: '2026-06-05', note: 'Salario', accountId: 'acc1' },
  ]

  it('netWorthSeries devuelve 12 puntos con el valor acumulado al cierre de cada mes', () => {
    const series = netWorthSeries([acc], txns, [], 2026)
    expect(series).toHaveLength(12)
    expect(series[4].key).toBe('2026-05')  // antes del ingreso: solo el opening
    expect(series[4].value).toBe(500)
    expect(series[5].key).toBe('2026-06')  // mes del ingreso: opening + 500
    expect(series[5].value).toBe(1000)
  })

  it('netWorthSeries convierte cuentas de otra divisa a la base', () => {
    const usdAcc: Account = { ...acc, id: 'acc_usd', currency: 'USD', openingBalance: 100 }
    const series = netWorthSeries([usdAcc], [], [], 2026, 'es-DO', 'DOP')
    // sin transacciones, opening=100 USD convertido a DOP en cada mes
    expect(series[0].value).toBeGreaterThan(100)
  })

  it('rollingNetWorthSeries devuelve los ultimos N meses terminando en endKey, sin atarse al año calendario', () => {
    const series = rollingNetWorthSeries([acc], txns, [], '2026-07', 3)
    expect(series).toHaveLength(3)
    expect(series.map(p => p.key)).toEqual(['2026-05', '2026-06', '2026-07'])
    expect(series[2].value).toBe(1000)  // incluye el ingreso de junio
  })
})

describe('netWorthBreakdown (activos vs pasivos)', () => {
  it('separa saldos positivos (activos) de negativos (pasivos)', () => {
    const checking: Account = { id: 'c', name: 'Cuenta', short: 'C', type: 'debit', color: '#fff', balance: 1000, last4: null }
    const credit: Account = { id: 'cr', name: 'Tarjeta', short: 'Tarjeta', type: 'credit', color: '#fff', balance: -300, last4: '1234' }
    expect(netWorthBreakdown([checking, credit], 'DOP')).toEqual({ assets: 1000, liabilities: 300 })
  })

  it('una tarjeta de credito sobrepagada (saldo positivo) cuenta como activo, no como pasivo', () => {
    const overpaidCredit: Account = { id: 'cr', name: 'Tarjeta', short: 'Tarjeta', type: 'credit', color: '#fff', balance: 50, last4: '1234' }
    expect(netWorthBreakdown([overpaidCredit], 'DOP')).toEqual({ assets: 50, liabilities: 0 })
  })

  it('respeta includeInTotal: false (cuentas ocultas no cuentan para ningun lado)', () => {
    const hidden: Account = { id: 'h', name: 'Oculta', short: 'H', type: 'debit', color: '#fff', balance: -500, last4: null, includeInTotal: false }
    expect(netWorthBreakdown([hidden], 'DOP')).toEqual({ assets: 0, liabilities: 0 })
  })

  it('convierte cuentas en otra divisa antes de sumar', () => {
    const usdDebt: Account = { id: 'u', name: 'USD', short: 'U', type: 'credit', color: '#fff', balance: -100, last4: null, currency: 'USD' }
    const result = netWorthBreakdown([usdDebt], 'DOP')
    expect(result.liabilities).toBeGreaterThan(100) // 100 USD > 100 DOP
  })
})

describe('getCategory / getAccount', () => {
  const cats: Category[] = [{ id: 'c1', name: 'Comida', type: 'expense', color: '#fff', budget: 0, icon: 'food' }]
  const accs: Account[] = [{ id: 'a1', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 0, last4: null }]

  it('encuentran por id o devuelven undefined', () => {
    expect(getCategory('c1', cats)?.name).toBe('Comida')
    expect(getCategory('missing', cats)).toBeUndefined()
    expect(getCategory(undefined, cats)).toBeUndefined()
    expect(getAccount('a1', accs)?.name).toBe('Efectivo')
    expect(getAccount('missing', accs)).toBeUndefined()
  })
})

describe('categoryRollover (arrastre de presupuesto)', () => {
  const cat = (over: Partial<Category> = {}): Category => ({ id: 'c1', name: 'Comida', type: 'expense', color: '#fff', budget: 5000, icon: 'food', ...over })
  const tx = (amount: number): Transaction => ({ id: 't' + amount, type: 'expense', amount, date: '2026-07-10', note: '', categoryId: 'c1', accountId: 'a1' })

  it('resta el exceso (gasto > presupuesto) cuando el arrastre está activo por categoría', () => {
    expect(categoryRollover(cat({ rolloverEnabled: true }), [tx(6000)])).toBe(-1000)
  })

  it('suma el sobrante (gasto < presupuesto)', () => {
    expect(categoryRollover(cat({ rolloverEnabled: true }), [tx(3000)])).toBe(2000)
  })

  it('sin arrastre por categoría ni global → 0', () => {
    expect(categoryRollover(cat({ rolloverEnabled: false }), [tx(6000)])).toBe(0)
  })

  it('el flag GLOBAL activa el arrastre aunque la categoría no lo tenga', () => {
    expect(categoryRollover(cat({ rolloverEnabled: false }), [tx(6000)], true)).toBe(-1000)
  })

  it('sin presupuesto → 0 aunque el global esté activo', () => {
    expect(categoryRollover(cat({ rolloverEnabled: false, budget: 0 }), [tx(6000)], true)).toBe(0)
  })
})
