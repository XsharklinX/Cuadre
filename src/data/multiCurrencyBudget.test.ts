import { describe, expect, it } from 'vitest'
import { amountForCategory, byCategory, convertTxAmountsToBase, transactionsForTotals } from './helpers'
import { convertCurrency } from './currencies'
import type { Account, Category, Transaction } from '@/types'

/**
 * PRESUPUESTOS MULTI-MONEDA.
 *
 * Los presupuestos se fijan en la divisa base de la app, pero el gasto puede
 * ocurrir en una cuenta en otra divisa o en el segundo libro de una tarjeta.
 * Si la conversión se equivoca de divisa, el presupuesto miente en la
 * dirección más peligrosa: hacia abajo.
 */

const dopCard: Account = {
  id: 'card', name: 'Visa', short: 'V', type: 'credit', color: '#fff',
  balance: 0, last4: '1', limit: 50_000, currency: 'DOP',
  secondaryCurrency: 'USD', secondaryBalance: 0,
}
const usdAccount: Account = {
  id: 'usd', name: 'Ahorro USD', short: 'U', type: 'savings', color: '#fff',
  balance: 0, last4: null, currency: 'USD',
}
const dopAccount: Account = {
  id: 'dop', name: 'Nomina', short: 'N', type: 'debit', color: '#fff',
  balance: 0, last4: null,
}
const hidden: Account = { ...dopAccount, id: 'hidden', includeInTotal: false }

const food: Category = { id: 'food', name: 'Comida', type: 'expense', color: '#fff', budget: 10_000, icon: 'food' }

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't', type: 'expense', amount: 100, date: '2026-09-19',
  note: 'x', accountId: 'dop', categoryId: 'food', ...over,
})

const USD_TO_DOP = convertCurrency(1, 'USD', 'DOP')

describe('conversión a la divisa base', () => {
  it('una cuenta en la divisa base no se toca', () => {
    const [out] = convertTxAmountsToBase([tx({ amount: 500 })], [dopAccount], 'DOP')
    expect(out.amount).toBe(500)
  })

  it('convierte el gasto de una cuenta en otra divisa', () => {
    const [out] = convertTxAmountsToBase([tx({ accountId: 'usd', amount: 25 })], [usdAccount], 'DOP')
    expect(out.amount).toBeCloseTo(25 * USD_TO_DOP, 2)
  })

  /**
   * EL BUG. Un movimiento del segundo libro está en `secondaryCurrency`, no en
   * la divisa de la cuenta. Como la tarjeta es en pesos y la base es pesos, el
   * conversor lo daba por bueno y US$25 se sumaban al presupuesto como 25
   * PESOS — un gasto 60 veces menor del real.
   */
  it('convierte el gasto del SEGUNDO libro con su propia divisa', () => {
    const [out] = convertTxAmountsToBase(
      [tx({ accountId: 'card', amount: 25, onSecondaryBalance: true })], [dopCard], 'DOP',
    )
    expect(out.amount).toBeCloseTo(25 * USD_TO_DOP, 2)
    expect(out.amount).not.toBe(25)
  })

  it('el libro principal de esa misma tarjeta no se convierte', () => {
    // La tarjeta es en pesos: su libro principal ya está en la base.
    const [out] = convertTxAmountsToBase(
      [tx({ accountId: 'card', amount: 2_000 })], [dopCard], 'DOP',
    )
    expect(out.amount).toBe(2_000)
  })

  it('convierte los splits con el mismo factor', () => {
    const [out] = convertTxAmountsToBase([tx({
      accountId: 'card', amount: 30, onSecondaryBalance: true,
      splits: [{ categoryId: 'food', amount: 20 }, { categoryId: 'other', amount: 10 }],
    })], [dopCard], 'DOP')
    const sum = out.splits!.reduce((s, x) => s + x.amount, 0)
    expect(sum).toBeCloseTo(out.amount, 2)
  })

  it('convierte los cargos para que el desglose siga cuadrando', () => {
    // Los cargos viajan DENTRO de `amount`: si no se convierten, el desglose
    // deja de sumar contra el total.
    const [out] = convertTxAmountsToBase([tx({
      accountId: 'card', amount: 103, onSecondaryBalance: true,
      fees: [{ kind: 'fx-surcharge', pct: 3, amount: 3 }],
    })], [dopCard], 'DOP')
    expect(out.fees![0].amount).toBeCloseTo(3 * USD_TO_DOP, 2)
    expect(out.fees![0].amount).toBeLessThan(out.amount)
  })
})

describe('presupuesto contra gasto en varias divisas', () => {
  const accounts = [dopAccount, usdAccount, dopCard]

  it('suma el gasto de todas las divisas en la base', () => {
    const txns = [
      tx({ id: 'a', accountId: 'dop', amount: 1_000 }),
      tx({ id: 'b', accountId: 'usd', amount: 10 }),
      tx({ id: 'c', accountId: 'card', amount: 5, onSecondaryBalance: true }),
    ]
    const converted = transactionsForTotals(txns, accounts, 'DOP')
    const total = converted.reduce((s, t) => s + amountForCategory(t, 'food'), 0)
    expect(total).toBeCloseTo(1_000 + 15 * USD_TO_DOP, 1)
  })

  it('un presupuesto puede excederse solo por gasto en dólares', () => {
    // El caso que importa: el presupuesto se ve sano hasta que la conversión
    // es correcta. Con el bug, estos US$200 contaban como 200 pesos.
    const txns = [tx({ id: 'a', accountId: 'card', amount: 200, onSecondaryBalance: true })]
    const converted = transactionsForTotals(txns, accounts, 'DOP')
    const spent = converted.reduce((s, t) => s + amountForCategory(t, 'food'), 0)
    expect(spent).toBeGreaterThan(food.budget)
  })

  it('byCategory agrupa sobre los montos ya convertidos', () => {
    const txns = [
      tx({ id: 'a', accountId: 'dop', amount: 500 }),
      tx({ id: 'b', accountId: 'card', amount: 10, onSecondaryBalance: true }),
    ]
    const converted = transactionsForTotals(txns, accounts, 'DOP')
    const [row] = byCategory(converted, 'expense', [food])
    expect(row.amount).toBeCloseTo(500 + 10 * USD_TO_DOP, 1)
  })

  it('las cuentas excluidas del total siguen fuera tras convertir', () => {
    const txns = [
      tx({ id: 'a', accountId: 'dop', amount: 500 }),
      tx({ id: 'b', accountId: 'hidden', amount: 900 }),
    ]
    const converted = transactionsForTotals(txns, [...accounts, hidden], 'DOP')
    expect(converted).toHaveLength(1)
    expect(converted[0].amount).toBe(500)
  })

  it('sin cuentas en otra divisa la lista vuelve intacta', () => {
    // Atajo de rendimiento: no debe romper la identidad de los objetos.
    const txns = [tx({ amount: 500 })]
    expect(convertTxAmountsToBase(txns, [dopAccount], 'DOP')).toBe(txns)
  })
})
