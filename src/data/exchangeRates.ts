import type { CurrencyCode } from '@/types'
import { CURRENCIES as DISPLAY_CURRENCIES } from './currencies'
import { recordRate, type FxSeries } from './fxHistory'

const CODES: CurrencyCode[] = ['DOP', 'USD', 'EUR', 'MXN', 'GBP', 'COP', 'ARS', 'BRL', 'CAD']
const CACHE_KEY = 'sharky-fx-rates-v1'
const TTL_MS = 12 * 60 * 60 * 1000 // refrescar cada 12h

type UsdRates = Partial<Record<CurrencyCode, number>>

interface RatesCache {
  fetchedAt: number
  rates: UsdRates
}

function readCache(): RatesCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as RatesCache) : null
  } catch {
    return null
  }
}

/**
 * EL HISTORIAL, que se construye con lo que ya se descarga.
 *
 * No hay fuente gratuita de serie historica para el peso dominicano (ver
 * `fxHistory.ts`), asi que el grafico del conversor se alimenta apuntando cada
 * descarga. Vive en su propia clave: es prescindible, y si un dia hay que
 * tirarlo no debe arrastrar las tasas vigentes, que si hacen falta para
 * convertir.
 */
const HISTORY_KEY = 'cuadre-fx-history-v1'

export function readFxHistory(): FxSeries {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const value = raw ? JSON.parse(raw) as FxSeries : {}
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

function appendHistory(rates: UsdRates, at: number) {
  try {
    let series = readFxHistory()
    for (const code of CODES) {
      const rate = rates[code]
      if (rate) series = recordRate(series, code, rate, at)
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(series))
  } catch {
    // Sin almacenamiento o cuota llena: el historial es lo prescindible, las
    // tasas vigentes no. Nunca debe impedir que se apliquen.
  }
}

function writeCache(rates: UsdRates) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ fetchedAt: Date.now(), rates }))
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.) — seguimos sin cache
  }
}

async function fetchLiveRates(): Promise<UsdRates | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD')
    if (!res.ok) return null
    const data = await res.json() as { result?: string; rates?: Record<string, number> }
    if (data.result !== 'success' || !data.rates) return null
    const out: UsdRates = {}
    for (const code of CODES) {
      const rate = data.rates[code]
      // Solo tasas positivas y finitas: una tasa 0/negativa/NaN/Infinity de un
      // API defectuoso corrompería TODAS las conversiones (divisiones y saldos
      // multi-moneda) — mejor ignorarla y conservar la anterior.
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) out[code] = rate
    }
    return out
  } catch {
    return null
  }
}

/** Las tasas se guardan como "1 USD = X moneda", relativo a `currencies.ts`. */
function applyRates(rates: UsdRates): boolean {
  let changed = false
  for (const meta of DISPLAY_CURRENCIES) {
    const r = rates[meta.code]
    if (r && meta.rateToUSD !== r) {
      meta.rateToUSD = r
      changed = true
    }
  }
  return changed
}

/** Timestamp de la última descarga de tasas (null si nunca se han descargado). */
export function getRatesFetchedAt(): number | null {
  return readCache()?.fetchedAt ?? null
}

/**
 * Aplica tasas en cache (si hay) y, si están vencidas o no existen, busca tasas frescas.
 *
 * `force` salta el TTL: lo usa el gesto de tirar de la lista, donde el usuario
 * está PIDIENDO tasas nuevas. Sin esto, tirar dentro de las doce horas de vida
 * de la cache no haría absolutamente nada y el gesto parecería roto.
 */
export async function syncExchangeRates(force = false): Promise<boolean> {
  const cached = readCache()
  let changed = cached ? applyRates(cached.rates) : false

  if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) return changed

  const fresh = await fetchLiveRates()
  if (!fresh) return changed

  writeCache(fresh)
  appendHistory(fresh, Date.now())
  return applyRates(fresh) || changed
}
