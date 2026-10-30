import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sheetRoot } from '../SheetPortal'
import { Icon } from '@/components/ui/Icon'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import {
  estimatedMonthlyRate, goalSeries, goalStatus, isGoalDone, monthsToAchieve, requiredContribution,
} from '@/data/goalPlans'
import { contributionDelta } from '@/data/helpers'
import { useT } from '@/i18n'
import type { CurrencyCode, Goal, GoalContribution } from '@/types'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { useDialogA11y } from '../useDialogA11y'
import { ProgressRing, goalPct, statusPill } from './GoalBits'

const MS_DAY = 86_400_000
const dayNum = (iso: string) => new Date(`${iso}T00:00:00`).getTime() / MS_DAY

/*
 * REAL CONTRA PLAN.
 *
 * El detalle era un anillo y tres cifras: decía cuánto llevas, no si vas
 * bien. La línea verde es lo que de verdad ahorraste; la punteada, lo que
 * tocaba para llegar a la fecha. Sin fecha límite, la punteada es «a tu
 * ritmo» desde hoy.
 */
function GoalChart({ goal, contributions, today, currency, lang }: {
  goal: Goal; contributions: GoalContribution[]; today: string; currency: CurrencyCode; lang: string
}) {
  const t = useT()
  const series = useMemo(() => goalSeries(goal, contributions, today), [goal, contributions, today])
  const rate = useMemo(() => estimatedMonthlyRate(goal, contributions, today), [goal, contributions, today])
  const W = 320, H = 132, padL = 4, padR = 4, padT = 14, padB = 22
  const x0 = dayNum(series.start), x1 = Math.max(dayNum(series.end), x0 + 1)
  const yMax = Math.max(goal.target, ...series.real.map(p => p.value)) || 1
  const X = (iso: string) => padL + ((dayNum(iso) - x0) / (x1 - x0)) * (W - padL - padR)
  const Y = (v: number) => padT + (1 - v / yMax) * (H - padT - padB)
  const pts = series.real.map(p => `${X(p.date).toFixed(1)},${Y(p.value).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const last = series.real[series.real.length - 1]
  const area = `${line} L${X(last.date).toFixed(1)},${Y(0).toFixed(1)} L${X(series.real[0].date).toFixed(1)},${Y(0).toFixed(1)} Z`
  // Sin plan: proyección a tu ritmo desde hoy hasta el final del eje.
  const pace = !series.plan && rate > 0
    ? { x2: X(series.end), y2: Y(Math.min(yMax, last.value + rate * ((x1 - dayNum(today)) / 30))) }
    : null
  const fmtMonth = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale(lang as 'es'), { month: 'short' })
  return (
    <div className="mgn-chart">
      <div className="mgn-chart-head">
        <b>{series.plan ? t('chartTitle') : t('chartTitlePace')}</b>
        <span>{fmtMonth(series.start)} → {fmtMonth(series.end)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={t('chartTitle')}>
        <line x1={padL} x2={W - padR} y1={Y(goal.target)} y2={Y(goal.target)} className="mgn-chart-grid" />
        <line x1={padL} x2={W - padR} y1={Y(0)} y2={Y(0)} className="mgn-chart-grid" />
        <text x={W - padR} y={Y(goal.target) - 4} textAnchor="end" className="mgn-chart-label">{fmt(goal.target, currency, { decimals: 0 })}</text>
        {series.plan && (
          <line
            x1={X(series.plan.from.date)} y1={Y(series.plan.from.value)}
            x2={X(series.plan.to.date)} y2={Y(series.plan.to.value)}
            className="mgn-chart-plan"
          />
        )}
        {pace && <line x1={X(today)} y1={Y(last.value)} x2={pace.x2} y2={pace.y2} className="mgn-chart-plan" />}
        <path d={area} className="mgn-chart-area mtac-anim" style={{ fill: `color-mix(in oklab, ${goal.color} 20%, transparent)` }} />
        <path d={line} className="mgn-chart-line mtac-anim" pathLength={1} style={{ stroke: goal.color }} />
        <line x1={X(today)} x2={X(today)} y1={padT - 6} y2={Y(0)} className="mgn-chart-today" />
        <circle cx={X(last.date)} cy={Y(last.value)} r={4} style={{ fill: goal.color }} />
        <text x={X(today) + 4} y={padT - 2} className="mgn-chart-label">{t('chartToday')}</text>
        <text x={padL} y={H - 6} className="mgn-chart-label">{fmtMonth(series.start)}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="mgn-chart-label">{fmtMonth(series.end)}</text>
      </svg>
      <div className="mgn-chart-legend">
        <span><i style={{ background: goal.color }} />{t('chartReal')}</span>
        <span><i className="dash" />{series.plan ? t('chartPlan') : t('chartPace')}</span>
      </div>
    </div>
  )
}

/*
 * ¿Y SI APORTO MÁS?
 *
 * Mueves el aporte al mes y la fecha de llegada se mueve en vivo. «Usar este»
 * lo convierte en el aporte automático (abre la edición con el monto puesto).
 */
function GoalSimulator({ goal, rate, currency, lang, onUse }: {
  goal: Goal; rate: number; currency: CurrencyCode; lang: string; onUse: (amount: number) => void
}) {
  const t = useT()
  const remaining = Math.max(0, goal.target - goal.saved)
  // Escala del deslizador: de un 2 % a un 40 % de lo que falta, en pasos redondos.
  const step = remaining > 200_000 ? 1_000 : remaining > 20_000 ? 500 : 100
  const min = Math.max(step, Math.round(remaining * 0.02 / step) * step)
  const max = Math.max(min + step, Math.round(remaining * 0.4 / step) * step)
  const start = Math.min(max, Math.max(min, Math.round((rate || remaining / 12) / step) * step))
  const [amount, setAmount] = useState(start)
  const months = Math.ceil(remaining / amount)
  const d = new Date(`${localToday()}T00:00:00`)
  d.setMonth(d.getMonth() + months, 1)
  const date = d.toLocaleDateString(dateLocale(lang as 'es'), { month: 'short', year: 'numeric' })
  const baseMonths = rate > 0 ? Math.ceil(remaining / rate) : null
  const diff = baseMonths !== null ? baseMonths - months : null
  const delta = diff === null ? ''
    : diff > 0 ? (diff === 1 ? t('simEarlierOne') : t('simEarlier').replace('{n}', String(diff)))
    : diff < 0 ? (diff === -1 ? t('simLaterOne') : t('simLater').replace('{n}', String(-diff)))
    : t('simSame')
  if (remaining <= 0) return null
  return (
    <div className="mgn-sim">
      <div className="mgn-sim-head">
        <b>{t('simTitle')}</b>
        <span className="mgn-sim-amount">{fmt(amount, currency)}<small>{t('perMonthShort')}</small></span>
      </div>
      <input
        id={`sim-${goal.id}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={amount}
        aria-label={t('simPerMonth')}
        onChange={e => setAmount(Number(e.target.value))}
        style={{ accentColor: goal.color }}
      />
      <div className="mgn-sim-foot">
        <span>
          {t('simArrive').replace('{date}', date)}
          {delta && <small className={diff !== null && diff < 0 ? 'later' : ''}> · {delta}</small>}
        </span>
        <button className="mgn-sim-use" style={{ color: goal.color }} onClick={() => onUse(amount)}>{t('simUse')}</button>
      </div>
    </div>
  )
}

