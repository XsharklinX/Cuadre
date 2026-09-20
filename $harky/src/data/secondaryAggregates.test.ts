import { describe, expect, it } from 'vitest'
import {
  accountBalanceInBase, availableBalanceInBase, creditCardsOwedInBase,
  netWorthBreakdown, totalBalanceInBase,
} from './helpers'
import { convertCurrency } from './currencies'
import type { Account } from '@/types'

/**
 * El SEGUNDO LIBRO de una tarjeta en los AGREGADOS.
 *
 * Cuando se añadió el segundo saldo, `accountBalanceInBase` se quedó mirando
 * solo el principal: una deuda de US$312 existía en la ficha de la tarjeta y
 * en ningún total. Patrimonio neto, deuda de tarjetas y totales por grupo la
 * ignoraban, que es la peor forma de equivocarse — el número se ve plausible.
 */

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Visa', short: 'V', type: 'credit', color: '#fff',
  balance: -10_000, last4: '1', limit: 50_000, currency: 'DOP',
  secondaryCurrency: 'USD', secondaryBalance: -300, ...over,
})

const cash = (over: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Efectivo', short: 'E', type: 'cash', color: '#fff',
  balance: 20_000, last4: null, ...over,
})

const USD_DEBT_IN_DOP = convertCurrency(300, 'USD', 'DOP')

describe('saldo de una cuenta en divisa base', () => {
  it('suma la deuda del segundo libro', () => {
    expect(accountBalanceInBase(card(), 'DOP')).toBeCloseTo(-10_000 - USD_DEBT_IN_DOP, 2)
  })

  it('una tarjeta sin segundo libro no cambia', () => {
    const plain = card({ secondaryCurrency: undefined, secondaryBalance: undefined })
    expect(accountBalanceInBase(plain, 'DOP')).toBe(-10_000)
  })

  it('un segundo saldo en cero no mueve nada', () => {
    expect(accountBalanceInBase(card({ secondaryBalance: 0 }), 'DOP')).toBe(-10_000)
  })

  it('si la divisa secundaria ES la base, se suma sin convertir', () => {
    const usdBase = card({ currency: 'USD', secondaryCurrency: 'DOP', secondaryBalance: -500 })
    const primary = convertCurrency(-10_000, 'USD', 'DOP')
    expect(accountBalanceInBase(usdBase, 'DOP')).toBeCloseTo(primary - 500, 2)
  })

  it('una cuenta que no es tarjeta nunca suma un segundo saldo', () => {
    // Aunque un backup corrupto trajera los campos.
    const debit = cash({ type: 'debit', secondaryCurrency: 'USD', secondaryBalance: -999 })
    expect(accountBalanceInBase(debit, 'DOP')).toBe(20_000)
  })
})

describe('agregados que dependen de ello', () => {
  const accounts = [cash(), card()]

  it('el patrimonio neto cuenta la deuda en dólares', () => {
    const total = totalBalanceInBase(accounts, 'DOP')
    expect(total).toBeCloseTo(20_000 - 10_000 - USD_DEBT_IN_DOP, 2)
    // Y NO el número plausible pero equivocado que salía antes.
    expect(total).not.toBeCloseTo(10_000, 2)
  })

  it('el total adeudado en tarjetas la incluye', () => {
    const owed = creditCardsOwedInBase(accounts, 'DOP')
    expect(owed).toBeCloseTo(10_000 + USD_DEBT_IN_DOP, 2)
  })

  it('el dinero disponible sigue sin contar tarjetas', () => {
    // El crédito es dinero del banco: la regla no cambia por tener dos libros.
    expect(availableBalanceInBase(accounts, 'DOP')).toBe(20_000)
  })

  it('el desglose de patrimonio cuadra con sus partes', () => {
    const b = netWorthBreakdown(accounts, 'DOP')
    expect(b.assets - b.liabilities).toBeCloseTo(totalBalanceInBase(accounts, 'DOP'), 2)
  })

  it('una cuenta oculta sigue fuera de los totales', () => {
    const hidden = [cash(), card({ includeInTotal: false })]
    expect(totalBalanceInBase(hidden, 'DOP')).toBe(20_000)
  })

  it('más deuda en dólares siempre baja el patrimonio', () => {
    const poco = totalBalanceInBase([cash(), card({ secondaryBalance: -100 })], 'DOP')
    const mucho = totalBalanceInBase([cash(), card({ secondaryBalance: -900 })], 'DOP')
    expect(mucho).toBeLessThan(poco)
  })
})
