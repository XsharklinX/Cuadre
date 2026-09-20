import { describe, expect, it } from 'vitest'
import { fxAlertTriggered, currentRate } from './fxAlerts'
import { getCurrencyMeta } from './currencies'

describe('fxAlertTriggered', () => {
  const dopRate = getCurrencyMeta('DOP').rateToUSD // 1 USD = X DOP

  it('dispara "above" cuando la tasa alcanza o supera el umbral', () => {
    const cfg = { enabled: true, currency: 'USD' as const, threshold: dopRate - 1, direction: 'above' as const }
    expect(fxAlertTriggered(cfg, 'DOP')).toBe(true)
  })

  it('no dispara "above" cuando la tasa está por debajo del umbral', () => {
    const cfg = { enabled: true, currency: 'USD' as const, threshold: dopRate + 5, direction: 'above' as const }
    expect(fxAlertTriggered(cfg, 'DOP')).toBe(false)
  })

  it('dispara "below" cuando la tasa cae al umbral o menos', () => {
    const cfg = { enabled: true, currency: 'USD' as const, threshold: dopRate + 1, direction: 'below' as const }
    expect(fxAlertTriggered(cfg, 'DOP')).toBe(true)
  })

  it('no dispara si está deshabilitada', () => {
    const cfg = { enabled: false, currency: 'USD' as const, threshold: 1, direction: 'above' as const }
    expect(fxAlertTriggered(cfg, 'DOP')).toBe(false)
  })

  it('no dispara con umbral 0 o negativo (sin configurar)', () => {
    const cfg = { enabled: true, currency: 'USD' as const, threshold: 0, direction: 'above' as const }
    expect(fxAlertTriggered(cfg, 'DOP')).toBe(false)
  })

  it('no dispara si la divisa vigilada es la misma que la base', () => {
    const cfg = { enabled: true, currency: 'DOP' as const, threshold: 1, direction: 'above' as const }
    expect(fxAlertTriggered(cfg, 'DOP')).toBe(false)
  })
})

describe('currentRate', () => {
  it('devuelve la tasa 1 USD = X DOP redondeada a 2 decimales', () => {
    expect(currentRate('USD', 'DOP')).toBeCloseTo(getCurrencyMeta('DOP').rateToUSD, 1)
  })

  it('misma moneda: tasa 1', () => {
    expect(currentRate('USD', 'USD')).toBe(1)
  })
})
