import { useMemo, useState } from 'react'
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Icon } from '@/components/ui/Icon'
import { projectCashflow, safeToSpend } from '@/data/cashflowProjection'
import { currentMonthKey, dateLocale, fmtCompact, localToday, transactionsForTotals, txForMonth } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { useT } from '@/i18n'
import { MobileAmountSheet } from './MobileAmountSheet'
import { useMobileBackDismiss } from './useMobileBackDismiss'

type Horizon = 'month' | '30d' | '60d'

function horizonDate(horizon: Horizon, today: string): string {
  const d = new Date(`${today}T00:00:00`)
  if (horizon === 'month') {
    d.setMonth(d.getMonth() + 1, 0) // último día del mes actual
  } else {
    d.setDate(d.getDate() + (horizon === '30d' ? 30 : 60))
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Calendario de flujo de caja: proyección del saldo total día a día usando
 * recurrencias, suscripciones y aportes automáticos a metas.
 * Responde "¿me alcanza hasta fin de mes?".
 */
export function MobileCashflow() {
  const t = useT()
  const fmtVal = useFmt()
  const lang = useSettings(s => s.language)
  const { transactions, accounts, goals, currency } = useFinance()
  const buffer = useSettings(s => s.cashflowBuffer)
  const setBuffer = useSettings(s => s.setCashflowBuffer)
  const [horizon, setHorizon] = useState<Horizon>('month')
  const [bufferSheet, setBufferSheet] = useState(false)

  useMobileBackDismiss(bufferSheet, () => setBufferSheet(false))

  const today = localToday()
  const projection = useMemo(
    () => projectCashflow(transactions, accounts, goals, horizonDate(horizon, today), today, currency),
    [transactions, accounts, goals, horizon, today, currency],
  )

  const safe = useMemo(() => safeToSpend(projection, buffer), [projection, buffer])

  // Saldo proyectado por día hasta el próximo ingreso (o los primeros 14 días),
  // para la pista visual: verde donde aguantas, rojo donde caerías bajo cero.
  const runway = useMemo(() => {
    const boundary = safe.nextIncome?.date
    return projection.series.filter(p => !boundary || p.date <= boundary).slice(0, 14)
  }, [projection.series, safe.nextIncome])

  const locale = dateLocale(lang)
  const dayLabel = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })

  const goesNegative = projection.minBalance < 0

  const [cutPct, setCutPct] = useState(20)

  // Escenario a partir de tu RITMO real de gasto discrecional. La proyección de
  // arriba solo cuenta eventos programados (recibos, aportes), así que asume que
  // no gastas nada más — optimista. Aquí se estima lo que seguirás gastando al
  // ritmo de este mes y se deja simular un recorte, para responder «¿y si
  // aprieto?» en vez de solo mostrar un número fijo.
  const scenario = useMemo(() => {
    // Conversion a divisa base antes de medir el ritmo de gasto: el error no
    // solo desplaza el numero de hoy, se PROPAGA a toda la proyeccion.
    const monthTx = txForMonth(transactionsForTotals(transactions, accounts, currency), currentMonthKey())
    // Discrecional = gasto de este mes que NO viene de una plantilla recurrente
    // (esos ya los cuenta la proyección). Solo hasta hoy, para medir el ritmo.
    const spentSoFar = monthTx
      .filter(tx => tx.type === 'expense' && !tx.generatedFrom && tx.date <= today)
      .reduce((sum, tx) => sum + tx.amount, 0)
    const dayOfMonth = new Date(`${today}T00:00:00`).getDate()
    const avgDaily = spentSoFar / Math.max(1, dayOfMonth)

    const horizon = horizonDate('month', today)
    const daysLeft = Math.max(0, Math.round(
      (new Date(`${horizon}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
    ))
    const remaining = avgDaily * daysLeft
    const paceEnd = projection.endBalance - remaining
    const scenarioEnd = paceEnd + remaining * (cutPct / 100)
    return { remaining, paceEnd, scenarioEnd, daysLeft, hasData: remaining > 0 }
  }, [transactions, accounts, currency, today, projection.endBalance, cutPct])
  const chartData = projection.series.map(point => ({
    date: point.date,
    balance: Math.round(point.balance * 100) / 100,
    label: new Date(`${point.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
  }))

  return (
    <div className="mcash-root">
      <div className="mobile-tab-segment">
        <div className="mobile-segment mobile-segment-3" role="tablist" aria-label={t('cashflowTitle')}>
          <button className={horizon === 'month' ? 'on' : ''} role="tab" aria-selected={horizon === 'month'} onClick={() => setHorizon('month')}>
            {t('cashflowHorizonMonth')}
          </button>
          <button className={horizon === '30d' ? 'on' : ''} role="tab" aria-selected={horizon === '30d'} onClick={() => setHorizon('30d')}>
            {t('cashflowHorizon30')}
          </button>
          <button className={horizon === '60d' ? 'on' : ''} role="tab" aria-selected={horizon === '60d'} onClick={() => setHorizon('60d')}>
            {t('cashflowHorizon60')}
          </button>
        </div>
      </div>

      {/* Héroe: lo que puedes gastar tranquilo */}
      <div className={`mcash-safe${safe.amount < 0 ? ' neg' : ''}`}>
        <small>{t('cashflowSafeLabel')}</small>
        <strong>{fmtVal(Math.max(0, safe.amount), currency)}</strong>
        <button className="mcash-safe-sub" onClick={() => setBufferSheet(true)}>
          {safe.nextIncome
            ? t('cashflowSafeUntil').replace('{days}', String(safe.daysUntilIncome ?? 0))
            : t('cashflowSafeNoIncome')}
          {buffer > 0 && ` · ${t('cashflowBufferAside').replace('{amount}', fmtCompact(buffer, currency))}`}
          <Icon name="sliders" size={12} />
        </button>
        {safe.amount < 0 && <div className="mcash-safe-warn">{t('cashflowSafeNegative')}</div>}
      </div>

      {/* Pista de días hasta el próximo ingreso */}
      {runway.length > 1 && (
        <>
          <div className="mcash-runway">
            {runway.map(point => (
              <i key={point.date} style={{ background: point.balance < 0 ? 'var(--m-expense)' : 'color-mix(in oklab, var(--m-income) 55%, transparent)' }}
                title={`${dayLabel(point.date)}: ${fmtCompact(point.balance, currency)}`} />
            ))}
          </div>
          <p className="mcash-runway-cap">{t('cashflowRunwayCaption')}</p>
        </>
      )}

      {/* Antes de tu próximo ingreso */}
      {(safe.bills.length > 0 || safe.nextIncome) && (
        <div className="mcash-before">
          <div className="mcash-before-title">{t('cashflowBeforeIncome')}</div>
          {(() => {
            let after = projection.startBalance
            return safe.bills.map((bill, i) => {
              after += bill.amount
              return (
                <div key={`${bill.sourceId}:${i}`} className="mcash-before-row">
                  <span className={`mcash-event-icon mcash-event-${bill.kind}`}>
                    <Icon name={bill.kind === 'goal' ? 'target' : 'repeat'} size={13} />
                  </span>
                  <span className="mcash-before-main">
                    <b>{bill.kind === 'goal' ? `${t('cashflowGoalPrefix')} ${bill.note}` : bill.note}</b>
                    <small>{dayLabel(bill.date)} · {t('cashflowLeavesYou').replace('{amount}', fmtCompact(after, currency))}</small>
                  </span>
                  <b className="text-expense">{fmtCompact(bill.amount, currency)}</b>
                </div>
              )
            })
          })()}
          {safe.nextIncome && (
            <div className="mcash-before-row income">
              <span className="mcash-event-icon mcash-event-income"><Icon name="arrowUp" size={13} /></span>
              <span className="mcash-before-main">
                <b>{safe.nextIncome.note}</b>
                <small>{dayLabel(safe.nextIncome.date)}</small>
              </span>
              <b className="mcash-event-income">+{fmtCompact(safe.nextIncome.amount, currency)}</b>
            </div>
          )}
        </div>
      )}

      {scenario.hasData && (
        <div className="mcash-scenario">
          <div className="mcash-scenario-pace">
            <small>{t('cashflowAtPaceLabel')}</small>
            <b className={scenario.paceEnd < 0 ? 'text-expense' : ''}>{fmtVal(scenario.paceEnd, currency)}</b>
          </div>
          <label className="mcash-scenario-slider">
            <span>{t('cashflowCutLabel').replace('{pct}', String(cutPct))}</span>
            <input
              type="range" min={0} max={60} step={5}
              value={cutPct}
              aria-label={t('cashflowCutLabel').replace('{pct}', String(cutPct))}
              onChange={e => setCutPct(Number(e.target.value))}
            />
          </label>
          <div className="mcash-scenario-result">
            <span>{t('cashflowScenarioResult').replace('{pct}', String(cutPct))}</span>
            <strong className={scenario.scenarioEnd < 0 ? 'text-expense' : 'text-income'}>
              {fmtVal(scenario.scenarioEnd, currency)}
            </strong>
          </div>
        </div>
      )}

      {goesNegative && (
        <div className="mcash-warning" role="alert">
          <Icon name="alert" size={16} />
          <span>
            {t('cashflowNegativeWarning')
              .replace('{date}', dayLabel(projection.minDate))
              .replace('{amount}', fmtCompact(projection.minBalance, currency))}
          </span>
        </div>
      )}

      <div className="mcash-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="mcash-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" hide />
            <YAxis hide domain={['auto', 'auto']} />
            {goesNegative && <ReferenceLine y={0} stroke="#ff6b8a" strokeDasharray="4 4" strokeOpacity={0.7} />}
            <Tooltip
              formatter={value => [fmtCompact(Number(value ?? 0), currency), '']}
              labelFormatter={label => label}
              separator=""
              contentStyle={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 12, fontSize: 12, color: 'var(--text)',
              }}
            />
            <Area type="monotone" dataKey="balance" stroke="var(--accent)" strokeWidth={2} fill="url(#mcash-grad)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mcash-summary-row">
        <div className="mcash-summary-item">
          <small>{t('cashflowToday')}</small>
          <b>{fmtCompact(projection.startBalance, currency)}</b>
        </div>
        <div className="mcash-summary-item">
          <small>{t('cashflowLowestPoint')}</small>
          <b className={projection.minBalance < 0 ? 'text-expense' : ''}>
            {fmtCompact(projection.minBalance, currency)}
          </b>
          <span>{dayLabel(projection.minDate)}</span>
        </div>
      </div>

      {projection.days.length === 0 ? (
        <div className="mcash-empty">
          <Icon name="calendar" size={40} style={{ opacity: .18 }} />
          <p>{t('cashflowNoEvents')}</p>
          <small>{t('cashflowNoEventsHint')}</small>
        </div>
      ) : (
        <div className="mcash-days">
          {projection.days.map(day => (
            <article key={day.date} className="mcash-day">
              <header>
                <span className="mcash-day-date">{dayLabel(day.date)}</span>
                <span className={`mcash-day-balance${day.balance < 0 ? ' text-expense' : ''}`}>
                  {fmtCompact(day.balance, currency)}
                </span>
              </header>
              <div className="mcash-events">
                {day.events.map((event, index) => (
                  <div key={`${event.sourceId}:${index}`} className="mcash-event">
                    <span className={`mcash-event-icon mcash-event-${event.kind}`}>
                      <Icon name={event.kind === 'income' ? 'arrowUp' : event.kind === 'goal' ? 'target' : 'repeat'} size={14} />
                    </span>
                    <span className="mcash-event-note">
                      {event.kind === 'goal' ? `${t('cashflowGoalPrefix')} ${event.note}` : event.note}
                    </span>
                    <b className={event.amount < 0 ? 'text-expense' : 'mcash-event-income'}>
                      {event.amount >= 0 ? '+' : ''}{fmtCompact(event.amount, currency)}
                    </b>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}

      <p className="mcash-note">
        <Icon name="info" size={12} /> {t('cashflowNote')}
      </p>

      {bufferSheet && (
        <MobileAmountSheet
          title={t('cashflowBufferTitle')}
          value={buffer}
          currency={currency}
          onDone={v => { setBuffer(Math.max(0, v)); setBufferSheet(false) }}
          onClose={() => setBufferSheet(false)}
        />
      )}
    </div>
  )
}
