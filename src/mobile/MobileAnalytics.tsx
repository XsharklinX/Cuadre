import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { toast } from '@/components/ui/Toast'
import { generateFinancialIntelligence, subscriptionInsightKey } from '@/data/financeIntelligence'
import { compareCategoryTotals } from '@/data/comparisons'
import { computeVerdict, savingsRate as savingsRateOf } from '@/data/analyticsVerdict'
import { exportElementPng } from '@/data/imageExport'
import { exportCsv, exportExcel, exportMonthlyPdf } from '@/data/professionalExport'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { playConfirmSound } from '@/lib/sound'
import { accountSavingsRate, amountForCategory, byCategory, categoryParts, currentMonthKey, dateLocale, monthLabel, monthlySeries, netWorthBreakdown, netWorthSeries, rollingNetWorthSeries, savingsBalance, shortMonth, totalBalanceInBase, totals, transactionsForTotals, txForMonth, type NetWorthPoint } from '@/data/helpers'
import { projectNetWorth } from '@/data/netWorthProjection'
import { useAnalyticsSections, type AnalyticsSectionId } from '@/store/analyticsSections'
import { useDismissals } from '@/store/dismissals'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { translateCategoryName, useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'
import type { CurrencyCode, IconName, Transaction } from '@/types'

export type AnalyticsPeriod = 'week' | 'month' | 'year'

/**
 * Sección plegable de Análisis. El contenido se monta solo cuando está abierta:
 * varias de estas secciones llevan gráficos que recorren todas las
 * transacciones, y montarlos todos de golpe era parte de por qué la pantalla
 * iba pesada.
 *
 * `count` adelanta cuánto hay dentro — sin eso, plegar sí sería esconder: el
 * usuario no tendría forma de saber si vale la pena abrir.
 */
function AnalyticsFold({
  id,
  title,
  subtitle,
  count,
  children,
}: {
  id: AnalyticsSectionId
  title: string
  subtitle?: string
  count?: number
  children: React.ReactNode
}) {
  const open = useAnalyticsSections(s => s.open[id] === true)
  const toggle = useAnalyticsSections(s => s.toggle)

  return (
    <section className={`man-fold${open ? ' on' : ''}`}>
      <button
        type="button"
        className="man-fold-head"
        aria-expanded={open}
        aria-controls={`man-fold-${id}`}
        onClick={() => toggle(id)}
      >
        <span className="man-fold-title">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </span>
        {count !== undefined && count > 0 && <span className="man-fold-count">{count}</span>}
        <Icon name="arrowUp" size={14} className="man-fold-chevron" />
      </button>
      {open && (
        <div className="man-fold-body" id={`man-fold-${id}`}>
          {children}
        </div>
      )}
    </section>
  )
}

interface InsightRow {
  /** Tipo de tarjeta: lo que se oculta con "ocultar todas las de este tipo". */
  id: string
  /** Instancia concreta: lo que se oculta con "ocultar esta". */
  dismissKey: string
  /** Solo la tarjeta de suscripción: clave compartida con la pantalla de Suscripciones. */
  subscriptionKey?: string
  icon: IconName
  tone: string
  title: string
  subtitle: string
  action?: { label: string; onClick: () => void }
}

function getMonthsShort(t: ReturnType<typeof useT>) {
  return [
    t('janShort'), t('febShort'), t('marShort'), t('aprShort'),
    t('mayShort'), t('junShort'), t('julShort'), t('augShort'),
    t('sepShort'), t('octShort'), t('novShort'), t('decShort'),
  ]
}

function getPeriods(t: ReturnType<typeof useT>): Array<{ id: AnalyticsPeriod; label: string }> {
  return [
    { id: 'week', label: t('periodWeek') },
    { id: 'month', label: t('periodMonth') },
    { id: 'year', label: t('periodYear') },
  ]
}


/**
 * Curva de patrimonio neto: últimos 12 meses reales + proyección lineal a 6
 * meses. SVG a mano (sin recharts) para no meter ~150 KB de librería de
 * gráficos en Análisis, que carga en el arranque (no es lazy).
 */
function NetWorthHistoryChart({ history, projected, currency, lang, fmtAmount }: {
  history: NetWorthPoint[]
  projected: NetWorthPoint[]
  currency: CurrencyCode
  lang: 'en' | 'es'
  fmtAmount: (n: number, c: CurrencyCode) => string
}) {
  const t = useT()
  const all = [...history, ...projected]
  if (all.length < 2) return null

  const W = 300
  const H = 90
  const PAD_Y = 8
  const values = all.map(p => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = W / (all.length - 1)
  const yOf = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2)
  const xOf = (i: number) => i * stepX

  const historyPoints = history.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(' ')
  const projectedPoints = [history[history.length - 1], ...projected]
    .map((p, i) => `${xOf(history.length - 1 + i)},${yOf(p.value)}`)
    .join(' ')
  const areaPath = `M${xOf(0)},${H} L${historyPoints.split(' ').map(pt => pt).join(' L')} L${xOf(history.length - 1)},${H} Z`

  const current = history[history.length - 1]
  const projectedEnd = projected[projected.length - 1]

  return (
    <div className="man-networth-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <line x1={0} y1={H - PAD_Y} x2={W} y2={H - PAD_Y} stroke="rgba(255,255,255,.08)" strokeWidth={1} />
        <path d={areaPath} fill="url(#nwGrad)" stroke="none" />
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--income)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--income)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polyline points={historyPoints} fill="none" stroke="var(--income)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={projectedPoints} fill="none" stroke="var(--income)" strokeWidth={1.6} strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
        <circle cx={xOf(history.length - 1)} cy={yOf(current.value)} r={3} fill="var(--income)" />
      </svg>
      <div className="man-networth-legend">
        <div>
          <span>{shortMonth(history[0].key, lang === 'en' ? 'en-US' : 'es-DO')}</span>
          <strong>{fmtAmount(history[0].value, currency)}</strong>
        </div>
        <div>
          <span>{t('today')}</span>
          <strong>{fmtAmount(current.value, currency)}</strong>
        </div>
        {projectedEnd && (
          <div className="man-networth-projected">
            <span>{t('netWorthProjectedLabel')}</span>
            <strong>{fmtAmount(projectedEnd.value, currency)}</strong>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Colores de los formatos de exportacion. Son CATEGORICOS (distinguir PDF de
 * Excel de CSV), no semanticos: no significan bueno ni malo. Viven juntos aqui
 * en vez de dispersos como hex sueltos para que el rediseno de paleta tenga un
 * solo sitio que tocar.
 */
const EXPORT_COLORS = {
  pdf:    '#e8b13d',
  excel:  '#35a06f',
  csv:    '#4a80c4',
  import: '#8b6fd4',
} as const

/** Icono de exportacion: relleno al 13% del color y el trazo a color pleno. */
function exportIcon(color: string): React.CSSProperties {
  return { background: `color-mix(in oklab, ${color} 13%, transparent)`, color }
}

export function MobileAnalytics({ mkey, onBudgets, onImport, onEditTx, initialPeriod }: { mkey: string; onBudgets?: () => void; onImport?: () => void; onEditTx?: (tx: Transaction) => void; initialPeriod?: AnalyticsPeriod }) {
  const { transactions, accounts, categories, goalContributions, currency, updateTx } = useFinance()
  const fmtVal = useFmt()
  const t = useT()
  const settings = useSettings()
  const lang = (settings.language ?? 'es') as 'en' | 'es'
  const compactNumbers = settings.compactNumbers
  const MONTHS_SHORT = getMonthsShort(t)
  const PERIODS = getPeriods(t)
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialPeriod ?? 'month')
  // Categoría enfocada en la dona: al tocar una porción/leyenda se resalta esa
  // rebanada, el resto se atenúa y el centro muestra su monto. Es solo estado
  // visual local (no filtra datos ni muta nada), así que es 100% reversible.
  const [focusCat, setFocusCat] = useState<string | null>(null)
  const finance = useFinance()
  const ownerName = useSettings(s => s.displayName) || '$harky'
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'excel' | 'csv' | 'png' | null>(null)
  useMobileBackDismiss(exportOpen, () => setExportOpen(false))
  const exportRef = useDialogA11y<HTMLDivElement>(() => setExportOpen(false), exportOpen)

  const runExport = async (kind: 'pdf' | 'excel' | 'csv' | 'png') => {
    setExporting(kind)
    try {
      if (kind === 'png') {
        // Compartir el periodo como imagen: era lo unico de la vista "Anual"
        // que no existia aqui.
        const el = document.getElementById('man-capture')
        if (el) {
          await exportElementPng(el, `sharky-${period}-${mkey}`)
          toast(t('reportExportedAsImage'), { icon: 'download', type: 'ok' })
        }
      } else if (kind === 'pdf') {
        await exportMonthlyPdf(finance, mkey, ownerName, lang)
        toast(t('pdfExportedFor').replace('{month}', monthLabel(mkey, dateLocale(lang))), { icon: 'download', type: 'ok' })
      } else if (kind === 'excel') {
        await exportExcel(finance)
        toast(t('excelExported'), { icon: 'download', type: 'ok' })
      } else {
        await exportCsv(finance)
        toast(t('csvExported'), { icon: 'download', type: 'ok' })
      }
      setExportOpen(false)
    } catch {
      toast(t(kind === 'pdf' ? 'pdfExportError' : kind === 'excel' ? 'excelExportError' : 'csvExportError'), { icon: 'alert' })
    } finally {
      setExporting(null)
    }
  }
  const year = Number(mkey.slice(0, 4))
  const visTx = useMemo(() => transactionsForTotals(transactions, accounts, currency), [transactions, accounts, currency])
  const monthTx = txForMonth(visTx, mkey)
  const weekWindow = useMemo(() => {
    if (!monthTx.length) return { start: '', end: '', tx: [] as typeof monthTx }
    const sortedDates = [...monthTx].map(tx => tx.date).sort((a, b) => a.localeCompare(b))
    const lastDate = sortedDates[sortedDates.length - 1] ?? `${mkey}-01`
    const end = new Date(`${lastDate}T00:00:00`)
    const start = new Date(end)
    start.setDate(end.getDate() - 6)
    const startKey = start.toISOString().slice(0, 10)
    const endKey = end.toISOString().slice(0, 10)
    return {
      start: startKey,
      end: endKey,
      tx: monthTx.filter(tx => tx.date >= startKey && tx.date <= endKey),
    }
  }, [monthTx, mkey])

  const scopedTx = useMemo(() => {
    if (period === 'year') return visTx.filter(tx => tx.date.startsWith(String(year)))
    if (period === 'week') return weekWindow.tx
    return monthTx
  }, [monthTx, period, visTx, weekWindow.tx, year])

  const summary = totals(scopedTx)
  const savedAmount = savingsBalance(accounts)
  const savingsRate = accountSavingsRate(accounts)
  const currentNetWorth = totalBalanceInBase(accounts, currency)
  // Todas las categorías del periodo (no recortadas): las top se muestran una a
  // una y el resto se agrega en "Otros" para que nada quede oculto y el donut
  // sume el 100% del gasto.
  const allExpenseRows = useMemo(() => byCategory(scopedTx, 'expense', categories), [scopedTx, categories])
  const LEGEND_TOP = 5
  const topRows = allExpenseRows.slice(0, LEGEND_TOP)
  const othersRows = allExpenseRows.slice(LEGEND_TOP)
  const othersAmount = othersRows.reduce((sum, r) => sum + r.amount, 0)
  const totalExpense = Math.max(1, summary.expense)
  const monthly = monthlySeries(visTx, year)
  const netWorth = netWorthSeries(accounts, transactions, goalContributions, year, dateLocale(lang), currency)

  const barData = useMemo(() => {
    if (period === 'year') {
      return monthly.map(m => ({
        label: MONTHS_SHORT[parseInt(m.key.slice(5, 7)) - 1] ?? m.label,
        income: m.income,
        expense: m.expense,
      }))
    }
    if (period === 'week') {
      if (!weekWindow.start) {
        return Array.from({ length: 7 }, (_, index) => ({ label: String(index + 1), income: 0, expense: 0 }))
      }
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(`${weekWindow.start}T00:00:00`)
        day.setDate(day.getDate() + index)
        const key = day.toISOString().slice(0, 10)
        const dayTx = weekWindow.tx.filter(tx => tx.date === key)
        const daySummary = totals(dayTx)
        return {
          label: String(day.getDate()),
          income: daySummary.income,
          expense: daySummary.expense,
        }
      })
    }
    return monthly.filter(m => m.key <= mkey).slice(-6).map(m => ({
      label: MONTHS_SHORT[parseInt(m.key.slice(5, 7)) - 1] ?? m.label,
      income: m.income,
      expense: m.expense,
    }))
  }, [mkey, monthly, period, weekWindow.start, weekWindow.tx, MONTHS_SHORT])

  const maxBar = Math.max(1, ...barData.flatMap(d => [d.income, d.expense]))

  const isCurrentMonth = mkey === currentMonthKey()
  const today = new Date()
  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const projectedExpense = isCurrentMonth && dayOfMonth > 0 ? summary.expense / dayOfMonth * daysInMonth : 0
  const prevMkey = (() => {
    const [y, m] = mkey.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const prevSum = totals(txForMonth(visTx, prevMkey))
  const prevCategoryRows = byCategory(txForMonth(visTx, prevMkey), 'expense', categories)
  const prevCategoryMap = new Map(prevCategoryRows.map(row => [row.category.id, row.amount]))
  const prevPace = prevSum.expense > 0 && dayOfMonth > 0 ? prevSum.expense / daysInMonth * dayOfMonth : 0
  const spendTrend = prevPace > 0 ? Math.round((summary.expense / prevPace - 1) * 100) : null
  const showTrend = period === 'month' && isCurrentMonth && monthTx.length > 0 && dayOfMonth >= 3
  const totalBudget = categories.filter(c => c.type === 'expense').reduce((sum, category) => sum + category.budget, 0)
  const budgetPct = totalBudget > 0 ? Math.min(100, Math.round(summary.expense / totalBudget * 100)) : 0

  const prevYear = year - 1
  const prevYearSum = useMemo(() => totals(visTx.filter(tx => tx.date.startsWith(String(prevYear)))), [visTx, prevYear])
  const compareLabel = period === 'year' ? String(prevYear) : monthLabel(prevMkey, dateLocale(lang))
  const comparePrev = period === 'year' ? prevYearSum : prevSum
  const compareRows: Array<{ label: string; current: number; prev: number; goodWhenUp: boolean; cls: string }> = [
    { label: t('incomes'), current: summary.income, prev: comparePrev.income, goodWhenUp: true, cls: 'income' },
    { label: t('expenses'), current: summary.expense, prev: comparePrev.expense, goodWhenUp: false, cls: 'expense' },
    { label: t('netLabel'), current: summary.net, prev: comparePrev.net, goodWhenUp: true, cls: summary.net >= 0 ? 'income' : 'expense' },
  ]
  const showCompare = period === 'month' || period === 'year'
  const previousScopedTx = period === 'year'
    ? visTx.filter(tx => tx.date.startsWith(String(prevYear)))
    : txForMonth(visTx, prevMkey)
  const categoryComparison = useMemo(
    () => showCompare ? compareCategoryTotals(scopedTx, previousScopedTx, categories, 'expense').slice(0, 5) : [],
    [scopedTx, previousScopedTx, categories, showCompare],
  )

  // Solo cuenta como enfoque si la categoría sigue en el periodo visible (evita
  // un enfoque "fantasma" al cambiar de mes/periodo sin tener que resetearlo).
  const activeFocus = focusCat && topRows.some(row => row.category.id === focusCat) ? focusCat : null
  const focusRow = activeFocus ? topRows.find(row => row.category.id === activeFocus) : null

  // Estadísticas de la categoría enfocada (al tocar una porción o la leyenda):
  // nº de movimientos, promedio, mayor gasto y % del total. Respeta splits.
  const focusStats = useMemo(() => {
    if (!activeFocus) return null
    const amounts: number[] = []
    for (const tx of scopedTx) {
      if (tx.type !== 'expense') continue
      const a = amountForCategory(tx, activeFocus)
      if (a > 0) amounts.push(a)
    }
    const count = amounts.length
    const sum = amounts.reduce((s, a) => s + a, 0)
    return { count, sum, avg: count ? sum / count : 0, max: count ? Math.max(...amounts) : 0, pct: Math.round(sum / totalExpense * 100) }
  }, [activeFocus, scopedTx, totalExpense])
  // Conteo de movimientos por categoría (para mostrar "N mov." en la leyenda).
  const countByCategory = useMemo(() => {
    const m: Record<string, number> = {}
    for (const tx of scopedTx) {
      if (tx.type !== 'expense') continue
      for (const p of categoryParts(tx)) if (p.categoryId && p.amount > 0) m[p.categoryId] = (m[p.categoryId] ?? 0) + 1
    }
    return m
  }, [scopedTx])
  const focusCategory = activeFocus ? categories.find(c => c.id === activeFocus) : null
  const focusBudgetPct = focusCategory && focusCategory.budget > 0 && focusStats
    ? Math.min(100, Math.round(focusStats.sum / focusCategory.budget * 100))
    : null

  const donutValueLabel = fmtVal(focusRow ? focusRow.amount : summary.expense, currency)
  const donutCaption = focusRow ? translateCategoryName(focusRow.category, lang) : t('expenses')
  const donutValueSize = donutValueLabel.length > 11 ? 12 : donutValueLabel.length > 8 ? 14 : 16

  // Donut: top categorías + segmento gris "Otros" (resto), para sumar el 100%.
  const donutSegments = othersAmount > 0
    ? [...topRows, { category: { id: '__others__', color: 'color-mix(in oklab, var(--m-text) 22%, transparent)' }, amount: othersAmount }]
    : topRows
  const donut = donutSegments.length
    ? `conic-gradient(${donutSegments.map((row, i) => {
        const start = donutSegments.slice(0, i).reduce((sum, current) => sum + current.amount / totalExpense * 100, 0)
        const end = start + row.amount / totalExpense * 100
        const color = activeFocus && activeFocus !== row.category.id
          ? 'color-mix(in oklab, var(--m-text) 9%, transparent)'
          : row.category.color
        return `${color} ${start}% ${end}%`
      }).join(', ')}, rgba(255,255,255,.07) 0)`
    : 'conic-gradient(rgba(255,255,255,.07) 0 100%)'

  const heroLabel = period === 'week'
    ? `${weekWindow.start} - ${weekWindow.end}`
    : period === 'year'
      ? String(year)
      : monthLabel(mkey, dateLocale(lang))

  const topCategory = allExpenseRows[0]
  const topCategoryPrevious = topCategory ? (prevCategoryMap.get(topCategory.category.id) ?? 0) : 0
  const topCategoryDelta = topCategory ? topCategory.amount - topCategoryPrevious : 0
  const overBudgetCategory = allExpenseRows.find(row => {
    const category = categories.find(item => item.id === row.category.id)
    return !!category && category.budget > 0 && row.amount >= category.budget * 0.8
  })
  const intelligence = useMemo(() => generateFinancialIntelligence({
    txns: visTx,
    categories,
    mkey,
    currentBalance: currentNetWorth,
    anomalySensitivity: settings.anomalySensitivity,
  }), [categories, currentNetWorth, mkey, settings.anomalySensitivity, visTx])
  const recentAnomaly = intelligence.anomalies[0]
  // Solo cuenta como "tendencia" algo que ya existia y crecio de forma notable
  // (previousAvg > 0) — si no, cualquier gasto nuevo dispararia el insight cada mes.
  const topTrend = intelligence.trends.find(item => item.previousAvg > 0 && item.delta > Math.max(300, item.previousAvg * 0.3))
  const upcomingSubscription = intelligence.subscriptions.find(item => !item.alreadyRecurring) ?? intelligence.subscriptions[0]
  const netWorthHistory = netWorth.filter(point => point.key <= mkey)
  const netWorthPoint = netWorth.find(point => point.key === mkey) ?? netWorthHistory[netWorthHistory.length - 1] ?? netWorth[0]
  const compareNetDeltaPct = showCompare
    ? comparePrev.net !== 0
      ? Math.round(((summary.net - comparePrev.net) / Math.abs(comparePrev.net)) * 100)
      : (summary.net !== 0 ? 100 : 0)
    : 0

  const netWorthRolling = useMemo(
    () => rollingNetWorthSeries(accounts, transactions, goalContributions, mkey, 12, dateLocale(lang), currency),
    [accounts, transactions, goalContributions, mkey, lang, currency],
  )
  const netWorthProjected = useMemo(() => projectNetWorth(netWorthRolling, 6), [netWorthRolling])
  const netWorthSplit = useMemo(() => netWorthBreakdown(accounts, currency), [accounts, currency])

  const hiddenInsights = useDismissals(s => s.hiddenInsights)
  const hiddenInsightTypes = useDismissals(s => s.hiddenInsightTypes)
  const dismissedSubscriptions = useDismissals(s => s.dismissed)
  const hideInsight = useDismissals(s => s.hideInsight)
  const hideInsightType = useDismissals(s => s.hideInsightType)
  const dismissSubscription = useDismissals(s => s.dismiss)
  // Tarjeta cuya ocultación espera a que el usuario elija el alcance.
  const [hiding, setHiding] = useState<InsightRow | null>(null)

  // Convierte el gasto detectado como suscripción en un recurrente mensual real
  const makeSubscriptionRecurring = () => {
    if (!upcomingSubscription) return
    const candidate = transactions
      .filter(tx => tx.type === 'expense' && !tx.recurring
        && tx.date === upcomingSubscription.lastDate
        && (tx.categoryId ?? '') === (upcomingSubscription.categoryId ?? '')
        && (tx.accountId ?? '') === (upcomingSubscription.accountId ?? ''))
      .sort((a, b) => Math.abs(a.amount - upcomingSubscription.amount) - Math.abs(b.amount - upcomingSubscription.amount))[0]
    if (!candidate) return toast(t('insightRecurringNotFound'), { icon: 'alert' })
    updateTx(candidate.id, {
      recurring: 'monthly',
      recurringStart: candidate.date,
      recurringNext: advanceRecurrenceDate(candidate.date, 'monthly'),
    })
    playConfirmSound()
    toast(t('insightRecurringCreated').replace('{name}', candidate.note), { icon: 'repeat', type: 'ok' })
  }

  // `id` es el TIPO de tarjeta (ocultar todas las de este tipo) y `dismissKey`
  // la instancia concreta (ocultar solo esta).
  const insightRows = [
    topCategory && topCategoryDelta > Math.max(500, topCategoryPrevious * 0.25)
      ? {
          id: 'category-cause',
          dismissKey: `category-cause:${topCategory.category.id}`,
          icon: topCategory.category.icon,
          tone: 'warn',
          title: t('spentMoreByCategory')
            .replace('{amount}', fmtVal(topCategoryDelta, currency))
            .replace('{category}', translateCategoryName(topCategory.category, lang)),
          subtitle: t('categoryExplainsIncrease'),
          action: onBudgets ? { label: t('insightActionBudget'), onClick: onBudgets } : undefined,
        }
      : null,
    recentAnomaly
      ? {
          id: 'anomaly',
          dismissKey: `anomaly:${recentAnomaly.tx.id}`,
          icon: 'alert' as IconName,
          tone: 'danger',
          title: t('anomalousExpenseTitle').replace('{note}', recentAnomaly.tx.note),
          subtitle: t('anomalousExpenseText')
            .replace('{amount}', fmtVal(recentAnomaly.tx.amount, currency))
            .replace('{baseline}', fmtVal(recentAnomaly.baseline, currency)),
          action: onEditTx ? { label: t('insightActionViewMovement'), onClick: () => onEditTx(recentAnomaly.tx) } : undefined,
        }
      : null,
    upcomingSubscription
      ? {
          id: 'subscription',
          dismissKey: `subscription:${upcomingSubscription.merchant}`,
          // Ocultar esta tarjeta usa la MISMA clave que la pantalla de
          // Suscripciones, así el usuario no tiene que rechazar dos veces la
          // misma sugerencia en dos sitios distintos.
          subscriptionKey: subscriptionInsightKey(upcomingSubscription),
          icon: 'repeat' as IconName,
          tone: upcomingSubscription.alreadyRecurring ? '' : 'warn',
          title: t('subscriptionInsightTitle').replace('{merchant}', upcomingSubscription.merchant),
          subtitle: t('subscriptionInsightText')
            .replace('{amount}', fmtVal(upcomingSubscription.amount, currency))
            .replace('{months}', String(upcomingSubscription.months)),
          action: upcomingSubscription.alreadyRecurring
            ? undefined
            : { label: t('insightActionMakeRecurring'), onClick: makeSubscriptionRecurring },
        }
      : null,
    overBudgetCategory
      ? {
          id: 'budget-risk',
          dismissKey: `budget-risk:${overBudgetCategory.category.id}`,
          icon: 'wallet' as IconName,
          tone: 'warn',
          title: t('budgetRiskTitle').replace('{category}', translateCategoryName(overBudgetCategory.category, lang)),
          subtitle: t('budgetRiskText').replace('{amount}', fmtVal(overBudgetCategory.amount, currency)),
          action: onBudgets ? { label: t('insightActionBudget'), onClick: onBudgets } : undefined,
        }
      : null,
    showTrend && spendTrend !== null
      ? {
          id: 'trend',
          dismissKey: 'trend',
          icon: spendTrend >= 0 ? 'arrowUp' : 'arrowDn',
          tone: spendTrend > 10 ? 'warn' : spendTrend < -10 ? 'ok' : '',
          title: (spendTrend >= 0 ? t('spendMoreThanLastMonth') : t('spendLessThanLastMonth')).replace('{pct}', String(Math.abs(spendTrend))),
          subtitle: t('samePaceAsElapsedDays'),
        }
      : null,
    topTrend
      ? {
          id: 'top-trend',
          dismissKey: `top-trend:${topTrend.label}`,
          icon: 'trend' as IconName,
          tone: 'warn',
          title: t('topTrendTitle').replace('{label}', topTrend.label).replace('{amount}', fmtVal(topTrend.amount, currency)),
          subtitle: t('topTrendSubtitle').replace('{avg}', fmtVal(topTrend.previousAvg, currency)),
          action: onBudgets && topTrend.kind === 'category' ? { label: t('insightActionBudget'), onClick: onBudgets } : undefined,
        }
      : null,
    showTrend && projectedExpense > 0
      ? {
          id: 'projection',
          dismissKey: 'projection',
          icon: 'trend',
          tone: projectedExpense > totalBudget && totalBudget > 0 ? 'warn' : 'ok',
          title: t('projectedAtClose').replace('{amount}', fmtVal(projectedExpense, currency)),
          subtitle: t('ifYouKeepCurrentPace'),
          action: onBudgets && projectedExpense > totalBudget && totalBudget > 0
            ? { label: t('insightActionViewBudgets'), onClick: onBudgets }
            : undefined,
        }
      : null,
    topCategory
      ? {
          id: 'top-category',
          dismissKey: `top-category:${topCategory.category.id}`,
          icon: topCategory.category.icon,
          tone: '',
          title: `${translateCategoryName(topCategory.category, lang)} - ${fmtVal(topCategory.amount, currency)}`,
          subtitle: t('topExpenseOfPeriod'),
        }
      : null,
  ].filter(Boolean) as InsightRow[]

  /**
   * El veredicto y los avisos que lo acompañan. Se calculan aquí, sobre los
   * mismos datos que ya alimentaban los acordeones — no hay plomería nueva,
   * solo se sube a la superficie lo que ya existía enterrado.
   */
  /**
   * El mes en curso se compara CONTRA EL MISMO PUNTO del mes pasado, no
   * contra el mes pasado entero.
   *
   * Comparar 20 dias contra 30 siempre da un resultado bonito: el veredicto
   * anunciaba "vas gastando 31% menos" mientras el aviso de ritmo, justo
   * debajo, decia "3% mas que el mes pasado". Los dos numeros eran correctos
   * y se contradecian, y el que mentia era el grande. `prevPace` ya existia
   * para el aviso de ritmo; ahora el veredicto usa la misma vara.
   */
  const verdictPrevious = useMemo(
    () => (period === 'month' && isCurrentMonth && prevPace > 0
      ? { ...comparePrev, expense: prevPace }
      : comparePrev),
    [period, isCurrentMonth, prevPace, comparePrev],
  )

  const verdict = useMemo(() => computeVerdict({
    current: summary,
    previous: verdictPrevious,
    txCount: scopedTx.length,
    noPrevious: previousScopedTx.length === 0,
  }), [summary, verdictPrevious, scopedTx.length, previousScopedTx.length])

  const rate = savingsRateOf(summary)

  const visibleInsights = insightRows.filter(row =>
    !hiddenInsightTypes.includes(row.id)
    && !hiddenInsights.includes(row.dismissKey)
    // La sugerencia de suscripción también se respeta si se rechazó desde la
    // pantalla de Suscripciones — es la misma sugerencia, no dos distintas.
    && !(row.subscriptionKey && dismissedSubscriptions.includes(row.subscriptionKey)))

  /**
   * Superlativos y fuentes de ingreso del año. Solo se calculan en el período
   * anual, que es el único donde tienen sentido: "tu mejor mes" dentro de un
   * mes no significa nada.
   */
  const yearHighlights = useMemo(() => {
    if (period !== 'year') return null
    const months = monthlySeries(visTx, year, dateLocale(lang))
    if (months.length === 0) return null
    const bestMonth = months.reduce((best, m) => m.net > best.net ? m : best, months[0])
    const worstMonth = months.reduce((worst, m) => m.expense > worst.expense ? m : worst, months[0])
    return {
      bestMonth,
      worstMonth,
      incomeSources: byCategory(scopedTx, 'income', categories).slice(0, 5),
    }
  }, [period, visTx, year, lang, scopedTx, categories])

  // Dos titulares como máximo. Tres ya es una lista, y una lista vuelve a ser
  // "todo con el mismo peso", que es justo lo que había que resolver.
  const headlineInsights = visibleInsights.slice(0, 2)
  // El resto sigue viviendo en su acordeón: no se pierde nada, solo deja de
  // competir por la parte alta de la pantalla.
  const foldInsights = visibleInsights.slice(2)

  return (
    <div className="man-root" id="man-capture">
      <div className="mobile-segment man-tabs" role="tablist" aria-label={t('periodLabel')}>
        {PERIODS.map(p => (
          <button key={p.id} className={period === p.id ? 'on' : ''} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── VEREDICTO ────────────────────────────────────────
          La pantalla responde UNA pregunta —¿cómo voy?— antes de ofrecer
          nada. Antes abría con cuatro números empatados (ingresos, gastos,
          neto y el anillo de ahorro) y cinco acordeones cerrados: el usuario
          tenía que saber de antemano qué buscaba. */}
      <section className={`man-verdict ${verdict.tone}`}>
        <div className="man-verdict-head">
          <span className="man-verdict-kicker">{heroLabel}</span>
          <h2 className="man-verdict-line">{t(verdict.key).replace('{pct}', String(verdict.params.pct ?? ''))}</h2>
        </div>

        <div className="man-verdict-hero">
          <span className="man-verdict-hero-label">
            {verdict.heroKind === 'overspent' ? t('overspentLabel')
              : verdict.heroKind === 'saved' ? t('savedThisPeriod')
              : t('netLabel')}
          </span>
          <strong className="man-verdict-hero-value">
            <AnimatedMoney value={verdict.hero} compact={compactNumbers} />
          </strong>
        </div>

        {/* Ingresos y gastos SOSTIENEN la cifra de arriba, no compiten con
            ella: por eso van pequeños y en una sola línea. */}
        <div className="man-verdict-support">
          <span><i className="dot income" />{t('incomes')} <b>{fmtVal(summary.income, currency)}</b></span>
          <span><i className="dot expense" />{t('expenses')} <b>{fmtVal(summary.expense, currency)}</b></span>
          {rate !== null && (
            <span><i className="dot save" />{t('savingsRateLabel')} <b>{Math.round(rate)}%</b></span>
          )}
        </div>
      </section>

      {/* ── TU AÑO ───────────────────────────────────────────
          Los superlativos y las fuentes de ingreso vivían en una vista
          "Anual" aparte que, por lo demás, repetía exactamente este período
          de Análisis: los mismos totales, la misma comparación contra el año
          anterior, el mismo desglose y la misma serie de patrimonio. Mantener
          dos destinos para el mismo dato es lo que hacía que la app se
          sintiera dispersa. */}
      {period === 'year' && yearHighlights && (
        <section className="man-year">
          <div className="man-year-grid">
            <article>
              <small>{t('bestSavingsMonthLabel')}</small>
              <b>{yearHighlights.bestMonth.label}</b>
              <span className="income">{fmtVal(yearHighlights.bestMonth.net, currency)}</span>
            </article>
            <article>
              <small>{t('highestExpenseMonthLabel')}</small>
              <b>{yearHighlights.worstMonth.label}</b>
              <span className="expense">{fmtVal(yearHighlights.worstMonth.expense, currency)}</span>
            </article>
          </div>

          {yearHighlights.incomeSources.length > 0 && (
            <div className="man-year-sources">
              <p className="man-year-sources-title">{t('incomeSourcesTitle')}</p>
              {yearHighlights.incomeSources.map(row => (
                <div key={row.category.id} className="man-year-source">
                  <span className="man-year-source-dot" style={{ background: row.category.color }} />
                  <span className="man-year-source-name">{translateCategoryName(row.category, lang)}</span>
                  <span className="man-year-source-amount">{fmtVal(row.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── LO QUE CAMBIÓ ────────────────────────────────────
          Los dos o tres avisos más urgentes, FUERA del acordeón. Había 465
          líneas de motor de insights alimentando un cajón cerrado que nadie
          abría. */}
      {headlineInsights.length > 0 && (
        <section className="man-headlines">
          {headlineInsights.map(insight => (
            <div key={insight.id} className="man-headline">
              <span className={`man-headline-ico ${insight.tone || ''}`}>
                <Icon name={insight.icon} size={17} />
              </span>
              <span className="man-headline-body">
                <b>{insight.title}</b>
                <small>{insight.subtitle}</small>
              </span>
            </div>
          ))}
        </section>
      )}

      <section className="man-panel man-panel-distribution">
        <div className="man-panel-head">
          <h3>{t('expenseDistribution')}</h3>
          <p>{t('byCategoryLabel')}</p>
        </div>

        <div className="man-donut-wrap">
          <button
            type="button"
            className="man-donut"
            style={{ background: donut }}
            aria-label={activeFocus ? t('clearSelectionLabel') : t('expenseDistribution')}
            onClick={() => setFocusCat(null)}
          >
            <span>
              <small>{donutCaption}</small>
              <strong style={{ fontSize: donutValueSize }}>{donutValueLabel}</strong>
            </span>
          </button>

          <div className="man-legend">
            {topRows.map(row => {
              const pct = Math.round(row.amount / totalExpense * 100)
              const category = categories.find(item => item.id === row.category.id)
              const budgetUsagePct = category && category.budget > 0 ? Math.min(100, row.amount / category.budget * 100) : null
              const dimmed = activeFocus !== null && activeFocus !== row.category.id
              const count = countByCategory[row.category.id] ?? 0
              return (
                <button
                  type="button"
                  key={row.category.id}
                  className={`man-legend-row${activeFocus === row.category.id ? ' on' : ''}${dimmed ? ' dim' : ''}`}
                  aria-pressed={activeFocus === row.category.id}
                  onClick={() => setFocusCat(prev => prev === row.category.id ? null : row.category.id)}
                >
                  <i style={{ background: row.category.color }} />
                  <div className="man-legend-main">
                    <strong>{translateCategoryName(row.category, lang)}</strong>
                    {budgetUsagePct !== null && (
                      <span className={`man-budget-chip${budgetUsagePct >= 100 ? ' over' : budgetUsagePct >= 80 ? ' warn' : ''}`}>
                        {t('pctOfBudget').replace('{pct}', String(Math.round(budgetUsagePct)))}
                      </span>
                    )}
                  </div>
                  <div className="man-legend-amount">
                    {fmtVal(row.amount, currency)}
                    <small>{pct}% · {t('txCountShort').replace('{n}', String(count))}</small>
                  </div>
                </button>
              )
            })}
            {othersAmount > 0 && (
              <div className="man-legend-row man-legend-others">
                <i />
                <div className="man-legend-main">
                  <strong>{t('othersLabel')}</strong>
                  <span>{t('otherCategoriesCount').replace('{n}', String(othersRows.length))}</span>
                </div>
                <div className="man-legend-amount">
                  {fmtVal(othersAmount, currency)}
                  <small>{Math.round(othersAmount / totalExpense * 100)}%</small>
                </div>
              </div>
            )}
            {!allExpenseRows.length && <p className="man-empty">{t('noExpensesToAnalyze')}</p>}
          </div>
        </div>

        {/* Detalle de la categoría enfocada: aparece al tocar una porción o fila. */}
        {focusStats && focusRow && (
          <div className="man-cat-detail">
            <div className="man-cat-detail-head">
              <i style={{ background: focusRow.category.color }} />
              <strong>{translateCategoryName(focusRow.category, lang)}</strong>
              <b>{t('pctOfTotalShort').replace('{pct}', String(focusStats.pct))}</b>
            </div>
            <div className="man-cat-stats">
              <div className="man-cat-stat">
                <small>{t('movementsCountLabel')}</small>
                <strong>{focusStats.count}</strong>
              </div>
              <div className="man-cat-stat">
                <small>{t('averageLabel')}</small>
                <strong>{fmtVal(focusStats.avg, currency)}</strong>
              </div>
              <div className="man-cat-stat">
                <small>{t('largestLabel')}</small>
                <strong>{fmtVal(focusStats.max, currency)}</strong>
              </div>
            </div>
            {focusBudgetPct !== null && (
              <div className="man-cat-detail-budget">
                <div className="man-cat-detail-budget-track">
                  <div
                    className="man-cat-detail-budget-fill"
                    style={{ width: `${focusBudgetPct}%`, background: focusBudgetPct >= 100 ? 'var(--m-expense)' : focusRow.category.color }}
                  />
                </div>
                <small>{t('pctOfBudget').replace('{pct}', String(focusBudgetPct))}</small>
              </div>
            )}
          </div>
        )}
      </section>

      <AnalyticsFold id="metrics" title={t('analyticsMetricsTitle')} subtitle={t('analyticsMetricsDesc')}>
        <div className="man-quick-grid">
          <article className="man-quick-card">
            <span className="man-chip-label">{t('monthlyFlowMetric')}</span>
            <strong className={`man-quick-value ${summary.net >= 0 ? 'income' : 'expense'}`}>
              {fmtVal(summary.net, currency)}
            </strong>
            <span className="man-quick-subtle">{t('incomes')} / {t('expenses')}</span>
          </article>

          {period === 'month' && totalBudget > 0 && onBudgets ? (
            <button className="man-quick-card" onClick={onBudgets}>
              <span className="man-chip-label">{t('monthBudget')}</span>
              <strong className={`man-quick-value ${budgetPct >= 100 ? 'expense' : budgetPct >= 80 ? 'warn' : ''}`}>{budgetPct}%</strong>
              <div className="man-quick-track">
                <span
                  style={{
                    width: `${Math.min(100, budgetPct)}%`,
                    background: budgetPct >= 100 ? 'var(--expense)' : budgetPct >= 80 ? 'var(--warn)' : 'var(--income)',
                  }}
                />
              </div>
            </button>
          ) : (
            <article className="man-quick-card">
              <span className="man-chip-label">{t('savingsRateTitle')}</span>
              <strong className="man-quick-value income">{Math.round(savingsRate)}%</strong>
              <span className="man-quick-subtle">{fmtVal(savedAmount, currency)}</span>
            </article>
          )}

          <article className="man-quick-card">
            <span className="man-chip-label">{t('topCategoryLabel')}</span>
            <strong className="man-quick-value">{topCategory ? translateCategoryName(topCategory.category, lang) : '—'}</strong>
            <span className="man-quick-subtle">{topCategory ? fmtVal(topCategory.amount, currency) : t('noExpensesToAnalyze')}</span>
          </article>

          <article className="man-quick-card">
            <span className="man-chip-label">{t('comparisonLabel')}</span>
            <strong className={`man-quick-value ${compareNetDeltaPct >= 0 ? 'income' : 'expense'}`}>
              {showCompare ? `${compareNetDeltaPct >= 0 ? '+' : ''}${compareNetDeltaPct}%` : '—'}
            </strong>
            <span className="man-quick-subtle">vs. {compareLabel}</span>
          </article>

          <article className="man-quick-card">
            <span className="man-chip-label">{t('netWorthLabel')}</span>
            <strong className={`man-quick-value ${currentNetWorth >= 0 ? 'income' : 'expense'}`}>
              {fmtVal(netWorthPoint?.value ?? currentNetWorth, currency)}
            </strong>
            <span className="man-quick-subtle">
              {netWorthSplit.liabilities > 0
                ? t('netWorthBreakdownLabel')
                    .replace('{assets}', fmtVal(netWorthSplit.assets, currency))
                    .replace('{liabilities}', fmtVal(netWorthSplit.liabilities, currency))
                : t('patrimonyScope')}
            </span>
          </article>
        </div>
      </AnalyticsFold>

      {(showCompare || foldInsights.length > 0) && (
        <AnalyticsFold
          id="trends"
          title={t('quickReadTitle')}
          subtitle={t('quickReadDesc')}
          count={foldInsights.length + (showCompare ? categoryComparison.length : 0)}
        >

          {showCompare && (
            <div className="man-compare-list">
              {compareRows.map(row => {
                const delta = row.prev !== 0
                  ? Math.round((row.current / row.prev - 1) * 100)
                  : (row.current !== 0 ? 100 : 0)
                const isUp = delta >= 0
                const isGood = isUp === row.goodWhenUp
                return (
                  <div key={row.label} className="man-compare-row">
                    <div className="man-compare-main">
                      <span>{row.label}</span>
                      <strong className={row.cls}>{fmtVal(row.current, currency)}</strong>
                    </div>
                    <div className="man-compare-side">
                      <span className={`man-compare-delta ${delta === 0 ? '' : isGood ? 'ok' : 'warn'}`}>
                        <Icon name={isUp ? 'arrowUp' : 'arrowDn'} size={11} />
                        {Math.abs(delta)}%
                      </span>
                      <small>{fmtVal(row.prev, currency)}</small>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {showCompare && categoryComparison.length > 0 && (
            <div className="man-catcompare-list">
              <p className="man-catcompare-title">{t('categoryComparisonTitle')}</p>
              {categoryComparison.map(row => {
                const isUp = row.delta >= 0
                return (
                  <div key={row.category.id} className="man-catcompare-row">
                    <span className="man-catcompare-icon" style={{ color: row.category.color, background: `color-mix(in oklab, ${row.category.color} 16%, transparent)` }}>
                      <Icon name={row.category.icon} size={15} />
                    </span>
                    <div className="man-catcompare-main">
                      <span>{translateCategoryName(row.category, lang)}</span>
                      <small>{fmtVal(row.current, currency)}</small>
                    </div>
                    <span className={`man-catcompare-delta ${row.delta === 0 ? '' : isUp ? 'warn' : 'ok'}`}>
                      <Icon name={isUp ? 'arrowUp' : 'arrowDn'} size={11} />
                      {row.deltaPct === null ? t('newLabel') : `${Math.abs(row.deltaPct)}%`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {foldInsights.length > 0 && (
            <div className="man-insights">
              {foldInsights.map(insight => (
                <div key={insight.id} className="man-insight-row">
                  <span className={`man-insight-icon ${insight.tone}`}>
                    <Icon name={insight.icon} size={16} />
                  </span>
                  <div className="man-insight-copy">
                    <strong>{insight.title}</strong>
                    <small>{insight.subtitle}</small>
                    {insight.action && (
                      <button className="man-insight-action" onClick={insight.action.onClick}>
                        {insight.action.label} <Icon name="arrowUp" size={11} style={{ transform: 'rotate(90deg)' }} />
                      </button>
                    )}
                  </div>
                  <button
                    className="man-insight-hide"
                    aria-label={t('hideInsightLabel')}
                    onClick={() => setHiding(insight)}
                  >
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </AnalyticsFold>
      )}

      <AnalyticsFold
        id="evolution"
        title={period === 'week' ? t('weeklyExpenses') : period === 'year' ? t('incomeVsExpense') : t('last6Months')}
        subtitle={period === 'week' ? `${weekWindow.start} - ${weekWindow.end}` : t('comparisonLabel')}
      >
        <div className="man-bar-chart">
          {barData.map(d => (
            <div key={d.label} className="man-bar-col">
              <div className="man-bar-tracks">
                {(period !== 'week' || d.income > 0) && (
                  <div
                    className="man-bar-income"
                    style={{ height: `${Math.max(2, d.income / maxBar * 100)}%` }}
                    title={t('incomeColon').replace('{amount}', fmtVal(d.income, currency))}
                  />
                )}
                <div
                  className="man-bar-expense"
                  style={{ height: `${Math.max(2, d.expense / maxBar * 100)}%` }}
                  title={t('expenseColon').replace('{amount}', fmtVal(d.expense, currency))}
                />
              </div>
              <span className="man-bar-label">{d.label}</span>
            </div>
          ))}
        </div>

        {(period !== 'week' || barData.some(d => d.income > 0)) && (
          <div className="man-bar-legend">
            <span><i style={{ background: 'var(--income)' }} />{t('incomes')}</span>
            <span><i style={{ background: 'var(--expense)' }} />{t('expenses')}</span>
          </div>
        )}
      </AnalyticsFold>

      {netWorthRolling.length >= 2 && (
        <AnalyticsFold id="networth" title={t('netWorthTimelineTitle')}>
          <NetWorthHistoryChart history={netWorthRolling} projected={netWorthProjected} currency={currency} lang={lang} fmtAmount={fmtVal} />
        </AnalyticsFold>
      )}

      {allExpenseRows.length > 0 && (
        <AnalyticsFold
          id="categories"
          title={t('topCategoriesTitle')}
          subtitle={t('topExpenseOfPeriod')}
          count={allExpenseRows.length}
        >
          <div className="man-category-list">
            {allExpenseRows.map((row, index) => {
              const category = categories.find(item => item.id === row.category.id)
              const pct = row.amount / totalExpense * 100
              return (
                <div key={row.category.id} className="man-cat-row">
                  <div className="man-cat-top">
                    <div className="man-cat-meta">
                      <span className="man-cat-rank">{index + 1}</span>
                      <span
                        className="man-cat-icon"
                        style={{
                          color: row.category.color,
                          background: `color-mix(in oklab, ${row.category.color} 16%, transparent)`,
                        }}
                      >
                        <Icon name={row.category.icon} size={18} />
                      </span>
                      <span className="man-cat-name">{translateCategoryName(row.category, lang)}</span>
                    </div>
                    <strong>{fmtVal(row.amount, currency)}</strong>
                  </div>
                  <div className="man-cat-bar">
                    <div style={{ width: `${pct}%`, background: row.category.color }} />
                  </div>
                  {category && category.budget > 0 && (
                    <span className={`man-cat-budget${row.amount > category.budget ? ' over' : ''}`}>
                      {row.amount > category.budget
                        ? t('overBudgetAmount').replace('{amount}', fmtVal(row.amount - category.budget, currency))
                        : t('availableAmount').replace('{amount}', fmtVal(category.budget - row.amount, currency))}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </AnalyticsFold>
      )}

      {/* Exportar e importar — compacto, sin robar espacio al análisis */}
      <div className="man-export-bar">
        <button className="man-export-btn" onClick={() => setExportOpen(true)}>
          <Icon name="download" size={16} />
          {t('exportData')}
        </button>
        {onImport && (
          <button className="man-export-btn ghost" onClick={onImport}>
            <Icon name="upload" size={16} />
            {t('importLabel')}
          </button>
        )}
      </div>

      <div style={{ height: 'calc(12px + env(safe-area-inset-bottom))' }} />

      {exportOpen && (
        <SheetPortal>
          <div ref={exportRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('exportData')} onClick={() => setExportOpen(false)}>
            <section className="man-export-sheet" onClick={e => e.stopPropagation()}>
              <header>
                <span>{t('exportData')}</span>
                <button aria-label={t('close')} onClick={() => setExportOpen(false)}><Icon name="close" size={18} /></button>
              </header>
              <button className="man-export-row" disabled={exporting !== null} onClick={() => void runExport('png')}>
                <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.import)}><Icon name="camera" size={20} /></span>
                <div><b>{t('exportImageLabel')}</b><small>{exporting === 'png' ? t('generatingImageEllipsis') : t('shareAsImageHint')}</small></div>
              </button>
              <button className="man-export-row" disabled={exporting !== null} onClick={() => void runExport('pdf')}>
                <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.pdf)}><Icon name="book" size={20} /></span>
                <div><b>{t('monthStatementPdf')}</b><small>{exporting === 'pdf' ? t('generatingPdf') : monthLabel(mkey, dateLocale(lang))}</small></div>
              </button>
              <button className="man-export-row" disabled={exporting !== null} onClick={() => void runExport('excel')}>
                <span className="man-export-ic" style={{ background: '#35d0a222', color: 'var(--income)' }}><Icon name="trend" size={20} /></span>
                <div><b>{t('fullReportExcelTitle')}</b><small>{exporting === 'excel' ? t('generatingExcel') : t('movementsAccountsCategories')}</small></div>
              </button>
              <button className="man-export-row" disabled={exporting !== null} onClick={() => void runExport('csv')}>
                <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.csv)}><Icon name="fileJson" size={20} /></span>
                <div><b>{t('fullReportCsvTitle')}</b><small>{exporting === 'csv' ? t('generatingCsv') : t('csvReportReady')}</small></div>
              </button>
              {onImport && (
                <button className="man-export-row" onClick={() => { setExportOpen(false); onImport() }}>
                  <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.import)}><Icon name="upload" size={20} /></span>
                  <div><b>{t('importBankStatement')}</b><small>{t('csvOfxFromBanks')}</small></div>
                </button>
              )}
            </section>
          </div>
        </SheetPortal>
      )}

      {hiding && (
        <SheetPortal>
          <div
            className="mnc-choice-overlay"
            role="dialog"
            aria-modal="true"
            aria-label={t('hideInsightTitle')}
            onClick={() => setHiding(null)}
          >
            <div className="mnc-choice" onClick={e => e.stopPropagation()}>
              <strong>{t('hideInsightTitle')}</strong>
              <small>{hiding.title}</small>
              <button
                className="mnc-choice-btn"
                onClick={() => {
                  // La sugerencia de suscripción se rechaza por su clave
                  // compartida, para que tampoco vuelva en Suscripciones.
                  if (hiding.subscriptionKey) dismissSubscription(hiding.subscriptionKey)
                  else hideInsight(hiding.dismissKey)
                  setHiding(null)
                  toast(t('insightHiddenToast'), { icon: 'check', type: 'ok' })
                }}
              >
                {t('hideInsightOne')}
              </button>
              <button
                className="mnc-choice-btn mnc-choice-btn-strong"
                onClick={() => {
                  hideInsightType(hiding.id)
                  setHiding(null)
                  toast(t('insightTypeHiddenToast'), { icon: 'check', type: 'ok' })
                }}
              >
                {t('hideInsightType')}
              </button>
              <button className="mnc-choice-cancel" onClick={() => setHiding(null)}>{t('cancel')}</button>
            </div>
          </div>
        </SheetPortal>
      )}
    </div>
  )
}
