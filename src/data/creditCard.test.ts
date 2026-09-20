import { describe, expect, it } from 'vitest'
import {
  creditCardsAsDebts, creditCycle, creditUsed, creditUtilization, hasSecondaryBalance,
  minimumPayment, nextMonthDay, projectMinimumPayoff, utilizationBand,
} from './creditCard'
import { sanitizeFinanceData } from '@/store/finance'
import type { Account } from '@/types'

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Visa', short: 'V', type: 'credit',
  color: '#fff', balance: -10_000, last4: '1234', limit: 50_000, ...over,
})

describe('deuda y utilización', () => {
  it('lee la deuda como número positivo', () => {
    expect(creditUsed(-10_000)).toBe(10_000)
  })

  it('un saldo a favor no es deuda negativa', () => {
    expect(creditUsed(500)).toBe(0)
  })

  it('sin límite configurado no hay utilización que mostrar', () => {
    // null, no 0: "no sé" y "cero por ciento" son cosas distintas.
    expect(creditUtilization(card({ limit: undefined }))).toBeNull()
  })

  it('nunca pasa de 100% aunque la deuda exceda el límite', () => {
    expect(creditUtilization(card({ balance: -60_000, limit: 50_000 }))).toBe(1)
  })

  it('el tramo de aviso arranca en 30%, no cerca del límite', () => {
    expect(utilizationBand(0.29)).toBe('ok')
    expect(utilizationBand(0.30)).toBe('watch')
    expect(utilizationBand(0.74)).toBe('watch')
    expect(utilizationBand(0.75)).toBe('high')
  })
})

describe('ciclo de corte', () => {
  it('un corte día 31 no se salta febrero', () => {
    // El bug clásico: setMonth(+1) sobre un día 31 desborda 31-ene a 3-mar.
    expect(nextMonthDay(31, new Date(2026, 1, 1))).toBe('2026-02-28')
  })

  it('recorta al último día real de un mes de 30', () => {
    expect(nextMonthDay(31, new Date(2026, 3, 1))).toBe('2026-04-30')
  })

  it('respeta el año bisiesto', () => {
    expect(nextMonthDay(30, new Date(2024, 1, 1))).toBe('2024-02-29')
  })

  it('si el día ya pasó este mes, salta al siguiente', () => {
    expect(nextMonthDay(5, new Date(2026, 8, 19))).toBe('2026-10-05')
  })

  it('el día de hoy cuenta como próxima ocurrencia', () => {
    expect(nextMonthDay(19, new Date(2026, 8, 19))).toBe('2026-09-19')
  })

  it('rechaza días imposibles', () => {
    for (const bad of [0, 32, -1, 1.5, Number.NaN]) {
      expect(nextMonthDay(bad), `day=${bad}`).toBeNull()
    }
  })

  it('marca el pago como próximo dentro de 5 días', () => {
    const cycle = creditCycle(card({ paymentDay: 22 }), new Date(2026, 8, 19))
    expect(cycle.daysToPayment).toBe(3)
    expect(cycle.paymentSoon).toBe(true)
  })

  it('no marca como próximo un pago a más de 5 días', () => {
    const cycle = creditCycle(card({ paymentDay: 28 }), new Date(2026, 8, 19))
    expect(cycle.paymentSoon).toBe(false)
  })

  it('sin días configurados devuelve nulos, no fechas inventadas', () => {
    const cycle = creditCycle(card())
    expect(cycle.statementDate).toBeNull()
    expect(cycle.paymentDate).toBeNull()
    expect(cycle.daysToPayment).toBeNull()
  })
})

describe('pago mínimo', () => {
  it('calcula el porcentaje sobre la deuda viva', () => {
    expect(minimumPayment(card({ balance: -10_000, minPaymentPct: 10 }))).toBe(1_000)
  })

  it('el piso gana cuando el porcentaje queda corto', () => {
    expect(minimumPayment(card({ balance: -1_000, minPaymentPct: 5, minPaymentFloor: 500 }))).toBe(500)
  })

  it('el piso nunca pide más que la deuda entera', () => {
    expect(minimumPayment(card({ balance: -200, minPaymentPct: 5, minPaymentFloor: 500 }))).toBe(200)
  })

  it('sin deuda el mínimo es cero, no null', () => {
    expect(minimumPayment(card({ balance: 0, minPaymentPct: 10 }))).toBe(0)
  })

  it('sin porcentaje configurado no se inventa un mínimo', () => {
    expect(minimumPayment(card({ minPaymentPct: undefined }))).toBeNull()
  })
})

