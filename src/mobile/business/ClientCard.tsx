import { useEffect, useMemo, useState } from 'react'
import { punctuality } from '@/data/bizToday'
import { BrandTile } from '@/components/ui/BrandTile'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY } from '@/data/billing'
import { chargeState, clientPerMonth, clientServices, clientTotalAmount, lastPriceChange, nextDueDate, outstanding } from '@/data/clients'
import { exportReceiptPdf, exportStatementPdf } from '@/data/businessExport'
import { clientHistory, groupCharges } from '@/data/collectFocus'
import { clientTimeline, type TimelineEvent } from '@/data/clientTimeline'
import { reminderMessage } from '@/data/clientList'
import { activeStars, applyDiscount, nextStep, referralDiscount, referralRules, thanksMessage } from '@/data/referrals'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { averageDelay } from '@/data/receivables'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { avatarInitials, avatarStyle } from './avatar'
import { BizSheet } from './shared'
import { ClientSheet } from './ClientSheet'
import { NewChargeSheet } from './NewChargeSheet'
import { DeleteClientSheet } from './DeleteClientSheet'

/**
 * LA FICHA DE UN CLIENTE.
 *
 * ── EL ORDEN ──────────────────────────────────────────────────────────
 *  1. Quién es: su cara, su servicio, desde cuándo, y quién lo trajo.
 *  2. Tres cifras: lo que debe, cuándo le toca y lo que te ha pagado.
 *  3. Sus estrellas: a cuántos te ha traído y cuánto le baja eso el precio.
 *  4. Lo que tiene pendiente.
 *  5. Su historia, del pago más nuevo al más viejo.
 *
 * ── LAS ACCIONES ──────────────────────────────────────────────────────
 * Dos a la vista, las de cada semana —un cobro nuevo y el recordatorio—, y el
 * resto en el menú ⋯, todas con su nombre. Borrar estaba detrás de «Editar
 * sus datos», como una papelera sin texto pegada a Cancelar: si no sabías que
 * estaba ahí, la app parecía no dejarte.
 */
