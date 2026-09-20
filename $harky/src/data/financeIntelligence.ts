import { byCategory, monthKey, monthlySeries, totals, txForMonth } from '@/data/helpers'
import type { Category, Transaction } from '@/types'

export interface SubscriptionInsight {
  merchant: string
  amount: number
  categoryId?: string
  accountId?: string
  months: number
  confidence: number
  lastDate: string
  alreadyRecurring: boolean
  /** Presente si el último cargo subió respecto al anterior — el aviso de «te subieron el precio». */
  priceIncrease?: { from: number; to: number; pct: number }
}

/**
 * Detecta si el cargo más reciente de una serie subió respecto al anterior.
 * Umbral del 5% (y ≥1 en valor absoluto) para no marcar redondeos o pequeñas
 * variaciones de cambio de divisa como una subida de precio real.
 */
function detectPriceIncrease(rows: { amount: number; date: string }[]): SubscriptionInsight['priceIncrease'] {
  const byDate = [...rows].sort((a, b) => a.date.localeCompare(b.date))
  const latest = byDate[byDate.length - 1]
  const prev = byDate[byDate.length - 2]
  if (!latest || !prev) return undefined
  if (latest.amount > prev.amount * 1.05 && latest.amount - prev.amount >= 1) {
    return { from: prev.amount, to: latest.amount, pct: Math.round((latest.amount / prev.amount - 1) * 100) }
  }
  return undefined
}

/**
 * Identidad estable de una sugerencia de suscripción, para recordar que el
 * usuario ya la rechazó. Vive aquí y no en una vista porque la misma
 * sugerencia se muestra en dos pantallas (Suscripciones y Análisis) y
 * rechazarla en una debe valer para la otra.
 */
export function subscriptionInsightKey(item: Pick<SubscriptionInsight, 'merchant' | 'categoryId' | 'accountId'>): string {
  return `${item.merchant}|${item.categoryId ?? ''}|${item.accountId ?? ''}`
}

export interface CashflowProjection {
  horizonDays: 30 | 60 | 90
  projectedNet: number
  projectedBalance: number
}

export interface SpendingAnomaly {
  tx: Transaction
  baseline: number
  multiplier: number
  reason: string
}

export interface TrendInsight {
  label: string
  amount: number
  delta: number
  /** Promedio de los 3 meses anteriores contra el que se compara `delta` — la "formula" del insight. */
  previousAvg: number
  kind: 'merchant' | 'category' | 'tag'
}

export interface FinancialIntelligence {
  subscriptions: SubscriptionInsight[]
  projections: CashflowProjection[]
  anomalies: SpendingAnomaly[]
  trends: TrendInsight[]
  recommendedMonthlySavings: number
  monthlyActions: string[]
}

export type AnomalySensitivity = 'strict' | 'balanced' | 'relaxed'

const ANOMALY_SETTINGS: Record<AnomalySensitivity, { multiplier: number; deviations: number; minAmount: number }> = {
  strict: { multiplier: 1.45, deviations: 1.5, minAmount: 300 },
  balanced: { multiplier: 1.75, deviations: 2, minAmount: 500 },
  relaxed: { multiplier: 2.25, deviations: 2.7, minAmount: 800 },
}

function normalizeMerchant(note: string): string {
  return note
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(?:pago|compra|consumo|pos|visa|mastercard|rd|dop|ref|aut)\b/gi, ' ')
    .replace(/[0-9#*_.:/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .split(' ')
    .slice(0, 4)
    .join(' ') || 'movimiento'
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function standardDeviation(values: number[]): number {
  const avg = average(values)
  return Math.sqrt(average(values.map(value => (value - avg) ** 2)))
}

function lastMonthsFrom(mkey: string, count: number): string[] {
  const [year, month] = mkey.split('-').map(Number)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(year, month - 1 - index, 1)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }).reverse()
}

