import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { sheetRoot } from '../SheetPortal'
import { Icon } from '@/components/ui/Icon'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { firstMonthDayDate, nextWeekdayDate, rampPlan, requiredContribution } from '@/data/goalPlans'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { playConfirmSound } from '@/lib/sound'
import { useT, type LangKey } from '@/i18n'
import type { CurrencyCode, Goal, GoalAutoContribute, IconName, RecurrenceFrequency } from '@/types'
import { MobileDatePicker } from '../MobileDatePicker'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { useDialogA11y } from '../useDialogA11y'
import { useMissingField } from '../useMissingField'
import { AccountChoice, AccountPickSheet, GOAL_COLORS, GOAL_ICONS } from './GoalBits'

export interface GoalPreset {
  id: string
  icon: IconName
  color: string
  nameKey?: LangKey
}

// Objetivos concretos: cada uno pre-llena nombre + icono + color.
export const GOAL_PRESETS: GoalPreset[] = [
  { id: 'emergency', icon: 'shield',     color: '#ffd60a', nameKey: 'goalPresetEmergency' },
  { id: 'vacation',  icon: 'plane',      color: '#0a84ff', nameKey: 'goalPresetVacation' },
  { id: 'car',       icon: 'car',        color: '#30d158', nameKey: 'goalPresetCar' },
  { id: 'home',      icon: 'home',       color: '#5e5ce6', nameKey: 'goalPresetHome' },
  { id: 'debt',      icon: 'handCoins',  color: '#e8445a', nameKey: 'goalPresetDebt' },
  { id: 'education', icon: 'graduation', color: '#c765ff', nameKey: 'goalPresetEducation' },
  { id: 'tech',      icon: 'phone',      color: '#64d2ff', nameKey: 'goalPresetTech' },
  { id: 'gift',      icon: 'gift',       color: '#ff6b8a', nameKey: 'goalPresetGift' },
]

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
function weekdayShortLabels(locale: string): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').slice(0, 3))
}
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

/** Cantidades redondas para la meta, según el tipo de objetivo. */
function targetChips(presetId: string | null): number[] {
  if (presetId === 'home' || presetId === 'car') return [200_000, 500_000, 1_000_000]
  if (presetId === 'gift' || presetId === 'tech') return [10_000, 25_000, 50_000]
  return [25_000, 50_000, 100_000]
}

function addMonthsISO(today: string, months: number): string {
  const d = new Date(`${today}T00:00:00`)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + months)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return localToday(d)
}

type Field = 'name' | 'target' | 'autoAmount' | 'autoAccount'

/*
 * CREAR UNA META EN TRES PASOS.
 *
 * El formulario de antes ponía todo en una hoja: nombre, sugerencias, monto,
 * fecha, 10 colores, 29 iconos, aporte automático, frecuencia, días, cuenta y
 * reto incremental. En un móvil pequeño era mucho bajar, el mismo problema que
 * la fecha tapada al editar un movimiento.
 *
 * 1 · ¿Para qué?  2 · ¿Cuánto y para cuándo?  3 · ¿Cómo vas a ahorrar?
 *
 * Al EDITAR una meta se ve todo en una sola hoja, en este mismo orden, porque
 * ahí se viene a cambiar una cosa concreta y los pasos estorbarían.
 */
