import { describe, expect, it } from 'vitest'
import { netWorthBreakdown, netWorthValue, type ManualDebt } from './helpers'
import type { Account } from '@/types'

const cash = (balance: number): Account => ({
  id: 'a1', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance, openingBalance: balance, last4: null,
})

const card = (balance: number): Account => ({
  id: 'c1', name: 'Visa', short: 'Visa', type: 'credit', color: '#fff',
  balance, openingBalance: 0, last4: '7109', limit: 30_000,
})

const debt = (over: Partial<ManualDebt> = {}): ManualDebt => ({ balance: 0, ...over })

describe('patrimonio neto', () => {
  it('activos menos pasivos de las cuentas', () => {
    const r = netWorthBreakdown([cash(20_000), card(-5_000)], 'DOP')
    expect(r.assets).toBe(20_000)
    expect(r.liabilities).toBe(5_000)
    expect(netWorthValue([cash(20_000), card(-5_000)], 'DOP')).toBe(15_000)
  })

  /*
   * EL FALLO QUE HABIA: registrabas un prestamo de vehiculo de RD$ 200.000 en
   * la pantalla de Deudas y tu patrimonio no se movia ni un peso. La cifra
   * decia "patrimonio" y era "saldo de mis cuentas".
   */
  it('una deuda registrada a mano SI resta', () => {
    const r = netWorthBreakdown([cash(20_000)], 'DOP', [debt({ balance: 200_000 })])
    expect(r.liabilities).toBe(200_000)
    expect(netWorthValue([cash(20_000)], 'DOP', [debt({ balance: 200_000 })])).toBe(-180_000)
  })

  /** Lo que te deben es un activo: te lo van a devolver. */
  it('lo que te deben suma', () => {
    const r = netWorthBreakdown([cash(10_000)], 'DOP', [debt({ balance: 5_000, direction: 'lent' })])
    expect(r.assets).toBe(15_000)
    expect(r.liabilities).toBe(0)
  })

  it('las dos direcciones a la vez', () => {
    const r = netWorthBreakdown([cash(10_000)], 'DOP', [
      debt({ balance: 30_000 }),
      debt({ balance: 4_000, direction: 'lent' }),
    ])
    expect(r.assets).toBe(14_000)
    expect(r.liabilities).toBe(30_000)
  })

  it('una deuda saldada no cuenta', () => {
    const r = netWorthBreakdown([cash(10_000)], 'DOP', [debt({ balance: 0 }), debt({ balance: -3 })])
    expect(r.liabilities).toBe(0)
    expect(r.assets).toBe(10_000)
  })

  it('convierte una deuda en otra divisa', () => {
    const r = netWorthBreakdown([cash(0)], 'DOP', [debt({ balance: 100, currency: 'USD' })])
    // No se fija la tasa: basta con que NO se cuente como 100 pesos.
    expect(r.liabilities).toBeGreaterThan(1_000)
  })

  /** Sin deudas registradas, el resultado es el de siempre. */
  it('sin deudas se comporta como antes', () => {
    expect(netWorthBreakdown([cash(20_000)], 'DOP')).toEqual(netWorthBreakdown([cash(20_000)], 'DOP', []))
  })
})
