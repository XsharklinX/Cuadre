import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { avatarInitials, avatarColor } from './avatar'
import { bizToday, freeSlotsValue, punctuality, type LateClient, type Punctuality } from '@/data/bizToday'
import { businessMonth } from '@/data/business'
import { clientServices, outstanding, type Charge, type Client } from '@/data/clients'
import { reminderMessage } from '@/data/clientList'
import { convertTxAmountsToBase, dateLocale, fmt, localToday } from '@/data/helpers'
import { makeOwner } from '@/data/attribution'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { openExternal } from '@/lib/openExternal'
import { playAchievementSound, playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { CurrencyCode } from '@/types'
import { sheetRoot } from '../SheetPortal'
import { useDialogA11y } from '../useDialogA11y'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { SwipeCharge } from './SwipeCharge'

/*
 * «HOY»: LA PORTADA DE NEGOCIO.
 *
 * Al entrar a Negocio se abría la lista de clientes, y lo que quiere saber
 * quien vive de cobrar es otra cosa: quién me paga hoy, quién va atrasado y
 * cómo va el mes. Esta pestaña lo contesta en una pantalla.
 *
 * La vista (`TodayView`) no lee del almacén: recibe los datos ya calculados.
 * Así la misma pantalla sirve para el ejemplo de quien todavía no tiene nada
 * (N8), que se mira sin escribir una sola línea en el libro.
 */

export interface TodayRow { id: string; client: Client; amount: number; currency: CurrencyCode; note: string; chargeId?: string }

export interface TodayData {
  collected: number
  target: number
  targetIsGoal: boolean
  profit: number | null
  dueToday: TodayRow[]
  late: (TodayRow & { days: number })[]
  upcoming: TodayRow[]
  freeSlots: { slots: number; perMonth: number }
  currency: CurrencyCode
  punctualityOf: (clientId: string) => Punctuality | null
}

const PUNCT_KEY = { onTime: 'punctOnTime', sometimes: 'punctSometimes', late: 'punctLate' } as const

export function TodayView({ data, onCollect, onOpenClient, onRemind, onRemindAll, onSetGoal, readOnly }: {
  data: TodayData
  onCollect?: (chargeId: string) => void
  onOpenClient?: (clientId: string) => void
  onRemind?: (clientId: string) => void
  onRemindAll?: () => void
  onSetGoal?: () => void
  readOnly?: boolean
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const decimals = useMoneyDecimals()
  const money = (n: number, cur: CurrencyCode = data.currency) => fmt(n, cur, { decimals })
  const pct = data.target > 0 ? Math.min(100, Math.round((data.collected / data.target) * 100)) : 0
  const R = 26, C = 2 * Math.PI * R

  const row = (r: TodayRow, extra?: React.ReactNode, late?: boolean) => {
    const p = data.punctualityOf(r.client.id)
    const inner = (
      <button
        className={`mbt-row${late ? ' late' : ''}`}
        onClick={() => (r.chargeId && onCollect ? onCollect(r.chargeId) : onOpenClient?.(r.client.id))}
        disabled={readOnly}
      >
        <span className="mbt-ava" style={{ background: `color-mix(in oklab, ${avatarColor(r.client.id)} 22%, transparent)`, color: avatarColor(r.client.id) }}>
          {avatarInitials(r.client.name)}
        </span>
        <span className="mbt-row-main">
          <b>{r.client.name}</b>
          <small>
            {r.note}
            {p && p !== 'onTime' && <em className={`mbt-punct ${p}`}>{t(PUNCT_KEY[p])}</em>}
          </small>
        </span>
        <strong>{money(r.amount, r.currency)}</strong>
        {extra}
      </button>
    )
    return r.chargeId && onCollect && !readOnly
      ? <SwipeCharge key={r.id} onCollect={() => onCollect(r.chargeId!)}>{inner}</SwipeCharge>
      : <div key={r.id}>{inner}</div>
  }

  return (
    <div className="mbt">
      <div className="mbt-hero">
        <svg width="70" height="70" viewBox="0 0 70 70" aria-hidden="true" className="mbt-ring">
          <circle cx="35" cy="35" r={R} className="mbt-ring-track" />
          <circle cx="35" cy="35" r={R} className="mbt-ring-val" strokeDasharray={`${(pct / 100) * C} ${C}`} />
        </svg>
        <span className="mbt-ring-pct">{pct}%</span>
        <div className="mbt-hero-text">
          <small>{t('bizTodayCollected').replace('{month}', new Date().toLocaleDateString(dateLocale(lang), { month: 'long' }))}</small>
          <b>{money(data.collected)}</b>
          <small>
            {data.target > 0
              ? (data.targetIsGoal ? t('bizTodayOfGoal') : t('bizTodayOfExpected')).replace('{amount}', money(data.target))
              : t('bizTodayNoExpected')}
            {data.profit !== null && ` · ${t('bizTodayProfit').replace('{amount}', money(data.profit))}`}
          </small>
          {onSetGoal && !readOnly && (
            <button className="mbt-goal-btn" onClick={onSetGoal}>
              {data.targetIsGoal ? t('bizGoalChange') : t('bizGoalSet')}
            </button>
          )}
        </div>
      </div>

      <div className="mbt-kpis">
        <div className="mbt-kpi"><b>{data.dueToday.length}</b><small>{t('bizTodayPayToday')}</small></div>
        <div className={`mbt-kpi${data.late.length ? ' bad' : ''}`}><b>{data.late.length}</b><small>{t('bizTodayLate')}</small></div>
        <div className="mbt-kpi"><b>{data.freeSlots.slots > 0 ? money(data.freeSlots.perMonth) : '—'}</b><small>{t('bizTodayFreeSlots').replace('{n}', String(data.freeSlots.slots))}</small></div>
      </div>

      <p className="mbt-title">{t('bizTodayPayTodayTitle')}</p>
      {data.dueToday.length ? (
        <div className="mbt-list">{data.dueToday.map(r => row(r))}</div>
      ) : (
        <div className="mbt-empty">
          <span>{t('bizTodayNothing')}</span>
          {data.upcoming.length > 0 && (
            <div className="mbt-list">
              {data.upcoming.map(r => row({ ...r, chargeId: undefined }))}
            </div>
          )}
        </div>
      )}

      {data.late.length > 0 && (
        <>
          <div className="mbt-title-row">
            <p className="mbt-title bad">{t('bizTodayLateTitle')}</p>
            {onRemindAll && data.late.length > 1 && !readOnly && (
              <button className="mbt-wa-all" onClick={onRemindAll}>
                <Icon name="share" size={14} /> {t('bizRemindAll').replace('{n}', String(data.late.length))}
              </button>
            )}
          </div>
          <div className="mbt-list">
            {data.late.map(r => row(
              { ...r, note: `${r.note} · ${t('bizDaysLate').replace('{n}', String(r.days))}` },
              onRemind && !readOnly ? (
                <span
                  role="button"
                  tabIndex={0}
                  className="mbt-wa"
                  onClick={e => { e.stopPropagation(); onRemind(r.client.id) }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onRemind(r.client.id) } }}
                >
                  WhatsApp
                </span>
              ) : null,
              true,
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Mensaje de recordatorio de un cliente atrasado, con su plantilla. */
function reminderFor(late: LateClient, tpl: string, money: (n: number, c: CurrencyCode) => string, serviceName: string, currency: CurrencyCode): string {
  return reminderMessage(tpl, {
    name: late.client.name,
    amount: money(late.owed, late.client.currency ?? currency),
    service: serviceName,
    months: Math.max(1, late.charges.length),
  })
}

/** Abre WhatsApp con el mensaje escrito; sin teléfono, lo copia. */
async function sendReminder(phone: string | undefined, text: string, copied: string): Promise<'opened' | 'copied'> {
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length >= 7) {
    // En RD los números de 10 cifras van con el 1 delante para wa.me.
    const full = digits.length === 10 ? `1${digits}` : digits
    const ok = await openExternal(`https://wa.me/${full}?text=${encodeURIComponent(text)}`)
    if (ok) return 'opened'
  }
  try { await navigator.clipboard?.writeText(text) } catch { /* se enseña abajo */ }
  toast(copied, { icon: 'check', type: 'ok' })
  return 'copied'
}

/*
 * N3 · RECORDAR A TODOS LOS ATRASADOS EN UNA PASADA.
 *
 * Uno detrás de otro: abre WhatsApp con el mensaje del primero ya escrito; al
 * volver a Cuadre está el siguiente esperando. Sin enlaces raros y sin mandar
 * nada por su cuenta: cada envío lo hace la persona.
 */
function RemindFlow({ late, onClose }: { late: LateClient[]; onClose: () => void }) {
  const t = useT()
  const decimals = useMoneyDecimals()
  const currency = useFinance(s => s.currency)
  const services = useBusiness(s => s.services)
  const tpl = useSettings(s => s.bizReminderTemplate)
  const [i, setI] = useState(0)
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  const current = late[i]
  const money = (n: number, c: CurrencyCode) => fmt(n, c, { decimals })
  const svcName = (c: Client) => services.find(s => s.id === clientServices(c)[0]?.serviceId)?.name ?? c.concept ?? ''
  const text = current ? reminderFor(current, tpl || t('cliReminderTpl'), money, svcName(current.client), currency) : ''

  const send = async () => {
    playSoftHaptic()
    await sendReminder(current.client.phone, text, t('cliReminderCopied'))
    if (i < late.length - 1) setI(i + 1)
    else { toast(t('bizRemindDone'), { icon: 'check', type: 'ok' }); onClose() }
  }

  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('bizRemindTitle')} onClick={onClose}>
      <section className="mgn-sheet mbt-remind" onClick={e => e.stopPropagation()}>
        <div className="mgn-sheet-head">
          <b>{t('bizRemindTitle')}</b>
          <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="mbt-steps" aria-hidden="true">
          {late.map((l, k) => (
            <span key={l.client.id} className={k < i ? 'done' : k === i ? 'now' : ''}>{l.client.name.split(/\s+/)[0]}</span>
          ))}
        </div>
        {current && (
          <>
            <p className="mgn-sheet-note">
              {t('bizRemindStep').replace('{i}', String(i + 1)).replace('{n}', String(late.length))}
              {' · '}{current.client.phone ? current.client.phone : t('bizRemindNoPhone')}
            </p>
            <blockquote className="mbt-msg">{text}</blockquote>
            <div className="mgl-form-actions mbt-remind-actions">
              <button className="mgl-btn-cancel" onClick={() => (i < late.length - 1 ? setI(i + 1) : onClose())}>{t('bizRemindSkip')}</button>
              <button className="mgl-btn-save mbt-wa-btn" onClick={() => void send()}>
                {current.client.phone ? t('bizRemindOpen') : t('bizRemindCopy')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>,
    sheetRoot(),
  )
}

/** La meta de cobro del mes, por negocio (N7). */
function GoalSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const currency = useFinance(s => s.currency)
  const { businesses, updateBusiness } = useBusiness()
  const vivos = businesses.filter(b => !b.archivedAt)
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(vivos.map(b => [b.id, b.monthlyGoal ? String(b.monthlyGoal) : ''])))
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  const save = () => {
    for (const b of vivos) {
      const n = Number((values[b.id] ?? '').replace(/[^\d.]/g, ''))
      updateBusiness(b.id, { monthlyGoal: n > 0 ? n : undefined })
    }
    toast(t('bizGoalSaved'), { icon: 'check', type: 'ok' })
    onClose()
  }
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('bizGoalTitle')} onClick={onClose}>
      <section className="mgn-sheet" onClick={e => e.stopPropagation()}>
        <div className="mgn-sheet-head">
          <b>{t('bizGoalTitle')}</b>
          <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <p className="mgn-sheet-note">{t('bizGoalWhy')}</p>
        {vivos.map(b => (
          <label key={b.id} className="mbizs-field" htmlFor={`goal-${b.id}`}>
            <span className="mbizs-field-label">{b.name} ({currency})</span>
            <input
              id={`goal-${b.id}`}
              className="mbizs-input"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={values[b.id] ?? ''}
              onChange={e => setValues(v => ({ ...v, [b.id]: e.target.value }))}
            />
          </label>
        ))}
        <button className="mgl-btn-save mgn-sheet-cta" onClick={save}>{t('save')}</button>
      </section>
    </div>,
    sheetRoot(),
  )
}

export function TodayTab({ onCollect, onOpenClient }: {
  onCollect: (chargeId: string) => void
  onOpenClient: (clientId: string) => void
}) {
  const t = useT()
  const decimals = useMoneyDecimals()
  const { transactions, accounts, currency } = useFinance()
  const { clients, charges, services, businesses } = useBusiness()
  const tpl = useSettings(s => s.bizReminderTemplate)
  const today = localToday()
  const [remindAll, setRemindAll] = useState(false)
  const [goalOpen, setGoalOpen] = useState(false)

  const summary = useMemo(() => bizToday(charges, clients, today), [charges, clients, today])
  const slots = useMemo(() => freeSlotsValue(services, clients, currency), [services, clients, currency])
  const vivos = businesses.filter(b => !b.archivedAt)
  const goal = vivos.reduce((s, b) => s + (b.monthlyGoal ?? 0), 0)
  const profit = useMemo(() => {
    if (!vivos.length) return null
    const owner = makeOwner({ businesses, services, clients, charges })
    const base = convertTxAmountsToBase(transactions, accounts, currency)
    const mkey = today.slice(0, 7)
    return vivos.reduce((s, b) => s + businessMonth(b, base, mkey, owner).profit, 0)
  }, [vivos, businesses, services, clients, charges, transactions, accounts, currency, today])
  const byClient = useMemo(() => {
    const m = new Map<string, Charge[]>()
    for (const ch of charges) m.set(ch.clientId, [...(m.get(ch.clientId) ?? []), ch])
    return m
  }, [charges])
  const svcName = (c: Client) => services.find(s => s.id === clientServices(c)[0]?.serviceId)?.name ?? c.concept ?? ''
  const clientMap = new Map(clients.map(c => [c.id, c]))
  const toRow = (ch: Charge): TodayRow | null => {
    const client = clientMap.get(ch.clientId)
    return client ? { id: ch.id, client, amount: outstanding(ch), currency: client.currency ?? currency, note: svcName(client), chargeId: ch.id } : null
  }

  const data: TodayData = {
    collected: summary.collected,
    target: goal > 0 ? goal : summary.expected,
    targetIsGoal: goal > 0,
    profit,
    dueToday: summary.dueToday.map(toRow).filter((r): r is TodayRow => !!r),
    late: summary.late.map(l => ({
      id: l.client.id, client: l.client, amount: l.owed, currency: l.client.currency ?? currency,
      note: svcName(l.client), chargeId: [...l.charges].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.id, days: l.maxDays,
    })),
    upcoming: summary.upcoming.map(ch => {
      const r = toRow(ch)
      return r ? { ...r, note: `${r.note} · ${new Date(`${ch.dueDate}T00:00:00`).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' })}` } : null
    }).filter((r): r is TodayRow => !!r),
    freeSlots: slots,
    currency,
    punctualityOf: id => punctuality(byClient.get(id) ?? [])?.kind ?? null,
  }

  // N7 · Al cruzar la meta del mes se avisa UNA vez (por mes).
  const { dismissedAlerts, dismissAlert } = useSettings()
  useEffect(() => {
    if (goal <= 0 || summary.collected < goal) return
    const id = `bizgoal:${today.slice(0, 7)}`
    if (dismissedAlerts.includes(id)) return
    dismissAlert(id)
    playAchievementSound()
    toast(t('bizGoalReached').replace('{name}', vivos.map(b => b.name).join(', ')), { icon: 'trophy', type: 'ok' })
  }, [goal, summary.collected, today, dismissedAlerts, dismissAlert, t, vivos])

  const remindOne = (clientId: string) => {
    const l = summary.late.find(x => x.client.id === clientId)
    if (!l) return
    const text = reminderFor(l, tpl || t('cliReminderTpl'), (n, c) => fmt(n, c, { decimals }), svcName(l.client), currency)
    void sendReminder(l.client.phone, text, t('cliReminderCopied'))
  }

  return (
    <>
      <TodayView
        data={data}
        onCollect={onCollect}
        onOpenClient={onOpenClient}
        onRemind={remindOne}
        onRemindAll={() => setRemindAll(true)}
        onSetGoal={vivos.length ? () => setGoalOpen(true) : undefined}
      />
      {remindAll && <RemindFlow late={summary.late} onClose={() => setRemindAll(false)} />}
      {goalOpen && <GoalSheet onClose={() => setGoalOpen(false)} />}
    </>
  )
}

/*
 * N8 · UN EJEMPLO QUE SE MIRA.
 *
 * Para quien abre Negocio por primera vez: la portada con una barbería de
 * ejemplo, en solo lectura y con una franja que lo dice. No toca el libro.
 */
export function ExampleSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const currency = useFinance(s => s.currency)
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  const mk = (id: string, name: string): Client => ({
    id, name, concept: t('bizExampleConcept'), amount: 500, cycle: 'monthly', dueDay: 1, accountId: '', categoryId: '', active: true, createdAt: 0,
  })
  const ana = mk('e1', 'Ana Lugo'), carlos = mk('e2', 'Carlos Soto'), jose = mk('e3', 'José Rosario'), maria = mk('e4', 'María Peña')
  const data: TodayData = {
    collected: 9450, target: 15000, targetIsGoal: true, profit: 5120,
    dueToday: [
      { id: 'r1', client: ana, amount: 500, currency, note: t('bizExampleConcept') },
      { id: 'r2', client: carlos, amount: 650, currency, note: t('bizExampleConcept') },
    ],
    late: [{ id: 'r3', client: jose, amount: 1000, currency, note: t('bizExampleConcept'), days: 12 }],
    upcoming: [{ id: 'r4', client: maria, amount: 500, currency, note: t('bizExampleConcept') }],
    freeSlots: { slots: 0, perMonth: 0 },
    currency,
    punctualityOf: id => (id === 'e3' ? 'late' : null),
  }
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('bizExampleTitle')} onClick={onClose}>
      <section className="mgn-sheet" onClick={e => e.stopPropagation()}>
        <div className="mgn-sheet-head">
          <b>{t('bizExampleTitle')}</b>
          <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <p className="mbt-example-band">{t('bizExampleBand')}</p>
        <TodayView data={data} readOnly />
        <button className="mgl-btn-save mgn-sheet-cta" onClick={onClose}>{t('bizExampleStart')}</button>
      </section>
    </div>,
    sheetRoot(),
  )
}

export type { LateClient }