export function GoalForm({ initial, currency, presetAuto, onSave, onClose }: {
  initial?: Goal
  currency: CurrencyCode
  /** Monto mensual que viene del simulador («Usar este»). */
  presetAuto?: number
  onSave: (data: Omit<Goal, 'id' | 'saved'>) => void
  onClose: () => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const { accounts } = useFinance()
  const today = localToday()
  const wizard = !initial
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const [presetId, setPresetId] = useState<string | null>(null)
  const [name, setName] = useState(initial?.name ?? '')
  const [suggested, setSuggested] = useState('')
  const [target, setTarget] = useState(initial?.target ?? 0)
  const [color, setColor] = useState(initial?.color ?? GOAL_COLORS[0])
  const [icon, setIcon] = useState<IconName>(initial?.icon ?? 'target')
  const [lookOpen, setLookOpen] = useState(false)
  const [deadline, setDeadline] = useState(initial?.deadline ?? '')
  const [targetSheet, setTargetSheet] = useState(false)
  const [showDate, setShowDate] = useState(false)

  const validAccounts = accounts.filter(a => a.type !== 'credit')
  const [autoEnabled, setAutoEnabled] = useState(!!initial?.autoContribute || !!presetAuto)
  const [autoAmount, setAutoAmount] = useState(presetAuto ?? initial?.autoContribute?.amount ?? 0)
  const [autoFrequency, setAutoFrequency] = useState<RecurrenceFrequency>(presetAuto ? 'monthly' : initial?.autoContribute?.frequency ?? 'monthly')
  const [autoAccountId, setAutoAccountId] = useState(initial?.autoContribute?.fromAccountId ?? validAccounts.find(a => a.type === 'savings')?.id ?? validAccounts[0]?.id ?? '')
  const [autoAmountSheet, setAutoAmountSheet] = useState(false)
  const [accountPicker, setAccountPicker] = useState(false)
  const [autoPlan, setAutoPlan] = useState<'fixed' | 'ramp'>(initial?.autoContribute?.increment ? 'ramp' : 'fixed')
  const [autoIncrement, setAutoIncrement] = useState(initial?.autoContribute?.increment ?? 0)
  const [autoIncrementSheet, setAutoIncrementSheet] = useState(false)
  const [autoWeekday, setAutoWeekday] = useState<number | null>(
    initial?.autoContribute?.frequency === 'weekly' && initial.autoContribute.nextDate
      ? new Date(`${initial.autoContribute.nextDate}T00:00:00`).getDay()
      : null,
  )
  const initMonthDays = initial?.autoContribute?.frequency === 'monthly' ? initial.autoContribute.monthDays : undefined
  const initMonthDay = initial?.autoContribute?.frequency === 'monthly' && initial.autoContribute.nextDate
    ? new Date(`${initial.autoContribute.nextDate}T00:00:00`).getDate()
    : undefined
  const [monthlyPayments, setMonthlyPayments] = useState<1 | 2>(initMonthDays && initMonthDays.length === 2 ? 2 : 1)
  const [monthDay1, setMonthDay1] = useState<number>(initMonthDays?.[0] ?? initMonthDay ?? 15)
  const [monthDay2, setMonthDay2] = useState<number>(initMonthDays?.[1] ?? 30)
  const [dayFor, setDayFor] = useState<1 | 2>(1)

  const weekdayLabels = useMemo(() => weekdayShortLabels(dateLocale(lang)), [lang])
  const deadlinePast = !!deadline && deadline < today
  const reach = useMissingField<Field>()

  const anySub = targetSheet || showDate || autoAmountSheet || autoIncrementSheet || accountPicker
  useMobileBackDismiss(!anySub, () => {
    if (wizard && step > 1) setStep(s => (s - 1) as 1 | 2)
    else onClose()
  })
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !anySub)

  const need = useMemo(() => {
    if (!deadline || target <= 0 || deadlinePast) return null
    return requiredContribution(target, initial?.saved ?? 0, deadline, autoFrequency, today)
  }, [target, deadline, deadlinePast, autoFrequency, initial?.saved, today])

  const rampPreview = useMemo(
    () => autoPlan === 'ramp' ? rampPlan(autoAmount, autoIncrement, target) : null,
    [autoPlan, autoAmount, autoIncrement, target],
  )

  const fieldLabel: Record<Field, string> = {
    name: t('fieldName'), target: t('fieldTarget'), autoAmount: t('fieldAutoAmount'), autoAccount: t('account'),
  }
  const missingIn = (s: 1 | 2 | 3): Field | null => {
    if (s === 1) return !name.trim() && !suggested ? 'name' : null
    if (s === 2) return target > 0 ? null : 'target'
    if (!autoEnabled) return null
    if (!autoAmount || autoAmount <= 0) return 'autoAmount'
    if (!autoAccountId) return 'autoAccount'
    return null
  }
  const missing = wizard ? missingIn(step) : (missingIn(1) ?? missingIn(2) ?? missingIn(3))

  const pickPreset = (preset: GoalPreset) => {
    setPresetId(preset.id)
    setIcon(preset.icon)
    setColor(preset.color)
    setSuggested(preset.nameKey ? t(preset.nameKey) : '')
  }

  const save = () => {
    playConfirmSound()
    const monthDays = autoFrequency === 'monthly'
      ? (monthlyPayments === 2 ? [...new Set([monthDay1, monthDay2])].sort((a, b) => a - b) : [monthDay1])
      : undefined
    const nextDate = autoFrequency === 'weekly' && autoWeekday !== null
      ? nextWeekdayDate(today, autoWeekday)
      : monthDays && monthDays.length
        ? firstMonthDayDate(today, monthDays)
        : initial?.autoContribute?.nextDate ?? advanceRecurrenceDate(today, autoFrequency)
    const autoContribute: GoalAutoContribute | undefined = autoEnabled
      ? {
          amount: autoAmount,
          frequency: autoFrequency,
          fromAccountId: autoAccountId,
          nextDate,
          ...(autoPlan === 'ramp' && autoIncrement > 0 ? { increment: autoIncrement } : {}),
          ...(monthDays && monthDays.length ? { monthDays } : {}),
        }
      : undefined
    onSave({
      name: name.trim() || suggested, target, color, icon, deadline: deadline || undefined, autoContribute,
      // Conserva lo que el formulario no toca: pausa y «lograda».
      ...(initial?.autoPaused && autoEnabled ? { autoPaused: true } : {}),
      ...(initial?.achievedAt ? { achievedAt: initial.achievedAt } : {}),
    })
  }

  const primary = () => {
    if (missing) {
      reach.goTo(missing)
      if (missing === 'target') setTimeout(() => setTargetSheet(true), 400)
      if (missing === 'autoAmount') setTimeout(() => setAutoAmountSheet(true), 400)
      if (missing === 'autoAccount') setTimeout(() => setAccountPicker(true), 400)
      return
    }
    if (wizard && step < 3) { setStep(s => (s + 1) as 2 | 3); return }
    save()
  }

  const fmtDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' })
  const deadlineChips: { key: string; label: string; value: string }[] = [
    { key: '3', label: t('deadlineIn3'), value: addMonthsISO(today, 3) },
    { key: '6', label: t('deadlineIn6'), value: addMonthsISO(today, 6) },
    { key: '12', label: t('deadlineIn12'), value: addMonthsISO(today, 12) },
  ]
  const deadlineIsChip = deadlineChips.some(c => c.value === deadline)

  // ── Secciones ──
  const sectionPurpose = (
    <div className="mgn-step">
      <h3 className="mgn-step-title">{t('wizStep1Title')}</h3>
      {wizard && (
        <div className="mgn-preset-grid">
          {GOAL_PRESETS.map(preset => (
            <button
              key={preset.id}
              className={`mgn-preset${presetId === preset.id ? ' on' : ''}`}
              aria-pressed={presetId === preset.id}
              onClick={() => pickPreset(preset)}
              style={{ ['--c' as string]: preset.color }}
            >
              <span><Icon name={preset.icon} size={20} /></span>
              <small>{preset.nameKey ? t(preset.nameKey) : ''}</small>
            </button>
          ))}
        </div>
      )}
      <label className={`mgl-field${reach.flashClass('name')}`} ref={reach.register('name')}>
        <span>{t('name')}</span>
        <input
          id="goal-name"
          className="mgl-input"
          placeholder={suggested || t('egGoalName')}
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </label>
      <button className={`txf-more-toggle${lookOpen ? ' open' : ''}`} aria-expanded={lookOpen} onClick={() => setLookOpen(o => !o)}>
        <span className="mgn-look-dot" style={{ background: color }}><Icon name={icon} size={13} /></span>
        <span className="txf-more-title">{t('customizeLook')}</span>
        <small />
        <Icon name="arrowUp" size={12} className="txf-more-chev" />
      </button>
      {lookOpen && (
        <div className="txf-more">
          <div className="mgl-colors">
            {GOAL_COLORS.map(c => (
              <button
                key={c}
                className={`mgl-color-dot${color === c ? ' on' : ''}`}
                aria-label={t('colorOption').replace('{c}', c)}
                aria-pressed={color === c}
                style={{ background: c, color: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="mgl-icons">
            {GOAL_ICONS.map(ic => (
              <button
                key={ic}
                className={`mgl-icon-btn${icon === ic ? ' on' : ''}`}
                aria-label={t('iconOption').replace('{ic}', ic)}
                aria-pressed={icon === ic}
                style={icon === ic ? { background: `color-mix(in oklab, ${color} 22%, transparent)`, color } : {}}
                onClick={() => setIcon(ic)}
              >
                <Icon name={ic} size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  const sectionAmount = (
    <div className="mgn-step">
      <h3 className="mgn-step-title">{t('wizStep2Title')}</h3>
      <button ref={reach.register('target')} className={`mgn-amount-big${reach.flashClass('target')}`} onClick={() => setTargetSheet(true)}>
        <small>{t('howMuchNeed')}</small>
        <span>{fmt(target, currency)}</span>
      </button>
      <div className="mgn-chips">
        {targetChips(presetId).map(v => (
          <button key={v} className={`mgn-chip${target === v ? ' on' : ''}`} aria-pressed={target === v} onClick={() => setTarget(v)}>
            {fmt(v, currency, { decimals: 0 })}
          </button>
        ))}
      </div>
      <span className="txf-section-label">{t('forWhen')}</span>
      <div className="mgn-chips">
        {deadlineChips.map(c => (
          <button key={c.key} className={`mgn-chip${deadline === c.value ? ' on' : ''}`} aria-pressed={deadline === c.value} onClick={() => setDeadline(c.value)}>
            {c.label}
          </button>
        ))}
        <button className={`mgn-chip${deadline && !deadlineIsChip ? ' on' : ''}`} onClick={() => setShowDate(true)}>
          <Icon name="calendar" size={13} /> {deadline && !deadlineIsChip ? fmtDay(deadline) : t('deadlinePick')}
        </button>
        <button className={`mgn-chip${!deadline ? ' on' : ''}`} aria-pressed={!deadline} onClick={() => setDeadline('')}>
          {t('noDeadlineChip')}
        </button>
      </div>
      {deadlinePast && <small className="mgn-warn-text">{t('deadlinePastWarning')}</small>}
      {need && (
        <div className="mgn-advice" style={{ borderColor: `color-mix(in oklab, ${color} 40%, transparent)` }}>
          <Icon name="bolt" size={15} style={{ color, flexShrink: 0 }} />
          <span>
            {(need.periods === 1 ? t('wizNeedOne') : t('wizNeed'))
              .replace('{amount}', fmt(need.amount, currency))
              .replace('{freq}', autoFrequency === 'weekly' ? t('perWeekShort') : t('perMonthShort'))
              .replace('{n}', String(need.periods))
              .replace('{periods}', autoFrequency === 'weekly' ? t('weeksLabel') : t('monthsLabel'))}
          </span>
          {wizard && (
            <button
              type="button"
              className="mgl-suggestion-use"
              style={{ background: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
              onClick={() => { setAutoEnabled(true); setAutoPlan('fixed'); setAutoAmount(need.amount); setStep(3) }}
            >
              {t('useSuggestionLabel')}
            </button>
          )}
        </div>
      )}
    </div>
  )

  const autoSummary = (() => {
    const acct = validAccounts.find(a => a.id === autoAccountId)?.name ?? ''
    const freqPhrase = autoFrequency === 'weekly'
      ? t('autoEveryWeek')
      : monthlyPayments === 2 ? t('autoTwiceMonth') : t('autoEveryMonth')
    let when = ''
    if (autoFrequency === 'weekly') {
      if (autoWeekday !== null) when = t('autoOnWeekday').replace('{day}', weekdayLabels[WEEKDAY_ORDER.indexOf(autoWeekday)] ?? '')
    } else if (monthlyPayments === 2) {
      const [d1, d2] = [monthDay1, monthDay2].sort((a, b) => a - b)
      when = t('autoOnDays').replace('{d1}', String(d1)).replace('{d2}', String(d2))
    } else {
      when = t('autoOnDay').replace('{d}', String(monthDay1))
    }
    const amt = fmt(autoAmount, currency)
    const lead = autoPlan === 'ramp' && autoIncrement > 0
      ? t('autoSummaryRampLead').replace('{amount}', amt).replace('{inc}', fmt(autoIncrement, currency))
      : amt
    return [lead, freqPhrase, when, acct ? t('autoFromAccount').replace('{account}', acct) : ''].filter(Boolean).join(' ')
  })()

  const sectionHow = (
    <div className="mgn-step">
      <h3 className="mgn-step-title">{t('wizStep3Title')}</h3>
      <div className="mgn-how">
        <button
          className={`mgn-how-opt${autoEnabled ? ' on' : ''}`}
          aria-pressed={autoEnabled}
          disabled={validAccounts.length === 0}
          onClick={() => {
            setAutoEnabled(true)
            // Empieza con lo que pide el plan, no en cero.
            if (!autoAmount && need) setAutoAmount(need.amount)
          }}
        >
          <Icon name="repeat" size={18} />
          <b>{t('wizHowAuto')}</b>
          <small>{t('wizHowAutoDesc')}</small>
        </button>
        <button className={`mgn-how-opt${!autoEnabled ? ' on' : ''}`} aria-pressed={!autoEnabled} onClick={() => setAutoEnabled(false)}>
          <Icon name="handCoins" size={18} />
          <b>{t('wizHowManual')}</b>
          <small>{t('wizHowManualDesc')}</small>
        </button>
      </div>

      {autoEnabled && (
        <div className="mgl-auto-card" style={{ borderColor: `color-mix(in oklab, ${color} 30%, transparent)` }}>
          {autoAmount > 0 && (
            <div className="mgl-auto-summary" style={{ color }}>
              <Icon name="repeat" size={13} />
              <span>{autoSummary}</span>
            </div>
          )}
          <div className={`mgl-field${reach.flashClass('autoAmount')}`} ref={reach.register('autoAmount')}>
            <span>{autoPlan === 'ramp' ? t('firstContributionLabel') : t('autoContributeAmountLabel')}</span>
            <button className="mgl-amount-tap" onClick={() => setAutoAmountSheet(true)}>
              <span>{fmt(autoAmount, currency)}</span>
              <Icon name="edit" size={14} style={{ opacity: .4 }} />
            </button>
          </div>

          <div className="mpr-form-section">
            <span className="mpr-overdraft-label">{t('frequencyLabel')}</span>
            <div className="mpr-pill-row">
              {(['weekly', 'monthly'] as RecurrenceFrequency[]).map(f => (
                <button
                  key={f}
                  className={`mpr-pill${autoFrequency === f ? ' on' : ''}`}
                  style={autoFrequency === f ? { borderColor: color, color } : {}}
                  onClick={() => setAutoFrequency(f)}
                >
                  {f === 'weekly' ? t('weekly') : t('monthly')}
                </button>
              ))}
            </div>
          </div>

          {autoFrequency === 'weekly' && (
            <div className="mgl-field">
              <span>{t('chargeDayLabel')}</span>
              <div className="mgl-weekday-row">
                {WEEKDAY_ORDER.map((wd, i) => {
                  const on = autoWeekday === wd
                  return (
                    <button
                      key={wd}
                      type="button"
                      className={`mgl-weekday${on ? ' on' : ''}`}
                      style={on ? { borderColor: color, background: `color-mix(in oklab, ${color} 18%, transparent)`, color } : {}}
                      onClick={() => setAutoWeekday(on ? null : wd)}
                    >
                      {weekdayLabels[i]}
                    </button>
                  )
                })}
              </div>
              <small className="mgl-weekday-hint">
                {autoWeekday === null ? t('chargeDayAnyHint') : t('chargeDayPickedHint')}
              </small>
            </div>
          )}

          {autoFrequency === 'monthly' && (
            <>
              <div className="mpr-form-section">
                <span className="mpr-overdraft-label">{t('monthlyPaymentsLabel')}</span>
                <div className="mpr-pill-row">
                  {([1, 2] as const).map(n => (
                    <button
                      key={n}
                      className={`mpr-pill${monthlyPayments === n ? ' on' : ''}`}
                      style={monthlyPayments === n ? { borderColor: color, color } : {}}
                      onClick={() => { setMonthlyPayments(n); setDayFor(1) }}
                    >
                      {n === 1 ? t('onePaymentLabel') : t('twoPaymentsLabel')}
                    </button>
                  ))}
                </div>
              </div>
              {/* Días del mes en cuadrícula propia, no el menú gris del sistema. */}
              <div className="mgl-field">
                {monthlyPayments === 2 ? (
                  <div className="mgn-dayfor">
                    <button className={dayFor === 1 ? 'on' : ''} onClick={() => setDayFor(1)}>{t('firstChargeDayLabel')}: <b>{monthDay1}</b></button>
                    <button className={dayFor === 2 ? 'on' : ''} onClick={() => setDayFor(2)}>{t('secondChargeDayLabel')}: <b>{monthDay2}</b></button>
                  </div>
                ) : (
                  <span>{t('chargeDayMonthLabel')}</span>
                )}
                <div className="mgn-daygrid">
                  {MONTH_DAYS.map(d => {
                    const on = (dayFor === 1 || monthlyPayments === 1 ? monthDay1 : monthDay2) === d
                    return (
                      <button
                        key={d}
                        className={on ? 'on' : ''}
                        aria-pressed={on}
                        style={on ? { background: color, borderColor: color } : undefined}
                        onClick={() => (dayFor === 2 && monthlyPayments === 2 ? setMonthDay2(d) : setMonthDay1(d))}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <div ref={reach.register('autoAccount')} className={reach.flashClass('autoAccount')}>
            <AccountChoice
              label={t('sourceAccount')}
              account={validAccounts.find(a => a.id === autoAccountId)}
              currency={currency}
              onOpen={() => setAccountPicker(true)}
            />
          </div>

          <div className="mpr-form-section mpr-toggle-row mgl-auto-ramp-toggle">
            <div className="mpr-toggle-row-text">
              <span className="mpr-toggle-row-label">{t('planRampLabel')}</span>
              <small className="mpr-toggle-row-desc">{t('rampToggleDesc')}</small>
            </div>
            <label className="mset-toggle-wrap">
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={autoPlan === 'ramp'}
                onChange={e => setAutoPlan(e.target.checked ? 'ramp' : 'fixed')}
              />
              <span className="mset-toggle" />
            </label>
          </div>

          {autoPlan === 'ramp' && (
            <>
              <div className="mgl-field">
                <span>{t('rampIncrementLabel')}</span>
                <button className="mgl-amount-tap" onClick={() => setAutoIncrementSheet(true)}>
                  <span>+{fmt(autoIncrement, currency)}</span>
                  <Icon name="edit" size={14} style={{ opacity: .4 }} />
                </button>
              </div>
              {rampPreview && autoIncrement > 0 && (
                <div className="mgl-ramp-preview" style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)` }}>
                  <div className="mgl-ramp-seq">
                    {rampPreview.first.map((v, i) => <span key={i}>{fmt(v, currency)}</span>)}
                    <span className="mgl-ramp-dots">···</span>
                  </div>
                  {target > 0 && (
                    <small>
                      {t('rampPreviewSummary')
                        .replace('{n}', String(rampPreview.periods))
                        .replace('{freq}', autoFrequency === 'weekly' ? t('weeksLabel') : t('monthsLabel'))
                        .replace('{total}', fmt(rampPreview.total, currency))}
                    </small>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {!autoEnabled && <p className="mgn-sheet-note">{t('wizManualNote')}</p>}
    </div>
  )

  const title = initial ? t('editGoal') : t('newGoal')
  const primaryLabel = missing
    ? t('missingFieldLabel').replace('{field}', fieldLabel[missing])
    : wizard && step < 3 ? t('wizNext') : initial ? t('save') : t('createGoal')

  return createPortal(
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={title}>
      <section className="mgl-form mgn-form" onClick={e => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          {wizard && <small className="mgn-step-count">{t('wizardStep').replace('{n}', String(step))}</small>}
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {wizard && (
          <div className="mgn-progress" aria-hidden="true">
            {[1, 2, 3].map(n => <i key={n} className={n <= step ? 'on' : ''} style={n <= step ? { background: color } : undefined} />)}
          </div>
        )}

        <div className="mgl-form-body">
          {wizard && step > 1 && (
            <div className="mgn-wiz-recap">
              <span className="mgn-sheet-icon" style={{ color, background: `color-mix(in oklab, ${color} 18%, transparent)` }}><Icon name={icon} size={18} /></span>
              <b>{name.trim() || suggested}</b>
              {step === 3 && target > 0 && <small>{fmt(target, currency)}</small>}
            </div>
          )}
          {(!wizard || step === 1) && sectionPurpose}
          {(!wizard || step === 2) && sectionAmount}
          {(!wizard || step === 3) && sectionHow}
        </div>

        <div className="mgl-form-actions">
          {wizard && step > 1
            ? <button className="mgl-btn-cancel" onClick={() => setStep(s => (s - 1) as 1 | 2)}>{t('wizBack')}</button>
            : <button className="mgl-btn-cancel" onClick={onClose}>{t('cancel')}</button>}
          <button
            className={`mgl-btn-save${missing ? ' form-save-missing' : ''}`}
            style={missing ? undefined : { background: color }}
            onClick={primary}
          >
            {primaryLabel}
          </button>
        </div>
      </section>

      {targetSheet && (
        <MobileAmountSheet
          title={t('target')}
          value={target}
          currency={currency}
          onDone={v => { setTarget(v); setTargetSheet(false) }}
          onClose={() => setTargetSheet(false)}
        />
      )}
      {showDate && (
        <MobileDatePicker
          value={deadline || addMonthsISO(today, 6)}
          onChange={v => { setDeadline(v); setShowDate(false) }}
          onClose={() => setShowDate(false)}
        />
      )}
      {autoAmountSheet && (
        <MobileAmountSheet
          title={autoPlan === 'ramp' ? t('firstContributionLabel') : t('autoContributeAmountLabel')}
          value={autoAmount}
          currency={currency}
          onDone={v => { setAutoAmount(v); setAutoAmountSheet(false) }}
          onClose={() => setAutoAmountSheet(false)}
        />
      )}
      {autoIncrementSheet && (
        <MobileAmountSheet
          title={t('rampIncrementLabel')}
          value={autoIncrement}
          currency={currency}
          onDone={v => { setAutoIncrement(v); setAutoIncrementSheet(false) }}
          onClose={() => setAutoIncrementSheet(false)}
        />
      )}
      {accountPicker && (
        <AccountPickSheet
          title={t('sourceAccount')}
          accounts={validAccounts}
          value={autoAccountId}
          onPick={setAutoAccountId}
          onClose={() => setAccountPicker(false)}
        />
      )}
    </div>,
    sheetRoot(),
  )
}
