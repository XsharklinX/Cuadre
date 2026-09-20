import type { Totals } from '@/types'

/**
 * EL VEREDICTO DE ANÁLISIS.
 *
 * La pantalla de Análisis tenía cinco acordeones cerrados de igual peso. El
 * problema no era el scroll: cinco cajones iguales no son una jerarquía, son
 * una lista de cajones. El usuario tenía que saber de antemano qué buscaba —
 * y si lo supiera, no necesitaría la pantalla.
 *
 * Esto calcula la ÚNICA frase que la pantalla debe responder sin scroll:
 * ¿cómo voy? Todo lo demás es la evidencia de esa frase.
 *
 * Es puro y probado porque es la afirmación más fuerte que hace la app sobre
 * el dinero de alguien; equivocarla en la dirección optimista es el peor
 * error posible.
 */

export type VerdictTone = 'good' | 'neutral' | 'warn' | 'bad'

export interface Verdict {
  tone: VerdictTone
  /** Clave i18n del titular. */
  key: VerdictKey
  /** Sustituciones del titular. */
  params: Record<string, string | number>
  /** La cifra que sostiene la frase. Es el héroe de la pantalla. */
  hero: number
  /** Qué representa `hero`, para etiquetarlo. */
  heroKind: 'net' | 'saved' | 'overspent'
}

export type VerdictKey =
  | 'verdictNoData'
  | 'verdictSpendingMore'
  | 'verdictSpendingLess'
  | 'verdictNegativeNet'
  | 'verdictSteady'
  | 'verdictFirstMonth'

/** Bajo este número de movimientos no hay señal, solo ruido. */
const MIN_TX = 3
/** Variación por debajo de esto es ruido de calendario, no un cambio real. */
const NOISE_PCT = 8

export interface VerdictInput {
  current: Totals
  previous: Totals
  /** Movimientos del período actual: sirve para no opinar sobre nada. */
  txCount: number
  /** true si no hay período anterior con datos (primer mes de uso). */
  noPrevious: boolean
}

export function computeVerdict(input: VerdictInput): Verdict {
  const { current, previous, txCount, noPrevious } = input

  // Sin datos no se opina. Una app que dice "vas bien" sobre dos movimientos
  // está adivinando, y el usuario lo nota.
  if (txCount < MIN_TX) {
    return { tone: 'neutral', key: 'verdictNoData', params: {}, hero: current.net, heroKind: 'net' }
  }

  // Gastar más de lo que entra es el hecho más importante que puede haber, y
  // gana sobre cualquier comparación con el mes pasado.
  if (current.net < 0) {
    return {
      tone: 'bad',
      key: 'verdictNegativeNet',
      params: {},
      hero: Math.abs(current.net),
      heroKind: 'overspent',
    }
  }

  if (noPrevious || previous.expense <= 0) {
    return {
      tone: 'neutral',
      key: 'verdictFirstMonth',
      params: {},
      hero: current.net,
      heroKind: 'saved',
    }
  }

  const change = (current.expense - previous.expense) / previous.expense * 100
  const pct = Math.abs(Math.round(change))

  if (pct < NOISE_PCT) {
    return { tone: 'neutral', key: 'verdictSteady', params: {}, hero: current.net, heroKind: 'saved' }
  }

  return change > 0
    ? { tone: 'warn', key: 'verdictSpendingMore', params: { pct }, hero: current.net, heroKind: 'net' }
    : { tone: 'good', key: 'verdictSpendingLess', params: { pct }, hero: current.net, heroKind: 'saved' }
}

/**
 * Tasa de ahorro del período (0–100). `null` si no entró nada: dividir entre
 * cero daría Infinity, y "ahorraste ∞%" es peor que no decir nada.
 */
export function savingsRate(totals: Totals): number | null {
  if (totals.income <= 0) return null
  return Math.max(0, Math.min(100, totals.net / totals.income * 100))
}
