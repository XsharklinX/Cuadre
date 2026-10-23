import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { BrandTile } from '@/components/ui/BrandTile'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY, perMonth, prepaySaving } from '@/data/billing'
import { businessMonth, businessRunRate, businessYear, priceSpread, runRateSeries, serviceCostPerMonth, serviceMargin } from '@/data/business'
import { businessInvestment } from '@/data/investment'
import { chargeState, clientPerMonth, daysLate, nextDueDate, outstanding, type Charge } from '@/data/clients'
import { collectFocus, groupCharges, marginPct, type ChargeGroup } from '@/data/collectFocus'
import { exportChargesExcel, exportChargesPdf } from '@/data/businessExport'
import { findDuplicates } from '@/data/duplicateClients'
import { clientServices, clientTotalAmount, type Client } from '@/data/clients'
import { exportElementPng } from '@/data/imageExport'
import { convertTxAmountsToBase, currentMonthKey, dateLocale, fmt, localToday, monthLabel, shortMonth } from '@/data/helpers'
import { averageDelay, receivablesSummary } from '@/data/receivables'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playIncomeSound, playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { CurrencyCode, ViewProps } from '@/types'
import { ClientSheet } from './business/ClientSheet'
import { ClientCard } from './business/ClientCard'
import { MergeSheet } from './business/MergeSheet'
import { OrganizeSheet } from './business/OrganizeSheet'
import { SwipeCharge } from './business/SwipeCharge'
import { BusinessSheet } from './business/BusinessSheet'
import { ServiceSheet } from './business/ServiceSheet'
import { CollectSheet } from './business/CollectSheet'
import { NewChargeSheet } from './business/NewChargeSheet'
import { PayServiceSheet } from './business/PayServiceSheet'

/**
 * NEGOCIO: COBROS Y GANANCIA.
 *
 * Dos apartados en una pantalla en vez de dos pantallas: los dos contestan
 * preguntas del mismo momento («¿quién me debe?», «¿esto me deja algo?») y
 * repartirlos obligaría a pasear por el menú para juntarlos.
 *
 * ── LA FRONTERA QUE NO SE CRUZA ───────────────────────────────────────
 * Nada de lo que se ve aquí es dinero del balance. Un cobro esperado es una
 * expectativa con fecha; la ganancia es una resta sobre movimientos que ya
 * existen. El único sitio donde esto toca el libro es `CollectSheet`, que crea
 * un movimiento de verdad con `addTx`.
 *
 * ── POR QUÉ ABRE CON UNA SOLA CIFRA ───────────────────────────────────
 * Abría con tres cifras del mismo peso —atrasado, esta semana, cobrado— y
 * debajo una lista con todo mezclado. Había que leer las tres y decidir cuál
 * importaba, todas las mañanas. Una pantalla de cobros es una lista de tareas
 * disfrazada de informe: lo único que se viene a preguntar al abrirla es «¿a
 * quién le escribo?», y eso tiene una respuesta, no tres números.
 */

type Tab = 'collect' | 'profit'

