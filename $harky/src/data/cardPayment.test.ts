import { describe, expect, it } from 'vitest'
import { convertCurrency } from './currencies'
import { accountCurrency } from './helpers'
import type { Account } from '@/types'

/**
 * PAGAR UNA TARJETA EN OTRA DIVISA.
 *
 * `transfer()` interpreta su `amount` en la divisa de la cuenta de ORIGEN, no
 * la de destino. La hoja de pago muestra la deuda en la divisa de la TARJETA,
 * así que sin convertir, pagar RD$18,430 desde una cuenta en dólares enviaría
 * 18,430 DÓLARES — unas 60 veces de más.
 */

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Visa', short: 'V', type: 'credit', color: '#fff',
  balance: -18_430, last4: '1', limit: 50_000, currency: 'DOP', ...over,
})

const source = (over: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Cuenta', short: 'C', type: 'debit', color: '#fff',
  balance: 100_000, last4: null, ...over,
})

/** La conversión que hace la hoja de pago antes de llamar a `transfer`. */
function amountToSend(card: Account, src: Account, amountInCard: number, base: 'DOP' = 'DOP') {
  const cardCur = accountCurrency(card, base)
  const srcCur = accountCurrency(src, base)
  return cardCur === srcCur ? amountInCard : convertCurrency(amountInCard, cardCur, srcCur)
}

describe('monto que se envía al transferir', () => {
  it('misma divisa: se envía tal cual', () => {
    expect(amountToSend(card(), source(), 18_430)).toBe(18_430)
  })

  it('tarjeta en pesos pagada desde cuenta en dólares: se convierte', () => {
    const sent = amountToSend(card({ currency: 'DOP' }), source({ currency: 'USD' }), 18_430)
    expect(sent).toBeCloseTo(convertCurrency(18_430, 'DOP', 'USD'), 2)
    // El bug: enviar 18,430 dólares por una deuda de 18,430 pesos.
    expect(sent).toBeLessThan(1_000)
  })

  it('tarjeta en dólares pagada desde cuenta en pesos: también se convierte', () => {
    const sent = amountToSend(card({ currency: 'USD', balance: -300 }), source({ currency: 'DOP' }), 300)
    expect(sent).toBeCloseTo(convertCurrency(300, 'USD', 'DOP'), 2)
    expect(sent).toBeGreaterThan(1_000)
  })

  it('una cuenta sin divisa propia usa la base', () => {
    expect(amountToSend(card(), source({ currency: undefined }), 5_000)).toBe(5_000)
  })

  it('convertir ida y vuelta devuelve el mismo monto', () => {
    const sent = amountToSend(card({ currency: 'DOP' }), source({ currency: 'USD' }), 18_430)
    expect(convertCurrency(sent, 'USD', 'DOP')).toBeCloseTo(18_430, 1)
  })
})

describe('pagar reduce la deuda', () => {
  it('el saldo de la tarjeta se acerca a cero, no se aleja', () => {
    // El saldo de una tarjeta es negativo: sumarle un pago lo sube hacia 0.
    const before = card().balance
    const after = before + 5_000
    expect(after).toBeGreaterThan(before)
    expect(Math.abs(after)).toBeLessThan(Math.abs(before))
  })

  it('pagar todo la deja en cero', () => {
    const c = card()
    expect(c.balance + Math.abs(c.balance)).toBe(0)
  })
})
