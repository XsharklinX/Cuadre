import { describe, expect, it } from 'vitest'
import {
  availableFromBalance, balanceFromAvailable, balanceFromOwed, owedFromBalance,
} from './creditEntry'
import { creditUsed, creditUtilization } from './creditCard'
import type { Account } from '@/types'

const card = (balance: number, limit = 12_000): Account => ({
  id: 'c1', name: 'Banreservas', short: 'BR', type: 'credit', color: '#fff',
  balance, openingBalance: 0, last4: '7109', limit, currency: 'DOP',
})

describe('deuda y disponible son la misma cifra vista al reves', () => {
  /**
   * EL CASO REAL que lo motivo: el banco muestra "Disponible: RD$ 2,218.55"
   * sobre un cupo de RD$ 12,000, o sea una deuda de RD$ 9,781.45. Antes ese
   * 2,218.55 se guardaba tal cual y la tarjeta quedaba "sin usar".
   */
  it('convierte el disponible del banco en la deuda correcta', () => {
    const balance = balanceFromAvailable(2_218.55, 12_000)
    expect(balance).toBeCloseTo(-9_781.45, 2)
    expect(creditUsed(balance)).toBeCloseTo(9_781.45, 2)
    expect(creditUtilization(card(balance), 'DOP')).toBeCloseTo(0.8151, 3)
  })

  it('y NO deja la tarjeta como si no se hubiera usado', () => {
    const malo = 2_218.55                                  // lo que pasaba antes
    const bueno = balanceFromAvailable(2_218.55, 12_000)   // lo que pasa ahora
    expect(creditUsed(malo)).toBe(0)
    expect(creditUsed(bueno)).toBeGreaterThan(9_000)
  })

  it('ida y vuelta por el disponible no pierde nada', () => {
    for (const owed of [0, 0.01, 1_500, 9_781.45, 12_000]) {
      const balance = balanceFromOwed(owed)
      const available = availableFromBalance(balance, 12_000)
      expect(balanceFromAvailable(available, 12_000)).toBeCloseTo(balance, 6)
    }
  })

  it('ida y vuelta por la deuda tampoco', () => {
    for (const available of [0, 250.75, 2_218.55, 12_000]) {
      const balance = balanceFromAvailable(available, 12_000)
      expect(availableFromBalance(balance, 12_000)).toBeCloseTo(available, 6)
    }
  })

  it('sin deuda, el disponible es el limite entero', () => {
    expect(availableFromBalance(0, 12_000)).toBe(12_000)
  })

  it('al tope, no queda nada disponible', () => {
    expect(availableFromBalance(-12_000, 12_000)).toBe(0)
  })

  it('pasado del limite, el disponible es cero y no negativo', () => {
    expect(availableFromBalance(-15_000, 12_000)).toBe(0)
  })

  /** Un saldo a favor no da mas cupo del que la tarjeta tiene. */
  it('con saldo a favor, el disponible no supera el limite', () => {
    expect(availableFromBalance(3_000, 12_000)).toBe(12_000)
  })

  it('teclear mas disponible que el limite deja la deuda en cero, no a favor', () => {
    expect(balanceFromAvailable(99_999, 12_000)).toBe(0)
  })

  it('teclear un disponible negativo se trata como cero disponible', () => {
    expect(balanceFromAvailable(-500, 12_000)).toBe(-12_000)
  })

  it('la deuda nunca se guarda positiva', () => {
    expect(balanceFromOwed(500)).toBe(-500)
    expect(balanceFromOwed(0)).toBe(0)
    expect(balanceFromOwed(-7)).toBe(0)
  })

  it('owedFromBalance ignora el saldo a favor', () => {
    expect(owedFromBalance(1_000)).toBe(0)
    expect(owedFromBalance(-1_000)).toBe(1_000)
  })
})
