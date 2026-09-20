import { describe, expect, it } from 'vitest'
import { debtProgress, monthlyPaymentPlan, payoffTargetId, freedomDate, simulatePayoff, type Debt } from './debt'

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Tarjeta', balance: 10000, rate: 24, minPayment: 500, color: '#fff', ...over,
})

describe('debtProgress', () => {
  it('es 0 cuando el saldo iguala al original', () => {
    expect(debtProgress(debt({ balance: 10000, originalBalance: 10000 }))).toBe(0)
  })
  it('refleja la fracción pagada', () => {
    expect(debtProgress(debt({ balance: 4000, originalBalance: 10000 }))).toBeCloseTo(0.6)
  })
  it('sin original arranca en 0 (original = saldo actual)', () => {
    expect(debtProgress(debt({ balance: 4000, originalBalance: undefined }))).toBe(0)
  })
})

describe('payoffTargetId', () => {
  const small = debt({ id: 'small', balance: 2000, rate: 15 })
  const big = debt({ id: 'big', balance: 50000, rate: 30 })

  it('impulso ataca el menor saldo', () => {
    expect(payoffTargetId([small, big], 'snowball')).toBe('small')
  })
  it('menos intereses ataca la mayor tasa', () => {
    expect(payoffTargetId([small, big], 'avalanche')).toBe('big')
  })
  it('ignora deudas ya saldadas', () => {
    expect(payoffTargetId([debt({ id: 'paid', balance: 0 }), big], 'snowball')).toBe('big')
  })
})

describe('monthlyPaymentPlan', () => {
  it('todas pagan el mínimo y solo la objetivo recibe el extra', () => {
    const a = debt({ id: 'a', balance: 2000, rate: 10, minPayment: 200 })
    const b = debt({ id: 'b', balance: 8000, rate: 25, minPayment: 400 })
    const plan = monthlyPaymentPlan([a, b], 1000, 'avalanche')
    const byId = Object.fromEntries(plan.map(p => [p.id, p]))
    expect(byId.a.amount).toBe(200)              // solo mínimo
    expect(byId.b.amount).toBe(1400)             // mínimo + extra (mayor tasa)
    expect(byId.b.isTarget).toBe(true)
  })
})

describe('freedomDate', () => {
  it('suma los meses a la fecha base', () => {
    expect(freedomDate(15, new Date(2026, 6, 10))).toBe('2027-10-01')
  })
  it('devuelve null si no termina (0 o >50 años)', () => {
    expect(freedomDate(0)).toBeNull()
    expect(freedomDate(600)).toBeNull()
  })
})

describe('simulatePayoff + registrar pago (integración de progreso)', () => {
  it('el extra reduce los meses de pago', () => {
    const d = [debt({ balance: 20000, rate: 30, minPayment: 500 })]
    const withExtra = simulatePayoff(d, 2000, 'avalanche').months
    const without = simulatePayoff(d, 0, 'avalanche').months
    expect(withExtra).toBeLessThan(without)
  })
})
