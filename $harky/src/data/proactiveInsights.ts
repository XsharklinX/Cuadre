import type { LangKey } from '@/i18n'
import type { Category, IconName, Transaction } from '@/types'
import { amountForCategory, monthKey, txForMonth } from './helpers'

/**
 * Insights PROACTIVOS: avisos accionables que se muestran solo (en Movimientos)
 * sin que el usuario tenga que abrir Análisis. Cada insight es una función pura
 * de los datos del mes, con un `id` estable por tipo+categoría+mes para poder
 * descartarlo. La UI traduce `messageKey` reemplazando `params`.
 */
export interface ProactiveInsight {
  id: string
  severity: 'warn' | 'info' | 'good'
  icon: IconName
  titleKey: LangKey
  messageKey: LangKey
  params: Record<string, string | number>
  /** Para ordenar: menor = más urgente. */
  priority: number
}

function daysInMonth(mkey: string): number {
  const [y, m] = mkey.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

/** Suma de gasto del mes atribuida a una categoría (respeta splits). */
function spentOn(monthTx: Transaction[], categoryId: string): number {
  return monthTx.reduce((s, tx) => s + amountForCategory(tx, categoryId), 0)
}

export function proactiveInsights(opts: {
  txns: Transaction[]
  categories: Category[]
  mkey: string
  today: string
  fmt: (n: number) => string
  translateCategory: (c: Category) => string
}): ProactiveInsight[] {
  const { txns, categories, mkey, today, fmt, translateCategory } = opts
  const out: ProactiveInsight[] = []

  const monthTx = txForMonth(txns, mkey).filter(tx => tx.type === 'expense')
  const dim = daysInMonth(mkey)
  const isCurrentMonth = today.startsWith(mkey)
  const dayOfMonth = isCurrentMonth ? Math.min(dim, Number(today.slice(8, 10))) : dim
  const monthProgress = dayOfMonth / dim

  // ── Presupuestos: ya pasado, o a un ritmo que lo agotará antes de fin de mes ──
  for (const cat of categories) {
    if (cat.type !== 'expense' || cat.budget <= 0) continue
    const spent = spentOn(monthTx, cat.id)
    if (spent <= 0) continue
    const name = translateCategory(cat)

    if (spent > cat.budget) {
      out.push({
        id: `budget-over-${cat.id}-${mkey}`,
        severity: 'warn', icon: 'alert', titleKey: 'insightBudgetOverTitle', messageKey: 'insightBudgetOverBody',
        params: { category: name, amount: fmt(spent - cat.budget) }, priority: 1,
      })
      continue
    }
    // Proyección "a tu ritmo": día en que se agotaría el presupuesto.
    if (isCurrentMonth && dayOfMonth >= 3 && spent / cat.budget > monthProgress + 0.12) {
      const dailyRate = spent / dayOfMonth
      const projectedDay = Math.ceil(cat.budget / dailyRate)
      if (projectedDay <= dim) {
        out.push({
          id: `budget-pace-${cat.id}-${mkey}`,
          severity: 'warn', icon: 'trend', titleKey: 'insightBudgetPaceTitle', messageKey: 'insightBudgetPaceBody',
          params: { category: name, day: projectedDay, pct: Math.round(spent / cat.budget * 100) }, priority: 2,
        })
      }
    }
  }

  // ── Pico de categoría: gasto muy por encima del promedio de meses anteriores ──
  const prevKeys = previousMonthKeys(mkey, 3)
  const prevTx = txns.filter(tx => tx.type === 'expense' && prevKeys.includes(monthKey(tx.date)))
  if (prevTx.length > 0) {
    for (const cat of categories) {
      if (cat.type !== 'expense') continue
      const now = spentOn(monthTx, cat.id)
      if (now < 500) continue // ignora categorías triviales
      const prevAvg = spentOn(prevTx, cat.id) / prevKeys.length
      if (prevAvg <= 0) continue
      const delta = (now - prevAvg) / prevAvg
      // Solo si el mes ya avanzó lo suficiente para que la comparación tenga sentido.
      if (delta >= 0.4 && monthProgress >= 0.5) {
        out.push({
          id: `spike-${cat.id}-${mkey}`,
          severity: 'info', icon: 'chart', titleKey: 'insightSpikeTitle', messageKey: 'insightSpikeBody',
          params: { category: translateCategory(cat), pct: Math.round(delta * 100), amount: fmt(now) }, priority: 3,
        })
      }
    }
  }

  // ── Buen ritmo: gasto total muy por debajo del habitual (refuerzo positivo) ──
  if (prevTx.length > 0 && monthProgress >= 0.5) {
    const nowTotal = monthTx.reduce((s, tx) => s + tx.amount, 0)
    const prevAvgTotal = prevTx.reduce((s, tx) => s + tx.amount, 0) / prevKeys.length
    const expectedByNow = prevAvgTotal * monthProgress
    if (expectedByNow > 0 && nowTotal < expectedByNow * 0.75 && !out.some(i => i.severity === 'warn')) {
      out.push({
        id: `good-pace-${mkey}`,
        severity: 'good', icon: 'check', titleKey: 'insightGoodPaceTitle', messageKey: 'insightGoodPaceBody',
        params: { pct: Math.round((1 - nowTotal / expectedByNow) * 100) }, priority: 4,
      })
    }
  }

  return out.sort((a, b) => a.priority - b.priority)
}

function previousMonthKeys(mkey: string, count: number): string[] {
  const [y, m] = mkey.split('-').map(Number)
  const keys: string[] = []
  for (let i = 1; i <= count; i++) {
    const d = new Date(y, m - 1 - i, 1)
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}
