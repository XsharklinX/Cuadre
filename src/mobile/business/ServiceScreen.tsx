import { useMemo, useState } from 'react'
import { BrandTile } from '@/components/ui/BrandTile'
import { IconTile, NxSheet } from '@/components/ui/Phrase'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY, prepaySaving } from '@/data/billing'
import { serviceAccounts, serviceMargin } from '@/data/business'
import { clientProfits } from '@/data/attribution'
import { isScheduled, serviceDueDates } from '@/data/autopay'
import { owedByClient } from '@/data/clientList'
import { similarServices, unmarkedPayments } from '@/data/serviceMerge'
import { howToFix, nextPaymentDate, servicePayments, slotEconomics, totalPaid } from '@/data/serviceEconomics'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { markOldPayments, mergeServices, unmergeServices } from '@/lib/businessOps'
import { playSoftHaptic } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { avatarInitials, avatarStyle } from './avatar'
import { BizSheet } from './shared'
import { ServiceAccounts } from './ServiceAccounts'
import { ServiceSheet } from './ServiceSheet'
import { PayConfigSheet } from './PayConfigSheet'
import { ClientSheet } from './ClientSheet'

/**
 * S1 · UN SERVICIO CON SU PROPIA PANTALLA.
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────
 * Era un formulario largo con todo dentro: los datos, las cuentas, los pagos,
 * moverlo y el precio por plaza, uno debajo de otro. Lo que se MIRA cada
 * semana —cuánto deja, quién está, cuándo toca pagar— estaba mezclado con lo
 * que se CONFIGURA una vez, y por eso el menú se sentía un desastre.
 *
 * Ahora son cuatro pestañas para mirar, y lo que cambia cosas va al menú ⋯,
 * agrupado y con lo peligroso al final y en rojo.
 */
type Pestaña = 'summary' | 'accounts' | 'clients' | 'payments'

