import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { generateFinancialIntelligence, subscriptionInsightKey } from '@/data/financeIntelligence'
import { compareCategoryTotals } from '@/data/comparisons'
import { savingsRate as savingsRateOf } from '@/data/analyticsVerdict'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { playConfirmSound } from '@/lib/sound'
import { byCategory, currentMonthKey, dateLocale, fmt, monthLabel, monthlySeries, totalBalanceInBase, totals, transactionsForTotals, txForMonth } from '@/data/helpers'
import { businessIncome, spendShares } from '@/data/analyticsSummary'
import { canScope, scopeTransactions, type ReportScope } from '@/data/reportScope'
import { makeOwner } from '@/data/attribution'
import { useBusiness } from '@/store/business'
import { useDismissals } from '@/store/dismissals'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { translateCategoryName, useT } from '@/i18n'
import { SheetPortal } from './SheetPortal'
import type { IconName, Transaction } from '@/types'
import { useCaprices } from '@/store/caprices'
import { useWishes } from '@/store/wishes'
import { remaining as capriceRemaining } from '@/data/caprices'
import { receivablesSummary } from '@/data/receivables'
import { localToday } from '@/data/helpers'
import { ExportSheet } from './ExportSheet'
import { dailySeries, fixedVsVariable, monthPace, weekdayStats } from '@/data/analyticsViews'
import { CategorySheet, DaySheet, HeatCalendar, PaceChart, SpendBars } from './analytics/AnalyticsParts'
import { useNetWorthNow } from './analytics/NetWorthCard'
import { IconTile, NxSheet } from '@/components/ui/Phrase'
import { CatBadge } from '@/views/shared'
import { biggestExpense, merchantTotals, normalWeekExpense, priciestMonth } from '@/data/analyticsQuestions'

export type AnalyticsPeriod = 'week' | 'month' | 'year'
type CompareBase = 'prev' | 'lastYear' | 'avg'

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


