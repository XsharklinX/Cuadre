import { useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { currentMonthKey, dateLocale, netWorthBreakdown, rollingNetWorthSeries, shortMonth, type NetWorthPoint } from '@/data/helpers'
import { projectNetWorth } from '@/data/netWorthProjection'
import { estimatedMonthlyRate, isGoalDone, projectArrival } from '@/data/goalPlans'
import { localToday } from '@/data/helpers'
import { useFmt } from '@/hooks/useFmt'
import { useT } from '@/i18n'
import { useDebt } from '@/store/debt'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { CurrencyCode } from '@/types'

/*
 * A7 · EL PATRIMONIO VIVE EN CUENTAS (2.8).
 *
 * Lo que tienes menos lo que debes es una foto de tus cuentas, no algo del
 * mes que miras en Análisis. Su tarjeta se mudó aquí; Análisis solo dice
 * cuánto creció y lleva a Cuentas.
 */

/** El patrimonio de hoy y cuánto cambió desde el mes pasado. Lo usa Análisis para su fila. */
export function useNetWorthNow() {
  const { accounts, transactions, goalContributions, currency } = useFinance()
  const lang = useSettings(s => s.language) ?? 'es'
  const debts = useDebt(s => s.debts)
  return useMemo(() => {
    const split = netWorthBreakdown(accounts, currency, debts)
    const series = rollingNetWorthSeries(accounts, transactions, goalContributions, currentMonthKey(), 2, dateLocale(lang), currency)
    const prev = series.length >= 2 ? series[series.length - 2].value : null
    const now = split.assets - split.liabilities
    return { now, change: prev === null ? null : (series[series.length - 1]?.value ?? now) - prev }
  }, [accounts, transactions, goalContributions, currency, lang, debts])
}

/**
 * Curva de patrimonio: doce meses reales y seis proyectados. SVG a mano para
 * no cargar una librería de gráficos.
 */
function NetWorthChart({ history, projected, currency, lang, fmtAmount }: {
  history: NetWorthPoint[]
  projected: NetWorthPoint[]
  currency: CurrencyCode
  lang: string
  fmtAmount: (n: number, c: CurrencyCode) => string
}) {
  const t = useT()
  const all = [...history, ...projected]
  if (all.length < 2) return null
  const W = 300, H = 90, PAD_Y = 8
  const values = all.map(p => p.value)
  const min = Math.min(...values), max = Math.max(...values)
  const span = max - min || 1
  const stepX = W / (all.length - 1)
  const yOf = (v: number) => H - PAD_Y - ((v - min) / span) * (H - PAD_Y * 2)
  const xOf = (i: number) => i * stepX
  const historyPoints = history.map((p, i) => `${xOf(i)},${yOf(p.value)}`).join(' ')
  const projectedPoints = [history[history.length - 1], ...projected].map((p, i) => `${xOf(history.length - 1 + i)},${yOf(p.value)}`).join(' ')
  const areaPath = `M${xOf(0)},${H} L${historyPoints.split(' ').join(' L')} L${xOf(history.length - 1)},${H} Z`
  const current = history[history.length - 1]
  const projectedEnd = projected[projected.length - 1]
  return (
    <div className="man-networth-chart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none">
        <defs>
          <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--income)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--income)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="man-nw-area" d={areaPath} fill="url(#nwGrad)" stroke="none" />
        <polyline className="man-nw-linea" pathLength={1} points={historyPoints} fill="none" stroke="var(--income)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={projectedPoints} fill="none" stroke="var(--income)" strokeWidth={1.6} strokeDasharray="3 3" strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />
        <circle className="man-nw-hoy" cx={xOf(history.length - 1)} cy={yOf(current.value)} r={3} fill="var(--income)" />
      </svg>
      <div className="man-networth-legend">
        <div><span>{shortMonth(history[0].key, dateLocale(lang))}</span><strong>{fmtAmount(history[0].value, currency)}</strong></div>
        <div><span>{t('today')}</span><strong>{fmtAmount(current.value, currency)}</strong></div>
        {projectedEnd && (
          <div className="man-networth-projected"><span>{t('netWorthProjectedLabel')}</span><strong>{fmtAmount(projectedEnd.value, currency)}</strong></div>
        )}
      </div>
    </div>
  )
}

export function NetWorthCard() {
  const t = useT()
  const fmtVal = useFmt()
  const { accounts, transactions, goalContributions, currency, goals } = useFinance()
  const lang = useSettings(s => s.language) ?? 'es'
  const debts = useDebt(s => s.debts)
  const mkey = currentMonthKey()
  const today = localToday()
  const history = useMemo(
    () => rollingNetWorthSeries(accounts, transactions, goalContributions, mkey, 12, dateLocale(lang), currency),
    [accounts, transactions, goalContributions, mkey, lang, currency],
  )
  const projected = useMemo(() => projectNetWorth(history, 6), [history])
  const split = useMemo(() => netWorthBreakdown(accounts, currency, debts), [accounts, currency, debts])
  const now = split.assets - split.liabilities
  const arrivals = useMemo(() => goals
    .filter(g => !isGoalDone(g))
    .map(g => ({ goal: g, arrival: projectArrival(g, estimatedMonthlyRate(g, goalContributions, today), today) }))
    .filter((x): x is { goal: typeof x.goal; arrival: NonNullable<typeof x.arrival> } => !!x.arrival && !x.arrival.reached)
    .sort((a, b) => a.arrival.dateISO.localeCompare(b.arrival.dateISO))
    .slice(0, 3), [goals, goalContributions, today])
  if (!accounts.length) return null
  return (
    <section className="nw-card" aria-label={t('netWorthTimelineTitle')}>
      <span className="nw-label">{t('netWorthTimelineTitle')}</span>
      <b className={`nw-big${now < 0 ? ' neg' : ''}`}>{fmtVal(now, currency)}</b>
      <small className="nw-sub">
        {t('netWorthBreakdownLabel')
          .replace('{assets}', fmtVal(split.assets, currency))
          .replace('{liabilities}', fmtVal(split.liabilities, currency))}
      </small>
      {history.length >= 2 && <NetWorthChart history={history} projected={projected} currency={currency} lang={lang} fmtAmount={fmtVal} />}
      {arrivals.length > 0 && (
        <div className="man-goal-arrivals">
          {arrivals.map(({ goal, arrival }) => (
            <span key={goal.id} className="man-goal-arrival" style={{ ['--c' as string]: goal.color }}>
              <Icon name={goal.icon} size={13} />
              {t('anGoalArrival')
                .replace('{name}', goal.name)
                .replace('{date}', new Date(`${arrival.dateISO}T00:00:00`).toLocaleDateString(dateLocale(lang), { month: 'short', year: 'numeric' }))}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}
