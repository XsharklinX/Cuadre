import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { perMonth } from '@/data/billing'
import { chargeState, clientPerMonth } from '@/data/clients'
import { duePayments } from '@/data/autopay'
import { visibleClients } from '@/data/clientList'
import { findDuplicates } from '@/data/duplicateClients'
import { localToday } from '@/data/helpers'
import { useT, type LangKey } from '@/i18n'
import { playIncomeSound, playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useCreateRequest } from '@/store/createRequest'
import type { ViewProps } from '@/types'
import { ClientSheet } from './business/ClientSheet'
import { ClientCard } from './business/ClientCard'
import { MergeSheet } from './business/MergeSheet'
import { OrganizeSheet } from './business/OrganizeSheet'
import { CreateMenu } from './business/CreateMenu'
import { BusinessSheet } from './business/BusinessSheet'
import { ServiceSheet } from './business/ServiceSheet'
import { ServiceScreen } from './business/ServiceScreen'
import { CollectSheet } from './business/CollectSheet'
import { NewChargeSheet } from './business/NewChargeSheet'
import { PayServiceSheet } from './business/PayServiceSheet'
import { ClientsTab } from './business/ClientsTab'
import { CollectTab } from './business/CollectTab'
import { ProfitTab } from './business/ProfitTab'
import { TodayTab } from './business/TodayTab'

/**
 * NEGOCIO: CLIENTES, COBROS Y GANANCIA.
 *
 * ── E1 · TRES PESTAÑAS, UNA PREGUNTA CADA UNA ─────────────────────────
 * Cobros era tres pantallas en una: lo que te deben, el historial y la lista
 * de clientes, una debajo de otra, y para encontrar a alguien había que pasar
 * por encima de todo lo demás.
 *
 *  · CLIENTES — la gente: quién es, qué te compra, cómo va.
 *  · COBROS   — lo que toca hoy: atrasados, esta semana y lo cobrado.
 *  · GANANCIA — lo que te deja cada negocio y cada servicio.
 *
 * ── CUÁL SE ABRE ──────────────────────────────────────────────────────
 * La que tiene algo que hacer: Cobros si hay algo atrasado, de hoy o un pago
 * que pregunta. Si no, la última que miraste. Abrir siempre en la misma
 * obligaba a un toque cada mañana para llegar a donde estaba lo urgente.
 *
 * ── LA FRONTERA QUE NO SE CRUZA ───────────────────────────────────────
 * Nada de esto es dinero del balance. El libro solo se toca en las puertas de
 * siempre —cobrar, pagar un servicio— y en las automáticas, que usan esas
 * mismas puertas (ver `lib/businessOps.ts`).
 */

type Tab = 'today' | 'clients' | 'collect' | 'profit'