export function MobileAnalytics({ mkey, onBudgets, onAccounts, onEditTx, initialPeriod }: { mkey: string; onBudgets?: () => void; onAccounts?: () => void; onEditTx?: (tx: Transaction) => void; initialPeriod?: AnalyticsPeriod }) {
  const { transactions, accounts, categories, currency, updateTx } = useFinance()
  const fmtVal = useFmt()
  const t = useT()
  const settings = useSettings()
  const lang = (settings.language ?? 'es') as 'en' | 'es'
  const MONTHS_SHORT = getMonthsShort(t)
  const PERIODS = getPeriods(t)
  const [period, setPeriod] = useState<AnalyticsPeriod>(initialPeriod ?? 'month')
  const [exportOpen, setExportOpen] = useState(false)
  /* A8 · Con qué se compara el mes: el anterior, el mismo del año pasado o tu media. */
  const [compareBase, setCompareBase] = useState<CompareBase>('prev')
  const year = Number(mkey.slice(0, 4))

  /*
   * NEGOCIO Y PERSONAL, SEPARADOS.
   *
   * Esta pantalla miraba el libro entero, y para quien cobra a clientes eso
   * mezcla dos cosas que no se comparan: lo que gana vendiendo y lo que gasta
   * viviendo. «Gastaste un 40% mas que el mes pasado» no dice nada si la
   * subida fue comprar otra cuenta de Netflix para cinco clientes nuevos.
   *
   * El filtro va aqui arriba, sobre `visTx`, para que lo herede TODO lo de
   * abajo: el veredicto, las categorias, la serie, los informes. Filtrar
   * seccion por seccion habria dejado la mitad de la pantalla contestando a
   * una pregunta y la otra mitad a otra.
   *
   * Se recuerda en el dispositivo: es una preferencia de como miras tus
   * numeros, no un dato tuyo, y no tiene por que viajar en las copias.
   */
  const businesses = useBusiness(s => s.businesses)
  const puedeFiltrar = canScope(businesses)
  /* G1 · La misma frontera que Ganancia: de quién es cada movimiento. */
  const bizServices = useBusiness(s => s.services)
  const bizClients = useBusiness(s => s.clients)
  const bizCharges = useBusiness(s => s.charges)
  const owner = useMemo(
    () => makeOwner({ businesses, services: bizServices, clients: bizClients, charges: bizCharges }),
    [businesses, bizServices, bizClients, bizCharges],
  )
  const [scope, setScope] = useState<ReportScope>(() => {
    try {
      const guardado = localStorage.getItem('cuadre-report-scope')
      return guardado === 'business' || guardado === 'personal' ? guardado : 'all'
    } catch { return 'all' }
  })
  const cambiarScope = (s: ReportScope) => {
    setScope(s)
    try { localStorage.setItem('cuadre-report-scope', s) }
    catch { /* en privado no se recuerda, y no pasa nada */ }
  }

  const todoTx = useMemo(() => transactionsForTotals(transactions, accounts, currency, categories), [transactions, accounts, currency, categories])
  const visTx = useMemo(
    () => scopeTransactions(todoTx, businesses, puedeFiltrar ? scope : 'all', owner),
    [todoTx, businesses, puedeFiltrar, scope, owner],
  )
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
  const currentNetWorth = totalBalanceInBase(accounts, currency)
  // Todas las categorías del periodo (no recortadas): las top se muestran una a
  // una y el resto se agrega en "Otros" para que nada quede oculto y el donut
  // sume el 100% del gasto.
  const allExpenseRows = useMemo(() => byCategory(scopedTx, 'expense', categories), [scopedTx, categories])
  const totalExpense = Math.max(1, summary.expense)
  const monthly = monthlySeries(visTx, year)

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
  const base: CompareBase = period === 'month' ? compareBase : 'prev'
  const monthsBack = (k: number) => {
    const [y, m] = mkey.split('-').map(Number)
    const d = new Date(y, m - 1 - k, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const prevMkey = base === 'lastYear' ? monthsBack(12) : monthsBack(1)
  /*
   * «Tu media»: los tres meses anteriores divididos entre tres. Se escalan
   * los movimientos (y sus divisiones) para que todo lo que compara por
   * categoría o por concepto funcione igual que con un mes de verdad.
   */
  const avgTx = useMemo(() => {
    if (base !== 'avg') return null
    const keys = [monthsBack(1), monthsBack(2), monthsBack(3)]
    return visTx
      .filter(tx => keys.includes(tx.date.slice(0, 7)))
      .map(tx => ({ ...tx, amount: tx.amount / 3, splits: tx.splits?.map(sp => ({ ...sp, amount: sp.amount / 3 })) }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, visTx, mkey])
  const prevMonthTx = avgTx ?? txForMonth(visTx, prevMkey)
  const prevSum = totals(prevMonthTx)
  const prevCategoryRows = byCategory(prevMonthTx, 'expense', categories)
  const prevCategoryMap = new Map(prevCategoryRows.map(row => [row.category.id, row.amount]))
  const prevPace = prevSum.expense > 0 && dayOfMonth > 0 ? prevSum.expense / daysInMonth * dayOfMonth : 0
  const spendTrend = prevPace > 0 ? Math.round((summary.expense / prevPace - 1) * 100) : null
  const showTrend = period === 'month' && isCurrentMonth && monthTx.length > 0 && dayOfMonth >= 3
  const totalBudget = categories.filter(c => c.type === 'expense').reduce((sum, category) => sum + category.budget, 0)
  const budgetPct = totalBudget > 0 ? Math.min(100, Math.round(summary.expense / totalBudget * 100)) : 0

  const prevYear = year - 1
  const compareLabel = period === 'year' ? String(prevYear) : base === 'avg' ? t('anCmpAvgLabel') : monthLabel(prevMkey, dateLocale(lang))
  const showCompare = period === 'month' || period === 'year'
  const previousScopedTx = period === 'year'
    ? visTx.filter(tx => tx.date.startsWith(String(prevYear)))
    : prevMonthTx
  const categoryComparison = useMemo(
    () => showCompare ? compareCategoryTotals(scopedTx, previousScopedTx, categories, 'expense') : [],
    [scopedTx, previousScopedTx, categories, showCompare],
  )


  /*
   * A4 · A DÓNDE SE FUE. Una sola barra en vez de pedirle al ojo que compare
   * porciones de un anillo; el anillo sigue debajo para tocar y enfocar.
   */
  const shares = useMemo(() => spendShares(scopedTx, categories), [scopedTx, categories])

  /*
   * A2 · LO QUE EL SALDO NO ENSEÑA. Análisis resumía el libro como si no
   * existieran el negocio, lo que te deben, los caprichos por recuperar ni
   * los antojos en espera. Todo son cifras que la app ya tenía.
   */
  const charges = useBusiness(s => s.charges)
  const capricesItems = useCaprices(s => s.items)
  const wishItems = useWishes(s => s.items)
  const deNegocio = useMemo(() => {
    const vivos = businesses.filter(b => !b.archivedAt)
    // Con el filtro en Negocio o Personal la parte sería 100 o 0: no dice nada.
    if (!vivos.length || (puedeFiltrar && scope !== 'all')) return null
    return businessIncome(scopedTx, vivos, owner)
  }, [scopedTx, businesses, scope, puedeFiltrar, owner])
  const teDeben = useMemo(() => receivablesSummary(charges, localToday()).outstandingTotal, [charges])
  const caprichosFalta = capricesItems
    .filter(c => !c.closed)
    .reduce((sum, c) => sum + Math.max(0, capriceRemaining(c)), 0)
  const antojos = wishItems.filter(w => !w.resolvedAt)
  const antojosTotal = antojos.reduce((sum, w) => sum + w.amount, 0)
  const extras: Array<{ id: string; icon: IconName; label: string; value: string; pct?: number }> = []
  if (deNegocio && deNegocio.pct !== null && deNegocio.fromBusiness > 0) {
    extras.push({ id: 'biz', icon: 'briefcase', label: t('anFromBusiness').replace('{pct}', String(deNegocio.pct)), value: fmtVal(deNegocio.fromBusiness, currency), pct: deNegocio.pct })
  }
  if (teDeben > 0.005) extras.push({ id: 'owed', icon: 'receipt', label: t('anOwedToYou'), value: fmtVal(teDeben, currency) })
  if (caprichosFalta > 0.005) extras.push({ id: 'cap', icon: 'gift', label: t('anCapricesLeft'), value: fmtVal(caprichosFalta, currency) })
  if (antojos.length) extras.push({ id: 'wish', icon: 'heart', label: t('anWishesWaiting').replace('{n}', String(antojos.length)), value: fmtVal(antojosTotal, currency) })

  const heroLabel = period === 'week'
    ? (weekWindow.start
        ? `${new Date(`${weekWindow.start}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })} – ${new Date(`${weekWindow.end}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })}`
        : t('periodWeek'))
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

  /*
   * ANÁLISIS 2.6: SIN CAJONES.
   *
   * Antes: un veredicto, una dona y cinco acordeones cerrados que había que
   * abrir uno por uno (y que se cerraban al volver). Ahora la pantalla cuenta
   * el periodo de arriba abajo, en el orden en que uno se lo pregunta:
   * ¿cuánto me queda?, ¿voy mejor o peor?, ¿en qué se va?, ¿qué días gasto?,
   * ¿cómo voy a largo plazo? Cada gráfico se toca y lleva a los movimientos.
   */
  const todayISO = localToday()
  const daily = useMemo(() => dailySeries(visTx, mkey, todayISO), [visTx, mkey, todayISO])
  const prevDaily = useMemo(() => {
    if (base !== 'avg') return dailySeries(visTx, prevMkey, todayISO)
    const three = [1, 2, 3].map(k => dailySeries(visTx, monthsBack(k), todayISO))
    return three[0].map((p, i) => ({ ...p, expense: three.reduce((sum, arr) => sum + (arr[i]?.expense ?? 0), 0) / 3 }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visTx, prevMkey, todayISO, base, mkey])
  const pace = useMemo(() => monthPace(daily, prevDaily, todayISO), [daily, prevDaily, todayISO])
  const weekdays = useMemo(() => weekdayStats(daily), [daily])
  const fixedVar = useMemo(() => fixedVsVariable(scopedTx, visTx), [scopedTx, visTx])
  const [dayOpen, setDayOpen] = useState<string | null>(null)
  const [catOpen, setCatOpen] = useState<string | null>(null)

  const barPoints = useMemo(() => {
    if (period === 'month') return daily.map(p => ({ key: p.date, label: String(p.day), value: p.expense, future: p.future }))
    if (period === 'week') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(`${(weekWindow.start || `${mkey}-01`)}T00:00:00`)
        d.setDate(d.getDate() + i)
        const key = localToday(d)
        return { key, label: String(d.getDate()), value: weekWindow.tx.filter(tx => tx.date === key && tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0), future: key > todayISO }
      })
    }
    return monthly.map(m => ({ key: m.key, label: MONTHS_SHORT[parseInt(m.key.slice(5, 7)) - 1] ?? m.label, value: m.expense, future: m.key > currentMonthKey() }))
  }, [period, daily, weekWindow.start, weekWindow.tx, mkey, todayISO, monthly, MONTHS_SHORT])


  const weekdayName = (wd: number) => new Date(2024, 0, 7 + wd).toLocaleDateString(dateLocale(lang), { weekday: 'long' })
  const fixedTotal = fixedVar.fixed + fixedVar.variable
  const money0 = (n: number) => fmt(n, currency, { decimals: 0 })

  /*
   * ANÁLISIS 2.8 · CON LAS PIEZAS DE LA APP.
   *
   * La 2.6 quitó los cajones; seguían cuatro filas de controles antes del
   * primer dato y cada sección repetía los ingresos y los gastos. Ahora:
   *  A1  una fila de pastillas (periodo, filtro, comparar, compartir);
   *  A2  la tarjeta del periodo contesta primero («Te sobraron…»);
   *  A3  «Lo que hay que mirar»: una tarjeta de filas, cada una abre su detalle;
   *  A4  las categorías con su icono, su parte y la flecha contra la comparación;
   *  A5  preguntas rápidas al final.
   */
  const [scopeOpen, setScopeOpen] = useState(false)
  const [baseOpen, setBaseOpen] = useState(false)
  const [detail, setDetail] = useState<'pace' | 'evolution' | 'days' | 'floor' | 'sources' | null>(null)
  const [question, setQuestion] = useState<{ q: string; answer: string; sub: string } | null>(null)
  const netWorth = useNetWorthNow()
  const scopeLabel = scope === 'business'
    ? (businesses.filter(b => !b.archivedAt).length === 1 ? businesses.find(b => !b.archivedAt)!.name : t('scopeBusiness'))
    : scope === 'personal' ? t('scopePersonal') : t('scopeAll')

  // La semana normal, para decir si esta va por encima o por debajo.
  const weekNormal = useMemo(
    () => (period === 'week' && weekWindow.start ? normalWeekExpense(visTx, weekWindow.start) : null),
    [period, weekWindow.start, visTx],
  )
  // El día más caro del mes: una línea que lleva a ese día.
  const priciestDay = period === 'month'
    ? daily.filter(p => !p.future && p.expense > 0).reduce<typeof daily[number] | null>((m, p) => (!m || p.expense > m.expense ? p : m), null)
    : null
  const avgDay = period === 'month' ? (() => {
    const past = daily.filter(p => !p.future)
    return past.length ? past.reduce((s, p) => s + p.expense, 0) / past.length : 0
  })() : 0

  // A2 · El titular: la respuesta, no el porcentaje que asusta.
  const head = (() => {
    if (!scopedTx.length) return { line: t('noExpensesToAnalyze'), tone: '' }
    if (period === 'week') return { line: t('an28HeadWeek').replace('{amount}', money0(summary.expense)), tone: '' }
    if (summary.net >= 0) {
      return {
        line: (period === 'year' ? t('an28HeadYear').replace('{year}', String(year)) : t('an28HeadSaved')).replace('{amount}', money0(summary.net)),
        tone: 'ok',
      }
    }
    return { line: t('an28HeadOver').replace('{amount}', money0(-summary.net)), tone: 'bad' }
  })()
  const headSub = (() => {
    const parts: string[] = []
    if (period !== 'week' && rate !== null && summary.net >= 0) parts.push(t('an28OfIncome').replace('{pct}', String(Math.round(rate))))
    if (period === 'week' && weekNormal !== null) {
      const d = summary.expense - weekNormal
      parts.push(Math.abs(d) < weekNormal * 0.05
        ? t('an28WeekSame')
        : (d > 0 ? t('an28WeekMore') : t('an28WeekLess')).replace('{amount}', money0(Math.abs(d))))
    }
    if (period === 'month' && pace && pace.previousAtDay > 0) {
      const pct = Math.round((pace.current / pace.previousAtDay - 1) * 100)
      parts.push(Math.abs(pct) < 5
        ? t('an28PaceSame').replace('{month}', compareLabel)
        : (pct > 0 ? t('an28PaceMorePct') : t('an28PaceLessPct')).replace('{pct}', String(Math.abs(pct))).replace('{month}', compareLabel))
    }
    return parts.join(' · ')
  })()

  // A3 · Lo que hay que mirar, en filas.
  type LookRow = { key: string; icon: IconName; color: string; title: string; sub?: string; value?: string; valueTone?: string; onTap?: () => void; onHide?: () => void }
  const TONE_COLOR: Record<string, string> = { warn: '#f59e0b', danger: 'var(--m-expense)', ok: 'var(--m-income)', '': 'var(--m-primary)' }
  const look: LookRow[] = []
  for (const ins of visibleInsights) {
    if (ins.id === 'trend' || ins.id === 'projection' || ins.id === 'top-category') continue
    look.push({ key: ins.dismissKey, icon: ins.icon, color: TONE_COLOR[ins.tone] ?? TONE_COLOR[''], title: ins.title, sub: ins.subtitle, onTap: ins.action?.onClick, onHide: () => setHiding(ins) })
  }
  if (period === 'month' && pace && (pace.current > 0 || pace.previousAtDay > 0)) {
    look.push({
      key: 'pace', icon: pace.delta > 0 ? 'arrowUp' : 'arrowDn', color: pace.delta > 0 ? '#f59e0b' : 'var(--m-income)',
      title: Math.abs(pace.delta) < 1
        ? t('anPaceSame').replace('{month}', compareLabel)
        : (pace.delta > 0 ? t('an28PaceMore') : t('an28PaceLess')).replace('{month}', compareLabel),
      sub: pace.projected !== null ? t('anPaceProjection').replace('{amount}', money0(pace.projected)) : undefined,
      value: Math.abs(pace.delta) < 1 ? undefined : `${pace.delta > 0 ? '+' : '−'}${money0(Math.abs(pace.delta))}`,
      onTap: () => setDetail('pace'),
    })
  }
  if (period !== 'month' && barData.some(d => d.income > 0 || d.expense > 0)) {
    look.push({ key: 'evolution', icon: 'trend', color: 'var(--m-primary)', title: period === 'year' ? t('incomeVsExpense') : t('weeklyExpenses'), sub: t('an28SeeChart'), onTap: () => setDetail('evolution') })
  }
  if (period === 'month' && weekdays && weekdays.avg[weekdays.top] > 0) {
    look.push({
      key: 'days', icon: 'calendar', color: '#ffdd3d',
      title: t('an28DaysTop').replace('{day}', weekdayName(weekdays.top)),
      sub: t('an28DaysAvg').replace('{amount}', money0(weekdays.avg[weekdays.top])),
      onTap: () => setDetail('days'),
    })
  }
  if (fixedTotal > 0 && fixedVar.fixed > 0) {
    look.push({
      key: 'floor', icon: 'repeat', color: '#5bc0ff',
      title: t('an28Fixed').replace('{amount}', money0(fixedVar.fixed)),
      sub: t('an28FixedSub').replace('{pct}', String(Math.round((fixedVar.fixed / fixedTotal) * 100))),
      onTap: () => setDetail('floor'),
    })
  }
  if (period === 'month' && totalBudget > 0) {
    look.push({
      key: 'budget', icon: 'wallet', color: budgetPct >= 100 ? 'var(--m-expense)' : budgetPct >= 80 ? '#f59e0b' : 'var(--m-income)',
      title: t('an28Budget').replace('{pct}', String(budgetPct)), sub: t('an28BudgetSub'),
      value: `${budgetPct} %`, valueTone: budgetPct >= 100 ? 'bad' : '', onTap: onBudgets,
    })
  }
  for (const x of extras) look.push({ key: `x-${x.id}`, icon: x.icon, color: x.id === 'biz' ? '#5bc0ff' : x.id === 'owed' ? 'var(--m-income)' : x.id === 'cap' ? '#ff9a3d' : '#a78bfa', title: x.label, value: x.value })
  if (period === 'year' && yearHighlights?.incomeSources.length) {
    look.push({ key: 'sources', icon: 'briefcase', color: 'var(--m-income)', title: t('incomeSourcesTitle'), sub: yearHighlights.incomeSources.slice(0, 2).map(r => translateCategoryName(r.category, lang)).join(' · '), onTap: () => setDetail('sources') })
  }
  look.push({
    key: 'networth', icon: 'landmark', color: 'var(--m-income)',
    title: t('an28NetWorth').replace('{amount}', money0(netWorth.now)),
    sub: netWorth.change !== null && Math.abs(netWorth.change) >= 1
      ? (netWorth.change > 0 ? t('an28NetWorthUp') : t('an28NetWorthDown')).replace('{amount}', money0(Math.abs(netWorth.change)))
      : t('an28NetWorthSee'),
    onTap: onAccounts,
  })

  // A4 · La comparación de cada categoría, para su flecha.
  const cmpByCat = new Map(categoryComparison.map(r => [r.category.id, r]))

  // A5 · Preguntas rápidas: salen de tus comercios y categorías.
  const questions = useMemo(() => {
    const out: { q: string; answer: string; sub: string }[] = []
    const merchants = merchantTotals(visTx, year).filter(m => m.count >= 2).slice(0, 2)
    for (const m of merchants) {
      out.push({ q: t('an28QMerchant').replace('{name}', m.note), answer: money0(m.total), sub: t('an28QMerchantSub').replace('{n}', String(m.count)).replace('{year}', String(year)) })
    }
    const pricey = priciestMonth(visTx, year)
    if (pricey) {
      const why = biggestExpense(visTx, pricey.mkey)
      out.push({
        q: t('an28QPriciest'),
        answer: monthLabel(pricey.mkey, dateLocale(lang)),
        sub: t('an28QPriciestSub').replace('{amount}', money0(pricey.expense)) + (why ? ` · ${t('an28QBiggest').replace('{note}', why.note).replace('{amount}', money0(why.amount))}` : ''),
      })
    }
    const topYear = byCategory(visTx.filter(tx => tx.date.startsWith(String(year))), 'expense', categories)[0]
    if (topYear) {
      out.push({ q: t('an28QCategory').replace('{name}', translateCategoryName(topYear.category, lang)), answer: money0(topYear.amount), sub: t('an28QCategorySub').replace('{year}', String(year)) })
    }
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visTx, year, categories, lang, currency])

  const baseLabel = base === 'avg' ? t('anCmpAvgShort') : base === 'lastYear' ? t('anCmpLastYearShort') : t('anCmpPrevShort')

  return (
    <div className="man-root an28" id="man-capture">
      {/* A1 · Una fila: periodo, filtro, comparar y compartir. */}
      <div className="an28-ctrl">
        <div className="an28-pills" role="tablist" aria-label={t('periodLabel')}>
          {PERIODS.map(p => (
            <button key={p.id} className={period === p.id ? 'on' : ''} role="tab" aria-selected={period === p.id} onClick={() => setPeriod(p.id)}>
              {p.label}
            </button>
          ))}
          {puedeFiltrar && (
            <button className={scope !== 'all' ? 'on' : ''} onClick={() => setScopeOpen(true)} aria-haspopup="dialog">
              {scopeLabel} ▾
            </button>
          )}
          {period === 'month' && (
            <button className={base !== 'prev' ? 'on' : ''} onClick={() => setBaseOpen(true)} aria-haspopup="dialog">
              {baseLabel} ▾
            </button>
          )}
        </div>
        <button className="an28-share" aria-label={t('exportData')} onClick={() => setExportOpen(true)}>
          <Icon name="share" size={17} />
        </button>
      </div>

      {/* A2 · La tarjeta del periodo. */}
      <section className="an28-card an28-month">
        <span className="an28-label">{heroLabel}</span>
        <h2 className={`an28-head ${head.tone}`}>{head.line}</h2>
        {headSub && <p className="an28-sub">{headSub}</p>}
        {(summary.income > 0 || summary.expense > 0) && (
          <span className="an28-split" aria-hidden="true">
            <i style={{ flexGrow: Math.min(summary.expense, Math.max(summary.income, summary.expense)), background: 'var(--m-expense)' }} />
            {summary.net > 0 && <i style={{ flexGrow: summary.net, background: 'var(--m-income)' }} />}
          </span>
        )}
        <div className="an28-trio">
          <span><small>{t('anIn')}</small><b className="ok">{money0(summary.income)}</b></span>
          <span><small>{t('anOut')}</small><b className="bad">{money0(summary.expense)}</b></span>
          <span><small>{t('anLeft')}</small><b className={summary.net < 0 ? 'bad' : 'blue'}>{money0(summary.net)}</b></span>
        </div>
        {period === 'year' && yearHighlights ? (
          <>
            <div className="an28-yearbars" aria-hidden="true">
              {monthly.map(m => {
                const top = Math.max(1, ...monthly.map(x => Math.abs(x.net)))
                return <i key={m.key} className={m.net < 0 ? 'neg' : m.key > currentMonthKey() ? 'fut' : ''} style={{ height: `${Math.max(4, (Math.abs(m.net) / top) * 100)}%` }} />
              })}
            </div>
            <p className="an28-axis"><span>{MONTHS_SHORT[0]}</span><span>{t('an28YearBars')}</span><span>{MONTHS_SHORT[11]}</span></p>
          </>
        ) : scopedTx.length > 0 && (
          <SpendBars points={barPoints} highlight={dayOpen} onPick={key => setDayOpen(key)} />
        )}
        {priciestDay && avgDay > 0 && priciestDay.expense > avgDay * 2 && (
          <button className="an28-dayline" onClick={() => setDayOpen(priciestDay.date)}>
            <IconTile icon="alert" color="var(--m-expense)" size={30} />
            <span>
              {t('an28PriciestDay')
                .replace('{day}', String(priciestDay.day))
                .replace('{amount}', money0(priciestDay.expense))}
            </span>
            <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} />
          </button>
        )}
      </section>

      {/* A9 · El año: su mejor y su peor mes, con el porqué. */}
      {period === 'year' && yearHighlights && (
        <div className="an28-card an28-rows">
          <div className="an28-row">
            <IconTile icon="star" color="var(--m-income)" size={36} />
            <span className="an28-row-main"><b>{t('an28BestMonth').replace('{month}', yearHighlights.bestMonth.label)}</b><small>{t('an28BestMonthSub').replace('{amount}', money0(yearHighlights.bestMonth.net))}</small></span>
          </div>
          <div className="an28-row">
            <IconTile icon="alert" color="var(--m-expense)" size={36} />
            <span className="an28-row-main">
              <b>{t('an28WorstMonth').replace('{month}', yearHighlights.worstMonth.label)}</b>
              <small>
                {money0(yearHighlights.worstMonth.expense)}
                {(() => { const why = biggestExpense(visTx, yearHighlights.worstMonth.key); return why ? ` · ${t('an28QBiggest').replace('{note}', why.note).replace('{amount}', money0(why.amount))}` : '' })()}
              </small>
            </span>
          </div>
          {allExpenseRows[0] && (
            <div className="an28-row">
              <CatBadge category={allExpenseRows[0].category} size={36} />
              <span className="an28-row-main">
                <b>{t('an28TopCategory').replace('{name}', translateCategoryName(allExpenseRows[0].category, lang))}</b>
                <small>
                  {money0(allExpenseRows[0].amount)}
                  {(() => { const c = cmpByCat.get(allExpenseRows[0].category.id); return c && c.deltaPct !== null ? ` · ${t(c.deltaPct >= 0 ? 'an28MoreThan' : 'an28LessThan').replace('{pct}', String(Math.abs(c.deltaPct))).replace('{period}', compareLabel)}` : '' })()}
                </small>
              </span>
            </div>
          )}
        </div>
      )}

      {/* A3 · Lo que hay que mirar. */}
      {look.length > 0 && (
        <>
          <p className="an28-title">{t('an28Look')}</p>
          <div className="an28-card an28-rows">
            {look.map(r => (
              <div key={r.key} className="an28-row">
                <button className="an28-row-btn" onClick={r.onTap} disabled={!r.onTap}>
                  <IconTile icon={r.icon} color={r.color} size={36} />
                  <span className="an28-row-main"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                  {r.value && <span className={`an28-row-v ${r.valueTone ?? ''}`}>{r.value}</span>}
                  {r.onTap && !r.value && <Icon name="arrowUp" size={13} className="an28-chev" style={{ transform: 'rotate(90deg)' }} />}
                </button>
                {r.onHide && (
                  <button className="an28-hide" aria-label={t('hideInsightLabel')} onClick={r.onHide}><Icon name="close" size={13} /></button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* A4 · Categorías. */}
      <p className="an28-title">{t('an28WhereItWent')}{showCompare && <span>{t('an28Vs').replace('{period}', compareLabel)}</span>}</p>
      <div className="an28-card an28-cats">
        {shares.length > 0 && (
          <div className="man-stack" role="img" aria-label={shares.map(sh => `${sh.category ? translateCategoryName(sh.category, lang) : t('anTheRest')} ${sh.pct}%`).join(', ')}>
            {shares.map(sh => (
              <i key={sh.category?.id ?? 'rest'} className={sh.category ? undefined : 'rest'} style={{ flexGrow: sh.amount, background: sh.category?.color }} />
            ))}
          </div>
        )}
        {allExpenseRows.map(row => {
          const category = categories.find(item => item.id === row.category.id)
          const budget = category && category.budget > 0 && period === 'month' ? category.budget : 0
          const over = budget > 0 && row.amount > budget
          const cmp = cmpByCat.get(row.category.id)
          const pct = cmp?.deltaPct ?? null
          return (
            <button key={row.category.id} type="button" className="an28-cat" onClick={() => setCatOpen(row.category.id)}>
              <CatBadge category={row.category} size={36} />
              <span className="an28-row-main">
                <b>{translateCategoryName(row.category, lang)}</b>
                <small>
                  {over && <span className="bad">{t('an28OverBy').replace('{amount}', money0(row.amount - budget))} · </span>}
                  {Math.round(row.amount / totalExpense * 100)} %
                  {!over && budget > 0 && ` · ${t('an28LeftOf').replace('{amount}', money0(budget - row.amount))}`}
                </small>
              </span>
              <span className="an28-cat-v">
                <b>{money0(row.amount)}</b>
                {showCompare && cmp && (
                  <small className={cmp.delta > 0 ? 'bad' : cmp.delta < 0 ? 'ok' : ''}>
                    {Math.abs(cmp.delta) < 1 ? t('an28Same') : pct === null ? t('an28New') : `${cmp.delta > 0 ? '↑' : '↓'} ${Math.abs(pct)} %`}
                  </small>
                )}
              </span>
            </button>
          )
        })}
        {!allExpenseRows.length && <p className="man-empty">{t('noExpensesToAnalyze')}</p>}
      </div>

      {/* A5 · Preguntas rápidas. */}
      {questions.length > 0 && (
        <>
          <p className="an28-title">{t('an28Questions')}</p>
          <div className="an28-questions">
            {questions.map(q => <button key={q.q} onClick={() => setQuestion(q)}>{q.q}</button>)}
          </div>
        </>
      )}

      <div style={{ height: 'calc(12px + env(safe-area-inset-bottom))' }} />

      {/* ── Hojas ─────────────────────────────────────────────────── */}
      {scopeOpen && (
        <NxSheet title={t('an28ScopeTitle')} onClose={() => setScopeOpen(false)}>
          <div className="nx-list">
            {([
              { id: 'all' as const, icon: 'brand' as IconName, label: t('scopeAll'), sub: t('an28ScopeAllSub') },
              { id: 'personal' as const, icon: 'user' as IconName, label: t('scopePersonal'), sub: t('scopePersonalNote') },
              { id: 'business' as const, icon: 'briefcase' as IconName, label: scope === 'business' ? scopeLabel : (businesses.filter(b => !b.archivedAt).length === 1 ? businesses.find(b => !b.archivedAt)!.name : t('scopeBusiness')), sub: t('scopeBusinessNote') },
            ]).map(o => (
              <button key={o.id} className="an28-pick" onClick={() => { cambiarScope(o.id); setScopeOpen(false) }}>
                <IconTile icon={o.icon} color="var(--m-primary)" size={34} />
                <span className="an28-row-main"><b>{o.label}</b><small>{o.sub}</small></span>
                {scope === o.id && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        </NxSheet>
      )}

      {baseOpen && (
        <NxSheet title={t('an28BaseTitle')} onClose={() => setBaseOpen(false)}>
          <div className="nx-list">
            {([
              { id: 'prev' as const, label: t('anCmpPrev'), sub: monthLabel(monthsBack(1), dateLocale(lang)) },
              { id: 'lastYear' as const, label: t('anCmpLastYear'), sub: monthLabel(monthsBack(12), dateLocale(lang)) },
              { id: 'avg' as const, label: t('anCmpAvg'), sub: t('anCmpAvgSub') },
            ]).map(o => (
              <button key={o.id} className="an28-pick" onClick={() => { setCompareBase(o.id); setBaseOpen(false) }}>
                <span className="an28-row-main"><b>{o.label}</b><small>{o.sub}</small></span>
                {compareBase === o.id && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        </NxSheet>
      )}

      {detail === 'pace' && pace && (
        <NxSheet title={t('anPaceTitle')} sub={pace.projected !== null ? t('anPaceProjection').replace('{amount}', money0(pace.projected)) : undefined} onClose={() => setDetail(null)}>
          <PaceChart
            cur={daily.map((_, i) => daily.slice(0, i + 1).reduce((s, p) => s + p.expense, 0))}
            prev={prevDaily.map((_, i) => prevDaily.slice(0, i + 1).reduce((s, p) => s + p.expense, 0))}
            pace={pace}
          />
          <div className="man-bar-legend">
            <span><i style={{ background: 'var(--m-primary)' }} />{monthLabel(mkey, dateLocale(lang))}</span>
            <span><i className="dash" />{compareLabel}</span>
          </div>
        </NxSheet>
      )}

      {detail === 'evolution' && (
        <NxSheet title={period === 'year' ? t('incomeVsExpense') : t('weeklyExpenses')} onClose={() => setDetail(null)}>
          <div className="man-bar-chart">
            {barData.map(d => (
              <div key={d.label} className="man-bar-col">
                <div className="man-bar-tracks">
                  {(period !== 'week' || d.income > 0) && <div className="man-bar-income" style={{ height: `${Math.max(2, d.income / maxBar * 100)}%` }} />}
                  <div className="man-bar-expense" style={{ height: `${Math.max(2, d.expense / maxBar * 100)}%` }} />
                </div>
                <span className="man-bar-label">{d.label}</span>
              </div>
            ))}
          </div>
          <div className="man-bar-legend">
            <span><i style={{ background: 'var(--income)' }} />{t('incomes')}</span>
            <span><i style={{ background: 'var(--expense)' }} />{t('expenses')}</span>
          </div>
        </NxSheet>
      )}

      {detail === 'days' && (
        <NxSheet title={t('anDaysTitle')} sub={weekdays && weekdays.weekdayAvg > 0 ? t('anDaysWeekend').replace('{weekend}', money0(weekdays.weekendAvg)).replace('{weekday}', money0(weekdays.weekdayAvg)) : undefined} onClose={() => setDetail(null)}>
          <HeatCalendar points={daily} lang={lang} compact onPick={d => { setDetail(null); setDayOpen(d) }} />
        </NxSheet>
      )}

      {detail === 'floor' && (
        <NxSheet title={t('anFloorTitle')} sub={t('anFloorNote').replace('{amount}', money0(fixedVar.fixed))} onClose={() => setDetail(null)}>
          <div className="man-floor-bar">
            <i className="fixed" style={{ flexGrow: fixedVar.fixed }} />
            <i className="variable" style={{ flexGrow: fixedVar.variable }} />
          </div>
          <div className="man-floor-legend">
            <span><i className="fixed" />{t('anFixed')} <b>{money0(fixedVar.fixed)}</b></span>
            <span><i className="variable" />{t('anVariable')} <b>{money0(fixedVar.variable)}</b></span>
          </div>
        </NxSheet>
      )}

      {detail === 'sources' && yearHighlights && (
        <NxSheet title={t('incomeSourcesTitle')} onClose={() => setDetail(null)}>
          <div className="nx-list">
            {yearHighlights.incomeSources.map(row => (
              <div key={row.category.id} className="an28-pick">
                <CatBadge category={row.category} size={34} />
                <span className="an28-row-main"><b>{translateCategoryName(row.category, lang)}</b></span>
                <b className="ok">{money0(row.amount)}</b>
              </div>
            ))}
          </div>
        </NxSheet>
      )}

      {question && (
        <NxSheet title={question.q} onClose={() => setQuestion(null)}>
          <b className="an28-answer">{question.answer}</b>
          <p className="an28-sub">{question.sub}</p>
        </NxSheet>
      )}

      {dayOpen && (
        <DaySheet date={dayOpen} txs={visTx} currency={currency} lang={lang} onClose={() => setDayOpen(null)} onEditTx={onEditTx} />
      )}
      {catOpen && categories.find(c => c.id === catOpen) && (
        <CategorySheet
          category={categories.find(c => c.id === catOpen)!}
          allTx={visTx}
          periodTx={scopedTx}
          mkey={period === 'year' ? `${year}-12` : mkey}
          currency={currency}
          lang={lang}
          onClose={() => setCatOpen(null)}
          onEditTx={onEditTx}
        />
      )}

      {exportOpen && (
        <ExportSheet
          mkey={mkey}
          captureId="an28-share-card"
          captureName={`cuadre-${period}-${mkey}`}
          onClose={() => setExportOpen(false)}
          preview={(hide: boolean) => (
            <div className="an28-sharecard" id="an28-share-card">
              <div className="an28-sharecard-top"><b>Cuadre</b><span>{heroLabel}</span></div>
              <small>{summary.net >= 0 ? t('an28ShareLeft') : t('an28ShareOver')}</small>
              <strong>{hide ? (rate !== null ? `${Math.round(rate)} %` : '—') : money0(Math.abs(summary.net))}</strong>
              <div className="an28-sharecard-trio">
                <span><small>{t('anIn')}</small><b>{hide ? '·····' : money0(summary.income)}</b></span>
                <span><small>{t('anOut')}</small><b>{hide ? `${summary.income > 0 ? Math.round((summary.expense / summary.income) * 100) : 0} %` : money0(summary.expense)}</b></span>
                <span><small>{t('an28ShareRate')}</small><b>{rate !== null ? `${Math.round(rate)} %` : '—'}</b></span>
              </div>
              {allExpenseRows[0] && <small className="an28-sharecard-foot">{t('an28ShareTop').replace('{name}', translateCategoryName(allExpenseRows[0].category, lang))}</small>}
            </div>
          )}
        />
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