export function ClientCard({ clientId, onClose, onCollect, onDuplicated }: {
  clientId: string
  onClose: () => void
  onCollect: (chargeId: string) => void
  /** El clon recién creado, para abrirlo y ponerle su nombre. */
  onDuplicated: (clientId: string) => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const reminderTpl = useSettings(s => s.bizReminderTemplate)
  const thanksTpl = useSettings(s => s.bizThanksTemplate)
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { currency } = useFinance()
  const { clients, charges, businesses, services, duplicateClient, moveClientToService, updateClient, removeStar } = useBusiness()

  const [editando, setEditando] = useState(false)
  const [cobroNuevo, setCobroNuevo] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [cambiando, setCambiando] = useState(false)
  const [menu, setMenu] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const [estrella, setEstrella] = useState(false)
  const [verEstrellas, setVerEstrellas] = useState(false)

  const today = localToday()
  const client = clients.find(c => c.id === clientId)

  /*
   * Si lo borran, la ficha deja de describir a nadie y se cierra sola. Un
   * cliente borrado con su historial sigue existiendo, así que también cuenta.
   */
  useEffect(() => { if (!client || client.deletedAt) onClose() }, [client, onClose])

  const suyos = useMemo(() => charges.filter(c => c.clientId === clientId), [charges, clientId])
  const hist = useMemo(() => clientHistory(clientId, charges, today), [charges, clientId, today])
  const grupos = useMemo(() => groupCharges(suyos, today), [suyos, today])
  const historia = useMemo(() => (client ? clientTimeline(client, charges) : []), [client, charges])

  if (!client || client.deletedAt) return null

  const cur = client.currency ?? currency
  const negocio = client.businessId ? businesses.find(b => b.id === client.businessId) : null
  const sus = clientServices(client)
  const servicio = sus[0] ? services.find(s => s.id === sus[0].serviceId) : null
  const retraso = averageDelay(suyos)
  const puntual = punctuality(suyos)
  const antes = lastPriceChange(client)
  const proximo = nextDueDate(client, today)
  const alMes = clientPerMonth(client, currency)
  const reglas = referralRules(negocio)
  const vigentes = activeStars(client, reglas)
  const descuento = referralDiscount(client, reglas)
  const siguiente = nextStep(client, reglas)
  const precio = clientTotalAmount(client)
  const recomendador = client.referredBy ? clients.find(c => c.id === client.referredBy) : null
  const nombreDe = (id?: string) => (id ? clients.find(c => c.id === id)?.name : undefined)
  const abiertos = [...grupos.late, ...grupos.week, ...grupos.later]
  // Los escalones del programa: tantos como hacen falta para llegar al tope.
  const escalones = reglas.pctPerStar > 0 ? Math.max(1, Math.ceil(reglas.maxPct / reglas.pctPerStar)) : 0
  /*
   * El comprobante solo de lo que tiene un movimiento detrás: un papel que
   * diga «recibido» sin esa prueba es justo el que no se puede emitir a la
   * ligera.
   */
  const conPrueba = (chargeId?: string) => {
    const charge = chargeId ? charges.find(c => c.id === chargeId) : undefined
    return !!charge && charge.txIds.length > 0 && charge.paid > 0 && !charge.waived
  }
  const fecha = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const dinero = (n: number) => fmt(n, cur, { decimals: moneyDecimals })

  const copiar = (texto: string, aviso: LangKey) => {
    playSoftHaptic()
    void navigator.clipboard?.writeText(texto)
      .then(() => toast(t(aviso), { icon: 'check', type: 'ok' }))
      // Sin portapapeles el texto se ENSEÑA: copiar es una comodidad.
      .catch(() => toast(texto, { icon: 'info', duration: 9000 }))
  }

  const recordar = () => copiar(reminderMessage(reminderTpl || t('cliReminderTpl'), {
    name: client.name,
    amount: dinero(hist.owes > 0 ? hist.owes : precio),
    service: servicio?.name ?? client.concept ?? '',
    months: Math.max(1, abiertos.filter(c => chargeState(c, today) === 'late').length),
  }), 'cliReminderCopied')

  const agradecer = () => copiar(thanksMessage(thanksTpl || t('cliThanksTpl'), {
    name: client.name,
    referred: nombreDe(vigentes[vigentes.length - 1]?.referredId) ?? '',
    pct: descuento,
    next: siguiente?.pct ?? null,
  }), 'cliThanksCopied')

  return (
    <BizSheet title={t('cliCardTitle')} onClose={onClose}>
      {/* ── QUIÉN ES ─────────────────────────────────────────── */}
      <div className="mcc-hero">
        <span className="mcc-ava" style={avatarStyle(client.id)}>
          {avatarInitials(client.name)}
          {vigentes.length > 0 && (
            <em className="mcc-ava-stars" aria-label={t('cliStarsN').replace('{n}', String(vigentes.length))}>
              ★{vigentes.length}
            </em>
          )}
        </span>
        <b className="mcc-name">{client.name}</b>
        <span className="mcc-sub">
          {servicio && <BrandTile name={servicio.name} size={16} color={negocio?.color} icon={negocio?.icon} />}
          {[
            servicio?.name ?? (client.concept || null),
            t('cliSince').replace('{date}', new Date(client.createdAt || Date.now()).toLocaleDateString(locale, { month: 'short', year: 'numeric' })),
          ].filter(Boolean).join(' · ')}
        </span>
        {recomendador && (
          <span className="mcc-ref"><Icon name="heart" size={12} /> {t('cliReferredBy').replace('{name}', recomendador.name)}</span>
        )}
      </div>

      {!client.active && <p className="mbizs-calc warn">{t('bizCliPaused')}</p>}

      {/* ── TRES CIFRAS ──────────────────────────────────────── */}
      <div className="mcc-trio">
        <div className={hist.owes > 0 ? 'due' : ''}>
          <small>{t('bizCliOwes')}</small>
          <b>{dinero(hist.owes)}</b>
        </div>
        <div>
          <small>{t('bizCliNext')}</small>
          <b>{proximo ? fecha(proximo) : '—'}</b>
        </div>
        <div className="paid">
          <small>{t('cliPaidShort')}</small>
          <b>{dinero(hist.totalPaid)}</b>
        </div>
      </div>

      <div className="mcli-meta">
        <span>
          {descuento > 0 ? (
            <>
              <s>{dinero(precio)}</s> {dinero(applyDiscount(precio, descuento))}
            </>
          ) : dinero(precio)}
          {' · '}{t(CYCLE_KEY[client.cycle] as LangKey)}
        </span>
        {client.cycle !== 'monthly' && alMes > 0 && (
          <span>{t('bizPerMonthIs').replace('{amount}', fmt(alMes, cur, { decimals: moneyDecimals }))}</span>
        )}
        {negocio && <span><Icon name={negocio.icon} size={12} /> {negocio.name}</span>}
        {client.autoCollect && <span className="ok"><Icon name="repeat" size={12} /> {t('cliAutoCollectOn')}</span>}
        {/* N6 · La puntualidad en una etiqueta: puntual, a veces tarde o siempre tarde. */}
        {puntual ? (
          <span className={`mcli-punct ${puntual.kind}`}>
            {puntual.kind === 'late'
              ? t('punctLateDays').replace('{n}', String(Math.round(puntual.avgDays)))
              : t(puntual.kind === 'onTime' ? 'punctOnTime' : 'punctSometimes')}
          </span>
        ) : retraso !== null && retraso >= 1 && (
          <span className="late">{t('bizAvgDelay').replace('{n}', String(retraso))}</span>
        )}
      </div>

      {antes && (
        <p className="mcli-price-was">
          {t('bizPriceWas')
            .replace('{amount}', dinero(antes.amount))
            .replace('{date}', new Date(antes.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }))}
        </p>
      )}

      {sus.length > 1 && (
        <div className="mcli-svcs">
          <div className="mbizs-field-label">{t('bizServices')}</div>
          {sus.map(({ serviceId, amount }) => {
            const svc = services.find(v => v.id === serviceId)
            if (!svc) return null
            return (
              <div key={serviceId} className="mcli-svc">
                <BrandTile name={svc.name} size={26} color={negocio?.color} icon={negocio?.icon} />
                <span>{svc.name}</span>
                <b>{dinero(amount)}</b>
              </div>
            )
          })}
        </div>
      )}

      {/* ── SUS ESTRELLAS ────────────────────────────────────── */}
      {/*
        Cada estrella es alguien que te trajo, y cada una le baja el precio.
        Se enseñan los escalones que le quedan, no solo los que tiene: ver la
        siguiente estrella apagada es lo que hace que quiera traer a otro.
      */}
      {reglas.pctPerStar > 0 && (
        <section className="mcc-stars">
          <div className="mcc-stars-top">
            <span className="mcc-stars-row" aria-hidden="true">
              {Array.from({ length: escalones }, (_, i) => (
                <i key={i} className={i < vigentes.length ? 'on' : ''}>★</i>
              ))}
            </span>
            <span className="mcc-stars-txt">
              <b>
                {vigentes.length === 0
                  ? t('cliStarsNone')
                  : t(vigentes.length === 1 ? 'cliStarsOne' : 'cliStarsMany').replace('{n}', String(vigentes.length))}
              </b>
              <small>
                {descuento > 0
                  ? t('cliStarsDiscount').replace('{pct}', String(descuento))
                  : t('cliStarsHowTo').replace('{pct}', String(reglas.pctPerStar))}
                {siguiente && descuento > 0 && ` · ${t('cliStarsNext').replace('{pct}', String(siguiente.pct))}`}
              </small>
            </span>
          </div>
          <div className="mcc-stars-acts">
            <button type="button" onClick={() => { playSoftHaptic(); setEstrella(true) }}>
              <Icon name="star" size={13} /> {t('cliAddStar')}
            </button>
            {descuento > 0 && (
              <button type="button" onClick={agradecer}>
                <Icon name="heart" size={13} /> {t('cliThank')}
              </button>
            )}
            {(client.stars?.length ?? 0) > 0 && (
              <button type="button" className="ghost" aria-expanded={verEstrellas} onClick={() => setVerEstrellas(v => !v)}>
                {t('cliStarsSee')}
              </button>
            )}
          </div>
          {verEstrellas && (
            <ul className="mcc-stars-list">
              {(client.stars ?? []).slice().reverse().map(s => (
                <li key={s.at} className={vigentes.includes(s) ? '' : 'old'}>
                  <span>★ {nombreDe(s.referredId) ?? s.note ?? t('cliStarNoName')}</span>
                  <small>{new Date(s.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</small>
                  <button type="button" aria-label={t('cliStarRemove')} onClick={() => { removeStar(client.id, s.at); playSoftHaptic() }}>
                    <Icon name="close" size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── LAS DOS DE CADA SEMANA, Y EL MENÚ ───────────────── */}
      <div className="mcc-acts">
        <button type="button" className="primary" onClick={() => { playSoftHaptic(); setCobroNuevo(true) }}>
          <Icon name="plus" size={15} /> {t('bizNewCharge')}
        </button>
        <button type="button" onClick={recordar}>
          <Icon name="bell" size={15} /> {t('cliRemind')}
        </button>
        <button type="button" className="more" aria-label={t('moreOptions')} onClick={() => { playSoftHaptic(); setMenu(true) }}>
          <Icon name="dots" size={17} />
        </button>
      </div>

      {/* ── LO PENDIENTE ─────────────────────────────────────── */}
      {abiertos.length > 0 && (
        <>
          <div className="mbizs-field-label">{t('cliPending')}</div>
          <div className="mcli-charges">
            {abiertos.map(charge => {
              const estado = chargeState(charge, today)
              return (
                <button key={charge.id} className={`mcli-charge ${estado}`} onClick={() => { playSoftHaptic(); onCollect(charge.id) }}>
                  <span>{fecha(charge.dueDate)}</span>
                  <b>{dinero(outstanding(charge))}</b>
                  {estado === 'late' && <em className="late">{t('bizGroupLate')}</em>}
                  {estado === 'today' && <em className="due">{t('bizDueToday')}</em>}
                  {estado === 'partial' && <em className="due">{t('bizPartial')}</em>}
                  {charge.discountPct ? <em className="ok">−{charge.discountPct}%</em> : null}
                  {charge.note && <u>{charge.note}</u>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* ── SU HISTORIA ──────────────────────────────────────── */}
      {/*
        Es lo que hace falta cuando alguien dice «yo ya te pagué»: cuándo,
        cuánto y con qué retraso, y el comprobante de cada pago a un toque.
      */}
      <div className="mbizs-field-label">{t('cliHistory')}</div>
      {historia.length === 0 ? (
        <p className="mbizs-calc">{t('bizCliNoHistory')}</p>
      ) : (
        <ol className="mcc-tl">
          {historia.map((e, i) => (
            <li key={`${e.kind}-${e.at}-${i}`} className={`k-${e.kind}`}>
              <i aria-hidden="true" />
              <span>
                <b>{textoDe(e, t, dinero, nombreDe)}</b>
                <small>{fecha(e.date)}{e.note ? ` · ${e.note}` : ''}</small>
              </span>
              {conPrueba(e.chargeId) && (
                <button
                  type="button"
                  className="mcli-receipt"
                  disabled={generando}
                  aria-label={t('rcptAction')}
                  onClick={async () => {
                    const charge = charges.find(c => c.id === e.chargeId)
                    if (!charge) return
                    setGenerando(true)
                    try {
                      const ok = await exportReceiptPdf(charge, client, currency, lang)
                      if (!ok) toast(t('rcptNeedsPayment'), { icon: 'alert' })
                    } finally { setGenerando(false) }
                  }}
                >
                  <Icon name="receipt" size={14} />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* ── EL MENÚ ⋯ ────────────────────────────────────────── */}
      {menu && (
        <BizSheet title={client.name} onClose={() => setMenu(false)}>
          <div className="mmenu">
            <button type="button" onClick={() => { setMenu(false); setEditando(true) }}>
              <Icon name="edit" size={17} /><span><b>{t('bizCliEdit')}</b></span>
            </button>
            {services.length > 1 && sus.length <= 1 && (
              <button type="button" onClick={() => { setMenu(false); setCambiando(true) }}>
                <Icon name="repeat" size={17} /><span><b>{t('bizChangeService')}</b></span>
              </button>
            )}
            <button type="button" onClick={() => {
              const nuevo = duplicateClient(client.id)
              setMenu(false)
              if (!nuevo) return
              toast(t('bizCliDuplicated'), { icon: 'check', type: 'ok' })
              onDuplicated(nuevo)
            }}>
              <Icon name="cards" size={17} /><span><b>{t('bizCliDuplicate')}</b><small>{t('cliDuplicateHint')}</small></span>
            </button>
            <button type="button" disabled={generando} onClick={async () => {
              setGenerando(true)
              try { await exportStatementPdf(client, charges, Number(today.slice(0, 4)), currency, lang) }
              finally { setGenerando(false); setMenu(false) }
            }}>
              <Icon name="fileJson" size={17} /><span><b>{t('stmtAction')}</b></span>
            </button>
            {client.phone && (
              <button type="button" onClick={() => { setMenu(false); copiar(client.phone!, 'bizPhoneCopied') }}>
                <Icon name="phone" size={17} /><span><b>{t('bizCopyPhone')}</b><small>{client.phone}</small></span>
              </button>
            )}
            <button type="button" onClick={() => {
              updateClient(client.id, { active: !client.active })
              toast(t(client.active ? 'cliPausedToast' : 'cliResumedToast'), { icon: 'check', type: 'ok' })
              setMenu(false)
            }}>
              <Icon name={client.active ? 'clock' : 'repeat'} size={17} />
              <span><b>{t(client.active ? 'cliPause' : 'cliResume')}</b><small>{t(client.active ? 'cliPauseHint' : 'cliResumeHint')}</small></span>
            </button>
            <button type="button" className="danger" onClick={() => { setMenu(false); setBorrando(true) }}>
              <Icon name="trash" size={17} /><span><b>{t('bizDeleteClient')}</b></span>
            </button>
          </div>
        </BizSheet>
      )}

      {borrando && <DeleteClientSheet clientIds={[client.id]} onClose={() => setBorrando(false)} />}
      {estrella && <AddStarSheet clientId={client.id} onClose={() => setEstrella(false)} />}

      {editando && <ClientSheet clientId={client.id} onClose={() => setEditando(false)} />}
      {cobroNuevo && <NewChargeSheet clientId={client.id} onClose={() => setCobroNuevo(false)} />}

      {cambiando && (
        <BizSheet title={t('bizChangeService')} onClose={() => setCambiando(false)}>
          <p className="mbizs-calc">{t('bizChangeServiceHint')}</p>
          {services.filter(v => !v.archivedAt).map(svc => {
            const esSuyo = sus.some(x => x.serviceId === svc.id)
            const biz = businesses.find(b => b.id === svc.businessId)
            return (
              <button
                key={svc.id}
                type="button"
                className={`mmerge-pick${esSuyo ? ' on' : ''}`}
                disabled={esSuyo}
                onClick={() => {
                  moveClientToService(client.id, svc.id)
                  playSoftHaptic()
                  toast(t('bizChangeServiceDone')
                    .replace('{name}', client.name)
                    .replace('{service}', svc.name), { icon: 'check', type: 'ok' })
                  setCambiando(false)
                }}
              >
                <BrandTile name={svc.name} size={26} color={biz?.color} icon={biz?.icon} />
                <span>
                  <b>{svc.name}</b>
                  {biz && <small>{biz.name}</small>}
                </span>
                {esSuyo && <Icon name="check" size={16} />}
              </button>
            )
          })}
        </BizSheet>
      )}
    </BizSheet>
  )
}

/** La frase de cada momento de su historia. */
function textoDe(
  e: TimelineEvent,
  t: ReturnType<typeof useT>,
  dinero: (n: number) => string,
  nombreDe: (id?: string) => string | undefined,
): string {
  const monto = dinero(e.amount ?? 0)
  switch (e.kind) {
    case 'paid': return t('tlPaid').replace('{amount}', monto)
    case 'late-paid': return t('tlLatePaid').replace('{amount}', monto).replace('{n}', String(e.days ?? 0))
    case 'partial': return t('tlPartial').replace('{amount}', monto)
    case 'waived': return t('tlWaived').replace('{amount}', monto)
    case 'price': return t('tlPrice').replace('{from}', dinero(e.from ?? 0)).replace('{to}', monto)
    case 'star': return nombreDe(e.otherId)
      ? t('tlStarFor').replace('{name}', nombreDe(e.otherId)!)
      : t('tlStar')
    case 'referred': return nombreDe(e.otherId)
      ? t('tlReferred').replace('{name}', nombreDe(e.otherId)!)
      : t('tlJoined')
    case 'joined': return t('tlJoined')
  }
}

/**
 * UNA ESTRELLA MÁS: a quién te trajo.
 *
 * Lo normal es elegir al cliente que trajo, si ya está en la app; si no, una
 * nota basta («su hermana, que todavía no paga»). Al crear un cliente con
 * «quién te lo recomendó», la estrella se pone sola y esto no hace falta.
 */
function AddStarSheet({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const t = useT()
  const { clients, addStar } = useBusiness()
  const [traido, setTraido] = useState('')
  const [nota, setNota] = useState('')
  const [buscar, setBuscar] = useState('')
  const yaTraidos = new Set((clients.find(c => c.id === clientId)?.stars ?? []).map(s => s.referredId).filter(Boolean))
  const candidatos = clients
    .filter(c => c.id !== clientId && !c.deletedAt && !yaTraidos.has(c.id))
    .filter(c => !buscar.trim() || c.name.toLowerCase().includes(buscar.trim().toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 8)

  const guardar = () => {
    addStar(clientId, { at: Date.now(), referredId: traido || undefined, note: nota.trim() || undefined })
    playSoftHaptic()
    toast(t('cliStarAdded'), { icon: 'star', type: 'ok' })
    onClose()
  }

  return (
    <BizSheet title={t('cliAddStarTitle')} onClose={onClose} onSave={guardar} saveLabel={t('cliAddStar')}>
      <p className="mbizs-calc">{t('cliAddStarHint')}</p>
      <input className="mbizs-input" value={buscar} placeholder={t('cliSearchPlaceholder')} onChange={e => setBuscar(e.target.value)} />
      <div className="mcc-pick">
        {candidatos.map(c => (
          <button key={c.id} type="button" className={traido === c.id ? 'on' : ''} aria-pressed={traido === c.id} onClick={() => setTraido(traido === c.id ? '' : c.id)}>
            <span className="mbiz-ava" style={avatarStyle(c.id)}>{avatarInitials(c.name)}</span>
            <span>{c.name}</span>
            {traido === c.id && <Icon name="check" size={15} />}
          </button>
        ))}
      </div>
      <input className="mbizs-input" value={nota} maxLength={140} placeholder={t('cliStarNotePlaceholder')} onChange={e => setNota(e.target.value)} />
    </BizSheet>
  )
}
