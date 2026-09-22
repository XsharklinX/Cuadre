import { describe, expect, it } from 'vitest'
import { sanitizeFinanceData } from './finance'
import { accountMovementsTotal, accountSecondaryMovementsTotal } from '@/data/helpers'
import type { Account, Transaction } from '@/types'

/**
 * PAGAR LA LINEA EN DIVISA EXTRANJERA.
 *
 * El usuario tenia una tarjeta con RD$ 0.00 de deuda en pesos y US$ 39.80 en
 * dolares, y la hoja de pago anunciaba "DEBES RD$ 0.00": no existia forma de
 * pagar la deuda en dolares, porque una transferencia solo sabia abonar el
 * saldo principal.
 *
 * `toSecondary` es la marca que manda el pago al segundo libro. Lo que se
 * prueba aqui es la invariante de los DOS libros: un pago a uno no puede
 * mover el otro, y el saneador no puede dejar la marca puesta donde no tiene
 * sentido (ahi el pago desapareceria de los dos).
 */

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Banreservas', short: 'BR', type: 'credit', color: '#fff',
  balance: -2_000, openingBalance: 0, last4: '7109', limit: 12_000,
  currency: 'DOP', secondaryCurrency: 'USD', secondaryBalance: -39.8,
  secondaryOpeningBalance: 0, ...over,
})

const cash = (over: Partial<Account> = {}): Account => ({
  id: 'x1', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance: 30_000, openingBalance: 30_000, last4: null, ...over,
})

const pay = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'p1', type: 'transfer', amount: 2_000, date: '2026-09-20',
  note: 'Pago tarjeta', fromAccount: 'x1', toAccount: 'c1', ...over,
})

describe('pago de la linea en divisa extranjera', () => {
  it('abona el SEGUNDO libro y deja el principal intacto', () => {
    const txns = [pay({ amount: 2_360, toAmount: 39.8, toSecondary: true })]

    // El segundo libro recibe los 39.80 dolares...
    expect(accountSecondaryMovementsTotal('c1', txns)).toBe(39.8)
    // ...y el libro en pesos de la tarjeta no se entera.
    expect(accountMovementsTotal('c1', txns, [])).toBe(0)
    // La cuenta de origen sigue pagando en SU divisa.
    expect(accountMovementsTotal('x1', txns, [])).toBe(-2_360)
  })

  it('sin la marca, el mismo pago va al libro principal', () => {
    const txns = [pay({ amount: 2_000 })]

    expect(accountMovementsTotal('c1', txns, [])).toBe(2_000)
    expect(accountSecondaryMovementsTotal('c1', txns)).toBe(0)
  })

  it('el saneador quita la marca si el destino no tiene segunda divisa', () => {
    const plain = card({ secondaryCurrency: undefined, secondaryBalance: undefined })
    const { transactions } = sanitizeFinanceData({
      accounts: [plain, cash()],
      categories: [], goals: [], goalContributions: [], currency: 'DOP',
      transactions: [pay({ toSecondary: true })],
    })

    expect(transactions[0].toSecondary).toBeUndefined()
    // Y entonces cuenta en el libro principal, que es donde puede estar.
    expect(accountMovementsTotal('c1', transactions, [])).toBe(2_000)
  })

  it('el saneador quita la marca en algo que no es una transferencia', () => {
    const { transactions } = sanitizeFinanceData({
      accounts: [card(), cash()],
      categories: [{ id: 'k1', name: 'Compras', type: 'expense', color: '#fff', budget: 0, icon: 'bag' }],
      goals: [], goalContributions: [], currency: 'DOP',
      transactions: [{
        id: 'e1', type: 'expense', amount: 500, date: '2026-09-20',
        note: 'Compra', accountId: 'c1', categoryId: 'k1', toSecondary: true,
      } as Transaction],
    })

    expect(transactions[0].toSecondary).toBeUndefined()
  })
})