export function ServiceScreen({ serviceId, onClose, onPay, onOpenClient }: {
  serviceId: string
  onClose: () => void
  onPay: (serviceId: string) => void
  onOpenClient: (clientId: string) => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { currency, transactions } = useFinance()
  const { services, businesses, clients, charges, deleteService, archiveService } = useBusiness()
  const [tab, setTab] = useState<Pestaña>('summary')
  const [menu, setMenu] = useState(false)
  const [editando, setEditando] = useState(false)
  const [pago, setPago] = useState(false)
  const [uniendo, setUniendo] = useState(false)
  const [moviendo, setMoviendo] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState(false)

  const service = services.find(s => s.id === serviceId)
  const negocio = service ? businesses.find(b => b.id === service.businessId) : null
  const hoy = localToday()
  const owed = useMemo(() => owedByClient(charges, hoy), [charges, hoy])

  if (!service) return null

  const cur = service.currency ?? currency
  const dinero = (n: number, c = currency) => fmt(n, c, { decimals: moneyDecimals })
  const fecha = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
  const margen = serviceMargin(service, clients, currency)
  const plaza = slotEconomics(service, clients, currency)
  const arreglo = howToFix(service, clients, currency)
  const pagos = servicePayments(service, transactions)
  const pagado = totalPaid(service, transactions)
  const viejos = unmarkedPayments(service, negocio ?? undefined, transactions, services)
  const parecidos = similarServices(services).find(g => g.some(s => s.id === service.id))?.filter(s => s.id !== service.id) ?? []
  const ganancias = clientProfits(service, clients, c => owed.get(c.id) ?? 0, currency)
  const cuentas = serviceAccounts(service)
  const ahorro = service.monthlyListPrice
    ? prepaySaving({ amount: service.cost, cycle: service.costCycle, customMonths: service.costCustomMonths }, service.monthlyListPrice)
    : 0
  /*
   * EL PRÓXIMO PAGO: del calendario si se paga solo o avisa; si no, del
   * último pago hecho, que es lo único que dice algo de cuándo toca.
   */
  const programado = isScheduled(service)
  const proximo = programado
    ? cuentas.flatMap(a => serviceDueDates(service, a, hoy, `${Number(hoy.slice(0, 4)) + 2}-12-31`)).sort()[0] ?? null
    : nextPaymentDate(service, transactions)
  const modo = service.payMode ?? 'manual'

  const borrar = () => {
    const copia = { ...service }
    const enganchados = clients.filter(c => c.serviceId === service.id).map(c => c.id)
    setMenu(false)
    onClose()
    deleteWithUndo({
      message: t('bizServiceDeleted'),
      onDelete: () => deleteService(copia.id),
      onRestore: () => useBusiness.setState(s => ({
        services: [...s.services, copia],
        clients: s.clients.map(c => enganchados.includes(c.id) ? { ...c, serviceId: copia.id } : c),
      })),
    })
  }


  return (
    <BizSheet title={t('svcScreenTitle')} onClose={onClose}>
      <header className="msvs-head">
        <BrandTile name={service.name} size={44} color={negocio?.color} icon={negocio?.icon} />
        <span>
          <b>{service.name}</b>
          <small>
            {cuentas.length > 1 ? `${t('invNAccounts').replace('{n}', String(cuentas.length))} · ` : ''}
            {dinero(cuentas.reduce((s, a) => s + a.cost, 0), cur)} {t(CYCLE_KEY[service.costCycle] as LangKey)}
            {negocio ? ` · ${negocio.name}` : ''}
          </small>
          {service.archivedAt && <em className="msvs-archived">{t('svcArchived')}</em>}
        </span>
        <button type="button" className="msvs-more" aria-label={t('moreOptions')} onClick={() => { playSoftHaptic(); setMenu(true) }}>
          <Icon name="dots" size={18} />
        </button>
      </header>


      {/* ── RESUMEN ──────────────────────────────────────────── */}
      {(
        <>
          {/* N6 · El anillo con las plazas ocupadas y lo que te deja (2.8). */}
          <div className="n28-hero static">
            <span className="n28-ring" aria-hidden="true">
              <svg width="64" height="64" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="26" className="trk" />
                <circle cx="32" cy="32" r="26" className="val" strokeDasharray={`${plaza.slots ? Math.min(1, margen.clientCount / plaza.slots) * 163.4 : 0} 163.4`} />
              </svg>
              <b>{plaza.slots === null ? margen.clientCount : `${margen.clientCount}/${plaza.slots}`}</b>
            </span>
            <span className="n28-hero-main">
              <small>{t('svcLeavesMonth')}</small>
              <b className={margen.margin < 0 ? 'neg' : 'pos'}>{margen.margin < 0 ? '−' : '+'}{dinero(Math.abs(margen.margin))}</b>
              <small>
                {t('svcCollectsPays').replace('{in}', dinero(margen.revenue)).replace('{out}', dinero(margen.cost))}
                {proximo ? ` · ${t('svcNextPay').toLowerCase()} ${fecha(proximo)}` : ''}
              </small>
            </span>
          </div>

          <p className="n28-title">{t('n28SeatsTitle')}{plaza.marginPerSlot !== null && <span>{t('svcPerSlot')} {dinero(plaza.marginPerSlot)}</span>}</p>
          <div className="n28-card">
            {ganancias.map(g => (
              <button key={g.client.id} type="button" className="n28-row" onClick={() => onOpenClient(g.client.id)}>
                <span className="mbiz-ava" style={avatarStyle(g.client.id)}>{avatarInitials(g.client.name)}</span>
                <span className="n28-svc-id">
                  <b>{g.client.name}</b>
                  <small className={g.owes > 0 ? 'bad' : ''}>
                    {g.owes > 0
                      ? t('svcClientOwes').replace('{amount}', dinero(g.owes, g.client.currency ?? currency))
                      : t('svcClientPays').replace('{pays}', dinero(g.pays)).replace('{slot}', dinero(g.slotCost))}
                  </small>
                </span>
                <b className={g.profit < 0 ? 'expense' : 'income'}>{g.profit < 0 ? '−' : '+'}{dinero(Math.abs(g.profit))}</b>
              </button>
            ))}
            {Array.from({ length: Math.max(0, (plaza.slots ?? 0) - margen.clientCount) }).slice(0, 6).map((_, i) => (
              <button key={`libre${i}`} type="button" className="n28-row free" onClick={() => { playSoftHaptic(); setNuevoCliente(true) }}>
                <span className="n28-free-ava" aria-hidden="true">+</span>
                <span className="n28-svc-id"><b>{t('n28FreeSeat')}</b><small>{t('n28FreeSeatHint')}</small></span>
              </button>
            ))}
            {ganancias.length === 0 && !plaza.slots && (
              <button type="button" className="n28-row free" onClick={() => { playSoftHaptic(); setNuevoCliente(true) }}>
                <span className="n28-free-ava" aria-hidden="true">+</span>
                <span className="n28-svc-id"><b>{t('svcAddClient')}</b><small>{t('svcNoClients')}</small></span>
              </button>
            )}
          </div>

          <div className="n28-card">
            <button type="button" className="n28-row" onClick={() => { playSoftHaptic(); setTab('accounts') }}>
              <IconTile icon="cards" color="#5bc0ff" size={36} />
              <span className="n28-svc-id"><b>{t('svcTabAccounts')}</b><small>{cuentas.length > 1 ? t('invNAccounts').replace('{n}', String(cuentas.length)) : dinero(cuentas.reduce((sum, a) => sum + a.cost, 0), cur)}</small></span>
              <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} />
            </button>
            <button type="button" className="n28-row" onClick={() => { playSoftHaptic(); setTab('payments') }}>
              <IconTile icon="receipt" color="#ff6b8a" size={36} />
              <span className="n28-svc-id"><b>{t('svcTabPayments')}</b><small>{pagos.length ? `${t('svcPaidTotal')} ${dinero(pagado)}` : t('svcNoPayments')}</small></span>
              <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} />
            </button>
          </div>

          <button type="button" className="msvs-pay-row" onClick={() => { playSoftHaptic(); setPago(true) }}>
            <Icon name="repeat" size={16} />
            <span>
              <b>{t(modo === 'auto' ? 'payModeAuto' : modo === 'ask' ? 'payModeAsk' : 'payModeManual')}</b>
              <small>
                {modo === 'manual'
                  ? t('svcPayManualHint')
                  : proximo ? t(modo === 'auto' ? 'svcPayAutoNext' : 'svcPayAskNext').replace('{date}', fecha(proximo)) : t('svcPayNoDate')}
              </small>
            </span>
            <Icon name="arrowDn" size={13} />
          </button>

          {ahorro > 0 && <p className="mbizs-calc strong">{t('bizPrepaySaving').replace('{amount}', dinero(ahorro, cur))}</p>}

          {arreglo && (arreglo.clientsNeeded !== null || arreglo.priceNeeded !== null) && margen.margin < 0 && (
            <div className="msvc-fix">
              <b>{t('svcFixTitle')}</b>
              {arreglo.clientsNeeded !== null && <p>{t('svcFixClients').replace('{n}', String(arreglo.clientsNeeded))}</p>}
              {arreglo.priceNeeded !== null && <p>{t('svcFixPrice').replace('{amount}', dinero(arreglo.priceNeeded))}</p>}
            </div>
          )}

          {/* S3 · La app lo propone cuando ve otro de la misma marca. */}
          {parecidos.length > 0 && (
            <div className="msvs-suggest">
              <b>{t('svcSimilarTitle').replace('{name}', parecidos.map(p => p.name).join(', '))}</b>
              <small>{t('svcSimilarHint')}</small>
              <button type="button" onClick={() => setUniendo(true)}>{t('svcSeeMerged')}</button>
            </div>
          )}

          <button type="button" className="mcc-acts-full" onClick={() => onPay(service.id)}>
            <Icon name="handCoins" size={15} /> {t('svcPayNow')}
          </button>
        </>
      )}

      {/* ── CUENTAS ──────────────────────────────────────────── */}
      {tab === 'accounts' && (
        <NxSheet title={`${t('svcTabAccounts')} · ${service.name}`} onClose={() => setTab('summary')}>
          <ServiceAccounts service={service} currency={currency} />
        </NxSheet>
      )}

      {/* ── PAGOS ────────────────────────────────────────────── */}
      {tab === 'payments' && (
        <NxSheet title={`${t('svcTabPayments')} · ${service.name}`} onClose={() => setTab('summary')}>
          {/* G1 · Los pagos viejos sin marca, propuestos: la app sospecha, el
              usuario decide. Marcados, se mueven y se unen con el servicio. */}
          {viejos.length > 0 && (
            <div className="msvs-suggest">
              <b>{t(viejos.length === 1 ? 'svcOldPayTitle' : 'svcOldPaysTitle').replace('{n}', String(viejos.length)).replace('{name}', service.name)}</b>
              <small>{t('svcOldPaysHint')}</small>
              <button type="button" onClick={() => {
                markOldPayments(service.id, viejos.map(v => v.id))
                playSoftHaptic()
                toast(t('svcOldPaysDone').replace('{n}', String(viejos.length)), { icon: 'check', type: 'ok' })
              }}>{t('svcOldPaysMark')}</button>
            </div>
          )}
          {pagos.length === 0 ? (
            <p className="mbizs-calc">{t('svcNoPayments')}</p>
          ) : (
            <div className="msvc-pays">
              {pagos.slice(0, 24).map(tx => (
                <div key={tx.id} className="msvc-pay">
                  <span>{fecha(tx.date)}{tx.autoPaid ? ` · ${t('svcPaidAuto')}` : ''}</span>
                  <b>{dinero(tx.amount)}</b>
                </div>
              ))}
              <div className="msvc-pay total">
                <span>{t('svcPaidTotal')}</span>
                <b>{dinero(pagado)}</b>
              </div>
            </div>
          )}
          <button type="button" className="mcc-acts-full" onClick={() => onPay(service.id)}>
            <Icon name="handCoins" size={15} /> {t('svcPayNow')}
          </button>
        </NxSheet>
      )}

      {/* ── EL MENÚ ⋯ ────────────────────────────────────────── */}
      {menu && (
        <BizSheet title={service.name} onClose={() => setMenu(false)}>
          <div className="mmenu">
            <button type="button" onClick={() => { setMenu(false); setEditando(true) }}>
              <Icon name="edit" size={17} /><span><b>{t('svcEdit')}</b><small>{t('svcEditHint')}</small></span>
            </button>
            <button type="button" onClick={() => { setMenu(false); setPago(true) }}>
              <Icon name="repeat" size={17} /><span><b>{t('svcHowPay')}</b><small>{t('svcHowPayHint')}</small></span>
            </button>
            <div className="mmenu-sep" />
            <button type="button" disabled={services.length < 2} onClick={() => { setMenu(false); setUniendo(true) }}>
              <Icon name="cards" size={17} /><span><b>{t('svcMerge')}</b><small>{t('svcMergeHint')}</small></span>
            </button>
            <button type="button" disabled={businesses.filter(b => !b.archivedAt).length < 2} onClick={() => { setMenu(false); setMoviendo(true) }}>
              <Icon name="briefcase" size={17} /><span><b>{t('bizMoveService')}</b><small>{t('svcMoveHint')}</small></span>
            </button>
            <button type="button" onClick={() => {
              archiveService(service.id, !service.archivedAt)
              toast(t(service.archivedAt ? 'svcUnarchived' : 'svcArchivedToast'), { icon: 'check', type: 'ok' })
              setMenu(false)
            }}>
              <Icon name="package" size={17} />
              <span><b>{t(service.archivedAt ? 'svcUnarchive' : 'svcArchive')}</b><small>{t('svcArchiveHint')}</small></span>
            </button>
            <div className="mmenu-sep" />
            <button type="button" className="danger" onClick={borrar}>
              <Icon name="trash" size={17} /><span><b>{t('bizDeleteService')}</b></span>
            </button>
          </div>
        </BizSheet>
      )}

      {editando && <ServiceSheet businessId={service.businessId} serviceId={service.id} onClose={() => setEditando(false)} />}
      {pago && <PayConfigSheet serviceId={service.id} onClose={() => setPago(false)} />}
      {uniendo && <MergeServiceSheet serviceId={service.id} suggested={parecidos[0]?.id} onClose={() => setUniendo(false)} />}
      {moviendo && <MoveServiceSheet serviceId={service.id} onClose={() => setMoviendo(false)} />}
      {nuevoCliente && (
        <ClientSheet clientId={null} defaults={{ businessId: service.businessId, serviceId: service.id }} onClose={() => setNuevoCliente(false)} />
      )}
    </BizSheet>
  )
}

