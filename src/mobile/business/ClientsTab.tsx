import { useMemo, useRef, useState } from 'react'
import { punctuality } from '@/data/bizToday'
import { ExampleSheet } from './TodayTab'
import { BrandTile } from '@/components/ui/BrandTile'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY } from '@/data/billing'
import { priceSpread, type Service } from '@/data/business'
import { clientServices, clientTotalAmount, dueWithin, nextDueDate, outstanding, type Client } from '@/data/clients'
import {
  filterCounts, matchesFilter, matchesQuery, owedByClient, reminderMessage, sortClients, visibleClients,
  type ClientFilter, type ClientSort,
} from '@/data/clientList'
import { exportChargesExcel, exportChargesPdf } from '@/data/businessExport'
import { findDuplicates } from '@/data/duplicateClients'
import { applyDiscount, referralDiscount, referralRules } from '@/data/referrals'
import { slotEconomics } from '@/data/serviceEconomics'
import { averageDelay } from '@/data/receivables'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { useSwipeAction } from '@/hooks/useSwipeAction'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { avatarInitials, avatarStyle } from './avatar'
import { BizSheet, Field } from './shared'
import { DeleteClientSheet } from './DeleteClientSheet'

/**
 * E1 · E2 · L2 · L3 · LA PESTAÑA DE CLIENTES.
 *
 * Antes vivían debajo de los cobros, en la misma pantalla que lo atrasado y el
 * historial: para encontrar a alguien había que pasar por encima de todo lo
 * demás. Aquí está la gente, con lo que hace falta para encontrarla:
 *
 *  · Buscar por nombre, teléfono o concepto.
 *  · Filtros con su número —«Deben 2»—, que sin tocarlos ya dicen si hay algo.
 *  · Orden por servicio (con sus plazas), por nombre, por lo que deben o por
 *    lo que pagan. Se recuerda.
 *  · Deslizar: a la derecha cobra lo más viejo que deba; a la izquierda copia
 *    el recordatorio listo para WhatsApp.
 *  · Mantener pulsado: elegir varios y cambiarles el precio, el servicio,
 *    pausarlos o borrarlos de una vez. Cuando Netflix sube, doce fichas
 *    pasan a ser doce toques y un número.
 */