export function detectSubscriptions(txns: Transaction[], mkey: string): SubscriptionInsight[] {
  const months = lastMonthsFrom(mkey, 12)
  const groups = new Map<string, Transaction[]>()
  txns
    .filter(tx => tx.type === 'expense' && months.includes(monthKey(tx.date)))
    .forEach(tx => {
      const key = `${normalizeMerchant(tx.note)}|${tx.categoryId ?? ''}|${tx.accountId ?? ''}`
      groups.set(key, [...(groups.get(key) ?? []), tx])
    })

  return Array.from(groups.entries()).flatMap(([key, rows]) => {
    const distinctMonths = new Set(rows.map(tx => monthKey(tx.date)))
    const amounts = rows.map(tx => tx.amount)
    const avg = average(amounts)
    const recurringFlag = rows.some(tx => tx.recurring)
    // La varianza sirve para descartar gasto irregular que no es suscripción.
    // Pero una suscripción a la que le SUBIERON el precio también dispara la
    // varianza — y es justo la que más interesa avisar. Por eso la varianza se
    // mide sobre los cargos previos (sin el último): si el histórico era
    // estable, un salto reciente no la descalifica, solo la marca como subida.
    const byDate = [...rows].sort((a, b) => a.date.localeCompare(b.date))
    const priorAmounts = byDate.length >= 3 ? byDate.slice(0, -1).map(tx => tx.amount) : amounts
    const priorAvg = average(priorAmounts)
    const variance = priorAvg ? standardDeviation(priorAmounts) / priorAvg : 1
    if (distinctMonths.size < 3 && !recurringFlag) return []
    if (variance > 0.18 && !recurringFlag) return []
    const [merchant, categoryId, accountId] = key.split('|')
    return [{
      merchant,
      amount: avg,
      categoryId: categoryId || undefined,
      accountId: accountId || undefined,
      months: distinctMonths.size,
      confidence: Math.min(98, Math.round((distinctMonths.size / 6) * 70 + (recurringFlag ? 25 : 0) + (1 - variance) * 20)),
      lastDate: rows.map(tx => tx.date).sort()[rows.length - 1] ?? '',
      alreadyRecurring: recurringFlag,
      priceIncrease: detectPriceIncrease(rows),
    }]
  }).sort((a, b) => b.confidence - a.confidence || b.amount - a.amount).slice(0, 6)
}

export function projectCashflow(txns: Transaction[], mkey: string, currentBalance: number): CashflowProjection[] {
  const historyMonths = lastMonthsFrom(mkey, 3)
  const history = historyMonths.map(key => totals(txForMonth(txns, key)))
  const avgMonthlyIncome = average(history.map(item => item.income))
  const avgMonthlyExpense = average(history.map(item => item.expense))
  const avgMonthlyNet = avgMonthlyIncome - avgMonthlyExpense
  return ([30, 60, 90] as const).map(horizonDays => {
    const factor = horizonDays / 30
    const projectedNet = avgMonthlyNet * factor
    return { horizonDays, projectedNet, projectedBalance: currentBalance + projectedNet }
  })
}

export function detectSpendingAnomalies(txns: Transaction[], mkey: string, sensitivity: AnomalySensitivity = 'balanced'): SpendingAnomaly[] {
  const setting = ANOMALY_SETTINGS[sensitivity]
  const historyMonths = lastMonthsFrom(mkey, 6)
  const monthTx = txForMonth(txns, mkey).filter(tx => tx.type === 'expense')
  const history = txns.filter(tx => tx.type === 'expense' && historyMonths.includes(monthKey(tx.date)) && monthKey(tx.date) !== mkey)

  return monthTx.flatMap(tx => {
    const peerGroup = history.filter(item => item.categoryId === tx.categoryId || normalizeMerchant(item.note) === normalizeMerchant(tx.note))
    if (peerGroup.length < 3) return []
    const baseline = average(peerGroup.map(item => item.amount))
    const deviation = standardDeviation(peerGroup.map(item => item.amount))
    const threshold = Math.max(baseline * setting.multiplier, baseline + deviation * setting.deviations)
    if (tx.amount < threshold || tx.amount < setting.minAmount) return []
    return [{ tx, baseline, multiplier: baseline ? tx.amount / baseline : 0, reason: `${normalizeMerchant(tx.note)} supera su patron habitual` }]
  }).sort((a, b) => b.multiplier - a.multiplier).slice(0, 5)
}

