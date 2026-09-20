import type { NetWorthPoint } from './helpers'

/**
 * Proyecta `monthsAhead` puntos futuros con regresión lineal simple (mínimos
 * cuadrados) sobre la serie histórica — suficiente para una tendencia visual,
 * no pretende ser un forecast financiero sofisticado.
 */
export function projectNetWorth(history: NetWorthPoint[], monthsAhead: number): NetWorthPoint[] {
  if (history.length < 2 || monthsAhead <= 0) return []

  const n = history.length
  const xs = history.map((_, i) => i)
  const ys = history.map(p => p.value)
  const meanX = xs.reduce((s, x) => s + x, 0) / n
  const meanY = ys.reduce((s, y) => s + y, 0) / n
  const numerator = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0)
  const denominator = xs.reduce((s, x) => s + (x - meanX) ** 2, 0)
  const slope = denominator !== 0 ? numerator / denominator : 0
  const intercept = meanY - slope * meanX

  const lastKey = history[n - 1].key
  const [lastYear, lastMonth] = lastKey.split('-').map(Number)

  return Array.from({ length: monthsAhead }, (_, i) => {
    const stepIndex = n + i
    const value = intercept + slope * stepIndex
    const d = new Date(lastYear, lastMonth - 1 + (i + 1), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { key, label: '', value }
  })
}
