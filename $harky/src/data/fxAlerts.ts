import { convertCurrency } from './currencies'
import type { CurrencyCode } from '@/types'

export interface FxAlertConfig {
  enabled: boolean
  /** Divisa vigilada (p.ej. 'USD'). */
  currency: CurrencyCode
  /** Umbral expresado en la moneda base del usuario. */
  threshold: number
  direction: 'above' | 'below'
}

/**
 * ¿La tasa actual de 1 `config.currency` en `baseCurrency` cruza el umbral?
 * Usa las tasas ya sincronizadas (mismo motor que el conversor).
 */
export function fxAlertTriggered(config: FxAlertConfig, baseCurrency: CurrencyCode): boolean {
  if (!config.enabled || config.threshold <= 0 || config.currency === baseCurrency) return false
  const rate = convertCurrency(1, config.currency, baseCurrency)
  return config.direction === 'above' ? rate >= config.threshold : rate <= config.threshold
}

/** Tasa actual de 1 `currency` en `baseCurrency`, redondeada a 2 decimales. */
export function currentRate(currency: CurrencyCode, baseCurrency: CurrencyCode): number {
  return Math.round(convertCurrency(1, currency, baseCurrency) * 100) / 100
}
