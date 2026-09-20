import { useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { sheetRoot } from './SheetPortal'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useFinance } from '@/store/finance'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useSettings } from '@/store/settings'
import { dateLocale, fmt, localToday, savingsBalance } from '@/data/helpers'
import { CURRENCIES } from '@/data/seed'
import { playKeySound, playBackspaceSound, playDoneSound, playConfirmSound, playDeleteSound, playAchievementSound } from '@/lib/sound'
import { useT, type LangKey } from '@/i18n'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { estimatedMonthlyRate, firstMonthDayDate, nextWeekdayDate, projectArrival, rampPlan, requiredContribution } from '@/data/goalPlans'
import { MobileDatePicker } from './MobileDatePicker'
import { MobileAmountSheet } from './MobileAmountSheet'
import type { CurrencyCode, Goal, GoalAutoContribute, IconName, RecurrenceFrequency, ViewProps } from '@/types'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { useSubmitGuard } from './useSubmitGuard'

const COLORS = [
  '#ffdd3d','#ff6b35','#e8445a','#c765ff','#5e5ce6',
  '#0a84ff','#30d158','#ffd60a','#ff9f0a','#64d2ff',
]

const ICONS: IconName[] = [
  'target','piggy','home','car','plane','book','heart','graduation',
  'gift','trophy','shield','star','briefcase','wallet','laptop','phone',
  'gym','coffee','tree','crown','map','package','tool','monitor',
  'banknote','coins','handCoins','landmark','receipt',
]

interface GoalPreset {
  id: string
  icon: IconName
  color: string
  /** Nombre pre-cargado (undefined = "Personalizado", abre el formulario en blanco). */
  nameKey?: LangKey
}

// Objetivos concretos: cada uno pre-llena nombre + icono + color, así elegir
// uno u otro sí cambia el resultado (a diferencia de un simple "propósito").
const GOAL_PRESETS: GoalPreset[] = [
  { id: 'emergency', icon: 'shield',    color: '#ffd60a', nameKey: 'goalPresetEmergency' },
  { id: 'vacation',  icon: 'plane',     color: '#0a84ff', nameKey: 'goalPresetVacation' },
  { id: 'car',       icon: 'car',       color: '#30d158', nameKey: 'goalPresetCar' },
  { id: 'home',      icon: 'home',      color: '#5e5ce6', nameKey: 'goalPresetHome' },
  { id: 'debt',      icon: 'handCoins', color: '#e8445a', nameKey: 'goalPresetDebt' },
  { id: 'education', icon: 'graduation', color: '#c765ff', nameKey: 'goalPresetEducation' },
  { id: 'tech',      icon: 'phone',     color: '#64d2ff', nameKey: 'goalPresetTech' },
  { id: 'gift',      icon: 'gift',      color: '#ff6b8a', nameKey: 'goalPresetGift' },
]
const CUSTOM_PRESET: GoalPreset = { id: 'custom', icon: 'star', color: COLORS[0] }

type Sheet =
  | { type: 'purpose' }
  | { type: 'add' | 'edit'; goal?: Goal; presetIcon?: IconName; presetColor?: string; presetName?: string }
  | { type: 'detail'; goal: Goal }
  | null

function pct(saved: number, target: number) {
  if (!target) return 0
  return Math.min(100, Math.round((saved / target) * 100))
}

function ProgressRing({
  pct: value,
  color,
  size = 52,
  stroke = 5,
  children,
}: {
  pct: number
  color: string
  size?: number
  stroke?: number
  children?: ReactNode
}) {
  const radius = (size - stroke) / 2
  const dash = 2 * Math.PI * radius
  const clamped = Math.min(100, Math.max(0, value))
  const fill = (dash * clamped) / 100
  const c = size / 2
  return (
    <div className="mgl-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} stroke="rgba(255,255,255,.08)" />
        <circle
          cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} stroke={color}
          strokeDasharray={`${fill} ${dash - fill}`}
          strokeDashoffset={dash / 4}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray var(--m-duration-slow, 220ms) var(--m-ease-out, ease)' }}
        />
      </svg>
      {children && <span className="mgl-ring-content">{children}</span>}
    </div>
  )
}

