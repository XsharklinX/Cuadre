import { describe, expect, it } from 'vitest'
import { routeDetectedAmount } from './useBankNotifications'
import { convertCurrency } from '@/data/currencies'
import type { Account } from '@/types'

/**
 * Enrutado de un movimiento DETECTADO por aviso bancario.
 *
 * El aviso trae su propia divisa y antes se ignoraba por completo: un aviso de
 * US$25 creaba un gasto de 25 PESOS. Esto espeja la decisión del flujo manual
 * para que un movimiento automático y uno tecleado den el mismo resultado.
 */

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Visa', short: 'V', type: 'credit', color: '#fff',
  balance: 0, last4: '1234', limit: 50_000, currency: 'DOP', ...over,
})

const USD_TO_DOP = convertCurrency(1, 'USD', 'DOP')

describe('a qué libro va un movimiento detectado', () => {
  it('misma divisa que la cuenta: no se toca nada', () => {
    const out = routeDetectedAmount(card(), 2_000, 'DOP', 'DOP')
    expect(out).toEqual({ amount: 2_000 })
    expect(out.onSecondaryBalance).toBeUndefined()
  })

  it('un aviso en dólares sobre una tarjeta con segundo saldo va al segundo libro SIN convertir', () => {
    const out = routeDetectedAmount(
      card({ secondaryCurrency: 'USD', secondaryBalance: 0 }), 25, 'USD', 'DOP',
    )
    expect(out.amount).toBe(25)
    expect(out.onSecondaryBalance).toBe(true)
    expect(out.fxRate).toBeUndefined()
  })

  it('un aviso en dólares sobre una tarjeta SIN segundo saldo se convierte', () => {
    const out = routeDetectedAmount(card(), 25, 'USD', 'DOP')
    expect(out.amount).toBeCloseTo(25 * USD_TO_DOP, 2)
    expect(out.onSecondaryBalance).toBeUndefined()
    // La tasa queda congelada, igual que en el flujo manual.
    expect(out.fxRate).toBeGreaterThan(0)
    expect(out.originalAmount).toBe(25)
    expect(out.originalCurrency).toBe('USD')
  })

  it('el bug original: 25 dólares nunca se registran como 25 pesos', () => {
    const out = routeDetectedAmount(card(), 25, 'USD', 'DOP')
    expect(out.amount).not.toBe(25)
  })

  it('un aviso en pesos sobre una tarjeta en dólares se convierte a dólares', () => {
    const out = routeDetectedAmount(card({ currency: 'USD' }), 1_540, 'DOP', 'DOP')
    expect(out.amount).toBeCloseTo(convertCurrency(1_540, 'DOP', 'USD'), 2)
  })

  it('un aviso en pesos sobre una tarjeta con segundo saldo en dólares va al libro principal', () => {
    // La divisa coincide con la PRINCIPAL, no con la secundaria.
    const out = routeDetectedAmount(
      card({ secondaryCurrency: 'USD', secondaryBalance: 0 }), 2_000, 'DOP', 'DOP',
    )
    expect(out.amount).toBe(2_000)
    expect(out.onSecondaryBalance).toBeUndefined()
  })

  it('una cuenta de débito nunca recibe el marcador de segundo libro', () => {
    const debit = card({ type: 'debit', secondaryCurrency: 'USD' })
    const out = routeDetectedAmount(debit, 25, 'USD', 'DOP')
    expect(out.onSecondaryBalance).toBeUndefined()
    expect(out.amount).toBeCloseTo(25 * USD_TO_DOP, 2)
  })

  it('una cuenta sin divisa propia usa la base de la app', () => {
    const plain = card({ currency: undefined })
    const out = routeDetectedAmount(plain, 25, 'USD', 'DOP')
    expect(out.amount).toBeCloseTo(25 * USD_TO_DOP, 2)
  })
})