/*
 * LA TARJETA CRECE HASTA SER EL DETALLE.
 *
 * El detalle abre desde el rectángulo de la tarjeta tocada (clip-path) y al
 * cerrar vuelve a él. Así se ve de dónde salió lo que estás mirando. Con
 * «reducir movimiento» se usa un fundido.
 */
export function GoalDetail({ goal, origin, currency, onClose, onContribute, onMenu, onUseAmount }: {
  goal: Goal
  origin: DOMRect | null
  currency: CurrencyCode
  onClose: () => void
  onContribute: () => void
  onMenu: () => void
  onUseAmount: (amount: number) => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const { accounts, goalContributions } = useFinance()
  const today = localToday()
  const ref = useRef<HTMLDivElement>(null)
  const [leaving, setLeaving] = useState(false)
  const status = useMemo(() => goalStatus(goal, goalContributions, today), [goal, goalContributions, today])
  const rate = useMemo(() => estimatedMonthlyRate(goal, goalContributions, today), [goal, goalContributions, today])
  const money = (n: number) => fmt(n, currency, { decimals: 0 })
  const pill = statusPill(status, t, lang, money)
  const p = goalPct(goal.saved, goal.target)
  const done = isGoalDone(goal)
  const history = useMemo(
    () => goalContributions.filter(c => c.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date)),
    [goalContributions, goal.id],
  )
  const need = goal.deadline && !done ? requiredContribution(goal.target, goal.saved, goal.deadline, 'monthly', today) : null
  const achievedMonths = done ? monthsToAchieve(goal, goalContributions) : null

  // Punto de partida del recorte: el rectángulo de la tarjeta.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !origin) return
    const vw = window.innerWidth, vh = window.innerHeight
    el.style.setProperty('--clip-from', `inset(${origin.top}px ${vw - origin.right}px ${vh - origin.bottom}px ${origin.left}px round 18px)`)
  }, [origin])

  const close = () => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduce || !origin) { onClose(); return }
    setLeaving(true)
    setTimeout(onClose, 230)
  }
  useMobileBackDismiss(true, close)
  const dialogRef = useDialogA11y<HTMLDivElement>(close, true)

  return createPortal(
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={goal.name} className="mgn-detail-wrap">
      <div ref={ref} className={`mgn-detail${origin ? ' morph' : ''}${leaving ? ' leaving' : ''}`} style={{ ['--c' as string]: goal.color }}>
        <header className="mgn-detail-head">
          <button className="mgn-sheet-x" aria-label={t('close')} onClick={close}><Icon name="arrowDn" size={18} style={{ transform: 'rotate(90deg)' }} /></button>
          <span className="mgn-sheet-icon" style={{ color: goal.color, background: `color-mix(in oklab, ${goal.color} 18%, transparent)` }}>
            <Icon name={goal.icon} size={18} />
          </span>
          <b>{goal.name}</b>
          <button className="mgn-sheet-x" aria-label={t('goalMenuLabel')} onClick={onMenu}><Icon name="dots" size={18} /></button>
        </header>

        <div className="mgn-detail-body">
          <div className="mgn-detail-hero">
            <ProgressRing pct={p} color={goal.color} size={92} stroke={9} intro>
              <strong>{p}%</strong>
            </ProgressRing>
            <div className="mgn-detail-hero-text">
              <b className="mgn-detail-saved">{fmt(goal.saved, currency)}</b>
              <small>
                {t('ofTargetLine').replace('{target}', fmt(goal.target, currency))}
                {!done && ` · ${t('goalRemainingShort').replace('{amount}', fmt(Math.max(0, goal.target - goal.saved), currency))}`}
              </small>
              <span className={`mgn-pill ${pill.tone}`}>
                {done && achievedMonths
                  ? (achievedMonths === 1 ? t('goalAchievedInOne') : t('goalAchievedIn').replace('{n}', String(achievedMonths)))
                  : pill.text}
              </span>
              {goal.autoContribute && (
                <span className={`mgn-pill ${goal.autoPaused ? 'muted' : 'auto'}`}>
                  <Icon name="repeat" size={11} />
                  {goal.autoPaused
                    ? t('autoPausedChip')
                    : t('autoContributeBadge')
                      .replace('{amount}', fmt(goal.autoContribute.amount, currency))
                      .replace('{freq}', goal.autoContribute.frequency === 'weekly' ? t('perWeekShort') : t('perMonthShort'))}
                </span>
              )}
            </div>
          </div>

          <GoalChart goal={goal} contributions={goalContributions} today={today} currency={currency} lang={lang} />

          {need && (
            <div className="mgn-advice" style={{ borderColor: `color-mix(in oklab, ${goal.color} 40%, transparent)` }}>
              <Icon name="bolt" size={15} style={{ color: goal.color, flexShrink: 0 }} />
              <span>
                {t('adviceNeed')
                  .replace('{amount}', fmt(need.amount, currency))
                  .replace('{date}', new Date(`${goal.deadline}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' }))}
                {rate > 0 && ` ${t('adviceNow').replace('{amount}', fmt(Math.round(rate), currency))}`}
              </span>
            </div>
          )}

          {!done && <GoalSimulator goal={goal} rate={rate} currency={currency} lang={lang} onUse={onUseAmount} />}

          <div className="mgn-history">
            <span className="mgn-section-title">{t('contributionHistory')}</span>
            {history.length === 0 ? (
              <p className="mgl-detail-history-empty">{t('noContributionsYet')}</p>
            ) : (
              <div className="mgl-history-list">
                {history.map(c => (
                  <div key={c.id} className="mgl-history-row">
                    <span className={`mgl-history-icon${c.withdraw ? ' mgn-out' : ''}`} style={c.withdraw ? undefined : { background: `color-mix(in oklab, ${goal.color} 16%, transparent)`, color: goal.color }}>
                      <Icon name={c.withdraw ? 'download' : 'plus'} size={13} />
                    </span>
                    <div className="mgl-history-info">
                      <strong className={c.withdraw ? 'mgn-out-text' : ''}>
                        {contributionDelta(c) < 0 ? '−' : '+'}{fmt(c.amount, currency)}
                      </strong>
                      <small>
                        {c.withdraw ? `${t('withdrawalLabel')} · ` : ''}
                        {accounts.find(a => a.id === c.fromAccountId)?.name ?? '—'}
                      </small>
                    </div>
                    <small className="mgl-history-date">
                      {new Date(`${c.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })}
                    </small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {!done && (
          <div className="mgl-form-actions">
            <button className="mgl-btn-save" style={{ background: goal.color }} onClick={onContribute}>
              <Icon name="plus" size={16} /> {t('contribute')}
            </button>
          </div>
        )}
      </div>
    </div>,
    sheetRoot(),
  )
}
