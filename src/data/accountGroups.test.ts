import { describe, expect, it } from 'vitest'
import { cardFigures, cardGroups, cashAccounts } from './accountGroups'
import type { Account } from '@/types'

const acc = (over: Partial<Account>): Account => ({
  id: 'a', name: 'Cuenta', short: 'C', type: 'debit', color: '#fff',
  balance: 0, openingBalance: 0, last4: null, ...over,
})

describe('el efectivo va aparte', () => {
  it('solo el efectivo, nunca una tarjeta', () => {
    const r = cashAccounts([
      acc({ id: 'ef', type: 'cash', balance: 8_450 }),
      acc({ id: 'db', type: 'debit' }),
      acc({ id: 'cr', type: 'credit' }),
    ])
    expect(r.map(a => a.id)).toEqual(['ef'])
  })
})

describe('las tarjetas, por tipo', () => {
  const cuentas = [
    acc({ id: 'ef', type: 'cash', balance: 8_450 }),
    acc({ id: 'cr1', type: 'credit', balance: -2_414 }),
    acc({ id: 'cr2', type: 'credit', balance: -9_781 }),
    acc({ id: 'db1', type: 'debit', balance: 34_120 }),
    acc({ id: 'ah1', type: 'savings', balance: 18_850 }),
  ]

  it('agrupa en credito, debito y ahorro, en ese orden', () => {
    expect(cardGroups(cuentas, 'DOP').map(g => g.id)).toEqual(['credit', 'debit', 'savings'])
  })

  /** El efectivo NO es una tarjeta: no puede colarse en ningun grupo. */
  it('deja el efectivo fuera', () => {
    const ids = cardGroups(cuentas, 'DOP').flatMap(g => g.accounts.map(a => a.id))
    expect(ids).not.toContain('ef')
  })

  it('no devuelve grupos vacios', () => {
    const solo = cardGroups([acc({ id: 'db1', type: 'debit', balance: 100 })], 'DOP')
    expect(solo.map(g => g.id)).toEqual(['debit'])
  })

  /*
   * La tarjeta mas comprometida primero: es la que hay que mirar. Ordenarlas
   * por nombre seria alfabetizar un problema.
   */
  it('el credito se ordena por deuda, de mayor a menor', () => {
    const [credito] = cardGroups(cuentas, 'DOP')
    expect(credito.accounts.map(a => a.id)).toEqual(['cr2', 'cr1'])
  })

  /** En credito el total es lo que DEBES, en positivo: la etiqueta ya dice "Debes". */
  it('el total del credito es la deuda en positivo', () => {
    const [credito] = cardGroups(cuentas, 'DOP')
    expect(credito.total).toBeCloseTo(12_195, 0)
  })

  it('una cuenta excluida del total no suma, pero se sigue viendo', () => {
    const conExcluida = [
      acc({ id: 'db1', type: 'debit', balance: 1_000 }),
      acc({ id: 'db2', type: 'debit', balance: 5_000, includeInTotal: false }),
    ]
    const [debito] = cardGroups(conExcluida, 'DOP')
    expect(debito.accounts).toHaveLength(2)
    expect(debito.total).toBe(1_000)
  })
})

describe('las cifras de una tarjeta', () => {
  it('en debito, el saldo tal cual', () => {
    const f = cardFigures(acc({ type: 'debit', balance: 34_120 }), 'DOP')
    expect(f.primary).toBe(34_120)
    expect(f.secondary).toBeNull()
    expect(f.usedLocal).toBeNull()
  })

  it('en credito, la deuda en POSITIVO', () => {
    const f = cardFigures(acc({ type: 'credit', balance: -9_781.45 }), 'DOP')
    expect(f.primary).toBeCloseTo(9_781.45, 2)
  })

  /** Manda la divisa de la cuenta, nunca la base. */
  it('la divisa sale de la cuenta', () => {
    expect(cardFigures(acc({ currency: 'USD', balance: 1_240 }), 'DOP').currency).toBe('USD')
    expect(cardFigures(acc({ balance: 100 }), 'DOP').currency).toBe('DOP')
  })

  it('la segunda deuda aparece cuando existe', () => {
    const f = cardFigures(acc({
      type: 'credit', balance: -9_781.45, secondaryCurrency: 'USD', secondaryBalance: -39.80,
    }), 'DOP')
    expect(f.secondary).toEqual({ amount: 39.80, currency: 'USD' })
  })

  /*
   * NUNCA "US$ 0.00". Una tarjeta con linea en dolares pero sin deuda no debe
   * enseñar un cero: hace dudar de si falta algo.
   */
  it('en cero, la segunda linea NO aparece', () => {
    const f = cardFigures(acc({
      type: 'credit', balance: -1_000, secondaryCurrency: 'USD', secondaryBalance: 0,
    }), 'DOP')
    expect(f.secondary).toBeNull()
  })

  it('sin linea extranjera tampoco aparece', () => {
    expect(cardFigures(acc({ type: 'credit', balance: -1_000 }), 'DOP').secondary).toBeNull()
  })

  /*
   * EL CUPO ES UNO SOLO. Con la deuda en pesos al 74% y la de dolares al 7%,
   * una sola barra al 74% diria que queda mas cupo del que hay.
   */
  it('la barra se parte en dos tramos y suman el consumo real', () => {
    const f = cardFigures(acc({
      type: 'credit', balance: -7_400, limit: 10_000,
      secondaryCurrency: 'USD', secondaryBalance: -10,
    }), 'DOP')
    expect(f.usedLocal).toBeCloseTo(0.74, 2)
    expect(f.usedForeign!).toBeGreaterThan(0)
    expect(f.usedLocal! + f.usedForeign!).toBeLessThanOrEqual(1)
  })

  it('sin limite no hay barra ni cupo libre', () => {
    const f = cardFigures(acc({ type: 'credit', balance: -1_000 }), 'DOP')
    expect(f.usedLocal).toBeNull()
    expect(f.free).toBeNull()
  })

  it('el cupo libre nunca baja de cero', () => {
    const f = cardFigures(acc({ type: 'credit', balance: -15_000, limit: 10_000 }), 'DOP')
    expect(f.free).toBe(0)
    expect(f.usedLocal).toBe(1)
  })
})