export function MobileBusiness(_: ViewProps) {
  const t = useT()
  const { clients, services, charges, syncCharges } = useBusiness()
  const today = localToday()

  /*
   * Los cobros que faltan se crean al ABRIR: un temporizador no corre con la
   * app cerrada, que es justo donde pasan los días. Es idempotente.
   */
  useEffect(() => { syncCharges(today) }, [syncCharges, today, clients.length])

  const hayUrgente = useMemo(() => {
    const vivos = new Set(clients.filter(c => !c.deletedAt).map(c => c.id))
    const cobro = charges.some(ch => vivos.has(ch.clientId) && (() => {
      const e = chargeState(ch, today)
      return e === 'late' || e === 'today' || (e === 'partial' && ch.dueDate <= today)
    })())
    return cobro || duePayments(services, today, { modes: ['ask'] }).length > 0
  }, [clients, charges, services, today])

  /*
   * «HOY» ES LA PORTADA. Se abre siempre en Hoy, que ya enseña lo urgente
   * (antes se saltaba a Cobros si había algo). Sin ningún cliente todavía se
   * abre Clientes, que es donde está cómo empezar y el ejemplo.
   */
  const sinClientes = clients.filter(c => !c.deletedAt).length === 0
  const [tab, setTab] = useState<Tab>(() => {
    if (sinClientes) return 'clients'
    if (hayUrgente) return 'today'
    try {
      const v = localStorage.getItem('cuadre-biz-tab')
      return v === 'collect' || v === 'profit' || v === 'clients' || v === 'today' ? v : 'today'
    } catch { return 'today' }
  })
  const cambiarTab = (x: Tab) => {
    setTab(x)
    playSoftHaptic()
    try { localStorage.setItem('cuadre-biz-tab', x) } catch { /* en privado no se recuerda */ }
  }

  const [nuevoCliente, setNuevoCliente] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [clientCardId, setClientCardId] = useState<string | null>(null)
  const [bizSheet, setBizSheet] = useState<'new' | string | null>(null)
  const [nuevoServicio, setNuevoServicio] = useState<string | null>(null)
  const [servicioAbierto, setServicioAbierto] = useState<string | null>(null)
  const [collectId, setCollectId] = useState<string | null>(null)
  const [newCharge, setNewCharge] = useState(false)
  const [payServiceId, setPayServiceId] = useState<string | null>(null)
  const [organizando, setOrganizando] = useState(false)
  const [mergeKey, setMergeKey] = useState<string | null>(null)

  const duplicados = useMemo(() => findDuplicates(visibleClients(clients)), [clients])
  const grupoAUnir = duplicados.find(g => g.key === mergeKey) ?? null

  /*
   * C4 · EL BOTÓN + DE LA BARRA, AQUÍ. Se reacciona al CAMBIO del contador,
   * no a su valor: el primer render no puede abrir un menú que nadie pidió.
   */
  const [crear, setCrear] = useState(false)
  const pedido = useCreateRequest(s => s.businessMenu)
  const pedidoVisto = useRef(pedido)
  useEffect(() => {
    if (pedido === pedidoVisto.current) return
    pedidoVisto.current = pedido
    setCrear(true)
  }, [pedido])

  const urgentes = useMemo(() => {
    const vivos = new Set(clients.filter(c => !c.deletedAt).map(c => c.id))
    return charges.filter(ch => vivos.has(ch.clientId) && chargeState(ch, today) === 'late').length
  }, [clients, charges, today])

  const TABS: Array<{ id: Tab; key: LangKey; badge?: number }> = [
    { id: 'today', key: 'bizTabToday', badge: urgentes },
    { id: 'clients', key: 'bizTabClients' },
    { id: 'collect', key: 'bizTabCollect' },
    { id: 'profit', key: 'bizTabProfit' },
  ]

  return (
    <div className="mbiz-screen">
      <div className="mbiz-tabs mbiz-tabs-4" role="tablist" aria-label={t('bizTitle')}>
        {TABS.map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'on' : ''}
            onClick={() => cambiarTab(item.id)}
          >
            {t(item.key)}
            {item.badge ? <em className="mbiz-tab-badge">{item.badge}</em> : null}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <TodayTab
          onCollect={id => setCollectId(id)}
          onOpenClient={id => { playSoftHaptic(); setClientCardId(id) }}
        />
      )}
      {tab === 'clients' && (
        <ClientsTab
          onOpenClient={id => { playSoftHaptic(); setClientCardId(id) }}
          onNewClient={() => setNuevoCliente(true)}
          onNewCharge={() => setNewCharge(true)}
          onCollect={id => setCollectId(id)}
          onMerge={key => setMergeKey(key)}
        />
      )}
      {tab === 'collect' && (
        <CollectTab
          onCollect={id => setCollectId(id)}
          onPayService={id => setPayServiceId(id)}
          onNewClient={() => setNuevoCliente(true)}
        />
      )}
      {tab === 'profit' && (
        <ProfitTab
          onEditBusiness={id => setBizSheet(id)}
          onOrganize={() => setOrganizando(true)}
          onOpenService={id => { playSoftHaptic(); setServicioAbierto(id) }}
          onNewService={bizId => setNuevoServicio(bizId)}
          onPayService={id => setPayServiceId(id)}
        />
      )}

      {/* Agregar un cliente es un formulario; VER uno es una ficha. */}
      {nuevoCliente && <ClientSheet clientId={null} onClose={() => setNuevoCliente(false)} />}
      {editId && <ClientSheet clientId={editId} onClose={() => setEditId(null)} />}
      {clientCardId && (
        <ClientCard
          clientId={clientCardId}
          onClose={() => setClientCardId(null)}
          onCollect={id => setCollectId(id)}
          onDuplicated={id => { setClientCardId(null); setEditId(id) }}
        />
      )}
      {newCharge && <NewChargeSheet onClose={() => setNewCharge(false)} />}
      {grupoAUnir && <MergeSheet group={grupoAUnir} onClose={() => setMergeKey(null)} />}
      {organizando && <OrganizeSheet onClose={() => setOrganizando(false)} />}
      {crear && (
        <CreateMenu
          onClose={() => setCrear(false)}
          onPick={(opcion, businessId) => {
            setCrear(false)
            if (opcion === 'client') setNuevoCliente(true)
            else if (opcion === 'charge') setNewCharge(true)
            else if (opcion === 'business') setBizSheet('new')
            else if (opcion === 'service' && businessId) setNuevoServicio(businessId)
            else if (opcion === 'movement') useCreateRequest.getState().askAddMovement()
          }}
        />
      )}
      {bizSheet && <BusinessSheet businessId={bizSheet === 'new' ? null : bizSheet} onClose={() => setBizSheet(null)} />}
      {nuevoServicio && (
        <ServiceSheet
          businessId={nuevoServicio}
          serviceId={null}
          onClose={() => setNuevoServicio(null)}
          // Recién creado, se abre su pantalla: lo siguiente es meterle
          // clientes o decir cómo se paga.
          onCreated={id => { setNuevoServicio(null); setServicioAbierto(id) }}
        />
      )}
      {servicioAbierto && (
        <ServiceScreen
          serviceId={servicioAbierto}
          onClose={() => setServicioAbierto(null)}
          onPay={id => setPayServiceId(id)}
          onOpenClient={id => setClientCardId(id)}
        />
      )}
      {payServiceId && <PayServiceSheet serviceId={payServiceId} onClose={() => setPayServiceId(null)} />}
      {collectId && (
        <CollectSheet
          chargeId={collectId}
          onClose={() => setCollectId(null)}
          onCollected={() => { playIncomeSound(); toast(t('bizCollectedToast'), { icon: 'check', type: 'ok' }) }}
        />
      )}
    </div>
  )
}

/** Reexportado para las hojas: el equivalente mensual de un cliente. */
export { clientPerMonth, perMonth }