export function ClientsTab({ onOpenClient, onNewClient, onNewCharge, onCollect, onMerge }: {
  onOpenClient: (id: string) => void
  onNewClient: () => void
  onNewCharge: () => void
  onCollect: (chargeId: string) => void
  onMerge: (key: string) => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const reminderTpl = useSettings(s => s.bizReminderTemplate)
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const currency = useFinance(s => s.currency)
  const { clients: todos, services, businesses, charges } = useBusiness()
  const today = localToday()

  const clients = useMemo(() => visibleClients(todos), [todos])
  const owed = useMemo(() => owedByClient(charges, today), [charges, today])
  // N6 · Retraso medio de cada cliente, para ordenar por puntualidad.
  const delay = useMemo(() => {
    const porCliente = new Map<string, typeof charges>()
    for (const ch of charges) porCliente.set(ch.clientId, [...(porCliente.get(ch.clientId) ?? []), ch])
    const m = new Map<string, number>()
    for (const [id, lista] of porCliente) { const p = punctuality(lista); if (p) m.set(id, p.avgDays) }
    return m
  }, [charges])
  const [ejemplo, setEjemplo] = useState(false)
  const counts = useMemo(() => filterCounts(clients, owed), [clients, owed])
  const negocio = useMemo(() => new Map(businesses.map(b => [b.id, b])), [businesses])

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ClientFilter>('all')
  const [sort, setSort] = useState<ClientSort>(() => {
    try {
      const v = localStorage.getItem('cuadre-clients-sort')
      return v === 'az' || v === 'owe' || v === 'pays' || v === 'service' || v === 'late' ? v : 'service'
    } catch { return 'service' }
  })
  const cambiarOrden = (s: ClientSort) => {
    setSort(s)
    playSoftHaptic()
    try { localStorage.setItem('cuadre-clients-sort', s) } catch { /* en privado no se recuerda */ }
  }
  const [menu, setMenu] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [plantillas, setPlantillas] = useState(false)

  /* L2 · La selección. `null` = no se está eligiendo. */
  const [elegidos, setElegidos] = useState<Set<string> | null>(null)
  const [accion, setAccion] = useState<'price' | 'service' | 'delete' | null>(null)
  const alternarElegido = (id: string) => setElegidos(prev => {
    const n = new Set(prev ?? [])
    if (n.has(id)) n.delete(id); else n.add(id)
    return n.size ? n : null
  })

  /* Duplicados: no fusiona nada solo, sugiere y decide el usuario. */
  const [dupIgnored, setDupIgnored] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cuadre-dup-ignored') ?? '[]') }
    catch { return [] }
  })
  const duplicados = useMemo(
    () => findDuplicates(clients).filter(g => !dupIgnored.includes(g.key)),
    [clients, dupIgnored],
  )
  const descartarDup = (key: string) => {
    const siguiente = [...dupIgnored, key]
    setDupIgnored(siguiente)
    try { localStorage.setItem('cuadre-dup-ignored', JSON.stringify(siguiente.slice(-40))) }
    catch { /* en privado no se recuerda */ }
  }
  const spread = useMemo(() => priceSpread(clients), [clients])

  const lista = useMemo(
    () => sortClients(clients.filter(c => matchesQuery(c, query) && matchesFilter(c, filter, owed)), sort, owed, delay),
    [clients, query, filter, owed, sort, delay],
  )

  /** Por servicio, con los sueltos al final; un cliente con dos sale en los dos. */
  const grupos = useMemo(() => {
    if (sort !== 'service') return null
    const porId = new Map<string, Client[]>()
    const sueltos: Client[] = []
    for (const c of lista) {
      const suyos = clientServices(c)
      if (!suyos.length) { sueltos.push(c); continue }
      for (const { serviceId } of suyos) porId.set(serviceId, [...(porId.get(serviceId) ?? []), c])
    }
    const fuera: Array<{ svc?: Service; items: Client[] }> = services
      .filter(s => porId.has(s.id))
      .map(s => ({ svc: s, items: porId.get(s.id)! }))
    if (sueltos.length) fuera.push({ items: sueltos })
    return fuera
  }, [lista, services, sort])

  const exportar = async (hacer: () => Promise<number>) => {
    setExportando(true)
    try {
      const n = await hacer()
      toast(n === 0 ? t('bizNothingToExport') : t('bizExported').replace('{n}', String(n)), { icon: n ? 'check' : 'info', type: n ? 'ok' : undefined })
    } finally { setExportando(false); setMenu(false) }
  }

  /** L3 · El recordatorio de un cliente, copiado. */
  const recordar = (c: Client) => {
    const debe = owed.get(c.id) ?? 0
    const svc = services.find(s => s.id === clientServices(c)[0]?.serviceId)
    const texto = reminderMessage(reminderTpl || t('cliReminderTpl'), {
      name: c.name,
      amount: fmt(debe > 0 ? debe : clientTotalAmount(c), c.currency ?? currency, { decimals: moneyDecimals }),
      service: svc?.name ?? c.concept ?? '',
      months: Math.max(1, charges.filter(ch => ch.clientId === c.id && !ch.waived && outstanding(ch) > 0 && ch.dueDate <= today).length),
    })
    void navigator.clipboard?.writeText(texto)
      .then(() => toast(t('cliReminderCopied'), { icon: 'check', type: 'ok' }))
      .catch(() => toast(texto, { icon: 'info', duration: 9000 }))
  }

  /** L3 · A la derecha: cobrar lo más viejo que deba. */
  const cobrarViejo = (c: Client) => {
    const viejo = charges
      .filter(ch => ch.clientId === c.id && !ch.waived && outstanding(ch) > 0)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
    if (viejo) onCollect(viejo.id)
    else toast(t('cliNothingOwed').replace('{name}', c.name.split(/\s+/)[0]), { icon: 'info' })
  }

  const fila = (client: Client) => {
    const cur = client.currency ?? currency
    const debe = owed.get(client.id) ?? 0
    const precio = clientTotalAmount(client)
    const desc = referralDiscount(client, referralRules(client.businessId ? negocio.get(client.businessId) : null))
    const proximo = nextDueDate(client, today)
    const retraso = averageDelay(charges.filter(ch => ch.clientId === client.id))
    const estado: 'late' | 'soon' | 'ok' | 'off' = !client.active ? 'off'
      : debe > 0 ? 'late'
        : proximo && dueWithin({ id: '', clientId: '', dueDate: proximo, amount: 0, paid: 0, txIds: [], paidAt: 0 }, today, 7) ? 'soon'
          : 'ok'
    const nota = estado === 'off' ? t('bizPaused')
      : estado === 'late' ? t('bizOwesN').replace('{n}', String(charges.filter(c => c.clientId === client.id && !c.waived && outstanding(c) > 0 && c.dueDate <= today).length))
        : estado === 'soon' && proximo ? t('bizDueOnShort').replace('{date}', new Date(`${proximo}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))
          : t('bizUpToDate')
    const svc = services.find(s => s.id === clientServices(client)[0]?.serviceId)
    return (
      <ClientRow
        key={`${client.id}`}
        client={client}
        estado={estado}
        selected={elegidos?.has(client.id) ?? false}
        selecting={!!elegidos}
        onTap={() => (elegidos ? alternarElegido(client.id) : onOpenClient(client.id))}
        onLong={() => { playSoftHaptic(); alternarElegido(client.id) }}
        onRight={() => cobrarViejo(client)}
        onLeft={() => recordar(client)}
        labels={{ pay: t('bizSwipePaid'), remind: t('cliRemind') }}
      >
        <span className="mbiz-client-id">
          <b>
            {client.name}
            {(client.stars?.length ?? 0) > 0 && <em className="mbiz-star">★{client.stars!.length}</em>}
          </b>
          <small>
            {sort !== 'service' && svc ? `${svc.name} · ` : ''}
            {nota}
            {retraso !== null && retraso >= 1 && ` · ${t('bizAvgDelay').replace('{n}', String(retraso))}`}
          </small>
        </span>
        <span className="mbiz-client-next">
          {debe > 0 ? (
            <>
              <b className="expense">{fmt(debe, cur, { decimals: moneyDecimals })}</b>
              <em>{t('bizOwesLabel')}</em>
            </>
          ) : (
            <>
              <b>{fmt(applyDiscount(precio, desc), cur, { decimals: moneyDecimals })}</b>
              <em>{desc > 0 ? `−${desc}% · ` : ''}{t(CYCLE_KEY[client.cycle] as LangKey)}</em>
            </>
          )}
        </span>
      </ClientRow>
    )
  }

  if (clients.length === 0) {
    return (
      <div className="mbiz-empty">
        <EmptyArt kind="clients" />
        <strong>{t('bizNoClientsTitle')}</strong>
        <p>{t('bizNoClientsText')}</p>
        <button onClick={onNewClient}>{t('bizAddClient')}</button>
        {/* N8 · Ver cómo se ve antes de escribir nada. */}
        <button className="mbiz-example-btn" onClick={() => setEjemplo(true)}>{t('bizExampleOpen')}</button>
        {ejemplo && <ExampleSheet onClose={() => setEjemplo(false)} />}
        <ol className="mbiz-guide">
          <li>{t('bizGuideStep1')}</li>
          <li>{t('bizGuideStep2')}</li>
          <li>{t('bizGuideStep3')}</li>
          <li>{t('bizGuideStep4')}</li>
        </ol>
      </div>
    )
  }

  const FILTROS: Array<{ id: ClientFilter; key: LangKey; n: number }> = [
    { id: 'all', key: 'cliFilterAll', n: counts.all },
    { id: 'owe', key: 'cliFilterOwe', n: counts.owe },
    { id: 'paused', key: 'cliFilterPaused', n: counts.paused },
    ...(counts.stars ? [{ id: 'stars' as const, key: 'cliFilterStars' as const, n: counts.stars }] : []),
  ]
  const ORDENES: Array<{ id: ClientSort; key: LangKey }> = [
    { id: 'service', key: 'cliSortService' },
    { id: 'az', key: 'cliSortAz' },
    { id: 'owe', key: 'cliSortOwe' },
    { id: 'pays', key: 'cliSortPays' },
    { id: 'late', key: 'cliSortLate' },
  ]
  const ids = elegidos ? [...elegidos] : []
  const todosPausados = ids.length > 0 && ids.every(id => !clients.find(c => c.id === id)?.active)

  return (
    <>
      <div className="mbiz-section-head">
        <span>{t('bizClients')} · {clients.length}</span>
        <span className="mbiz-head-btns">
          <button className="primary" onClick={onNewClient}>
            <Icon name="plus" size={14} /> {t('bizAddClient')}
          </button>
          <button className="more" aria-label={t('moreOptions')} onClick={() => { setMenu(true); playSoftHaptic() }}>
            <Icon name="dots" size={16} />
          </button>
        </span>
      </div>

      <label className="mcl-search">
        <Icon name="search" size={15} />
        <input
          value={query}
          placeholder={t('cliSearchAll').replace('{n}', String(clients.length))}
          aria-label={t('cliSearchPlaceholder')}
          onChange={e => setQuery(e.target.value)}
        />
        {query && <button type="button" aria-label={t('close')} onClick={() => setQuery('')}><Icon name="close" size={14} /></button>}
      </label>

      <div className="mcl-filters" role="group">
        {FILTROS.map(f => (
          <button key={f.id} type="button" className={filter === f.id ? 'on' : ''} aria-pressed={filter === f.id} onClick={() => { setFilter(f.id); playSoftHaptic() }}>
            {t(f.key)} <b>{f.n}</b>
          </button>
        ))}
      </div>

      <div className="mcl-sort" role="radiogroup" aria-label={t('cliSortLabel')}>
        {ORDENES.map(o => (
          <button key={o.id} type="button" role="radio" aria-checked={sort === o.id} className={sort === o.id ? 'on' : ''} onClick={() => cambiarOrden(o.id)}>
            {t(o.key)}
          </button>
        ))}
      </div>

      {/* Dos fichas de la misma persona: se sugiere, decide el usuario. */}
      {!query && filter === 'all' && duplicados.map(g => (
        <div key={g.key} className="mbiz-dup">
          <span className="mbiz-dup-top">
            <Icon name="user" size={14} />
            <b>{g.clients.length === 2 ? t('dupFoundOne') : t('dupFound').replace('{n}', String(g.clients.length))}</b>
          </span>
          <small>{g.clients.map(c => c.name).join(' · ')}</small>
          <span className="mbiz-dup-acts">
            <button onClick={() => onMerge(g.key)}>{t('dupSee')}</button>
            <button className="ghost" onClick={() => descartarDup(g.key)}>{t('dupNot')}</button>
          </span>
        </div>
      ))}

      {lista.length === 0 && <p className="mbizs-calc">{t('cliNoMatch')}</p>}

      {grupos ? grupos.map(g => {
        const econ = g.svc ? slotEconomics(g.svc, clients, currency) : null
        const negocioDe = g.svc ? negocio.get(g.svc.businessId) : undefined
        return (
          <div key={g.svc?.id ?? 'sin'} className="mbiz-group">
            {g.svc ? (
              <div className="mbiz-svc-head">
                <BrandTile name={g.svc.name} size={30} color={negocioDe?.color} icon={negocioDe?.icon} />
                <span>
                  <b>{g.svc.name}</b>
                  <small>
                    {econ?.slots
                      ? t('bizSlotsOf').replace('{used}', String(g.items.length)).replace('{total}', String(econ.slots))
                      : t('bizNClients').replace('{n}', String(g.items.length))}
                  </small>
                </span>
                {econ?.slots ? (
                  <div className="mbiz-svc-bar">
                    <i style={{ width: `${Math.min(100, Math.round(g.items.length / econ.slots * 100))}%` }} />
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mbiz-group-head as-label">
                <span>{t('bizNoServiceGroup')}</span>
                <b>{g.items.length}</b>
              </div>
            )}
            <div className="mbiz-list m-stagger">{g.items.map(fila)}</div>
          </div>
        )
      }) : (
        <div className="mbiz-list m-stagger">{lista.map(fila)}</div>
      )}

      {spread.length > 0 && !query && (
        <div className="mbiz-card info">
          <strong>{t('bizPriceSpreadTitle')}</strong>
          {spread.slice(0, 3).map(s => (
            <p key={s.concept}>
              {s.concept}: {fmt(s.min, currency, { decimals: moneyDecimals })} – {fmt(s.max, currency, { decimals: moneyDecimals })}
              {' '}<small>({t('bizPriceSpreadN').replace('{n}', String(s.clients))})</small>
            </p>
          ))}
        </div>
      )}

      <p className="mcl-tip">{t('cliGesturesTip')}</p>

      {/* ── LA BARRA DE LA SELECCIÓN ─────────────────────────── */}
      {elegidos && (
        <div className="mcl-selbar" role="toolbar" aria-label={t('cliSelectedN').replace('{n}', String(ids.length))}>
          <span className="mcl-selbar-top">
            <button type="button" aria-label={t('close')} onClick={() => setElegidos(null)}><Icon name="close" size={16} /></button>
            <b>{t('cliSelectedN').replace('{n}', String(ids.length))}</b>
            <button type="button" className="link" onClick={() => setElegidos(new Set(lista.map(c => c.id)))}>{t('cliSelectAll')}</button>
          </span>
          <span className="mcl-selbar-acts">
            <button type="button" onClick={() => setAccion('price')}><Icon name="dollar" size={15} />{t('cliBulkPrice')}</button>
            <button type="button" disabled={services.length === 0} onClick={() => setAccion('service')}><Icon name="repeat" size={15} />{t('cliBulkService')}</button>
            <button type="button" onClick={() => {
              useBusiness.getState().updateClients(ids, { active: todosPausados })
              toast(t(todosPausados ? 'cliResumedToast' : 'cliPausedToast'), { icon: 'check', type: 'ok' })
              setElegidos(null)
            }}>
              <Icon name="clock" size={15} />{t(todosPausados ? 'cliResume' : 'cliPause')}
            </button>
            <button type="button" className="danger" onClick={() => setAccion('delete')}><Icon name="trash" size={15} />{t('delete')}</button>
          </span>
        </div>
      )}

      {accion === 'price' && (
        <BulkPriceSheet ids={ids} onClose={() => setAccion(null)} onDone={() => { setAccion(null); setElegidos(null) }} />
      )}
      {accion === 'service' && (
        <BizSheet title={t('cliBulkServiceTitle').replace('{n}', String(ids.length))} onClose={() => setAccion(null)}>
          {services.filter(s => !s.archivedAt).map(svc => {
            const biz = negocio.get(svc.businessId)
            return (
              <button key={svc.id} type="button" className="mmerge-pick" onClick={() => {
                for (const id of ids) useBusiness.getState().moveClientToService(id, svc.id)
                toast(t('cliBulkServiceDone').replace('{n}', String(ids.length)).replace('{service}', svc.name), { icon: 'check', type: 'ok' })
                setAccion(null)
                setElegidos(null)
              }}>
                <BrandTile name={svc.name} size={26} color={biz?.color} icon={biz?.icon} />
                <span><b>{svc.name}</b>{biz && <small>{biz.name}</small>}</span>
              </button>
            )
          })}
        </BizSheet>
      )}
      {accion === 'delete' && (
        <DeleteClientSheet clientIds={ids} onClose={() => setAccion(null)} onDone={() => setElegidos(null)} />
      )}

      {menu && (
        <BizSheet title={t('bizClients')} onClose={() => setMenu(false)}>
          <div className="mmenu">
            <button type="button" disabled={clients.length === 0} onClick={() => { setMenu(false); onNewCharge() }}>
              <Icon name="receipt" size={17} /><span><b>{t('bizNewCharge')}</b><small>{t('createChargeHint')}</small></span>
            </button>
            <button type="button" onClick={() => { setMenu(false); setPlantillas(true) }}>
              <Icon name="edit" size={17} /><span><b>{t('cliTemplates')}</b><small>{t('cliTemplatesHint')}</small></span>
            </button>
            <div className="mmenu-sep" />
            <button type="button" disabled={exportando} onClick={() => exportar(() => exportChargesExcel(charges, clients))}>
              <Icon name="fileJson" size={17} /><span><b>{t('bizExportExcel')}</b><small>{t('bizExportCharges')}</small></span>
            </button>
            <button type="button" disabled={exportando} onClick={() => exportar(() => exportChargesPdf(charges, clients, currency, lang))}>
              <Icon name="print" size={17} /><span><b>{t('bizExportPdf')}</b><small>{t('bizExportCharges')}</small></span>
            </button>
          </div>
        </BizSheet>
      )}
      {plantillas && <TemplatesSheet onClose={() => setPlantillas(false)} />}
    </>
  )
}

/**
 * Una fila de cliente que se desliza y se mantiene pulsada.
 *
 * Mantener pulsado tiene que cancelarse en cuanto el dedo se mueve: si no,
 * hacer scroll despacio sobre una fila la elegiría.
 */
function ClientRow({ client, estado, selected, selecting, onTap, onLong, onRight, onLeft, labels, children }: {
  client: Client
  estado: string
  selected: boolean
  selecting: boolean
  onTap: () => void
  onLong: () => void
  onRight: () => void
  onLeft: () => void
  labels: { pay: string; remind: string }
  children: React.ReactNode
}) {
  const ref = useSwipeAction<HTMLDivElement>(onRight, !selecting, onLeft)
  const reloj = useRef<number | null>(null)
  const largo = useRef(false)
  const inicio = useRef({ x: 0, y: 0 })
  const cancelar = () => { if (reloj.current) { window.clearTimeout(reloj.current); reloj.current = null } }

  return (
    <div className="mbiz-swipe">
      <div
        ref={ref}
        className="mbiz-swipe-row"
        onPointerDown={e => {
          largo.current = false
          inicio.current = { x: e.clientX, y: e.clientY }
          cancelar()
          reloj.current = window.setTimeout(() => { largo.current = true; onLong() }, 480)
        }}
        onPointerMove={e => {
          if (Math.abs(e.clientX - inicio.current.x) > 8 || Math.abs(e.clientY - inicio.current.y) > 8) cancelar()
        }}
        onPointerUp={cancelar}
        onPointerCancel={cancelar}
        onContextMenu={e => e.preventDefault()}
      >
        <button
          type="button"
          className={`mbiz-client st-${estado}${client.active ? '' : ' off'}${selected ? ' sel' : ''}`}
          aria-pressed={selecting ? selected : undefined}
          onClick={() => { if (largo.current) { largo.current = false; return } onTap() }}
        >
          <i className="mbiz-dot" aria-hidden="true" />
          <span className="mbiz-ava" style={selected ? undefined : avatarStyle(client.id)}>
            {selected ? <Icon name="check" size={14} /> : avatarInitials(client.name)}
          </span>
          {children}
        </button>
      </div>
      {!selecting && (
        <>
          <span className="mbiz-swipe-bg pay" aria-hidden="true"><Icon name="check" size={15} />{labels.pay}</span>
          <span className="mbiz-swipe-bg remind" aria-hidden="true">{labels.remind}<Icon name="bell" size={15} /></span>
        </>
      )}
    </div>
  )
}

/** L2 · El mismo precio a varios: cuando el servicio sube, todos a la vez. */
function BulkPriceSheet({ ids, onClose, onDone }: { ids: string[]; onClose: () => void; onDone: () => void }) {
  const t = useT()
  const [amount, setAmount] = useState('')
  const monto = Number(amount) || 0
  return (
    <BizSheet
      title={t('cliBulkPriceTitle').replace('{n}', String(ids.length))}
      onClose={onClose}
      canSave={monto > 0}
      saveLabel={t('save')}
      onSave={() => {
        useBusiness.getState().updateClients(ids, { amount: monto })
        playSoftHaptic()
        toast(t('cliBulkPriceDone').replace('{n}', String(ids.length)), { icon: 'check', type: 'ok' })
        onDone()
      }}
    >
      <Field label={t('amount')} hint={t('cliBulkPriceHint')}>
        <input className="mbizs-input" type="number" inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} />
      </Field>
    </BizSheet>
  )
}

/** L3 · Las plantillas del recordatorio y de las gracias. */
function TemplatesSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { bizReminderTemplate, bizThanksTemplate, setBizTemplates } = useSettings()
  const [rem, setRem] = useState(bizReminderTemplate || t('cliReminderTpl'))
  const [thx, setThx] = useState(bizThanksTemplate || t('cliThanksTpl'))
  return (
    <BizSheet
      title={t('cliTemplates')}
      onClose={onClose}
      onSave={() => {
        // Igual a la de la app = vacía: así, si cambia el idioma, cambia con él.
        setBizTemplates({
          bizReminderTemplate: rem.trim() === t('cliReminderTpl') ? '' : rem.trim(),
          bizThanksTemplate: thx.trim() === t('cliThanksTpl') ? '' : thx.trim(),
        })
        onClose()
      }}
    >
      <Field label={t('cliTplReminder')} hint={t('cliTplReminderHint')}>
        <textarea className="mbizs-input mbizs-textarea" rows={3} value={rem} onChange={e => setRem(e.target.value)} />
      </Field>
      <Field label={t('cliTplThanks')} hint={t('cliTplThanksHint')}>
        <textarea className="mbizs-input mbizs-textarea" rows={3} value={thx} onChange={e => setThx(e.target.value)} />
      </Field>
    </BizSheet>
  )
}