export function MobileBusiness(_: ViewProps) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { transactions, accounts, currency } = useFinance()
  const { clients, businesses, services, charges, syncCharges } = useBusiness()
  const [tab, setTab] = useState<Tab>('collect')

  const [clientSheet, setClientSheet] = useState<'new' | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [clientCardId, setClientCardId] = useState<string | null>(null)
  const [bizSheet, setBizSheet] = useState<'new' | string | null>(null)
  const [svcSheet, setSvcSheet] = useState<{ businessId: string; id: 'new' | string } | null>(null)
  const [collectId, setCollectId] = useState<string | null>(null)
  const [newCharge, setNewCharge] = useState(false)
  const [payServiceId, setPayServiceId] = useState<string | null>(null)
  const [openBizId, setOpenBizId] = useState<string | null>(null)
  const [organizando, setOrganizando] = useState(false)
  // Generar un papel tarda lo suficiente como para que, sin esto, el usuario
  // pulse dos veces y reciba dos archivos.
  const [exportando, setExportando] = useState(false)
  /*
   * El resumen del mes se captura de un NODO REAL, no de un lienzo aparte.
   *
   * `exportElementPng` fotografía un elemento del DOM, así que lo que se
   * comparte es exactamente lo que el usuario ve —con su tema y sus cifras—
   * en vez de una segunda maquetación que acabaría diciendo otra cosa.
   */
  const resumenRef = useRef<HTMLDivElement>(null)

  const exportar = async (hacer: () => Promise<number>) => {
    setExportando(true)
    try {
      const n = await hacer()
      if (n === 0) toast(t('bizNothingToExport'), { icon: 'info' })
      else toast(t('bizExported').replace('{n}', String(n)), { icon: 'check', type: 'ok' })
    } finally { setExportando(false) }
  }

  const today = localToday()
  const mkey = currentMonthKey()

  /*
   * Los cobros que faltan se crean al ABRIR, no con un temporizador: un
   * temporizador no corre con la app cerrada, que es justo donde pasan los
   * días. `syncCharges` es idempotente, así que entrar diez veces no duplica
   * nada (ver `pendingCharges`).
   */
  useEffect(() => { syncCharges(today) }, [syncCharges, today, clients.length])

  const baseTx = useMemo(
    () => convertTxAmountsToBase(transactions, accounts, currency),
    [transactions, accounts, currency],
  )

  const summary = useMemo(() => receivablesSummary(charges, today), [charges, today])
  const focus = useMemo(() => collectFocus(charges, clients, today), [charges, clients, today])
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients])
  /*
   * Solo los cobros con cliente vivo.
   *
   * Un cobro cuyo cliente se borró no se puede pintar —no hay nombre que
   * poner—, así que si entrara en el grupo la cabecera diría «3» encima de dos
   * filas. Un recuento que no cuadra con lo que se ve hace dudar de toda la
   * pantalla; esos huérfanos los reporta y los arregla «Salud de datos».
   */
  const grupos = useMemo(
    () => groupCharges(charges.filter(c => clientMap.has(c.clientId)), today),
    [charges, clientMap, today],
  )
  const spread = useMemo(() => priceSpread(clients), [clients])

  /*
   * DOS FICHAS, UNA PERSONA.
   *
   * Hasta la 2.1.0 un cliente solo podía tener UN servicio, así que quien te
   * compraba Netflix y Crunchyroll está apuntado dos veces, con su historial
   * partido entre dos fichas que no se hablan.
   *
   * Los descartados se recuerdan en el dispositivo: decir «no son la misma» y
   * que el aviso vuelva mañana es peor que no avisar.
   */
  const [dupIgnored, setDupIgnored] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cuadre-dup-ignored') ?? '[]') }
    catch { return [] }
  })
  const duplicados = useMemo(
    () => findDuplicates(clients).filter(g => !dupIgnored.includes(g.key)),
    [clients, dupIgnored],
  )
  const [mergeKey, setMergeKey] = useState<string | null>(null)
  const grupoAUnir = duplicados.find(g => g.key === mergeKey) ?? null

  const descartarDup = (key: string) => {
    const siguiente = [...dupIgnored, key]
    setDupIgnored(siguiente)
    try { localStorage.setItem('cuadre-dup-ignored', JSON.stringify(siguiente.slice(-40))) }
    catch { /* en privado no se recuerda, y no pasa nada */ }
  }

  /*
   * AGRUPAR POR SERVICIO.
   *
   * Con treinta clientes repartidos en cuatro servicios, una lista plana
   * ordenada por nada obliga a leerla entera para contestar «¿quién está en
   * esta cuenta de Netflix?», que es la pregunta de todos los días de quien
   * revende.
   *
   * Es una preferencia de la vista, no de los datos: se recuerda en el
   * dispositivo y no viaja en las copias.
   */
  const [porServicio, setPorServicio] = useState(() => {
    try { return localStorage.getItem('cuadre-clients-by-service') === '1' }
    catch { return false }
  })
  const alternarAgrupar = () => {
    const siguiente = !porServicio
    playSoftHaptic()
    setPorServicio(siguiente)
    try { localStorage.setItem('cuadre-clients-by-service', siguiente ? '1' : '0') }
    catch { /* en privado no se recuerda, y no pasa nada */ }
  }

  /** Los clientes repartidos por servicio, con los sueltos al final. */
  const gruposDeClientes = useMemo(() => {
    const porId = new Map<string, typeof clients>()
    const sueltos: typeof clients = []
    for (const client of clients) {
      const suyos = clientServices(client)
      if (!suyos.length) { sueltos.push(client); continue }
      // Un cliente con dos servicios sale en los dos: está en las dos cuentas,
      // y enseñarlo en una sola haría que la otra pareciera tener una plaza
      // libre que no tiene.
      for (const { serviceId } of suyos) {
        if (!porId.has(serviceId)) porId.set(serviceId, [])
        porId.get(serviceId)!.push(client)
      }
    }
    const fuera = services
      .filter(svc => porId.has(svc.id))
      .map(svc => ({ id: svc.id, name: svc.name, items: porId.get(svc.id)! }))
    if (sueltos.length) fuera.push({ id: '', name: t('bizNoServiceGroup'), items: sueltos })
    return fuera
  }, [clients, services, t])

  /*
   * LAS CUENTAS DE CADA NEGOCIO, UNA VEZ.
   *
   * Estaban dentro del `map` del render: el año, la serie de la gráfica, la
   * inversión y el mes se recalculaban enteros en CADA repintado —al plegar un
   * grupo de cobros, al cambiar de pestaña, al abrir una hoja— y cada uno
   * recorre el libro. Nada de esto depende de qué tarjeta esté abierta, así
   * que no tenía por qué rehacerse al abrirla.
   */
  const anio = Number(mkey.slice(0, 4))
  /* La ganancia de todos los negocios del mes, para el encabezado. */
  const cuentas = useMemo(() => businesses.filter(b => !b.archivedAt).map(biz => {
    /*
     * Las dos vistas, etiquetadas. La de CAJA es lo que vio el banco;
     * la de AL MES contesta «¿esto me deja algo?», que es la que la
     * caja no contesta cuando los pagos no son mensuales.
     */
    const runRate = businessRunRate(biz, services, baseTx, mkey, currency)
    return {
      biz,
      mes: businessMonth(biz, baseTx, mkey),
      year: businessYear(biz, baseTx, anio),
      runRate,
      /*
       * EL MARGEN: lo que dice si el negocio es BUENO.
       *
       * El monto solo no lo dice: subir de 1,000 a 1,200 de ganancia puede ser
       * porque vendiste más o porque te subieron el coste, y el porcentaje
       * distingue las dos cosas.
       */
      margen: marginPct(runRate.collected, runRate.profit),
      /*
       * LA INVERSION: lo que has puesto, frente a lo que has sacado.
       *
       * Contesta lo que la ganancia mensual no contesta: si el negocio ya se
       * pago solo. Uno puede dejar 400 al mes y llevar dos años sin recuperar
       * lo que costo montarlo.
       */
      inv: businessInvestment(biz, baseTx, mkey, runRate.profit),
      serie: runRateSeries(biz, services, baseTx, anio, currency),
      suyos: services.filter(s => s.businessId === biz.id),
    }
  }), [businesses, services, baseTx, mkey, anio, currency])

  /*
   * QUÉ VIENE ABIERTO.
   *
   * Un acordeón que abre todo cerrado deja la pantalla vacía y obliga a un
   * toque antes de poder ver nada; uno que abre todo abierto es la lista de
   * antes con cabeceras. Lo que hay que hacer hoy se ve; el resto se pide.
   *
   * ── LA EXCEPCIÓN QUE IMPORTA ─────────────────────────────────────────
   * Si no hay nada atrasado ni nada esta semana, «más adelante» se abre
   * también. Plegar sirve para que lo urgente no se pierda entre lo que no lo
   * es; sin nada urgente, plegar solo esconde todo lo que hay. Quien acaba de
   * registrar a su primer cliente —cuyo primer cobro cae el mes que viene—
   * vería una pantalla vacía con una cabecera cerrada.
   *
   * El histórico nunca se abre solo: lo cobrado no es una tarea.
   */
  const porDefecto: Record<ChargeGroup, boolean> = {
    late: true,
    week: true,
    later: grupos.late.length === 0 && grupos.week.length === 0,
    done: false,
  }
  /* Lo que el usuario haya decidido a mano manda sobre el defecto, pero solo
     para los grupos que haya tocado: los demás siguen reaccionando a los
     datos. */
  const [elegidos, setElegidos] = useState<Partial<Record<ChargeGroup, boolean>>>({})
  const abiertos: Record<ChargeGroup, boolean> = {
    late: elegidos.late ?? porDefecto.late,
    week: elegidos.week ?? porDefecto.week,
    later: elegidos.later ?? porDefecto.later,
    done: elegidos.done ?? porDefecto.done,
  }
  const alternar = (g: ChargeGroup) => {
    playSoftHaptic()
    setElegidos(prev => ({ ...prev, [g]: !(prev[g] ?? porDefecto[g]) }))
  }

  const totalProfit = useMemo(
    () => Math.round(cuentas.reduce((sum, c) => sum + c.runRate.profit, 0) * 100) / 100,
    [cuentas],
  )

  const TABS: Array<{ id: Tab; key: LangKey }> = [
    { id: 'collect', key: 'bizTabCollect' },
    { id: 'profit', key: 'bizTabProfit' },
  ]

  const GRUPOS: Array<{ id: ChargeGroup; key: LangKey }> = [
    { id: 'late', key: 'bizGroupLate' },
    { id: 'week', key: 'bizGroupWeek' },
    { id: 'later', key: 'bizGroupLater' },
    { id: 'done', key: 'bizGroupDone' },
  ]

  /** La fila de un cobro, igual en los cuatro grupos. */
  const filaCobro = (charge: Charge) => {
    const client = clientMap.get(charge.clientId)
    if (!client) return null
    const estado = chargeState(charge, today)
    const atraso = daysLate(charge, today)
    const falta = outstanding(charge)
    const cur = client.currency ?? currency
    const cobrable = estado !== 'paid' && estado !== 'waived'
    return (
      /*
        DESLIZAR PARA COBRAR.
        Marcar «me pagó» es la acción de veinte veces al mes y pedía abrir una
        hoja. El gesto abre la hoja con todo listo —no da el cobro por hecho—,
        porque un cobro parcial es normal y esto crea un movimiento real.
      */
      <SwipeCharge key={charge.id} onCollect={() => setCollectId(charge.id)} disabled={!cobrable}>
      <button
        className={`mbiz-charge ${estado}`}
        onClick={() => setCollectId(charge.id)}
      >
        <span className="mbiz-charge-id">
          <b>{client.name}</b>
          <small>
            {client.concept || t(CYCLE_KEY[client.cycle] as LangKey)}
            {' · '}
            {new Date(`${charge.dueDate}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
          </small>
        </span>
        <span className="mbiz-charge-right">
          <b>{fmt(estado === 'paid' ? charge.paid : falta, cur, { decimals: moneyDecimals })}</b>
          {estado === 'late' && <em className="late">{t('bizDaysLate').replace('{n}', String(atraso))}</em>}
          {estado === 'today' && <em className="due">{t('bizDueToday')}</em>}
          {estado === 'partial' && <em className="due">{t('bizPartial')}</em>}
          {estado === 'paid' && <em className="ok">{t('bizPaid')}</em>}
          {estado === 'waived' && <em>{t('bizWaived')}</em>}
        </span>
      </button>
      </SwipeCharge>
    )
  }

  /** La fila de un cliente, igual en la lista plana y en la agrupada. */
  const filaCliente = (client: Client) => {
    const suyos = charges.filter(c => c.clientId === client.id)
    const retraso = averageDelay(suyos)
    const cur = client.currency ?? currency
    const debe = suyos
      .filter(c => !c.waived)
      .reduce((sum, c) => sum + outstanding(c), 0)
    // Lo que se le cobra: la suma de sus servicios cuando tiene varios, que
    // es lo que de verdad se le factura (ver `clientTotalAmount`).
    const precio = clientTotalAmount(client)
    return (
      <button
        key={client.id}
        className={`mbiz-client${client.active ? '' : ' off'}`}
        onClick={() => { playSoftHaptic(); setClientCardId(client.id) }}
        aria-label={`${client.name} — ${t('bizOpenClient')}`}
      >
        <span className="mbiz-ava" style={{ background: `color-mix(in oklab, ${colorFor(client.id)} 22%, transparent)`, color: colorFor(client.id) }}>
          {initials(client.name)}
        </span>
        <span className="mbiz-client-id">
          <b>{client.name}</b>
          <small>
            {fmt(precio, cur, { decimals: moneyDecimals })}
            {' · '}{t(CYCLE_KEY[client.cycle] as LangKey)}
            {/* La puntualidad, dicha en datos y sin juicios: sirve para
                decidir precios, no para acusar a nadie. */}
            {retraso !== null && retraso >= 1 && ` · ${t('bizAvgDelay').replace('{n}', String(retraso))}`}
          </small>
        </span>
        <span className="mbiz-client-next">
          {/* Lo que debe manda sobre la próxima fecha: es lo que hay que
              hacer, no lo que va a pasar. */}
          {debe > 0 ? (
            <b className="expense">{fmt(debe, cur, { decimals: moneyDecimals })}</b>
          ) : nextDueDate(client, today)
            ? new Date(`${nextDueDate(client, today)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
            : '—'}
        </span>
      </button>
    )
  }

  return (
    <div className="mbiz-screen">
      <div className="mbiz-tabs mbiz-tabs-2" role="tablist" aria-label={t('bizTitle')}>
        {TABS.map(item => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'on' : ''}
            onClick={() => { setTab(item.id); playSoftHaptic() }}
          >
            {t(item.key)}
          </button>
        ))}
      </div>

      {/* ═══ COBROS ═══════════════════════════════════════ */}
      {tab === 'collect' && (
        <>
          {clients.length === 0 ? (
            <div className="mbiz-empty">
              <EmptyArt kind="clients" />
              <strong>{t('bizNoClientsTitle')}</strong>
              <p>{t('bizNoClientsText')}</p>
              <button onClick={() => setClientSheet('new')}>{t('bizAddClient')}</button>

              {/*
                LOS CUATRO PASOS, EN LA PANTALLA VACIA.
                Negocio tiene cuatro piezas que dependen unas de otras
                —negocio, servicio, cliente, cobro— y entrando en el orden
                equivocado nada cuadra: un negocio sin categorias da cero
                para siempre y un cliente sin servicio no mide ningun margen.

                Va aqui y no en una hoja aparte porque esta pantalla ya esta
                vacia: un cartel sobre una pantalla llena es un estorbo, sobre
                una vacia es lo unico que hay que leer. Y desaparece sola con
                el primer cliente, sin que nadie tenga que cerrarla.
              */}
              <ol className="mbiz-guide">
                <li>{t('bizGuideStep1')}</li>
                <li>{t('bizGuideStep2')}</li>
                <li>{t('bizGuideStep3')}</li>
                <li>{t('bizGuideStep4')}</li>
              </ol>
            </div>
          ) : (
            <>
              {/* ── HOY: UNA SOLA CIFRA Y A QUIÉN ───────────── */}
              {/*
                TRES MATERIALES, NO UNO.
                El titular, una tarjeta de negocio y la fila de un cliente
                compartian fondo, borde y radio, asi que la pantalla no decia
                que importaba y habia que leerla entera. El titular va ahora
                a sangre —sin caja—, las tarjetas con color propio, y las
                filas planas. Nada cambia de sitio; cambia el peso con el que
                cada cosa pide atencion.
              */}
              <section className={`mbiz-focus bare ${focus.kind}`}>
                <small>
                  {focus.kind === 'late' ? t('bizFocusLate')
                    : focus.kind === 'today' ? t('bizFocusToday')
                      : t('bizFocusCalm')}
                </small>
                <strong>
                  <AnimatedMoney value={focus.amount} decimals={moneyDecimals} fit />
                </strong>

                {focus.kind === 'calm' ? (
                  <p>{focus.amount > 0 ? t('bizFocusCalmNote') : t('bizFocusCalmEmpty')}</p>
                ) : (
                  <p>
                    {/*
                      El titular nombra a quien peor está, porque de un nombre
                      se puede actuar y de «3 personas» no. El recuento va
                      detrás, para saber si eso es todo o hay cola.
                    */}
                    {focus.names.length > 0 && (focus.kind === 'late'
                      ? t('bizFocusWorst')
                        .replace('{name}', focus.names[0])
                        .replace('{n}', String(focus.worstDays))
                      : t('bizFocusWorstToday').replace('{name}', focus.names[0]))}
                    {focus.people > 1 && (focus.names.length > 0 ? ' · ' : '')}
                    {focus.people > 1 && t('bizFocusPeople').replace('{n}', String(focus.people))}
                  </p>
                )}

                {/* Lo que te deben NO suma al balance, y se dice donde se ve. */}
                <em>{t('bizNotMoneyYet')}</em>
              </section>

              {/* Lo cobrado del mes, que en calma ya es el titular: ahí se
                  omite para no decir la misma cifra dos veces seguidas. */}
              {focus.kind !== 'calm' && summary.collectedThisMonth > 0 && (
                <p className="mbiz-note">
                  {t('bizCollected')}: <b className="income">{fmt(summary.collectedThisMonth, currency, { decimals: moneyDecimals })}</b>
                </p>
              )}

              {/* ── LA LISTA, AGRUPADA POR ESTADO ───────────── */}
              {GRUPOS.map(g => {
                const lista = grupos[g.id]
                if (lista.length === 0) return null
                const abierto = abiertos[g.id]
                return (
                  <div key={g.id} className={`mbiz-group${abierto ? ' open' : ''}`}>
                    <button className="mbiz-group-head" onClick={() => alternar(g.id)} aria-expanded={abierto}>
                      <span>{t(g.key)}</span>
                      <b>{lista.length}</b>
                      <Icon name={abierto ? 'arrowUp' : 'arrowDn'} size={14} />
                    </button>
                    {abierto && (
                      <div className="mbiz-list m-stagger">
                        {lista.map(filaCobro)}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* No fusiona nada solo: dos hermanos pueden llamarse igual, y
                  una app que junta dos personas por su cuenta destruye datos
                  sin preguntar. Sugiere, y decide el usuario. */}
              {duplicados.map(g => (
                <div key={g.key} className="mbiz-dup">
                  <span className="mbiz-dup-top">
                    <Icon name="user" size={14} />
                    <b>
                      {g.clients.length === 2
                        ? t('dupFoundOne')
                        : t('dupFound').replace('{n}', String(g.clients.length))}
                    </b>
                  </span>
                  <small>{g.clients.map(c => c.name).join(' · ')}</small>
                  <span className="mbiz-dup-acts">
                    <button onClick={() => setMergeKey(g.key)}>{t('dupSee')}</button>
                    <button className="ghost" onClick={() => descartarDup(g.key)}>{t('dupNot')}</button>
                  </span>
                </div>
              ))}

              <div className="mbiz-section-head">
                <span>{t('bizClients')}</span>
                <span className="mbiz-head-btns">
                  {/* Solo con servicios y con clientes de sobra: agrupar tres
                      filas en dos grupos es más cabeceras que datos. */}
                  {services.length > 1 && clients.length > 4 && (
                    <button onClick={alternarAgrupar} aria-pressed={porServicio}>
                      <Icon name={porServicio ? 'list' : 'grid'} size={13} /> {t('bizGroupByService')}
                    </button>
                  )}
                  {/* Un cobro suelto es para alguien que YA es cliente, así que
                      vive junto a la lista de clientes, no junto a «Agregar». */}
                  <button onClick={() => setNewCharge(true)}>
                    <Icon name="receipt" size={13} /> {t('bizNewCharge')}
                  </button>
                  <button onClick={() => setClientSheet('new')}>
                    <Icon name="plus" size={13} /> {t('bizAddClient')}
                  </button>
                </span>
              </div>

              {porServicio ? gruposDeClientes.map(grupo => (
                <div key={grupo.id || 'sin'} className="mbiz-group">
                  <div className="mbiz-group-head as-label">
                    <span>{grupo.name}</span>
                    <b>{grupo.items.length}</b>
                  </div>
                  <div className="mbiz-list">{grupo.items.map(filaCliente)}</div>
                </div>
              )) : (
                <div className="mbiz-list m-stagger">{clients.map(filaCliente)}</div>
              )}

              {/* Exportar: para quien lleva la contabilidad fuera, o para
                  mandarle los cobros del año a un contable. */}
              <div className="mbiz-export">
                <span>{t('bizExportCharges')}</span>
                <button
                  disabled={exportando}
                  onClick={() => exportar(() => exportChargesExcel(charges, clients))}
                >
                  <Icon name="fileJson" size={13} /> {t('bizExportExcel')}
                </button>
                <button
                  disabled={exportando}
                  onClick={() => exportar(() => exportChargesPdf(charges, clients, currency, lang))}
                >
                  <Icon name="print" size={13} /> {t('bizExportPdf')}
                </button>
              </div>

              {/* Precios desiguales por el mismo concepto. Un negocio pequeño
                  se desangra por precios que nunca se revisaron. */}
              {spread.length > 0 && (
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
            </>
          )}
        </>
      )}

      {/* ═══ GANANCIA ═════════════════════════════════════ */}
      {tab === 'profit' && (
        <>
          <div className="mbiz-section-head">
            <span>{t('bizBusinesses')}</span>
            <span className="mbiz-head-btns">
              {/* Ordenar y archivar: solo con dos o mas negocios, porque con
                  uno no hay orden que cambiar. */}
              {businesses.length > 1 && (
                <button onClick={() => setOrganizando(true)}>
                  <Icon name="dots" size={13} /> {t('bizReorder')}
                </button>
              )}
              <button onClick={() => setBizSheet('new')}>
                <Icon name="plus" size={13} /> {t('bizAddBusiness')}
              </button>
            </span>
          </div>

          {/*
            TUS NEGOCIOS, TODOS JUNTOS.
            Con tres o cuatro habia que abrir uno por uno para saber como va
            el mes. La pregunta «¿como va el mes?» tiene una respuesta, y
            exigia cuatro toques y una suma mental.

            Solo con dos o mas: con uno, este resumen es la misma cifra que la
            tarjeta de abajo dicha dos veces.
          */}
          {cuentas.length > 1 && (
            <section className="mbiz-allsum">
              <small>{t('bizAllBusinesses').replace('{n}', String(cuentas.length))}</small>
              <strong className={totalProfit < 0 ? 'expense' : 'income'}>
                {totalProfit < 0 && '−'}
                <AnimatedMoney value={Math.abs(totalProfit)} decimals={moneyDecimals} fit />
              </strong>
              {/* Cada negocio como una barra de SU color: cuatro negocios se
                  distinguen sin leer ninguna etiqueta. */}
              {totalProfit > 0 && (
                <div className="mbiz-allsum-bar">
                  {cuentas
                    .filter(c => c.runRate.profit > 0)
                    .map(c => (
                      <i
                        key={c.biz.id}
                        style={{
                          background: c.biz.color,
                          width: `${Math.round(c.runRate.profit / totalProfit * 100)}%`,
                        }}
                      />
                    ))}
                </div>
              )}
              <div className="mbiz-allsum-keys">
                {cuentas.map(c => (
                  <span key={c.biz.id}>
                    <i style={{ background: c.biz.color }} />
                    {c.biz.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {businesses.length === 0 ? (
            <div className="mbiz-empty">
              <EmptyArt kind="business" />
              <strong>{t('bizNoBusinessTitle')}</strong>
              <p>{t('bizNoBusinessText')}</p>
            </div>
          ) : cuentas.map(({ biz, mes, year, runRate, margen, inv, serie, suyos }) => {
            const abierto = openBizId === biz.id
            return (
              <div
                key={biz.id}
                className="mbiz-biz"
                style={{ '--biz': biz.color } as React.CSSProperties}
                ref={abierto ? resumenRef : undefined}
              >
                {/*
                  LA CABECERA COMO UN RESULTADO, NO COMO UNA FILA.
                  La ganancia en grande con su margen al lado, y debajo las tres
                  cifras de las que sale: antes era un número suelto al final de
                  una fila, del tamaño de los demás, y había que abrir la tarjeta
                  para saber si era bueno.
                */}
                <button className="mbiz-biz-head tinted" onClick={() => setOpenBizId(abierto ? null : biz.id)} aria-expanded={abierto}>
                  <span className="mbiz-biz-top">
                    {/* El color del negocio ya se elegia y solo pintaba un
                        cuadradito de 34px. Ahora baña su cabecera: cuatro
                        negocios se distinguen sin leer. */}
                    <span className="mbiz-biz-ico"><Icon name={biz.icon} size={17} /></span>
                    <span className="mbiz-biz-id">
                      <b>{biz.name}</b>
                      <small>{t('bizProfitOf').replace('{month}', monthLabel(mkey, locale))}</small>
                    </span>
                    <Icon name={abierto ? 'arrowUp' : 'arrowDn'} size={14} />
                  </span>

                  <span className="mbiz-biz-big">
                    <b className={runRate.profit < 0 ? 'neg' : ''}>
                      {runRate.profit < 0 && '−'}
                      <AnimatedMoney value={Math.abs(runRate.profit)} decimals={moneyDecimals} fit />
                    </b>
                    {margen !== null && (
                      <em className={margen < 0 ? 'neg' : ''}>
                        {margen}% <span>{t('bizMarginPct')}</span>
                      </em>
                    )}
                  </span>

                  {/* De dónde sale esa cifra, en la misma vista: cobrado,
                      coste al mes y la resta. Sin esto el número grande hay
                      que creérselo. */}
                  <span className="mbiz-biz-three">
                    <span><small>{t('bizCollectedLabel')}</small><b className="income">{fmt(runRate.collected, currency, { decimals: moneyDecimals })}</b></span>
                    <span><small>{t('bizMonthlyCostLabel')}</small><b className="expense">−{fmt(runRate.monthlyCost, currency, { decimals: moneyDecimals })}</b></span>
                    <span><small>{t('bizMonthlyAvg')}</small><b>{fmt(year.monthlyAvg, currency, { decimals: moneyDecimals })}</b></span>
                  </span>
                </button>

                {abierto && (
                  <div className="mbiz-biz-body">
                    {margen !== null
                      ? <p className="mbiz-why">{t('bizMarginOf').replace('{amount}', String(margen))}</p>
                      : <p className="mbiz-why">{t('bizMarginNone')}</p>}
                    {/*
                      La vista de CAJA, solo cuando difiere de la otra.
                      Si todo se paga al mes, las dos cifras son la misma y
                      ensenar las dos solo haria dudar de cual es la buena.
                    */}
                    {runRate.hasNonMonthly && (
                      <>
                        <div className="mbiz-row">
                          <span>{t('bizCashOut')}</span>
                          <b className="expense">−{fmt(mes.costs, currency, { decimals: moneyDecimals })}</b>
                        </div>
                        <p className="mbiz-why">{t('bizCashVsMonthly')}</p>
                      </>
                    )}
                    {biz.setAsidePct ? (
                      <div className="mbiz-row">
                        <span>{t('bizSetAside').replace('{pct}', String(biz.setAsidePct))}</span>
                        <b>{fmt(mes.collected * biz.setAsidePct / 100, currency, { decimals: moneyDecimals })}</b>
                      </div>
                    ) : null}

                    <div className="mbiz-sep" />
                    <div className="mbiz-sechead">{t('invTitle')}</div>
                    <div className="mbiz-row">
                      <span>{t('invPutIn')}</span>
                      <b className="expense">{fmt(inv.total, currency, { decimals: moneyDecimals })}</b>
                    </div>
                    <div className="mbiz-row">
                      <span>{t('invTaken')}</span>
                      <b className="income">{fmt(inv.collected, currency, { decimals: moneyDecimals })}</b>
                    </div>
                    <div className="mbiz-row">
                      <span>{inv.isProfitable ? t('invRecovered') : t('invToRecover')}</span>
                      <b className={inv.isProfitable ? 'income' : 'expense'}>
                        {fmt(Math.abs(inv.returned), currency, { decimals: moneyDecimals })}
                      </b>
                    </div>
                    {/* El plazo solo si el negocio de verdad gana algo al mes:
                        con ganancia cero no hay plazo, hay un problema. */}
                    {inv.monthsToRecover !== null && (
                      <p className="mbiz-why">
                        {t('invMonthsToRecover').replace('{n}', String(inv.monthsToRecover))}
                      </p>
                    )}

                    <div className="mbiz-sep" />
                    <div className="mbiz-row"><span>{t('bizYearProfit')}</span><b>{fmt(year.profit, currency, { decimals: moneyDecimals })}</b></div>

                    {/* La gráfica del año: doce barras, la de este mes marcada.
                        Las pérdidas van hacia abajo desde la línea del cero, o
                        un mes malo se vería igual que uno bueno. */}
                    {/* La grafica usa la vista AL MES: con la de caja, un
                        pago anual deja un crater en su mes y once planos, y la
                        linea dejaria de contar como va el negocio. */}
                    <ProfitChart
                      points={serie}
                      mkey={mkey}
                      locale={locale}
                      currency={currency}
                      decimals={moneyDecimals}
                      avgLabel={t('bizChartAvg')}
                    />

                    {/*
                      EL RESUMEN DEL MES, COMO IMAGEN.
                      Lo que se manda por WhatsApp a un socio, o se guarda al
                      cerrar el mes. Es el nodo de arriba —la cabecera con la
                      ganancia y sus tres cifras— fotografiado tal cual: una
                      segunda maquetación acabaría diciendo otra cosa que la
                      pantalla.
                    */}
                    <button
                      className="mbiz-shot"
                      disabled={exportando}
                      onClick={async () => {
                        const nodo = resumenRef.current
                        if (!nodo) return
                        setExportando(true)
                        try {
                          playSoftHaptic()
                          await exportElementPng(nodo, `cuadre-${biz.name}-${mkey}`)
                          toast(t('bizMonthImageSaved'), { icon: 'check', type: 'ok' })
                        } finally { setExportando(false) }
                      }}
                    >
                      <Icon name="camera" size={14} /> {t('bizMonthImage')}
                    </button>

                    <div className="mbiz-section-head small">
                      <span>{labelOf(biz.labels?.service, t('bizServices'))}</span>
                      <button onClick={() => setSvcSheet({ businessId: biz.id, id: 'new' })}>
                        <Icon name="plus" size={12} /> {t('add')}
                      </button>
                    </div>

                    {suyos.map(svc => {
                      const m = serviceMargin(svc, clients, currency)
                      const ahorro = svc.monthlyListPrice
                        ? prepaySaving({ amount: svc.cost, cycle: svc.costCycle, customMonths: svc.costCustomMonths }, svc.monthlyListPrice)
                        : 0
                      const svcCur = svc.currency ?? currency
                      return (
                        <div key={svc.id} className="mbiz-svc-wrap">
                        <button className="mbiz-svc" onClick={() => setSvcSheet({ businessId: biz.id, id: svc.id })}>
                          {/*
                            EL LOGO DE LA MARCA, si se le reconoce el nombre.
                            Suscripciones ya los pintaba y aqui los mismos
                            servicios se dibujaban como texto gris. Los logos
                            llevan en el repositorio desde antes que Negocio.
                          */}
                          <BrandTile name={svc.name} size={34} color={biz.color} icon={biz.icon} />
                          <span className="mbiz-svc-id">
                            <b>{svc.name}</b>
                            <small>
                              {fmt(svc.cost, svcCur, { decimals: moneyDecimals })} {t(CYCLE_KEY[svc.costCycle] as LangKey)}
                              {/* El coste al mes, cuando no es mensual: es la
                                  cifra con la que se compara el margen, y sin
                                  decirla el margen parece salido de la nada. */}
                              {svc.costCycle !== 'monthly' && ` · ${t('bizPerMonth').replace('{amount}', fmt(serviceCostPerMonth(svc, currency), currency, { decimals: moneyDecimals }))}`}
                            </small>
                          </span>
                          <span className="mbiz-svc-right">
                            <b className={m.margin < 0 ? 'expense' : 'income'}>
                              {m.margin < 0 && '−'}{fmt(Math.abs(m.margin), currency, { decimals: moneyDecimals })}
                            </b>
                            <em>
                              {t('bizNClients').replace('{n}', String(m.clientCount))}
                              {m.freeSlots !== null && m.freeSlots > 0 && ` · ${t('bizFreeSlots').replace('{n}', String(m.freeSlots))}`}
                            </em>
                            {m.breakEven !== null && m.margin < 0 && (
                              <em className="late">{t('bizBreakEven').replace('{n}', String(m.breakEven))}</em>
                            )}
                            {ahorro > 0 && <em className="ok">{t('bizPrepaySaving').replace('{amount}', fmt(ahorro, svcCur, { decimals: moneyDecimals }))}</em>}
                          </span>
                        </button>
                        {/* Pagar va aparte del toque que abre la ficha: son dos
                            cosas distintas y meterlas en el mismo boton obliga
                            a entrar a la ficha para pagar. */}
                        <button className="mbiz-svc-pay" onClick={() => setPayServiceId(svc.id)}>
                          <Icon name="handCoins" size={15} />
                          {t('invPayShort')}
                        </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}

      {/* Agregar un cliente es un formulario; VER uno es una ficha. Son dos
          pantallas distintas porque son dos intenciones distintas. */}
      {clientSheet && (
        <ClientSheet clientId={null} onClose={() => setClientSheet(null)} />
      )}
      {editId && (
        <ClientSheet clientId={editId} onClose={() => setEditId(null)} />
      )}
      {clientCardId && (
        <ClientCard
          clientId={clientCardId}
          onClose={() => setClientCardId(null)}
          onCollect={id => setCollectId(id)}
          onDuplicated={id => {
            // Se cierra la ficha del original y se abre el formulario del
            // clon: lo unico que le falta es el nombre.
            setClientCardId(null)
            setEditId(id)
          }}
        />
      )}
      {newCharge && <NewChargeSheet onClose={() => setNewCharge(false)} />}
      {grupoAUnir && (
        <MergeSheet group={grupoAUnir} onClose={() => setMergeKey(null)} />
      )}
      {organizando && <OrganizeSheet onClose={() => setOrganizando(false)} />}
      {bizSheet && (
        <BusinessSheet
          businessId={bizSheet === 'new' ? null : bizSheet}
          onClose={() => setBizSheet(null)}
        />
      )}
      {svcSheet && (
        <ServiceSheet
          businessId={svcSheet.businessId}
          serviceId={svcSheet.id === 'new' ? null : svcSheet.id}
          onClose={() => setSvcSheet(null)}
        />
      )}
      {payServiceId && (
        <PayServiceSheet serviceId={payServiceId} onClose={() => setPayServiceId(null)} />
      )}

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

/** Un color estable por cliente, derivado de su id. */
const AVATAR_COLORS = ['#5bc0ff', '#35d0a2', '#ffd166', '#ff6b8a', '#c765ff', '#ff9a3d']
function colorFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Las iniciales de un nombre, para el avatar. */
function initials(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/**
 * La ganancia del año en doce barras.
 *
 * Las pérdidas crecen hacia ABAJO desde la línea del cero. Dibujarlas hacia
 * arriba como las ganancias haría que un mes de −3,000 se viera igual que uno
 * de +3,000, que es justo lo contrario de lo que hay que ver.
 *
 * ── POR QUÉ LLEVA MESES Y MEDIA ───────────────────────────────────────
 * Doce barras sin una sola etiqueta son una forma bonita, no un dato: no se
 * sabía qué mes era cada una ni cuánto valía la más alta. Con los meses debajo
 * y la media cruzando se puede leer qué meses están por encima de lo normal,
 * que es para lo que sirve ver un año.
 */
function ProfitChart({ points, mkey, locale, currency, decimals, avgLabel }: {
  points: Array<{ mkey: string; profit: number }>
  mkey: string
  locale: string
  currency: CurrencyCode
  decimals: number | undefined
  avgLabel: string
}) {
  const tope = Math.max(1, ...points.map(p => Math.abs(p.profit)))
  /*
   * La media de los meses que ya PASARON. Incluir los que todavía no han
   * llegado —que valen cero— la hundiría a la mitad en marzo y la línea diría
   * que un mes normal es peor de lo que es.
   */
  const pasados = points.filter(p => p.mkey <= mkey)
  const media = pasados.length
    ? pasados.reduce((sum, p) => sum + p.profit, 0) / pasados.length
    : 0
  const alturaMedia = Math.min(100, Math.round(Math.abs(media) / tope * 100))

  return (
    <>
      <div className="mbiz-chart">
        {points.map(p => {
          const alto = Math.round(Math.abs(p.profit) / tope * 100)
          return (
            <span key={p.mkey} className={`mbiz-chart-col${p.mkey === mkey ? ' now' : ''}`}>
              <i className="up" style={{ height: p.profit > 0 ? `${alto}%` : 0 }} />
              <i className="zero" />
              <i className="down" style={{ height: p.profit < 0 ? `${alto}%` : 0 }} />
              {/* La inicial del mes: con tres letras no caben doce en 320px. */}
              <u aria-hidden="true">{shortMonth(p.mkey, locale).slice(0, 1)}</u>
            </span>
          )
        })}
        {/* La media, dibujada donde de verdad cae: por encima del cero si se
            gana, por debajo si se pierde. */}
        {media !== 0 && (
          <span
            className={`mbiz-chart-avg${media < 0 ? ' neg' : ''}`}
            style={{ '--h': `${alturaMedia}%` } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
      </div>
      <p className="mbiz-chart-legend">
        {avgLabel.replace('{amount}', fmt(media, currency, { decimals }))}
      </p>
    </>
  )
}

/** La palabra del negocio, o la de la app si no puso ninguna. */
function labelOf(custom: string | undefined, fallback: string): string {
  return custom?.trim() || fallback
}

/** Reexportado para las hojas: el equivalente mensual de un cliente. */
export { clientPerMonth, perMonth }