export function computeTrends(txns: Transaction[], categories: Category[], mkey: string): TrendInsight[] {
  const current = txForMonth(txns, mkey).filter(tx => tx.type === 'expense')
  const previousKeys = lastMonthsFrom(mkey, 4).slice(0, 3)
  const previous = txns.filter(tx => tx.type === 'expense' && previousKeys.includes(monthKey(tx.date)))
  const build = (rows: Transaction[], selector: (tx: Transaction) => string | undefined) => {
    const map = new Map<string, number>()
    rows.forEach(tx => {
      const key = selector(tx)
      if (!key) return
      map.set(key, (map.get(key) ?? 0) + tx.amount)
    })
    return map
  }
  const currentMerchants = build(current, tx => normalizeMerchant(tx.note))
  const previousMerchants = build(previous, tx => normalizeMerchant(tx.note))
  const currentTags = build(current, tx => tx.tags?.[0])
  const previousTags = build(previous, tx => tx.tags?.[0])
  const previousCategories = build(previous, tx => tx.categoryId)
  const categoryData = byCategory(current, 'expense', categories)

  const merchantTrends = Array.from(currentMerchants.entries()).map(([label, amount]) => {
    const previousAvg = (previousMerchants.get(label) ?? 0) / 3
    return { label, amount, delta: amount - previousAvg, previousAvg, kind: 'merchant' as const }
  })
  const tagTrends = Array.from(currentTags.entries()).map(([label, amount]) => {
    const previousAvg = (previousTags.get(label) ?? 0) / 3
    return { label: `#${label}`, amount, delta: amount - previousAvg, previousAvg, kind: 'tag' as const }
  })
  // Antes: delta = amount (no comparaba con nada, solo ordenaba por gasto total).
  // Ahora compara contra el promedio de los 3 meses anteriores, igual que
  // comerciantes/tags — así "tendencia" refleja un cambio real, no solo el monto.
  const categoryTrends = categoryData.map(item => {
    const previousAvg = (previousCategories.get(item.category.id) ?? 0) / 3
    return { label: item.category.name, amount: item.amount, delta: item.amount - previousAvg, previousAvg, kind: 'category' as const }
  })

  return [...merchantTrends, ...tagTrends, ...categoryTrends]
    .filter(item => item.amount > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 8)
}

export function generateFinancialIntelligence(params: {
  txns: Transaction[]
  categories: Category[]
  mkey: string
  currentBalance: number
  anomalySensitivity?: AnomalySensitivity
}): FinancialIntelligence {
  const { txns, categories, mkey, currentBalance, anomalySensitivity = 'balanced' } = params
  const months = monthlySeries(txns, Number(mkey.slice(0, 4))).filter(month => month.key <= mkey)
  const activeMonths = months.filter(month => month.income > 0 || month.expense > 0).slice(-3)
  const avgIncome = average(activeMonths.map(month => month.income))
  const avgExpense = average(activeMonths.map(month => month.expense))
  const avgNet = avgIncome - avgExpense
  const subscriptions = detectSubscriptions(txns, mkey)
  const projections = projectCashflow(txns, mkey, currentBalance)
  const anomalies = detectSpendingAnomalies(txns, mkey, anomalySensitivity)
  const trends = computeTrends(txns, categories, mkey)
  const recommendedMonthlySavings = Math.max(0, Math.round(Math.min(avgNet * 0.5, avgIncome * 0.2)))

  const actions = [
    subscriptions.length ? `Revisa ${subscriptions.length} posible${subscriptions.length > 1 ? 's' : ''} suscripcion${subscriptions.length > 1 ? 'es' : ''} antes del proximo cierre.` : '',
    anomalies.length ? `Audita ${anomalies[0].tx.note}: esta por encima de su promedio habitual.` : '',
    avgNet < 0 ? 'Reduce gastos variables: el promedio reciente esta cerrando en negativo.' : '',
    recommendedMonthlySavings > 0 ? `Programa un ahorro mensual sugerido de ${Math.round(recommendedMonthlySavings)} DOP.` : '',
    projections[0]?.projectedBalance < 0 ? 'Tu proyección a 30 días queda negativa; evita nuevos gastos no esenciales.' : '',
  ].filter(Boolean)

  if (!actions.length) actions.push('Mantén el ritmo actual y revisa categorías top una vez por semana.')

  return { subscriptions, projections, anomalies, trends, recommendedMonthlySavings, monthlyActions: actions.slice(0, 4) }
}