/**
 * S3 · UNIR SERVICIOS, viendo antes cómo queda.
 *
 * Se elige el otro; el que se abrió es el que queda, y el otro pasa a ser una
 * cuenta más suya. Con deshacer: unir es de las pocas cosas que tocan a la vez
 * clientes, cuentas y pagos del libro.
 */
function MergeServiceSheet({ serviceId, suggested, onClose }: { serviceId: string; suggested?: string; onClose: () => void }) {
  const t = useT()
  const { services, businesses, clients } = useBusiness()
  const [otro, setOtro] = useState(suggested ?? '')
  const service = services.find(s => s.id === serviceId)
  if (!service) return null
  const candidatos = services.filter(s => s.id !== serviceId)
  const elegido = candidatos.find(s => s.id === otro)
  const suyos = (id: string) => clients.filter(c => !c.deletedAt && (c.serviceId === id || c.serviceShares?.some(x => x.serviceId === id))).length

  const unir = () => {
    if (!elegido) return
    const undo = mergeServices(service.id, elegido.id)
    if (!undo) return
    playSoftHaptic()
    toast(t('svcMergedToast').replace('{name}', elegido.name).replace('{into}', service.name), {
      icon: 'check',
      type: 'ok',
      duration: 7000,
      action: { label: t('undo'), onClick: () => unmergeServices(undo) },
    })
    onClose()
  }

  return (
    <BizSheet title={t('svcMergeTitle')} onClose={onClose} onSave={unir} canSave={!!elegido} saveLabel={t('svcMergeGo')}>
      <p className="mbizs-calc">{t('svcMergePick').replace('{name}', service.name)}</p>
      {candidatos.map(s => {
        const biz = businesses.find(b => b.id === s.businessId)
        return (
          <button key={s.id} type="button" className={`mmerge-pick${otro === s.id ? ' on' : ''}`} onClick={() => setOtro(s.id)}>
            <BrandTile name={s.name} size={26} color={biz?.color} icon={biz?.icon} />
            <span>
              <b>{s.name}</b>
              <small>{t(suyos(s.id) === 1 ? 'svcMergeCountOne' : 'svcMergeCount').replace('{n}', String(suyos(s.id)))}{biz ? ` · ${biz.name}` : ''}</small>
            </span>
            {otro === s.id && <Icon name="check" size={16} />}
          </button>
        )
      })}
      {elegido && (
        <div className="msvs-preview">
          <b>{t('svcMergeResult').replace('{name}', service.name)}</b>
          <small>
            {t('svcMergeResultLine')
              .replace('{accounts}', String(serviceAccounts(service).length + serviceAccounts(elegido).length))
              .replace('{clients}', String(suyos(service.id) + suyos(elegido.id)))}
          </small>
          <small>{t('svcMergeWhat').replace('{name}', elegido.name)}</small>
        </div>
      )}
    </BizSheet>
  )
}

