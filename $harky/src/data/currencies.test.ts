import { describe, expect, it } from 'vitest'
import { convertCurrency, fmtConversion, getCurrencyMeta, CURRENCIES } from './currencies'

// Nota: usa las tasas semilla de currencies.ts (en tests no corre
// syncExchangeRates, así que son estables).

describe('convertCurrency (conversión multi-moneda)', () => {
  it('misma moneda: identidad exacta', () => {
    expect(convertCurrency(1234.56, 'DOP', 'DOP')).toBe(1234.56)
    expect(convertCurrency(0, 'USD', 'USD')).toBe(0)
  })

  it('USD → DOP y de vuelta (ida y vuelta sin deriva)', () => {
    const dop = convertCurrency(100, 'USD', 'DOP')
    expect(dop).toBeCloseTo(100 * getCurrencyMeta('DOP').rateToUSD, 6)
    expect(convertCurrency(dop, 'DOP', 'USD')).toBeCloseTo(100, 6)
  })

  it('conversión cruzada (EUR → DOP) pasa por USD correctamente', () => {
    const eurRate = getCurrencyMeta('EUR').rateToUSD
    const dopRate = getCurrencyMeta('DOP').rateToUSD
    expect(convertCurrency(50, 'EUR', 'DOP')).toBeCloseTo((50 / eurRate) * dopRate, 6)
  })

  it('ida y vuelta cruzada conserva el monto para todas las monedas', () => {
    for (const { code } of CURRENCIES) {
      const there = convertCurrency(1000, 'DOP', code)
      const back = convertCurrency(there, code, 'DOP')
      expect(back).toBeCloseTo(1000, 6)
    }
  })

  it('montos negativos (deudas) se convierten con signo', () => {
    expect(convertCurrency(-100, 'USD', 'DOP')).toBeCloseTo(-5850, 0)
  })

  it('todas las tasas semilla son positivas y finitas (guarda del conversor)', () => {
    for (const meta of CURRENCIES) {
      expect(Number.isFinite(meta.rateToUSD)).toBe(true)
      expect(meta.rateToUSD).toBeGreaterThan(0)
    }
  })
})

describe('fmtConversion (formato compacto)', () => {
  it('formatea montos pequeños con dos decimales', () => {
    expect(fmtConversion(1, 'USD', 'USD')).toBe('$1.00')
  })

  it('formatea miles con sufijo k', () => {
    expect(fmtConversion(1500, 'USD', 'USD')).toBe('$1.5k')
  })

  it('formatea millones con sufijo M', () => {
    expect(fmtConversion(2_500_000, 'USD', 'USD')).toBe('$2.5M')
  })

  it('convierte antes de formatear (no formatea en la divisa de origen)', () => {
    const dopRate = getCurrencyMeta('DOP').rateToUSD
    expect(fmtConversion(1000, 'USD', 'DOP')).toBe(`RD$${((1000 * dopRate) / 1000).toFixed(1)}k`)
  })
})
