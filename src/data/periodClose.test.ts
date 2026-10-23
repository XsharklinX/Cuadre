import { describe, expect, it } from 'vitest'
import { applyClose, closePlan } from './periodClose'
import type { Account, Transaction } from '@/types'

function cuenta(over: Partial<Account> = {}): Account {
  return {
    id: 'a1', name: 'Popular', short: 'Pop', type: 'debit', color: '#3b82f6',
    balance: 10_000, openingBalance: 0, last4: null, ...over,
  } as Account
}

let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'expense', amount: 100, date: '2026-09-10',
    note: 'x', categoryId: 'c1', accountId: 'a1', ...over,
  } as Transaction
}

const CORTE = '2026-10-01'

/** La igualdad que sostiene el libro entero. */
function invariante(cuentas: Account[], conservados: Transaction[]): void {
  for (const a of cuentas) {
    const mueven = conservados.reduce((sum, t) => {
      if (t.onSecondaryBalance) return sum
      if (t.type === 'transfer') {
        if (t.fromAccount === a.id) return sum - t.amount
        if (t.toAccount === a.id && !t.toSecondary) return sum + (t.toAmount ?? t.amount)
        return sum
      }
      if (t.accountId !== a.id) return sum
      return sum + (t.type === 'income' ? t.amount : -t.amount)
    }, 0)
    expect(Math.round(((a.openingBalance ?? 0) + mueven) * 100) / 100).toBe(a.balance)
  }
}