describe('proyección de pagar solo el mínimo', () => {
  it('sin tasa configurada no proyecta nada', () => {
    expect(projectMinimumPayoff(card({ apr: undefined, minPaymentPct: 10 }))).toBeNull()
  })

  it('la cola es larga porque el mínimo baja con el saldo', () => {
    const p = projectMinimumPayoff(card({ balance: -18_430, apr: 24, minPaymentPct: 10 }))!
    expect(p.never).toBe(false)
    // Mucho más de los ~10 meses que sugiere "10% mensual": ese es el dato
    // que el usuario no intuye y que justifica mostrar la proyección.
    expect(p.months).toBeGreaterThan(24)
    expect(p.totalInterest).toBeGreaterThan(0)
  })

  it('avisa cuando el mínimo no cubre ni el interés', () => {
    // 60% anual = 5% mensual, con mínimo del 3%: la deuda crece sola.
    const p = projectMinimumPayoff(card({ balance: -50_000, apr: 60, minPaymentPct: 3 }))!
    expect(p.never).toBe(true)
  })

  it('una tarjeta saldada no proyecta interés', () => {
    const p = projectMinimumPayoff(card({ balance: 0, apr: 24, minPaymentPct: 10 }))!
    expect(p).toEqual({ months: 0, totalInterest: 0, never: false })
  })

  it('pagar más rápido cuesta menos interés', () => {
    const lento = projectMinimumPayoff(card({ balance: -20_000, apr: 24, minPaymentPct: 5 }))!
    const rapido = projectMinimumPayoff(card({ balance: -20_000, apr: 24, minPaymentPct: 20 }))!
    expect(rapido.months).toBeLessThan(lento.months)
    expect(rapido.totalInterest).toBeLessThan(lento.totalInterest)
  })
})

describe('segundo saldo', () => {
  it('se reconoce por la divisa, no por el monto', () => {
    // Una tarjeta en dólares recién configurada tiene saldo 0 y SIGUE siendo
    // de dos divisas.
    expect(hasSecondaryBalance(card({ secondaryCurrency: 'USD', secondaryBalance: 0 }))).toBe(true)
    expect(hasSecondaryBalance(card())).toBe(false)
  })

  it('una cuenta que no es de crédito nunca tiene segundo saldo', () => {
    expect(hasSecondaryBalance(card({ type: 'debit', secondaryCurrency: 'USD' }))).toBe(false)
  })
})

describe('saneado de los campos de tarjeta', () => {
  const load = (over: Partial<Account>) => sanitizeFinanceData({
    accounts: [card(over)], transactions: [], categories: [], goals: [],
    goalContributions: [], currency: 'DOP',
  }).accounts[0]

  it('conserva un ciclo y una tasa válidos', () => {
    const a = load({ statementDay: 25, paymentDay: 14, apr: 24, minPaymentPct: 10 })
    expect(a.statementDay).toBe(25)
    expect(a.paymentDay).toBe(14)
    expect(a.apr).toBe(24)
  })

  it('borra un día de corte imposible en vez de corregirlo', () => {
    // Corregir 45 a 31 inventaría una fecha que el usuario nunca puso.
    expect(load({ statementDay: 45 }).statementDay).toBeUndefined()
  })

  it('borra tasas absurdas', () => {
    expect(load({ apr: -5 }).apr).toBeUndefined()
    expect(load({ apr: 500 }).apr).toBeUndefined()
  })

  it('descarta el segundo saldo si no trae divisa', () => {
    const a = load({ secondaryBalance: -300, secondaryCurrency: undefined })
    expect(a.secondaryBalance).toBeUndefined()
  })

  it('descarta un segundo saldo en la MISMA divisa de la tarjeta', () => {
    const a = load({ currency: 'DOP', secondaryCurrency: 'DOP', secondaryBalance: -300 })
    expect(a.secondaryCurrency).toBeUndefined()
  })

  it('un segundo saldo con divisa válida pero sin monto arranca en cero', () => {
    const a = load({ secondaryCurrency: 'USD', secondaryBalance: undefined })
    expect(a.secondaryCurrency).toBe('USD')
    expect(a.secondaryBalance).toBe(0)
  })

  it('quita los campos de tarjeta de una cuenta que no es de crédito', () => {
    const a = load({ type: 'debit', apr: 24, statementDay: 25, secondaryCurrency: 'USD' })
    expect(a.apr).toBeUndefined()
    expect(a.statementDay).toBeUndefined()
    expect(a.secondaryCurrency).toBeUndefined()
  })
})