function daysLeftLabel(deadline: string | undefined, today: string, t: ReturnType<typeof useT>): { text: string; overdue: boolean } | null {
  if (!deadline) return null
  const diff = Math.ceil((new Date(`${deadline}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000)
  if (diff < 0) return { text: t('goalOverdueLabel'), overdue: true }
  if (diff === 0) return { text: t('goalDueToday'), overdue: false }
  if (diff === 1) return { text: t('goalDaysLeftOne'), overdue: false }
  return { text: t('goalDaysLeftMany').replace('{n}', String(diff)), overdue: false }
}

function currencyPrefix(currency: CurrencyCode): string {
  return CURRENCIES[currency].symbol
}

// Etiqueta corta de frecuencia para los badges: "/sem", "/mes" o "×2/mes".
function autoFreqShort(auto: GoalAutoContribute, t: ReturnType<typeof useT>): string {
  if (auto.frequency === 'weekly') return t('perWeekShort')
  return auto.monthDays && auto.monthDays.length === 2 ? t('perTwiceMonthShort') : t('perMonthShort')
}

// Días del mes 1-31 para los selectores de cobro mensual.
const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

// Días de la semana empezando en lunes, con su índice JS (0=Dom … 6=Sáb).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
function weekdayShortLabels(locale: string): string[] {
  // 2024-01-01 fue lunes: generamos etiquetas cortas localizadas lunes→domingo.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').slice(0, 3))
}

function fmtAmountText(text: string, prefix: string): string {
  if (!text) return `${prefix} 0`
  const n = parseFloat(text)
  if (isNaN(n)) return `${prefix} 0`
  if (text.endsWith('.')) return `${prefix} ${n.toLocaleString('en-US')}.`
  return `${prefix} ${n.toLocaleString('en-US', { minimumFractionDigits: text.includes('.') ? 2 : 0 })}`
}

const NUMPAD_KEYS = ['1','2','3','4','5','6','7','8','9','.','0','back'] as const

function GoalNumpad({
  amountText,
  onPress,
  prefix,
  onDone,
}: {
  amountText: string
  onPress: (k: string) => void
  prefix: string
  onDone: () => void
}) {
  const t = useT()
  return (
    <div className="mgl-numpad-view">
      <div className="mgl-numpad-display">{fmtAmountText(amountText, prefix)}</div>
      <div className="mgl-numpad-grid">
        {NUMPAD_KEYS.map(k => (
          <button
            key={k}
            className={k === 'back' ? 'mgl-numpad-back' : 'mgl-numpad-key'}
            onClick={() => onPress(k)}
          >
            {k === 'back' ? <Icon name="close" size={18} /> : k}
          </button>
        ))}
      </div>
      <button className="mgl-numpad-done" onClick={onDone}>{t('done')}</button>
    </div>
  )
}

function GoalCard({ goal, currency, projection, onClick }: { goal: Goal; currency: string; projection?: string | null; onClick: () => void }) {
  const t = useT()
  const p = pct(goal.saved, goal.target)
  const cur = currency as Parameters<typeof fmt>[1]
  const today = localToday()
  const done = goal.saved >= goal.target
  const deadlineInfo = !done ? daysLeftLabel(goal.deadline, today, t) : null
  return (
    <button className="mgl-card" onClick={onClick}>
      <div className="mgl-card-top">
        <ProgressRing pct={p} color={goal.color} size={52} stroke={5}>
          <Icon name={goal.icon} size={20} style={{ color: goal.color }} />
        </ProgressRing>
        <div className="mgl-card-info">
          <strong>{goal.name}</strong>
          <span className="mgl-card-amounts">
            {fmt(goal.saved, cur)} <span className="mgl-dim">{t('of')} {fmt(goal.target, cur)}</span>
          </span>
        </div>
        <span className="mgl-pct" style={{ color: goal.color }}>{p}%</span>
      </div>
      {(deadlineInfo || goal.autoContribute || done || projection) && (
        <div className="mgl-card-chips">
          {done && (
            <span className="mgl-chip mgl-chip-done">
              <Icon name="check" size={11} /> {t('goalCompletedLabel')}
            </span>
          )}
          {/* Proyección «a tu ritmo llegas en …» — el dato que motiva. Solo si
              hay ritmo estimado y la meta no está enlazada a una fecha límite
              (ahí manda la fecha, no la proyección). */}
          {!done && projection && !deadlineInfo && (
            <span className="mgl-chip mgl-chip-proj">
              <Icon name="trend" size={11} /> {projection}
            </span>
          )}
          {deadlineInfo && (
            <span className={`mgl-chip${deadlineInfo.overdue ? ' mgl-chip-warn' : ''}`}>
              <Icon name="calendar" size={11} /> {deadlineInfo.text}
            </span>
          )}
          {goal.autoContribute && (
            <span className="mgl-chip">
              <Icon name="repeat" size={11} />
              {t('autoContributeBadge')
                .replace('{amount}', fmt(goal.autoContribute.amount, cur))
                .replace('{freq}', autoFreqShort(goal.autoContribute, t))}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

function GoalPurposeSheet({
  onPick,
  onClose,
}: {
  onPick: (preset: GoalPreset) => void
  onClose: () => void
}) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, true)

  return createPortal(
    // No cierra al tocar fuera (se cerraba con cualquier toque accidental); se
    // sale con la X del encabezado o el gesto de atrás.
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('newGoal')}>
      <section className="mgl-purpose-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          <span>{t('newGoal')}</span>
          <span aria-hidden="true" />
        </header>
        <div className="mgl-purpose-body">
          <h2>{t('goalPurposeTitle')}</h2>
          <p>{t('goalPurposeSubtitle')}</p>
          <div className="mgl-preset-grid">
            {GOAL_PRESETS.map(preset => (
              <button key={preset.id} className="mgl-preset-card" onClick={() => onPick(preset)}>
                <span className="mgl-preset-icon" style={{
                  color: preset.color,
                  background: `color-mix(in oklab, ${preset.color} 18%, transparent)`,
                }}>
                  <Icon name={preset.icon} size={22} />
                </span>
                <span className="mgl-preset-name">{preset.nameKey ? t(preset.nameKey) : ''}</span>
              </button>
            ))}
          </div>
          <button className="mgl-preset-custom" onClick={() => onPick(CUSTOM_PRESET)}>
            <span className="mgl-preset-custom-icon"><Icon name="plus" size={18} /></span>
            <span>
              <strong>{t('goalPresetCustom')}</strong>
              <small>{t('goalPresetCustomDesc')}</small>
            </span>
            <Icon name="arrowUp" size={14} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)', flexShrink: 0 }} />
          </button>
        </div>
      </section>
    </div>,
    sheetRoot(),
  )
}

function GoalForm({
  initial,
  currency,
  presetIcon,
  presetColor,
  presetName,
  onSave,
  onClose,
}: {
  initial?: Goal
  currency: string
  presetIcon?: IconName
  presetColor?: string
  presetName?: string
  onSave: (data: Omit<Goal,'id'|'saved'>) => void
  onClose: () => void
}) {
  const t = useT()
  const { accounts } = useFinance()
  const [name, setName]             = useState(initial?.name ?? '')
  // Nombre SUGERIDO por el preset elegido: se muestra como placeholder y se usa
  // solo si el usuario no escribe uno propio — así el preset aporta icono/color
  // (la parte "categoría") sin obligarte a borrar un nombre puesto a la fuerza.
  const [suggested, setSuggested]   = useState(presetName ?? '')
  const [amountText, setAmountText] = useState(initial?.target?.toString() ?? '')
  const [color, setColor]           = useState(initial?.color ?? presetColor ?? COLORS[0])
  const [icon, setIcon]             = useState<IconName>(initial?.icon ?? presetIcon ?? 'target')
  const [deadline, setDeadline]     = useState(initial?.deadline ?? '')
  const [showNumpad, setShowNumpad] = useState(false)
  const [showDate, setShowDate]     = useState(false)

  const validAccounts = accounts.filter(a => a.type !== 'credit')
  const [autoEnabled, setAutoEnabled]     = useState(!!initial?.autoContribute)
  const [autoAmount, setAutoAmount]       = useState(initial?.autoContribute?.amount ?? 0)
  const [autoFrequency, setAutoFrequency] = useState<RecurrenceFrequency>(initial?.autoContribute?.frequency ?? 'monthly')
  const [autoAccountId, setAutoAccountId] = useState(initial?.autoContribute?.fromAccountId ?? validAccounts[0]?.id ?? '')
  const [autoAmountSheet, setAutoAmountSheet] = useState(false)
  const [autoPlan, setAutoPlan] = useState<'fixed' | 'ramp'>(initial?.autoContribute?.increment ? 'ramp' : 'fixed')
  const [autoIncrement, setAutoIncrement] = useState(initial?.autoContribute?.increment ?? 0)
  const [autoIncrementSheet, setAutoIncrementSheet] = useState(false)
  const [autoWeekday, setAutoWeekday] = useState<number | null>(
    initial?.autoContribute?.frequency === 'weekly' && initial.autoContribute.nextDate
      ? new Date(`${initial.autoContribute.nextDate}T00:00:00`).getDay()
      : null,
  )
  // Pagos mensuales: 1 o 2 al mes, con su(s) día(s). Se rehidrata desde
  // `monthDays` si existe; si no, del día de `nextDate` (metas antiguas).
  const initMonthDays = initial?.autoContribute?.frequency === 'monthly' ? initial.autoContribute.monthDays : undefined
  const initMonthDay = initial?.autoContribute?.frequency === 'monthly' && initial.autoContribute.nextDate
    ? new Date(`${initial.autoContribute.nextDate}T00:00:00`).getDate()
    : undefined
  const [monthlyPayments, setMonthlyPayments] = useState<1 | 2>(initMonthDays && initMonthDays.length === 2 ? 2 : 1)
  const [monthDay1, setMonthDay1] = useState<number>(initMonthDays?.[0] ?? initMonthDay ?? 1)
  const [monthDay2, setMonthDay2] = useState<number>(initMonthDays?.[1] ?? 15)

  const lang = useSettings(s => s.language)
  const cur = currency as CurrencyCode
  const prefix = currencyPrefix(cur)
  const today = localToday()
  const deadlinePast = !!deadline && deadline < today
  const weekdayLabels = useMemo(() => weekdayShortLabels(dateLocale(lang)), [lang])

  useMobileBackDismiss(true, showNumpad ? () => setShowNumpad(false) : showDate ? () => setShowDate(false) : autoAmountSheet ? () => setAutoAmountSheet(false) : autoIncrementSheet ? () => setAutoIncrementSheet(false) : onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !showNumpad && !showDate && !autoAmountSheet && !autoIncrementSheet)

  // Vista previa del reto incremental: primeros aportes, nº de plazos y total.
  const rampPreview = useMemo(
    () => autoPlan === 'ramp' ? rampPlan(autoAmount, autoIncrement, parseFloat(amountText) || 0) : null,
    [autoPlan, autoAmount, autoIncrement, amountText],
  )

  // Calculadora inversa: con meta + fecha límite, sugerimos el aporte por
  // período para llegar a tiempo ("necesitas RD$X/semana").
  const suggestion = useMemo(() => {
    const target = parseFloat(amountText) || 0
    if (!deadline || target <= 0 || deadlinePast) return null
    return requiredContribution(target, initial?.saved ?? 0, deadline, autoFrequency, localToday())
  }, [amountText, deadline, deadlinePast, autoFrequency, initial?.saved])

  const pressAmt = (key: string) => {
    if (key === 'back') {
      playBackspaceSound()
      setAmountText(v => v.slice(0, -1))
      return
    }
    playKeySound()
    setAmountText(v => {
      if (key === '.') {
        if (v.includes('.')) return v
        return (v || '0') + '.'
      }
      if (v === '0' && key !== '.') return key
      const next = v + key
      const [, dec] = next.split('.')
      if (dec && dec.length > 2) return v
      return next
    })
  }

  const handleDone = () => {
    playDoneSound()
    setShowNumpad(false)
  }

  const save = () => {
    const targetVal = parseFloat(amountText)
    if ((!name.trim() && !suggested) || !targetVal || targetVal <= 0) return
    if (autoEnabled && (!autoAmount || autoAmount <= 0 || !autoAccountId)) return
    playConfirmSound()
    // Mensual: 1 día = un pago; 2 días = dos pagos al mes (se cobra `amount` en cada uno).
    const monthDays = autoFrequency === 'monthly'
      ? (monthlyPayments === 2 ? [...new Set([monthDay1, monthDay2])].sort((a, b) => a - b) : [monthDay1])
      : undefined
    // nextDate: semanal → el próximo día elegido; mensual con días → el primero
    // futuro; si no, se conserva el existente (edición) o el próximo período.
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
    onSave({ name: name.trim() || suggested, target: targetVal, color, icon, deadline: deadline || undefined, autoContribute })
  }

  const deadlineLabel = deadline
    ? new Date(`${deadline}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' })
    : t('noDeadlineLabel')

  // Resumen en lenguaje natural del aporte automático: de un vistazo, qué pasará.
  // Reemplaza tener que leer 5 controles sueltos por una frase clara.
  const weekdayLabelFor = (wd: number) => weekdayLabels[WEEKDAY_ORDER.indexOf(wd)] ?? ''
  const autoSummary = (() => {
    const amt = fmt(autoAmount, cur)
    const acct = validAccounts.find(a => a.id === autoAccountId)?.name ?? ''
    const freqPhrase = autoFrequency === 'weekly'
      ? t('autoEveryWeek')
      : monthlyPayments === 2 ? t('autoTwiceMonth') : t('autoEveryMonth')
    let when = ''
    if (autoFrequency === 'weekly') {
      if (autoWeekday !== null) when = t('autoOnWeekday').replace('{day}', weekdayLabelFor(autoWeekday))
    } else if (monthlyPayments === 2) {
      const [d1, d2] = [monthDay1, monthDay2].sort((a, b) => a - b)
      when = t('autoOnDays').replace('{d1}', String(d1)).replace('{d2}', String(d2))
    } else {
      when = t('autoOnDay').replace('{d}', String(monthDay1))
    }
    const lead = autoPlan === 'ramp' && autoIncrement > 0
      ? t('autoSummaryRampLead').replace('{amount}', amt).replace('{inc}', fmt(autoIncrement, cur))
      : amt
    return [lead, freqPhrase, when, acct ? t('autoFromAccount').replace('{account}', acct) : '']
      .filter(Boolean).join(' ')
  })()

  return createPortal(
    // No cierra al tocar fuera (evita perder lo que escribiste por un toque).
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={initial ? t('editGoal') : t('newGoal')}>
      <section className={`mgl-form${showNumpad ? ' mgl-form-numpad' : ''}`} onClick={e => e.stopPropagation()}>
        <header>
          <span>{initial ? t('editGoal') : t('newGoal')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        {showNumpad ? (
          <GoalNumpad amountText={amountText} onPress={pressAmt} prefix={prefix} onDone={handleDone} />
        ) : (
          <>
            <div className="mgl-form-body">
              <label className="mgl-field">
                <span>{t('name')}</span>
                <input
                  className="mgl-input"
                  placeholder={suggested || t('egGoalName')}
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
                {/* Presets = icono + color (como una categoría) + sugerencia de
                    nombre (placeholder). Un toque NO pisa lo que escribiste: solo
                    cambia el icono/color y la sugerencia, para no tener que borrar. */}
                <div className="mgl-preset-chips">
                  {GOAL_PRESETS.map(preset => {
                    const presetLabel = preset.nameKey ? t(preset.nameKey) : ''
                    const on = icon === preset.icon && color === preset.color
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={`mgl-preset-chip${on ? ' on' : ''}`}
                        onClick={() => {
                          setIcon(preset.icon)
                          setColor(preset.color)
                          setSuggested(presetLabel)
                        }}
                      >
                        <Icon name={preset.icon} size={13} style={{ color: preset.color }} />
                        {presetLabel}
                      </button>
                    )
                  })}
                </div>
              </label>

              <div className="mgl-field">
                <span>{t('target')}</span>
                <button className="mgl-amount-tap" onClick={() => setShowNumpad(true)}>
                  <span>{fmtAmountText(amountText, prefix)}</span>
                  <Icon name="edit" size={14} style={{ opacity: .4 }} />
                </button>
              </div>

              <div className="mgl-field">
                <span>{t('deadlineOptional')}</span>
                <button
                  className={`mgl-amount-tap${deadlinePast ? ' warn' : ''}`}
                  onClick={() => setShowDate(true)}
                >
                  <span style={deadlinePast ? { color: 'var(--m-warn, #f59e0b)' } : undefined}>{deadlineLabel}</span>
                  <Icon name="calendar" size={14} style={{ opacity: .4 }} />
                </button>
                {deadlinePast && (
                  <small style={{ color: 'var(--m-warn, #f59e0b)', marginTop: 4, display: 'block', fontSize: 11 }}>
                    {t('deadlinePastWarning')}
                  </small>
                )}
              </div>

              {/* Calculadora inversa: aporte sugerido para llegar a la fecha */}
              {suggestion && (
                <div className="mgl-suggestion" style={{ borderColor: color + '55' }}>
                  <Icon name="bolt" size={14} style={{ color, flexShrink: 0 }} />
                  <span>
                    {t('goalSuggestionText')
                      .replace('{amount}', fmt(suggestion.amount, cur))
                      .replace('{freq}', autoFrequency === 'weekly' ? t('perWeekShort') : t('perMonthShort'))
                      .replace('{n}', String(suggestion.periods))
                      .replace('{periods}', autoFrequency === 'weekly' ? t('weeksLabel') : t('monthsLabel'))}
                  </span>
                  <button
                    type="button"
                    className="mgl-suggestion-use"
                    style={{ background: color + '22', color }}
                    onClick={() => { setAutoEnabled(true); setAutoPlan('fixed'); setAutoAmount(suggestion.amount) }}
                  >
                    {t('useSuggestionLabel')}
                  </button>
                </div>
              )}

              <div className="mgl-field">
                <span>{t('color')}</span>
                <div className="mgl-colors">
                  {COLORS.map(c => (
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
              </div>

              <div className="mgl-field">
                <span>{t('icon')}</span>
                <div className="mgl-icons">
                  {ICONS.map(ic => (
                    <button
                      key={ic}
                      className={`mgl-icon-btn${icon === ic ? ' on' : ''}`}
                      aria-label={t('iconOption').replace('{ic}', ic)}
                      aria-pressed={icon === ic}
                      style={icon === ic ? { background: color + '33', color } : {}}
                      onClick={() => setIcon(ic)}
                    >
                      <Icon name={ic} size={18} />
                    </button>
                  ))}
                </div>
              </div>

              {validAccounts.length > 0 && (
                <div className="mpr-form-section mpr-toggle-row">
                  <div className="mpr-toggle-row-text">
                    <span className="mpr-toggle-row-label">{t('autoContributeLabel')}</span>
                    <small className="mpr-toggle-row-desc">{t('autoContributeDesc')}</small>
                  </div>
                  <label className="mset-toggle-wrap">
                    <input
                      type="checkbox"
                      className="mset-toggle-input"
                      checked={autoEnabled}
                      onChange={e => setAutoEnabled(e.target.checked)}
                    />
                    <span className="mset-toggle" />
                  </label>
                </div>
              )}

              {autoEnabled && (
                <div className="mgl-auto-card" style={{ borderColor: color + '44' }}>
                  {/* Resumen en lenguaje natural: qué pasará exactamente, de un vistazo. */}
                  {autoAmount > 0 && (
                    <div className="mgl-auto-summary" style={{ color }}>
                      <Icon name="repeat" size={13} />
                      <span>{autoSummary}</span>
                    </div>
                  )}

                  <div className="mgl-field">
                    <span>{autoPlan === 'ramp' ? t('firstContributionLabel') : t('autoContributeAmountLabel')}</span>
                    <button className="mgl-amount-tap" onClick={() => setAutoAmountSheet(true)}>
                      <span>{fmt(autoAmount, cur)}</span>
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
                              style={on ? { borderColor: color, background: color + '22', color } : {}}
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
                              onClick={() => setMonthlyPayments(n)}
                            >
                              {n === 1 ? t('onePaymentLabel') : t('twoPaymentsLabel')}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mgl-day-selects">
                        <label className="mgl-field">
                          <span>{monthlyPayments === 2 ? t('firstChargeDayLabel') : t('chargeDayMonthLabel')}</span>
                          <select className="mgl-input" value={monthDay1} onChange={e => setMonthDay1(Number(e.target.value))}>
                            {MONTH_DAYS.map(d => (
                              <option key={d} value={d}>{t('dayNumberLabel').replace('{d}', String(d))}</option>
                            ))}
                          </select>
                        </label>
                        {monthlyPayments === 2 && (
                          <label className="mgl-field">
                            <span>{t('secondChargeDayLabel')}</span>
                            <select className="mgl-input" value={monthDay2} onChange={e => setMonthDay2(Number(e.target.value))}>
                              {MONTH_DAYS.map(d => (
                                <option key={d} value={d}>{t('dayNumberLabel').replace('{d}', String(d))}</option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    </>
                  )}

                  <label className="mgl-field">
                    <span>{t('sourceAccount')}</span>
                    <select className="mgl-input" value={autoAccountId} onChange={e => setAutoAccountId(e.target.value)}>
                      {validAccounts.map(a => (
                        <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance, cur)}</option>
                      ))}
                    </select>
                  </label>

                  {/* Reto incremental: opción avanzada, al final y como interruptor
                      (antes eran unos pills prominentes arriba que confundían). */}
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
                          <span>+{fmt(autoIncrement, cur)}</span>
                          <Icon name="edit" size={14} style={{ opacity: .4 }} />
                        </button>
                      </div>
                      {rampPreview && autoIncrement > 0 && (
                        <div className="mgl-ramp-preview" style={{ borderColor: color + '55' }}>
                          <div className="mgl-ramp-seq">
                            {rampPreview.first.map((v, i) => (
                              <span key={i}>{fmt(v, cur)}</span>
                            ))}
                            <span className="mgl-ramp-dots">···</span>
                          </div>
                          {parseFloat(amountText) > 0 && (
                            <small>
                              {t('rampPreviewSummary')
                                .replace('{n}', String(rampPreview.periods))
                                .replace('{freq}', autoFrequency === 'weekly' ? t('weeksLabel') : t('monthsLabel'))
                                .replace('{total}', fmt(rampPreview.total, cur))}
                            </small>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="mgl-form-actions">
              <button className="mgl-btn-cancel" onClick={onClose}>{t('cancel')}</button>
              <button className="mgl-btn-save" style={{ background: color }} onClick={save}>
                {initial ? t('save') : t('createGoal')}
              </button>
            </div>
          </>
        )}
      </section>

      {showDate && (
        <MobileDatePicker
          value={deadline || localToday()}
          onChange={v => { setDeadline(v); setShowDate(false) }}
          onClose={() => setShowDate(false)}
        />
      )}

      {autoAmountSheet && (
        <MobileAmountSheet
          title={autoPlan === 'ramp' ? t('firstContributionLabel') : t('autoContributeAmountLabel')}
          value={autoAmount}
          currency={cur}
          onDone={v => { setAutoAmount(v); setAutoAmountSheet(false) }}
          onClose={() => setAutoAmountSheet(false)}
        />
      )}

      {autoIncrementSheet && (
        <MobileAmountSheet
          title={t('rampIncrementLabel')}
          value={autoIncrement}
          currency={cur}
          onDone={v => { setAutoIncrement(v); setAutoIncrementSheet(false) }}
          onClose={() => setAutoIncrementSheet(false)}
        />
      )}
    </div>,
    sheetRoot(),  )
}

function GoalDetailSheet({
  goal,
  currency,
  onClose,
  onContribute,
  onEdit,
  onDelete,
}: {
  goal: Goal
  currency: string
  onClose: () => void
  onContribute: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const { accounts, goalContributions } = useFinance()
  const cur = currency as Parameters<typeof fmt>[1]
  const p = pct(goal.saved, goal.target)
  const remaining = Math.max(0, goal.target - goal.saved)
  const done = goal.saved >= goal.target
  const today = localToday()
  const deadlineInfo = !done ? daysLeftLabel(goal.deadline, today, t) : null
  const history = useMemo(
    () => goalContributions.filter(c => c.goalId === goal.id).sort((a, b) => b.date.localeCompare(a.date)),
    [goalContributions, goal.id],
  )

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, true)

  return createPortal(
    // No cierra al tocar fuera: era el más molesto (detalle corto = mucho fondo).
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={goal.name}>
      <section className="mgl-form mgl-detail" onClick={e => e.stopPropagation()}>
        <header>
          <span>{goal.name}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mgl-detail-body">
          <div className="mgl-detail-hero">
            <ProgressRing pct={p} color={goal.color} size={112} stroke={9}>
              <Icon name={goal.icon} size={26} style={{ color: goal.color }} />
              <strong>{p}%</strong>
            </ProgressRing>
            {done && (
              <span className="mgl-chip mgl-chip-done mgl-detail-done-badge">
                <Icon name="check" size={11} /> {t('goalCompletedLabel')}
              </span>
            )}
            {deadlineInfo && (
              <span className={`mgl-chip${deadlineInfo.overdue ? ' mgl-chip-warn' : ''}`}>
                <Icon name="calendar" size={11} /> {deadlineInfo.text}
              </span>
            )}
          </div>

          <div className="mgl-detail-stats">
            <div className="mgl-detail-stat">
              <span>{t('saved')}</span>
              <strong>{fmt(goal.saved, cur)}</strong>
            </div>
            <div className="mgl-detail-stat">
              <span>{t('target')}</span>
              <strong>{fmt(goal.target, cur)}</strong>
            </div>
            <div className="mgl-detail-stat">
              <span>{t('goalRemainingLabel')}</span>
              <strong>{fmt(remaining, cur)}</strong>
            </div>
          </div>

          {goal.autoContribute && (
            <div className="mgl-auto-badge mgl-detail-auto">
              <Icon name="repeat" size={12} />
              {t('autoContributeBadge')
                .replace('{amount}', fmt(goal.autoContribute.amount, cur))
                .replace('{freq}', autoFreqShort(goal.autoContribute, t))}
            </div>
          )}

          <div className="mgl-detail-history">
            <span className="mgl-detail-history-title">{t('contributionHistory')}</span>
            {history.length === 0 ? (
              <p className="mgl-detail-history-empty">{t('noContributionsYet')}</p>
            ) : (
              <div className="mgl-history-list">
                {history.map(c => (
                  <div key={c.id} className="mgl-history-row">
                    <span className="mgl-history-icon" style={{ background: goal.color + '22', color: goal.color }}>
                      <Icon name="plus" size={13} />
                    </span>
                    <div className="mgl-history-info">
                      <strong>{fmt(c.amount, cur)}</strong>
                      <small>{accounts.find(a => a.id === c.fromAccountId)?.name ?? '—'}</small>
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

        <div className="mgl-form-actions">
          <button className="mgl-btn-cancel" onClick={onEdit}>
            <Icon name="edit" size={15} /> {t('edit')}
          </button>
          <button className="mgl-btn-cancel mgl-detail-del" aria-label={t('deleteGoalNamed').replace('{name}', goal.name)} onClick={onDelete}>
            <Icon name="trash" size={15} />
          </button>
          <button className="mgl-btn-save" style={{ background: goal.color }} onClick={onContribute}>
            {t('contribute')}
          </button>
        </div>
      </section>
    </div>,
    sheetRoot(),  )
}

function ContributeSheet({ goal, currency, onClose }: { goal: Goal; currency: string; onClose: () => void }) {
  const t = useT()
  const { accounts, contribute } = useFinance()
  const validAccounts = accounts.filter(a => a.type !== 'credit')
  const [amount, setAmount] = useState(0)
  const [accountId, setAccountId] = useState(validAccounts.find(a => a.type === 'savings')?.id ?? validAccounts[0]?.id ?? '')
  const [showNumpad, setShowNumpad] = useState(true)
  const cur = currency as Parameters<typeof fmt>[1]
  const { submitting, beginSubmit, endSubmit } = useSubmitGuard()

  useMobileBackDismiss(!showNumpad, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !showNumpad)

  const submit = () => {
    if (!amount || amount <= 0 || !accountId) return
    if (!beginSubmit()) return
    try {
      contribute(goal.id, amount, accountId)
      if (goal.saved < goal.target && goal.saved + amount >= goal.target) playAchievementSound()
      else playConfirmSound()
      onClose()
    } catch (e: unknown) {
      endSubmit()
      toast(e instanceof Error ? e.message : t('errorContributing'), { icon: 'alert' })
    }
  }

  return createPortal(
    <>
    // No cierra al tocar fuera (evita cancelar el aporte por un toque).
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('contributeToGoal').replace('{name}', goal.name)}>
      <section className="mgl-form" onClick={e => e.stopPropagation()}>
        <header>
          <span>{t('contributeToGoal').replace('{name}', goal.name)}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mgl-form-body">
          <div className="mgl-contrib-display">
            <div className="mgl-contrib-ring" style={{ borderColor: goal.color }}>
              <Icon name={goal.icon} size={28} style={{ color: goal.color }} />
            </div>
            <div>
              <strong>{fmt(goal.saved, cur)}</strong>
              <small> / {fmt(goal.target, cur)}</small>
            </div>
          </div>

          <div className="mgl-field">
            <span>{t('amountToContribute')}</span>
            <button className="mgl-amount-tap" onClick={() => setShowNumpad(true)}>
              <span>{fmt(amount, cur)}</span>
              <Icon name="edit" size={14} style={{ opacity: .4 }} />
            </button>
          </div>

          <label className="mgl-field">
            <span>{t('sourceAccount')}</span>
            <select className="mgl-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
              {validAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} — {fmt(a.balance, cur)}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mgl-form-actions">
          <button className="mgl-btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button className="mgl-btn-save" disabled={submitting} style={{ background: goal.color }} onClick={submit}>
            {t('contribute')}
          </button>
        </div>
      </section>
    </div>
    {showNumpad && (
      <MobileAmountSheet
        title={t('amountToContribute')}
        value={amount}
        currency={currency}
        onDone={v => { setAmount(v); setShowNumpad(false) }}
        onClose={() => setShowNumpad(false)}
      />
    )}
    </>,
    sheetRoot(),  )
}

export function MobileGoals(_props: ViewProps) {
  const t = useT()
  const { accounts, goals, goalContributions, addGoal, updateGoal, deleteGoal, restoreGoal, currency } = useFinance()
  const [sheet, setSheet] = useState<Sheet>(null)
  const [contributeGoal, setContributeGoal] = useState<Goal | null>(null)

  // Sin diálogo de confirmación: borra al momento y ofrece «Deshacer» 5 s. Se
  // captura la meta y sus aportes antes de borrar para poder recomponerla
  // entera — borrar una meta se lleva también su historial de aportes.
  const askDelete = (g: Goal) => {
    const contribs = goalContributions.filter(c => c.goalId === g.id)
    playDeleteSound()
    deleteWithUndo({
      message: t('goalDeleted'),
      onDelete: () => deleteGoal(g.id),
      onRestore: () => restoreGoal(g, contribs),
    })
    setSheet(null)
  }

  const totalSaved  = goals.reduce((s, g) => s + g.saved, 0)
  const totalTarget = goals.reduce((s, g) => s + g.target, 0)
  const overallPct = pct(totalSaved, totalTarget)
  const backedSavings = savingsBalance(accounts)
  const savingsCoverage = totalSaved > 0 ? Math.min(999, Math.round(backedSavings / totalSaved * 100)) : 0
  const cur = currency as Parameters<typeof fmt>[1]
  const lang = useSettings(s => s.language)
  const today = localToday()

  // Proyección «a tu ritmo» por meta — texto ya formateado para la tarjeta.
  const projections = useMemo(() => {
    const map: Record<string, string | null> = {}
    for (const g of goals) {
      const rate = estimatedMonthlyRate(g, goalContributions, today)
      const arr = projectArrival(g, rate, today)
      map[g.id] = arr && !arr.reached
        ? t('goalArrivalAtPace').replace('{date}', new Date(`${arr.dateISO}T00:00:00`).toLocaleDateString(dateLocale(lang), { month: 'short', year: 'numeric' }))
        : null
    }
    return map
  }, [goals, goalContributions, today, lang, t])

  return (
    <div className="mgl-root">
      {goals.length > 0 && (
        <div className="mgl-summary">
          <ProgressRing pct={overallPct} color="var(--m-primary)" size={80} stroke={8}>
            <strong>{overallPct}%</strong>
          </ProgressRing>
          <div className="mgl-summary-rows">
            <div className="mgl-summary-row">
              <span className="mgl-sum-label">{t('saved')}</span>
              <strong className="mgl-sum-value">{fmt(totalSaved, cur)}</strong>
            </div>
            <div className="mgl-summary-row">
              <span className="mgl-sum-label">{t('target')}</span>
              <strong className="mgl-sum-value">{fmt(totalTarget, cur)}</strong>
            </div>
            <div className="mgl-summary-row mgl-summary-row-dim">
              <span className="mgl-sum-label">{t('savings')}</span>
              <strong className="mgl-sum-value">{savingsCoverage}% · {fmt(backedSavings, cur)}</strong>
            </div>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="mgl-empty">
          <Icon name="target" size={48} style={{ opacity: .25 }} />
          <p>{t('noGoals')}</p>
          <button className="mgl-empty-btn" onClick={() => setSheet({ type: 'purpose' })}>
            {t('createFirstGoal')}
          </button>
        </div>
      ) : (
        <div className="mgl-list">
          {goals.map(g => (
            <div key={g.id} className="mgl-card-wrap">
              <GoalCard goal={g} currency={currency} projection={projections[g.id]} onClick={() => setSheet({ type: 'detail', goal: g })} />
              <div className="mgl-card-actions">
                <button className="mgl-action-btn" onClick={() => setContributeGoal(g)}>
                  <Icon name="plus" size={15} /> {t('contribute')}
                </button>
                <button className="mgl-action-btn" aria-label={t('editGoalNamed').replace('{name}', g.name)} onClick={() => setSheet({ type: 'edit', goal: g })}>
                  <Icon name="edit" size={15} />
                </button>
                <button className="mgl-action-btn mgl-action-del" aria-label={t('deleteGoalNamed').replace('{name}', g.name)} onClick={() => askDelete(g)}>
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </div>
          ))}
          <button className="mgl-add-goal" onClick={() => setSheet({ type: 'purpose' })}>
            <Icon name="plus" size={18} /> {t('newGoal')}
          </button>
        </div>
      )}

      {sheet?.type === 'purpose' && (
        <GoalPurposeSheet
          onPick={preset => setSheet({
            type: 'add',
            presetIcon: preset.icon,
            presetColor: preset.color,
            presetName: preset.nameKey ? t(preset.nameKey) : undefined,
          })}
          onClose={() => setSheet(null)}
        />
      )}

      {(sheet?.type === 'add' || sheet?.type === 'edit') && (
        <GoalForm
          initial={sheet.goal}
          currency={currency}
          presetIcon={sheet.presetIcon}
          presetColor={sheet.presetColor}
          presetName={sheet.presetName}
          onSave={data => {
            if (sheet.type === 'edit' && sheet.goal) {
              updateGoal(sheet.goal.id, data)
            } else {
              addGoal({ ...data, saved: 0 })
            }
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'detail' && (
        <GoalDetailSheet
          goal={goals.find(g => g.id === sheet.goal.id) ?? sheet.goal}
          currency={currency}
          onClose={() => setSheet(null)}
          onContribute={() => { setContributeGoal(sheet.goal); setSheet(null) }}
          onEdit={() => setSheet({ type: 'edit', goal: sheet.goal })}
          onDelete={() => askDelete(sheet.goal)}
        />
      )}

      {contributeGoal && (
        <ContributeSheet goal={contributeGoal} currency={currency} onClose={() => setContributeGoal(null)} />
      )}
    </div>
  )
}
