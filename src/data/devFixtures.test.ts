import { describe, expect, it } from 'vitest'
import { makeStressData, sabotageAccounts, sabotageFx } from './devFixtures'
import { sanitizeFinanceData } from '@/store/finance'
import { accountMovementsTotal } from './helpers'

describe('datos de estres', () => {
  const data = makeStressData({ accounts: 30, transactions: 5_000, months: 36 })

  it('genera lo que se le pide', () => {
    expect(data.accounts).toHaveLength(30)
    expect(data.transactions).toHaveLength(5_000)
  })

  it('es determinista: la misma semilla, el mismo libro', () => {
    const a = makeStressData({ accounts: 5, transactions: 50, months: 6, seed: 7 })
    const b = makeStressData({ accounts: 5, transactions: 50, months: 6, seed: 7 })
    expect(a.transactions).toEqual(b.transactions)
  })

  /**
   * Lo importante: que el libro generado sea LEGAL. Un generador que produce
   * datos que el saneador tira no prueba nada — parecería que la app aguanta
   * 5.000 movimientos cuando en realidad se quedó con cero.
   */
  it('sobrevive entero al saneador', () => {
    const clean = sanitizeFinanceData({
      accounts: data.accounts,
      categories: data.categories,
      transactions: data.transactions,
      goals: [], goalContributions: [], currency: 'DOP',
    })
    expect(clean.transactions).toHaveLength(5_000)
    expect(clean.accounts).toHaveLength(30)
  })

  it('incluye exactamente un efectivo', () => {
    expect(data.accounts.filter(a => a.type === 'cash')).toHaveLength(1)
  })

  it('mete tarjetas con deuda en dolares, que es el caso caro', () => {
    expect(data.accounts.some(a => a.secondaryCurrency === 'USD')).toBe(true)
  })
})

describe('sabotajes', () => {
  const data = makeStressData({ accounts: 4, transactions: 40, months: 3, seed: 3 })

  it('el drift deja el saldo sin cuadrar con sus movimientos', () => {
    const before = data.accounts[0]
    const after = sabotageAccounts(data.accounts)[0]
    expect(after.balance).not.toBe(before.balance)
    // El libro de movimientos NO cambia: por eso queda derivado.
    const movements = accountMovementsTotal(after.id, data.transactions, [])
    expect(after.balance - (after.openingBalance ?? 0)).not.toBeCloseTo(movements, 2)
  })

  it('el trio FX corrupto lo tira el saneador entero', () => {
    const broken = sabotageFx(data.transactions)
    const target = broken.find(t => t.fxRate === 0)
    expect(target).toBeDefined()

    const clean = sanitizeFinanceData({
      accounts: data.accounts, categories: data.categories,
      transactions: broken, goals: [], goalContributions: [], currency: 'DOP',
    })
    const after = clean.transactions.find(t => t.id === target!.id)!
    // Ni un `fxRate: 0` ni un monto original huerfano: o los tres o ninguno.
    expect(after.fxRate).toBeUndefined()
    expect(after.originalAmount).toBeUndefined()
    expect(after.originalCurrency).toBeUndefined()
  })
})