describe('puente tarjeta → simulador de deuda', () => {
  const debit: Account = {
    id: 'd1', name: 'Nomina', short: 'N', type: 'debit',
    color: '#fff', balance: 5_000, last4: null,
  }

  it('solo entran tarjetas CON deuda y CON tasa', () => {
    const out = creditCardsAsDebts([
      debit,
      card({ id: 'sin-tasa', balance: -5_000, apr: undefined }),
      card({ id: 'sin-deuda', balance: 0, apr: 24 }),
      card({ id: 'valida', balance: -5_000, apr: 24, minPaymentPct: 10 }),
    ])
    expect(out.map(d => d.id)).toEqual(['card:valida'])
  })

  it('la deuda entra positiva y con la tasa de la tarjeta', () => {
    const [d] = creditCardsAsDebts([card({ balance: -8_000, apr: 30, minPaymentPct: 10 })])
    expect(d.balance).toBe(8_000)
    expect(d.rate).toBe(30)
    expect(d.minPayment).toBe(800)
  })

  it('suma las dos divisas de la tarjeta en una sola deuda', () => {
    // El simulador razona sobre UNA deuda por tarjeta: son el mismo limite y
    // el mismo interes, aunque el banco las liquide por separado.
    const [d] = creditCardsAsDebts([card({
      balance: -10_000, apr: 24, minPaymentPct: 10,
      secondaryCurrency: 'USD', secondaryBalance: -100,
    })])
    expect(d.balance).toBeGreaterThan(10_000)
  })

  it('sin minimo configurado asume 5%, que solo afecta la velocidad simulada', () => {
    const [d] = creditCardsAsDebts([card({ balance: -10_000, apr: 24, minPaymentPct: undefined })])
    expect(d.minPayment).toBe(500)
  })

  it('el id lleva prefijo para que la UI sepa que no se edita a mano', () => {
    const [d] = creditCardsAsDebts([card({ id: 'abc', balance: -1_000, apr: 24 })])
    expect(d.id).toBe('card:abc')
    expect(d.fromAccountId).toBe('abc')
  })

  it('no inventa un saldo original: el progreso de una tarjeta arranca en cero', () => {
    const [d] = creditCardsAsDebts([card({ balance: -1_000, apr: 24 })])
    expect(d.originalBalance).toBeUndefined()
  })
})

describe('utilización con dos divisas', () => {
  it('cuenta ambas deudas contra el mismo límite', () => {
    // Solo-local diria 20%; la tarjeta de verdad esta mucho mas arriba.
    const soloLocal = creditUtilization(card({ balance: -10_000, limit: 50_000 }))!
    const conDolares = creditUtilization(card({
      balance: -10_000, limit: 50_000, secondaryCurrency: 'USD', secondaryBalance: -400,
    }))!
    expect(soloLocal).toBeCloseTo(0.2, 2)
    expect(conDolares).toBeGreaterThan(soloLocal)
  })

  it('una segunda divisa en cero no mueve la utilización', () => {
    const sin = creditUtilization(card({ balance: -10_000, limit: 50_000 }))!
    const con = creditUtilization(card({
      balance: -10_000, limit: 50_000, secondaryCurrency: 'USD', secondaryBalance: 0,
    }))!
    expect(con).toBe(sin)
  })
})