describe('closePlan', () => {
  it('separa lo viejo de lo que se queda', () => {
    const txns = [tx({ date: '2026-08-01' }), tx({ date: '2026-09-30' }), tx({ date: '2026-10-05' })]
    const p = closePlan([cuenta()], { a1: 10_000 }, txns, CORTE)
    expect(p.archive).toHaveLength(2)
    expect(p.keep).toHaveLength(1)
    expect(p.keep[0].date).toBe('2026-10-05')
  })

  it('el día del corte se CONSERVA, no se archiva', () => {
    const p = closePlan([cuenta()], {}, [tx({ date: CORTE })], CORTE)
    expect(p.keep).toHaveLength(1)
    expect(p.archive).toHaveLength(0)
  })

  it('NO suma dos veces los movimientos conservados', () => {
    // El error obvio sería poner la apertura igual al saldo pedido: entonces
    // los movimientos de este mes se contarían otra vez y el saldo quedaría
    // mal justo después de cuadrarlo.
    const txns = [tx({ date: '2026-10-05', type: 'expense', amount: 500 })]
    const p = closePlan([cuenta()], { a1: 12_000 }, txns, CORTE)
    expect(p.openings.a1).toBe(12_500)
    const cuentas = applyClose([cuenta()], p)
    expect(cuentas[0].balance).toBe(12_000)
  })

  it('el saldo final es EXACTAMENTE el que escribió el usuario', () => {
    const txns = [
      tx({ date: '2026-08-01', amount: 9_999 }),
      tx({ date: '2026-10-03', type: 'income', amount: 1_200 }),
      tx({ date: '2026-10-09', type: 'expense', amount: 340 }),
    ]
    const p = closePlan([cuenta()], { a1: 7_777.77 }, txns, CORTE)
    const cuentas = applyClose([cuenta()], p)
    expect(cuentas[0].balance).toBe(7_777.77)
  })

  it('la invariante se cumple después del cierre', () => {
    const txns = [
      tx({ date: '2026-07-04', amount: 5_000 }),
      tx({ date: '2026-10-02', type: 'income', amount: 800 }),
      tx({ date: '2026-10-14', type: 'expense', amount: 125.5 }),
    ]
    const p = closePlan([cuenta()], { a1: 3_000 }, txns, CORTE)
    invariante(applyClose([cuenta()], p), p.keep)
  })

  it('una cuenta sin saldo escrito se queda como está, no se inventa', () => {
    const p = closePlan([cuenta({ balance: 10_000 })], {}, [], CORTE)
    expect(p.openings.a1).toBe(10_000)
    expect(p.changes).toEqual([])
  })

  it('enseña qué cuentas cambian y en cuánto, antes de aplicar', () => {
    const p = closePlan(
      [cuenta({ balance: 10_000 }), cuenta({ id: 'a2', name: 'Efectivo', balance: 3_200 })],
      { a1: 9_600, a2: 3_200 },
      [], CORTE,
    )
    expect(p.changes).toEqual([
      { accountId: 'a1', name: 'Popular', before: 10_000, after: 9_600, diff: -400 },
    ])
  })

  describe('transferencias conservadas', () => {
    it('cuentan en las dos cuentas', () => {
      const cuentas = [cuenta({ id: 'a1', balance: 10_000 }), cuenta({ id: 'a2', name: 'Ahorro', balance: 5_000 })]
      const txns = [tx({
        date: '2026-10-07', type: 'transfer', amount: 1_000,
        fromAccount: 'a1', toAccount: 'a2', categoryId: undefined, accountId: undefined,
      })]
      const p = closePlan(cuentas, { a1: 10_000, a2: 5_000 }, txns, CORTE)
      const r = applyClose(cuentas, p)
      expect(r[0].balance).toBe(10_000)
      expect(r[1].balance).toBe(5_000)
      invariante(r, p.keep)
    })

    it('una transferencia entre divisas usa toAmount en el destino', () => {
      const cuentas = [cuenta({ id: 'a1', balance: 10_000 }), cuenta({ id: 'usd', currency: 'USD', balance: 200 })]
      const txns = [tx({
        date: '2026-10-07', type: 'transfer', amount: 6_000, toAmount: 100,
        fromAccount: 'a1', toAccount: 'usd', categoryId: undefined, accountId: undefined,
      })]
      const p = closePlan(cuentas, { a1: 10_000, usd: 200 }, txns, CORTE)
      const r = applyClose(cuentas, p)
      expect(r[1].balance).toBe(200)
      expect(p.openings.usd).toBe(100)
    })
  })

  describe('el segundo libro de una tarjeta', () => {
    const tarjeta = cuenta({
      id: 'tc', name: 'Visa', type: 'credit', currency: 'DOP',
      secondaryCurrency: 'USD', secondaryBalance: -120, secondaryOpeningBalance: 0,
      balance: -4_000,
    })

    it('también se recompone, en vez de quedar derivando en silencio', () => {
      const txns = [tx({ date: '2026-10-08', type: 'expense', amount: 30, accountId: 'tc', onSecondaryBalance: true })]
      const p = closePlan([tarjeta], { tc: -4_000 }, txns, CORTE)
      expect(p.secondaryOpenings.tc).toBe(-90)
      const r = applyClose([tarjeta], p)
      expect(r[0].secondaryBalance).toBe(-120)
    })

    it('un movimiento del segundo libro no toca el principal', () => {
      const txns = [tx({ date: '2026-10-08', type: 'expense', amount: 30, accountId: 'tc', onSecondaryBalance: true })]
      const p = closePlan([tarjeta], { tc: -4_000 }, txns, CORTE)
      expect(p.openings.tc).toBe(-4_000)
    })

    it('una cuenta normal no recibe apertura secundaria', () => {
      const p = closePlan([cuenta()], { a1: 100 }, [], CORTE)
      expect(p.secondaryOpenings).toEqual({})
    })
  })

  it('con el libro vacío no revienta', () => {
    const p = closePlan([cuenta()], { a1: 500 }, [], CORTE)
    expect(p.archive).toEqual([])
    expect(applyClose([cuenta()], p)[0].balance).toBe(500)
  })

  it('un saldo escrito que no es número se ignora', () => {
    const p = closePlan([cuenta({ balance: 777 })], { a1: Number.NaN }, [], CORTE)
    expect(p.openings.a1).toBe(777)
  })

  it('applyClose no toca una cuenta que no está en el plan', () => {
    const p = closePlan([cuenta()], { a1: 100 }, [], CORTE)
    const ajena = cuenta({ id: 'otra', balance: 42 })
    expect(applyClose([ajena], p)[0]).toBe(ajena)
  })
})
