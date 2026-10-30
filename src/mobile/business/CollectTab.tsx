import { useMemo, useState } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { BrandTile } from '@/components/ui/BrandTile'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY } from '@/data/billing'
import { chargeState, daysLate, outstanding, type Charge } from '@/data/clients'
import { collectFocus, groupCharges, type ChargeGroup } from '@/data/collectFocus'
import { duePayments, type DuePayment } from '@/data/autopay'
import { receivablesSummary } from '@/data/receivables'
import { dateLocale, fmt, localToday, monthKey, monthLabel } from '@/data/helpers'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { alreadyPaidByHand, collectCharge, registerServicePayment, uncollectCharge } from '@/lib/businessOps'
import { playIncomeSound, playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { SwipeCharge } from './SwipeCharge'
import { BizSheet } from './shared'
import { avatarInitials, avatarStyle } from './avatar'

/**
 * E3 · COBROS, SOLO LO QUE TOCA.
 *
 * Antes esta pantalla era tres en una: lo que te deben, el historial y la
 * lista de clientes, una debajo de otra. Ahora la gente está en su pestaña y
 * aquí queda lo que hay que hacer:
 *
 *  · Arriba, a quién escribir hoy (el titular de siempre) y lo cobrado del mes
 *    contra lo que falta, con una barra.
 *  · Los pagos de servicios que preguntan (P2): «Hoy toca pagar Netflix».
 *  · Atrasados, esta semana y más adelante, con «Cobrar los N» cuando hay
 *    varios: si cinco pagan el día 1, cinco ingresos de un toque, con
 *    deshacer.
 *  · Lo cobrado, por mes y plegado: no es una tarea.
 */
export function CollectTab({ onCollect, onPayService, onNewClient }: {
  onCollect: (chargeId: string) => void
  onPayService: (serviceId: string) => void
  onNewClient: () => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { currency, accounts } = useFinance()
  const { clients, charges, services, snoozePay, markPayHandled } = useBusiness()
  const today = localToday()
  const mes = today.slice(0, 7)

  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  const vivos = useMemo(() => charges.filter(c => clientMap.has(c.clientId)), [charges, clientMap])
  const grupos = useMemo(() => groupCharges(vivos, today), [vivos, today])
  const focus = useMemo(() => collectFocus(vivos, clients, today), [vivos, clients, today])
  const summary = useMemo(() => receivablesSummary(vivos, today), [vivos, today])
  // Lo que falta del MES: lo de este mes y lo atrasado, que sigue sin entrar.
  const faltaMes = useMemo(() => vivos
    .filter(c => !c.waived && c.dueDate.slice(0, 7) <= mes)
    .reduce((s, c) => s + outstanding(c), 0), [vivos, mes])
  const porPagar = useMemo(() => duePayments(services, today, { modes: ['ask'] }), [services, today])

  const porDefecto: Record<ChargeGroup, boolean> = {
    late: true, week: true, later: grupos.late.length === 0 && grupos.week.length === 0, done: false,
  }
  const [elegidos, setElegidos] = useState<Partial<Record<ChargeGroup, boolean>>>({})
  const abierto = (g: ChargeGroup) => elegidos[g] ?? porDefecto[g]
  const alternar = (g: ChargeGroup) => { playSoftHaptic(); setElegidos(p => ({ ...p, [g]: !(p[g] ?? porDefecto[g]) })) }
  const [lote, setLote] = useState<Charge[] | null>(null)
  // N2 · Lista o agenda: se recuerda en el dispositivo.
  const [vista, setVista] = useState<'list' | 'agenda'>(() => {
    try { return localStorage.getItem('cuadre-col-view') === 'agenda' ? 'agenda' : 'list' } catch { return 'list' }
  })
  const cambiarVista = (v: 'list' | 'agenda') => {
    setVista(v)
    playSoftHaptic()
    try { localStorage.setItem('cuadre-col-view', v) } catch { /* en privado no se recuerda */ }
  }
  const [mesAbierto, setMesAbierto] = useState<string | null>(null)
  const [persona, setPersona] = useState<string | null>(null)

  if (clients.filter(c => !c.deletedAt).length === 0 && !porPagar.length) {
    return (
      <div className="mbiz-empty">
        <strong>{t('colEmptyTitle')}</strong>
        <p>{t('colEmptyText')}</p>
        <button onClick={onNewClient}>{t('bizAddClient')}</button>
      </div>
    )
  }

  const fila = (charge: Charge) => {
    const client = clientMap.get(charge.clientId)
    if (!client) return null
    const estado = chargeState(charge, today)
    const falta = outstanding(charge)
    const cur = client.currency ?? currency
    const cobrable = estado !== 'paid' && estado !== 'waived'
    return (
      <SwipeCharge key={charge.id} onCollect={() => onCollect(charge.id)} disabled={!cobrable}>
        <button className={`mbiz-charge ${estado}`} onClick={() => onCollect(charge.id)}>
          <span className="mbiz-charge-id">
            <b>{client.name}</b>
            <small>
              {client.concept || t(CYCLE_KEY[client.cycle] as LangKey)}
              {' · '}
              {new Date(`${charge.dueDate}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
              {charge.discountPct ? ` · ★ −${charge.discountPct}%` : ''}
            </small>
          </span>
          <span className="mbiz-charge-right">
            <b>{fmt(estado === 'paid' ? charge.paid : falta, cur, { decimals: moneyDecimals })}</b>
            {estado === 'late' && <em className="late">{t('bizDaysLate').replace('{n}', String(daysLate(charge, today)))}</em>}
            {estado === 'today' && <em className="due">{t('bizDueToday')}</em>}
            {estado === 'partial' && <em className="due">{t('bizPartial')}</em>}
            {estado === 'paid' && <em className="ok">{t('bizPaid')}</em>}
            {estado === 'waived' && <em>{t('bizWaived')}</em>}
          </span>
        </button>
      </SwipeCharge>
    )
  }

  /*
   * N7 · LOS ATRASADOS, UNA FILA POR PERSONA (2.8).
   *
   * José Rosario salía tres veces (3 ago, 3 sept, 3 oct) en tarjetas con
   * borde rojo. Ahora es una fila: «José Rosario · 3 meses · RD$1,050». Al
   * tocarla se abren sus cobros sueltos y «Cobrar los 3» de una vez.
   */
  const porPersona = (lista: Charge[]) => {
    const gente = new Map<string, Charge[]>()
    for (const c of lista) gente.set(c.clientId, [...(gente.get(c.clientId) ?? []), c])
    const filas = [...gente.entries()]
      .map(([id, cs]) => ({ client: clientMap.get(id)!, cs: [...cs].sort((a, b) => a.dueDate.localeCompare(b.dueDate)), total: cs.reduce((sum, c) => sum + outstanding(c), 0) }))
      .filter(r => r.client)
      .sort((a, b) => b.total - a.total)
    return (
      <div className="n28-card n28-people">
        {filas.map(({ client, cs, total }) => {
          const ab = persona === client.id
          const desde = new Date(`${cs[0].dueDate}T00:00:00`).toLocaleDateString(locale, { month: 'short' })
          return (
            <div key={client.id} className={`n28-person${ab ? ' open' : ''}`}>
              <button type="button" className="n28-row" aria-expanded={ab} onClick={() => {
                playSoftHaptic()
                if (cs.length === 1) { onCollect(cs[0].id); return }
                setPersona(ab ? null : client.id)
              }}>
                <span className="mbiz-ava" style={avatarStyle(client.id)}>{avatarInitials(client.name)}</span>
                <span className="n28-svc-id">
                  <b>{client.name}</b>
                  <small>
                    {cs.length > 1 ? t('n28OwesMonths').replace('{n}', String(cs.length)).replace('{since}', desde) : t('bizDaysLate').replace('{n}', String(daysLate(cs[0], today)))}
                  </small>
                </span>
                <span className="n28-person-v">
                  <b className="expense">{fmt(total, client.currency ?? currency, { decimals: moneyDecimals })}</b>
                  <small>{cs.length > 1 ? (ab ? t('nxkHide') : t('n28SeeMonths')) : t('n28Collect')}</small>
                </span>
              </button>
              {ab && (
                <div className="n28-person-body">
                  <div className="mbiz-list">{cs.map(fila)}</div>
                  <button type="button" className="mcol-batch" onClick={() => { playSoftHaptic(); setLote(cs.filter(c => !c.waived && outstanding(c) > 0)) }}>
                    {t('colCollectN').replace('{n}', String(cs.length))}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  /** P2 · «Ya lo pagué»: se registra con todo lo que el servicio ya sabe. */
  const yaPague = (due: DuePayment) => {
    playSoftHaptic()
    if (alreadyPaidByHand(due)) {
      markPayHandled(due.service.id, [due.key], today)
      toast(t('colAlreadyRecorded'), { icon: 'check', type: 'ok' })
      return
    }
    const txId = registerServicePayment(due, { auto: false })
    // Sin cuenta o categoría guardadas: se abre Pagar, donde se eligen.
    if (!txId) { onPayService(due.service.id); return }
    toast(t('invPaidToast').replace('{name}', due.service.name), {
      icon: 'check', type: 'ok', duration: 6000,
      action: {
        label: t('undo'),
        onClick: () => {
          useFinance.getState().deleteTx(txId)
          useBusiness.getState().unmarkPayHandled(due.service.id, [due.key])
        },
      },
    })
  }

  /** Lo cobrado, por mes: de lo más nuevo a lo más viejo. */
  const porMes = new Map<string, Charge[]>()
  for (const c of grupos.done) {
    const k = c.paidAt > 0 ? monthKey(new Date(c.paidAt).toISOString().slice(0, 10)) : c.dueDate.slice(0, 7)
    porMes.set(k, [...(porMes.get(k) ?? []), c])
  }
  const meses = [...porMes.keys()].sort((a, b) => b.localeCompare(a))

  const GRUPOS: Array<{ id: Exclude<ChargeGroup, 'done'>; key: LangKey }> = [
    { id: 'late', key: 'bizGroupLate' },
    { id: 'week', key: 'bizGroupWeek' },
    { id: 'later', key: 'bizGroupLater' },
  ]

  return (
    <>
      <section className={`mbiz-focus bare ${focus.kind}`}>
        <small>
          {focus.kind === 'late' ? t('bizFocusLate') : focus.kind === 'today' ? t('bizFocusToday') : t('bizFocusCalm')}
        </small>
        <strong><AnimatedMoney value={focus.amount} decimals={moneyDecimals} fit /></strong>
        {focus.kind === 'calm' ? (
          <p>{focus.amount > 0 ? t('bizFocusCalmNote') : t('bizFocusCalmEmpty')}</p>
        ) : (
          <p>
            {focus.names.length > 0 && (focus.kind === 'late'
              ? t('bizFocusWorst').replace('{name}', focus.names[0]).replace('{n}', String(focus.worstDays))
              : t('bizFocusWorstToday').replace('{name}', focus.names[0]))}
            {focus.people > 1 && (focus.names.length > 0 ? ' · ' : '')}
            {focus.people > 1 && t('bizFocusPeople').replace('{n}', String(focus.people))}
          </p>
        )}
        <em>{t('bizNotMoneyYet')}</em>
      </section>

      {/* Lo cobrado contra lo que falta del mes, en una barra. */}
      {(summary.collectedThisMonth > 0 || faltaMes > 0) && (
        <div className="mcol-month">
          <span>
            <small>{t('colCollected')}</small>
            <b className="income">{fmt(summary.collectedThisMonth, currency, { decimals: moneyDecimals })}</b>
          </span>
          <span className="right">
            <small>{t('colMissing')}</small>
            <b>{fmt(faltaMes, currency, { decimals: moneyDecimals })}</b>
          </span>
          <div className="mcol-bar">
            <i style={{ width: `${Math.round(summary.collectedThisMonth / Math.max(1, summary.collectedThisMonth + faltaMes) * 100)}%` }} />
          </div>
        </div>
      )}

      {/* ── P2 · LOS PAGOS QUE PREGUNTAN ────────────────────── */}
      {porPagar.map(due => {
        const cuenta = accounts.find(a => a.id === due.service.payAccountId)
        return (
          <div key={`${due.service.id}|${due.key}`} className="mcol-ask">
            <BrandTile name={due.service.name} size={32} />
            <span className="mcol-ask-id">
              <b>{t(due.date === today ? 'colAskToday' : 'colAskLate').replace('{name}', due.service.name)}</b>
              <small>
                {fmt(due.amount, due.service.currency ?? currency, { decimals: moneyDecimals })}
                {cuenta ? ` · ${t('colAskFrom').replace('{account}', cuenta.name)}` : ''}
                {due.date !== today ? ` · ${new Date(`${due.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}` : ''}
              </small>
            </span>
            <span className="mcol-ask-acts">
              <button type="button" className="go" onClick={() => yaPague(due)}>{t('colAskPaid')}</button>
              <button type="button" onClick={() => {
                const manana = new Date(`${today}T00:00:00`)
                manana.setDate(manana.getDate() + 1)
                snoozePay(due.service.id, due.key, localToday(manana))
                playSoftHaptic()
              }}>{t('colAskTomorrow')}</button>
              <button type="button" className="ghost" aria-label={t('colAskSkip')} onClick={() => {
                markPayHandled(due.service.id, [due.key], today)
                toast(t('colAskSkipped'), { icon: 'check' })
              }}><Icon name="close" size={14} /></button>
            </span>
          </div>
        )
      })}

      <div className="mobile-segment mcol-view" role="tablist" aria-label={t('bizTabCollect')}>
        <button role="tab" aria-selected={vista === 'list'} className={vista === 'list' ? 'on' : ''} onClick={() => cambiarVista('list')}>{t('colViewList')}</button>
        <button role="tab" aria-selected={vista === 'agenda'} className={vista === 'agenda' ? 'on' : ''} onClick={() => cambiarVista('agenda')}>{t('colViewAgenda')}</button>
      </div>

      {vista === 'agenda' && <CollectAgenda charges={vivos} today={today} locale={locale} renderRow={fila} money={n => fmt(n, currency, { decimals: moneyDecimals })} />}

      {/* ── LO QUE HAY QUE COBRAR ───────────────────────────── */}
      {vista === 'list' && GRUPOS.map(g => {
        const lista = grupos[g.id]
        if (!lista.length) return null
        const ab = abierto(g.id)
        // «Cobrar los N» para lo que ya venció o vence hoy: cobrar por
        // adelantado lo que vence el viernes sería apuntar dinero que no llegó.
        const cobrables = lista.filter(c => c.dueDate <= today && !c.waived && outstanding(c) > 0)
        return (
          <div key={g.id} className={`mbiz-group${ab ? ' open' : ''}`}>
            <div className="mcol-group-head">
              <button className="mbiz-group-head" onClick={() => alternar(g.id)} aria-expanded={ab}>
                <span>{t(g.key)}</span>
                <b>{lista.length}</b>
                <Icon name={ab ? 'arrowUp' : 'arrowDn'} size={14} />
              </button>
              {cobrables.length >= 2 && (
                <button type="button" className="mcol-batch" onClick={() => { playSoftHaptic(); setLote(cobrables) }}>
                  {t('colCollectN').replace('{n}', String(cobrables.length))}
                </button>
              )}
            </div>
            {ab && (g.id === 'late' ? porPersona(lista) : <div className="mbiz-list m-stagger">{lista.map(fila)}</div>)}
          </div>
        )
      })}

      {/* ── LO COBRADO, POR MES ─────────────────────────────── */}
      {vista === 'list' && meses.length > 0 && <div className="mbizs-field-label mcol-done-label">{t('bizGroupDone')}</div>}
      {vista === 'list' && meses.map(mk => {
        const lista = porMes.get(mk)!
        const total = lista.reduce((s, c) => s + c.paid, 0)
        const ab = mesAbierto === mk
        return (
          <div key={mk} className={`mbiz-group${ab ? ' open' : ''}`}>
            <button className="mbiz-group-head" onClick={() => { playSoftHaptic(); setMesAbierto(ab ? null : mk) }} aria-expanded={ab}>
              <span>{t('colDoneIn').replace('{month}', monthLabel(mk, locale))}</span>
              <b>{lista.length}</b>
              <em className="income">{fmt(total, currency, { decimals: moneyDecimals })}</em>
              <Icon name={ab ? 'arrowUp' : 'arrowDn'} size={14} />
            </button>
            {ab && <div className="mbiz-list">{lista.map(fila)}</div>}
          </div>
        )
      })}

      {lote && <BatchCollectSheet charges={lote} onClose={() => setLote(null)} />}
    </>
  )
}

/**
 * «COBRAR LOS N», con la lista delante.
 *
 * Cada uno con su cuenta, su categoría y lo que falta, como «Me pagó» con todo
 * por defecto. Lo que no se pueda —un cliente sin cuenta o sin categoría— se
 * dice y se deja para cobrarlo a mano. Con deshacer: mueve dinero.
 */
function BatchCollectSheet({ charges, onClose }: { charges: Charge[]; onClose: () => void }) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const currency = useFinance(s => s.currency)
  const clients = useBusiness(s => s.clients)
  const total = charges.reduce((s, c) => s + outstanding(c), 0)

  const cobrar = () => {
    const hechos: Array<{ chargeId: string; paid: { txId: string; amount: number } }> = []
    for (const c of charges) {
      const paid = collectCharge(c)
      if (paid) hechos.push({ chargeId: c.id, paid })
    }
    const fallan = charges.length - hechos.length
    playIncomeSound()
    toast(t(fallan ? 'colBatchSomeFailed' : 'colBatchDone').replace('{n}', String(hechos.length)).replace('{failed}', String(fallan)), {
      icon: 'check', type: 'ok', duration: 7000,
      action: hechos.length ? { label: t('undo'), onClick: () => { for (const h of hechos) uncollectCharge(h.chargeId, h.paid) } } : undefined,
    })
    onClose()
  }

  return (
    <BizSheet title={t('colCollectN').replace('{n}', String(charges.length))} onClose={onClose} onSave={cobrar} saveLabel={t('colBatchGo')}>
      <div className="mbizs-hero">
        <small>{t('colBatchTotal')}</small>
        <strong>{fmt(total, currency, { decimals: moneyDecimals })}</strong>
        <span>{t('colBatchHint')}</span>
      </div>
      <div className="mcol-batch-list">
        {charges.map(c => {
          const cl = clients.find(x => x.id === c.clientId)
          return (
            <div key={c.id}>
              <span>{cl?.name ?? '—'}</span>
              <b>{fmt(outstanding(c), cl?.currency ?? currency, { decimals: moneyDecimals })}</b>
            </div>
          )
        })}
      </div>
    </BizSheet>
  )
}

/*
 * N2 · LOS COBROS EN UN CALENDARIO.
 *
 * Un punto en cada día que alguien paga, más grande cuanto más se cobra, y en
 * rojo lo vencido. Tocar un día lista sus cobros con el mismo deslizar para
 * cobrar de la lista. Sirve para ver de un vistazo qué semanas entra dinero.
 */
function CollectAgenda({ charges, today, locale, renderRow, money }: {
  charges: Charge[]
  today: string
  locale: string
  renderRow: (charge: Charge) => React.ReactNode
  money: (n: number) => string
}) {
  const t = useT()
  const [mes, setMes] = useState(today.slice(0, 7))
  const [dia, setDia] = useState<string>(today)
  const [y, m] = mes.split('-').map(Number)
  const dias = new Date(y, m, 0).getDate()
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const delMes = charges.filter(c => !c.waived && c.dueDate.startsWith(mes))
  const porDia = new Map<string, Charge[]>()
  for (const c of delMes) porDia.set(c.dueDate, [...(porDia.get(c.dueDate) ?? []), c])
  const maxDia = Math.max(1, ...[...porDia.values()].map(l => l.reduce((s, c) => s + c.amount, 0)))
  const mover = (d: number) => {
    const nd = new Date(y, m - 1 + d, 1)
    const k = `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`
    setMes(k)
    setDia(k === today.slice(0, 7) ? today : `${k}-01`)
    playSoftHaptic()
  }
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }))
  const lista = (porDia.get(dia) ?? []).sort((a, b) => b.amount - a.amount)
  const totalDia = lista.reduce((s, c) => s + c.amount, 0)
  return (
    <div className="mcol-agenda">
      <div className="mcol-agenda-head">
        <button aria-label={t('prevMonth')} onClick={() => mover(-1)}><Icon name="arrowUp" size={16} style={{ transform: 'rotate(-90deg)' }} /></button>
        <b>{monthLabel(mes, locale)}</b>
        <button aria-label={t('nextMonth')} onClick={() => mover(1)}><Icon name="arrowUp" size={16} style={{ transform: 'rotate(90deg)' }} /></button>
      </div>
      <div className="mcol-cal">
        {heads.map((h, i) => <small key={`h${i}`}>{h}</small>)}
        {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
        {Array.from({ length: dias }, (_, i) => {
          const key = `${mes}-${String(i + 1).padStart(2, '0')}`
          const l = porDia.get(key) ?? []
          const suma = l.reduce((s, c) => s + c.amount, 0)
          const tarde = l.some(c => chargeState(c, today) === 'late')
          const size = l.length ? 5 + Math.round((suma / maxDia) * 6) : 0
          return (
            <button
              key={key}
              className={`${key === dia ? 'on' : ''}${key === today ? ' today' : ''}`}
              aria-pressed={key === dia}
              onClick={() => { setDia(key); playSoftHaptic() }}
            >
              {i + 1}
              {l.length > 0 && <i className={tarde ? 'late' : ''} style={{ width: size, height: size }} />}
            </button>
          )
        })}
      </div>
      <p className="mcol-agenda-day">
        {t('colAgendaDay')
          .replace('{day}', new Date(`${dia}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric' }))
          .replace('{amount}', money(totalDia))}
      </p>
      {lista.length ? <div className="mbiz-list">{lista.map(renderRow)}</div> : <p className="mcol-agenda-empty">{t('colAgendaEmpty')}</p>}
    </div>
  )
}