/**
 * S4 · MOVER UN SERVICIO CON TODO LO SUYO.
 *
 * Con G1, el dinero va con él: sus pagos están marcados con el servicio y sus
 * cobros con sus clientes. Lo único que se queda es lo viejo sin marca, que se
 * cuenta por categoría; se dice, y se ofrece marcarlo en Pagos.
 */
function MoveServiceSheet({ serviceId, onClose }: { serviceId: string; onClose: () => void }) {
  const t = useT()
  const { services, businesses, clients, charges, moveService } = useBusiness()
  const transactions = useFinance(s => s.transactions)
  const [destino, setDestino] = useState('')
  const service = services.find(s => s.id === serviceId)
  if (!service) return null
  const otros = businesses.filter(b => b.id !== service.businessId && !b.archivedAt)
  const suyos = clients.filter(c => c.serviceId === service.id || c.serviceShares?.some(x => x.serviceId === service.id))
  const ids = new Set(suyos.map(c => c.id))
  const cobros = charges.filter(ch => ids.has(ch.clientId)).length
  const pagos = servicePayments(service, transactions).length
  const viejos = unmarkedPayments(service, businesses.find(b => b.id === service.businessId), transactions, services).length

  const mover = () => {
    const b = businesses.find(x => x.id === destino)
    if (!b) return
    moveService(service.id, b.id)
    playSoftHaptic()
    toast(t('bizMoveDone').replace('{name}', service.name).replace('{business}', b.name), { icon: 'check', type: 'ok' })
    onClose()
  }

  return (
    <BizSheet title={t('svcMoveTitle').replace('{name}', service.name)} onClose={onClose} onSave={mover} canSave={!!destino} saveLabel={t('bizMoveService')}>
      {otros.map(b => (
        <button key={b.id} type="button" className={`mmerge-pick${destino === b.id ? ' on' : ''}`} onClick={() => setDestino(b.id)}>
          <span className="mcreate-ico" style={{ background: `color-mix(in oklab, ${b.color} 20%, transparent)`, color: b.color }}>
            <Icon name={b.icon} size={16} />
          </span>
          <span>
            <b>{b.name}</b>
            <small>{t('svcMoveHasN').replace('{n}', String(services.filter(s => s.businessId === b.id).length))}</small>
          </span>
          {destino === b.id && <Icon name="check" size={16} />}
        </button>
      ))}
      <div className="msvs-preview">
        <b>{t('svcMoveTakes').replace('{clients}', String(suyos.length)).replace('{pays}', String(pagos)).replace('{charges}', String(cobros))}</b>
        <small>{t('svcMoveMoney')}</small>
        {viejos > 0 && <small className="warn">{t('svcMoveOld').replace('{n}', String(viejos))}</small>}
      </div>
    </BizSheet>
  )
}
