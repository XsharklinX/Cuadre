import { describe, expect, it } from 'vitest'
import { recomputeAccountBalances, sanitizeFinanceData } from './finance'
import { accountMovementsTotal, accountSecondaryMovementsTotal } from '@/data/helpers'
import type { Account, Transaction } from '@/types'

/**
 * El SEGUNDO LIBRO de una tarjeta: gastos en dólares sobre una tarjeta en
 * pesos golpean `secondaryBalance`, no `balance`, y sin convertir.
 *
 * Esto toca el núcleo del libro, así que lo que se prueba aquí no es la UI
 * sino la invariante: cada libro se conserva por separado y ninguno se
 * contamina con el otro.
 */

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Visa', short: 'V', type: 'credit', color: '#fff',
  balance: 0, openingBalance: 0, last4: '1234', limit: 50_000,
  currency: 'DOP', secondaryCurrency: 'USD', secondaryBalance: 0,
  secondaryOpeningBalance: 0, ...over,
})

const debit = (over: Partial<Account> = {}): Account => ({
  id: 'd1', name: 'Nomina', short: 'N', type: 'debit', color: '#fff',
  balance: 10_000, openingBalance: 10_000, last4: null, ...over,
})

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'expense', amount: 100, date: '2026-09-19',
  note: 'Compra', accountId: 'c1', categoryId: 'k1', ...over,
})

const CATEGORIES = [{ id: 'k1', name: 'Compras', type: 'expense' as const, color: '#fff', budget: 0, icon: 'cart' as const }]

function load(accounts: Account[], transactions: Transaction[]) {
  return sanitizeFinanceData({
    accounts, transactions, categories: CATEGORIES,
    goals: [], goalContributions: [], currency: 'DOP',
  })
}

describe('separación de los dos libros', () => {
  const movements: Transaction[] = [
    tx({ id: 'local', amount: 2_000 }),
    tx({ id: 'dolares', amount: 25, onSecondaryBalance: true }),
  ]

  it('un gasto en el segundo libro no toca el saldo principal', () => {
    expect(accountMovementsTotal('c1', movements)).toBe(-2_000)
  })

  it('un gasto del libro principal no toca el segundo saldo', () => {
    expect(accountSecondaryMovementsTotal('c1', movements)).toBe(-25)
  })

  it('el monto del segundo libro NO se convierte', () => {
    // El bug que este campo existe para evitar: US$25 restando 25 PESOS, o
    // 25 dólares convertidos a 1,540 y restados del saldo en dólares.
    expect(accountSecondaryMovementsTotal('c1', movements)).toBe(-25)
    expect(accountSecondaryMovementsTotal('c1', movements)).not.toBe(-1_540)
  })

  it('un ingreso al segundo libro (un pago a la tarjeta) lo reduce', () => {
    const conPago = [...movements, tx({ id: 'pago', type: 'income', amount: 10, onSecondaryBalance: true })]
    expect(accountSecondaryMovementsTotal('c1', conPago)).toBe(-15)
  })

  it('las transferencias nunca entran al segundo libro', () => {
    const conTransfer: Transaction[] = [
      { id: 'tr', type: 'transfer', amount: 500, date: '2026-09-19', note: 'Pago', fromAccount: 'd1', toAccount: 'c1' },
    ]
    expect(accountSecondaryMovementsTotal('c1', conTransfer)).toBe(0)
  })
})

describe('conservación del dinero por libro', () => {
  it('cada libro cumple saldo = apertura + sus movimientos', () => {
    const movements: Transaction[] = [
      tx({ id: 'a', amount: 2_000 }),
      tx({ id: 'b', amount: 25, onSecondaryBalance: true }),
      tx({ id: 'c', amount: 1_500 }),
      tx({ id: 'd', amount: 40, onSecondaryBalance: true }),
      tx({ id: 'e', type: 'income', amount: 800 }),
    ]
    const [rebuilt] = recomputeAccountBalances(
      [card({ balance: -999, secondaryBalance: -999 })], movements, [],
    )

    expect(rebuilt.balance).toBe(rebuilt.openingBalance! + accountMovementsTotal('c1', movements, []))
    expect(rebuilt.secondaryBalance).toBe(
      rebuilt.secondaryOpeningBalance! + accountSecondaryMovementsTotal('c1', movements),
    )
  })

  it('recalcular es idempotente: correrlo dos veces da lo mismo', () => {
    const movements = [tx({ id: 'a', amount: 2_000 }), tx({ id: 'b', amount: 25, onSecondaryBalance: true })]
    const once = recomputeAccountBalances([card()], movements, [])
    const twice = recomputeAccountBalances(once, movements, [])
    expect(twice).toEqual(once)
  })

  it('recalcular repara AMBOS libros, no solo el principal', () => {
    // Antes, "Recalcular saldos" habría arreglado el saldo en pesos y dejado
    // el de dólares derivando en silencio.
    const movements = [tx({ id: 'a', amount: 2_000 }), tx({ id: 'b', amount: 25, onSecondaryBalance: true })]
    const corrupto = card({ balance: 123_456, secondaryBalance: 789 })
    const [fixed] = recomputeAccountBalances([corrupto], movements, [])
    expect(fixed.balance).toBe(-2_000)
    expect(fixed.secondaryBalance).toBe(-25)
  })

  it('back-deriva la apertura del segundo libro en tarjetas antiguas', () => {
    // Una tarjeta que existía antes de este campo: su apertura se deduce
    // hacia atrás sin mover el saldo mostrado.
    const movements = [tx({ id: 'b', amount: 25, onSecondaryBalance: true })]
    const vieja = card({ secondaryBalance: -100, secondaryOpeningBalance: undefined })
    const [fixed] = recomputeAccountBalances([vieja], movements, [])
    expect(fixed.secondaryOpeningBalance).toBe(-75)
    expect(fixed.secondaryBalance).toBe(-100)
  })

  it('una cuenta sin divisa secundaria no gana un segundo libro', () => {
    const [fixed] = recomputeAccountBalances([debit()], [], [])
    expect(fixed.secondaryBalance).toBeUndefined()
    expect(fixed.secondaryOpeningBalance).toBeUndefined()
  })
})

describe('saneado del marcador', () => {
  it('conserva el marcador sobre una tarjeta con divisa secundaria', () => {
    const out = load([card()], [tx({ amount: 25, onSecondaryBalance: true })])
    expect(out.transactions[0].onSecondaryBalance).toBe(true)
  })

  it('lo quita si la tarjeta no tiene divisa secundaria', () => {
    // Sin esto el gasto iría a un saldo inexistente y el dinero desaparecería.
    const out = load([card({ secondaryCurrency: undefined })], [tx({ amount: 25, onSecondaryBalance: true })])
    expect(out.transactions[0].onSecondaryBalance).toBeUndefined()
  })

  it('lo quita sobre una cuenta que no es tarjeta', () => {
    const out = load([debit()], [tx({ accountId: 'd1', amount: 25, onSecondaryBalance: true })])
    expect(out.transactions[0].onSecondaryBalance).toBeUndefined()
  })

  it('el movimiento degradado vuelve al libro principal, no se pierde', () => {
    // Degradar el marcador NUNCA puede borrar el movimiento: el dinero tiene
    // que seguir contando en algún libro.
    const out = load([debit()], [tx({ accountId: 'd1', amount: 25, onSecondaryBalance: true })])
    expect(out.transactions).toHaveLength(1)
    expect(accountMovementsTotal('d1', out.transactions)).toBe(-25)
  })
})
