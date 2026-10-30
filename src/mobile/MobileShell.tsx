import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ViewErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import type { ShortcutRequest } from '@/hooks/useAppShortcut'
import type { NotificationRequest, NotificationTargetType } from '@/hooks/useNotificationTarget'
import type { SharedReceipt } from '@/hooks/useTauri'
import type { Transaction, ViewId, ViewProps } from '@/types'
import type { BatchReceiptInput } from './MobileReceiptBatch'
import { ROUTE_ORDER, MobileBottomNav, type MobileRoute, type QuickAddMode } from './MobileBottomNav'
import type { AnalyticsPeriod } from './MobileAnalytics'
import { MobileCreateFlow } from './MobileCreateFlow'
import { SheetPortal } from './SheetPortal'
import { MobileMovements } from './MobileMovements'
// Lazy: ninguna de estas pantallas se ve en el primer render (Movimientos).
// Diferirlas achica el bundle que hay que parsear/hidratar al abrir la app.
//
// Las tres pestañas que NO son la inicial (Análisis, Cuentas, Perfil) también
// van aquí: Análisis en particular arrastra recharts (~470 KB), que antes se
// descargaba al abrir la app aunque nunca tocaras esa pestaña. Se precargan en
// reposo (ver PREFETCH_TABS abajo) para que cambiar de pestaña siga siendo
// instantáneo la primera vez.
const MobileAnalytics = lazy(() => import('./MobileAnalytics').then(m => ({ default: m.MobileAnalytics })))
const MobileAccounts = lazy(() => import('./MobileAccounts').then(m => ({ default: m.MobileAccounts })))
const MobileProfile = lazy(() => import('./MobileProfile').then(m => ({ default: m.MobileProfile })))
const MobileCalendar = lazy(() => import('./MobileCalendar').then(m => ({ default: m.MobileCalendar })))
const MobileDebt = lazy(() => import('./MobileDebt').then(m => ({ default: m.MobileDebt })))
const MobileCashflow = lazy(() => import('./MobileCashflow').then(m => ({ default: m.MobileCashflow })))
const MobileSubscriptions = lazy(() => import('./MobileSubscriptions').then(m => ({ default: m.MobileSubscriptions })))
const MobileCurrencySheet = lazy(() => import('./MobileCurrencySheet').then(m => ({ default: m.MobileCurrencySheet })))
const MobileCurrencyConverter = lazy(() => import('./MobileCurrencyConverter').then(m => ({ default: m.MobileCurrencyConverter })))
const MobileGlobalSearch = lazy(() => import('./MobileGlobalSearch').then(m => ({ default: m.MobileGlobalSearch })))
const MobileCSVImport = lazy(() => import('./MobileCSVImport').then(m => ({ default: m.MobileCSVImport })))
const MobileReceiptBatch = lazy(() => import('./MobileReceiptBatch').then(m => ({ default: m.MobileReceiptBatch })))
const MobileNotificationCenter = lazy(() => import('./MobileNotificationCenter').then(m => ({ default: m.MobileNotificationCenter })))
import { useSwipeRoute } from '@/hooks/useSwipeRoute'
import { useCreateRequest } from '@/store/createRequest'
import { useFinance } from '@/store/finance'
import { useGoalsRequest } from './goals/goalsRequest'
import { useSettings } from '@/store/settings'
import { useWishes } from '@/store/wishes'
import { OPEN_NOTIFICATIONS_EVENT, toastsOnScreen } from '@/components/ui/Toast'
import { ToolsMenu, useToolsAttention, type UtilId } from './ToolsMenu'
import { ExportSheet } from './ExportSheet'
import { isGoalDone } from '@/data/goalPlans'
import { MobileAvatarSheet } from './MobileAvatarSheet'
import { MobileTopBar } from './MobileTopBar'
import { useNotificationFeed } from '@/hooks/useNotificationFeed'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { syncExchangeRates } from '@/data/exchangeRates'
import { toast } from '@/components/ui/Toast'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import type { Sheet } from './settings/shared'

type MobileViewRenderer = (props: ViewProps) => React.ReactNode
// Orden visual de las sub-pestañas: Cuentas primero (landing por defecto del
// tab "Cuentas" en el bottom nav), luego Informes, luego Metas.
const REPORT_TAB_VIEWS: ViewId[] = ['accounts', 'goals']
const TOOL_VIEWS: ViewId[] = ['budgets', 'subscriptions', 'notes', 'debt', 'cashflow', 'calendar', 'caprices']
// Pantallas que se abren como "herramienta" desde el menú (⋯) de Movimientos.
// Al salir de una, volvemos al lugar de origen (normalmente Movimientos, que es
// donde vive el menú de herramientas) en vez de aterrizar en Cuentas.
const TOOL_SCREENS: ViewId[] = ['budgets', 'subscriptions', 'calendar', 'debt', 'cashflow', 'notes', 'caprices']

function MobileSkeletonScreen() {
  return (
    <div className="mobile-skeleton-screen" aria-hidden="true">
      <div className="mobile-skeleton-line short" />
      <div className="mobile-skeleton-card" />
      <div className="mobile-skeleton-pill" />
      <div className="mobile-skeleton-card" />
      <div className="mobile-skeleton-line medium" />
    </div>
  )
}

function routeFromView(view: ViewId): MobileRoute {
  if (view === 'transactions') return 'home'
  if (view === 'stats') return 'analysis'
  if (view === 'accounts' || view === 'goals') {
    return 'reports'
  }
  // Estas viven bajo Perfil (no Cuentas): son herramientas/reportes, no un
  // listado de cuentas — antes heredaban la pestaña "Cuentas" del bottom nav
  // por reusar la misma ruta, lo cual confundía (se veían como si fueran parte
  // de Cuentas).
  // Negocio tiene su propia pestaña: ya no hereda la de Perfil.
  if (view === 'business') return 'business'
  if (view === 'budgets' || view === 'subscriptions' || view === 'notes' || view === 'debt' || view === 'cashflow' || view === 'calendar' || view === 'caprices') return 'profile'
  return 'home'
}

function viewFromRoute(route: Exclude<MobileRoute, 'add'>): ViewId {
  if (route === 'analysis') return 'stats'
  if (route === 'reports') return 'accounts'
  if (route === 'business') return 'business'
  if (route === 'profile') return 'dashboard'
  return 'transactions'
}

function internalTitles(t: ReturnType<typeof useT>): Partial<Record<ViewId, string>> {
  return {
    calendar: t('calendarLabel'),
    budgets: t('budgets'),
    subscriptions: t('subscriptions'),
    notes: t('listsTitle'),
    // «Deudas», no «Calculadora de deudas»: el título largo se apretaba entre
    // los iconos de la barra centrada (se veía cortado) y además ya no describe
    // la pantalla — dejó de ser una calculadora al pasar a «Libre de deudas».
    debt: t('debtsLabel'),
    cashflow: t('cashflowTitle'),
    accounts: t('accounts'),
    goals: t('goals'),
    // Sin esta línea, Caprichos heredaba el título de la ruta: «Perfil».
    caprices: t('capTitle'),
  }
}

export function MobileShell({
  view,
  setView,
  viewProps,
  mobileViews,
  mkey,
  keys,
  onMonth,
  onSettings,
  onEditTx,
  userName,
  sharedReceipt,
  onConsumeSharedReceipt,
  appShortcut,
  onConsumeAppShortcut,
  notificationTarget,
  onConsumeNotificationTarget,
}: {
  view: ViewId
  setView: (view: ViewId) => void
  viewProps: ViewProps
  mobileViews: Partial<Record<ViewId, MobileViewRenderer>>
  mkey: string
  keys: string[]
  onMonth: (mkey: string) => void
  onSettings: (sheet?: Sheet) => void
  onEditTx: (transaction: Transaction) => void
  userName?: string
  sharedReceipt?: SharedReceipt[]
  onConsumeSharedReceipt?: () => void
  appShortcut?: ShortcutRequest | null
  onConsumeAppShortcut?: () => void
  notificationTarget?: NotificationRequest | null
  onConsumeNotificationTarget?: () => void
}) {
  const t = useT()
  const [route, setRoute] = useState<MobileRoute>(routeFromView(view))
  const [quickAddMode, setQuickAddMode] = useState<QuickAddMode | null>(null)
  const [batchReceipts, setBatchReceipts] = useState<BatchReceiptInput[] | null>(null)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [converterOpen, setConverterOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)

  /*
   * «Movimiento» desde el menú del + en Negocio. Mismo destino que el + de
   * siempre; se reacciona al CAMBIO del contador para que el primer render no
   * abra una pantalla que nadie pidió.
   */
  const pedidoMovimiento = useCreateRequest(s => s.addMovement)
  const movimientoVisto = useRef(pedidoMovimiento)
  useEffect(() => {
    if (pedidoMovimiento === movimientoVisto.current) return
    movimientoVisto.current = pedidoMovimiento
    setRoute('add')
  }, [pedidoMovimiento])
  const [notifOpen, setNotifOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [createKey, setCreateKey] = useState(0)
  const [analyticsInitialPeriod, setAnalyticsInitialPeriod] = useState<AnalyticsPeriod | undefined>(undefined)
  const [reportTransition, setReportTransition] = useState<'next' | 'prev'>('next')
  const [toolTransition, setToolTransition] = useState<'next' | 'prev'>('next')
  /** Hacia donde se movio entre las cuatro pestañas principales. */
  const [routeDir, setRouteDir] = useState<'next' | 'prev'>('next')
  const [exportOpen, setExportOpen] = useState(false)
  // H3 · El ☰ lleva un punto si alguna herramienta pide atención.
  const toolsAttention = useToolsAttention()
  // La meta principal (la primera sin lograr): la que propone el «+» en Metas.
  const mainGoal = useFinance(s => s.goals.find(g => !isGoalDone(g)) ?? null)

  /*
   * LA ENTRADA, SOLO LA PRIMERA VEZ.
   *
   * Android dibuja su splash con el icono y lo retira en cuanto la app pinta
   * su primer fotograma. Hasta ahora ese relevo era un corte: el contenido
   * simplemente estaba ahi. Esto lo convierte en una continuacion — el
   * contenido crece desde el centro, de donde estaba el icono.
   *
   * NO añade tiempo: ocurre mientras la app ya esta lista, no antes. El splash
   * propio que habia se quito justo por eso (eran dos segundos encima del de
   * Android) y no se trata de devolverlo.
   *
   * Se apaga sola tras la animacion para que no se repita al cambiar de
   * pestaña ni al volver del segundo plano.
   */
  const [primeraVez, setPrimeraVez] = useState(true)
  useEffect(() => {
    if (!primeraVez) return
    const t = window.setTimeout(() => setPrimeraVez(false), 480)
    return () => window.clearTimeout(t)
  }, [primeraVez])
  const prevIsAdd = useRef(false)
  const previousReportTab = useRef(Math.max(0, REPORT_TAB_VIEWS.indexOf(view)))
  const previousToolTab = useRef(Math.max(0, TOOL_VIEWS.indexOf(view)))
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollPositions = useRef<Record<string, number>>({})
  const activeScrollKey = useRef('')
  const activeMkey = mkey

  const notifFeed = useNotificationFeed()
  const openNotifications = () => {
    notifFeed.markAllSeen()
    setNotifOpen(true)
  }
  // B3 · «N avisos · Ver» abre la campanita.
  const openNotificationsRef = useRef(openNotifications)
  openNotificationsRef.current = openNotifications
  useEffect(() => {
    const onOpen = () => openNotificationsRef.current()
    window.addEventListener(OPEN_NOTIFICATIONS_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_NOTIFICATIONS_EVENT, onOpen)
  }, [])

  /*
   * C2 · EL ANTOJO SE DECIDE EN UN TOQUE.
   * Al abrir la app, si un antojo ya cumplió su espera, un aviso (una vez por
   * antojo) que lleva a Caprichos, donde están los dos botones. Espera a que
   * no haya otro aviso en pantalla: apilado encima de los del arranque tapaba
   * media pantalla.
   */
  useEffect(() => {
    let tries = 0
    let id: ReturnType<typeof setTimeout>
    const attempt = () => {
      if (toastsOnScreen() > 0) {
        if (++tries < 6) id = setTimeout(attempt, 2500)
        return
      }
      const { dismissedAlerts, dismissAlert } = useSettings.getState()
      const listo = useWishes.getState().items.find(w => !w.resolution && w.decideAt <= Date.now() && !dismissedAlerts.includes(`wishask:${w.id}`))
      if (!listo) return
      dismissAlert(`wishask:${listo.id}`)
      toast(t('nudgeWishTitle').replace('{name}', listo.name), {
        icon: 'piggy',
        duration: 7000,
        action: { label: t('nxkDecide'), onClick: () => gotoViewRef.current('caprices') },
      })
    }
    id = setTimeout(attempt, 1800)
    return () => clearTimeout(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rememberScroll = () => {
    const scroller = contentRef.current
    if (scroller && activeScrollKey.current) scrollPositions.current[activeScrollKey.current] = scroller.scrollTop
  }

  useEffect(() => {
    if (route === 'add' && !prevIsAdd.current) setCreateKey(k => k + 1)
    prevIsAdd.current = route === 'add'
  }, [route])

  // Precarga en reposo las otras tres pestañas. La app arranca solo con
  // Movimientos; sin esto, la PRIMERA vez que tocas Análisis/Cuentas/Perfil
  // verías un esqueleto mientras baja su código. Precargarlas cuando el hilo
  // está libre mantiene el arranque ligero Y el cambio de pestaña instantáneo.
  // requestIdleCallback no existe en el WebView viejo de algunos Android, de
  // ahí el fallback a un setTimeout corto.
  useEffect(() => {
    const warm = () => {
      void import('./MobileAnalytics')
      void import('./MobileAccounts')
      void import('./MobileProfile')
    }
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
    if (ric) {
      const id = ric(warm)
      const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback
      return () => cancel?.(id)
    }
    const id = window.setTimeout(warm, 1200)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    if (route === 'home' && view !== 'transactions') {
      setView('transactions')
    }
  }, [route, setView, view])

  // Origen al abrir una herramienta: para volver ahí al salir (por defecto
  // Movimientos, que es donde vive el menú de herramientas).
  const toolReturn = useRef<{ route: MobileRoute; view: ViewId }>({ route: 'home', view: 'transactions' })

  // Las utilidades del ☰, también alcanzables desde el buscador (S3).
  const openUtil = (u: UtilId) => {
    if (u === 'notes') gotoView('notes')
    else if (u === 'calendar') gotoView('calendar')
    else if (u === 'converter') setConverterOpen(true)
    else if (u === 'export') setExportOpen(true)
    else if (u === 'import') setCsvOpen(true)
  }

  const gotoView = (next: ViewId) => {
    rememberScroll()
    if (TOOL_SCREENS.includes(next) && !TOOL_SCREENS.includes(view)) {
      toolReturn.current = { route, view }
    }
    setRoute(routeFromView(next))
    setView(next)
  }
  // `gotoView` es una closure nueva en cada render (captura `route`/`view`
  // actuales) — el efecto de `appShortcut` de abajo solo debe reaccionar al
  // shortcut en sí, no a que `gotoView` haya cambiado de identidad. Se lee
  // por ref para no correr el efecto de más ni recibir la advertencia de
  // dependencias faltantes.
  const gotoViewRef = useRef(gotoView)
  gotoViewRef.current = gotoView

  const exitTool = () => {
    rememberScroll()
    const origin = toolReturn.current
    setRoute(origin.route)
    setView(origin.view)
  }

  useMobileBackDismiss(route === 'add', () => {
    setQuickAddMode(null)
    setBatchReceipts(null)
    setRoute('home')
    setView('transactions')
    onConsumeSharedReceipt?.()
  })
  useMobileBackDismiss(toolsOpen, () => setToolsOpen(false))
  const toolsRef = useDialogA11y<HTMLDivElement>(() => setToolsOpen(false), toolsOpen)

  useEffect(() => {
    if (route !== 'reports') return
    const nextIndex = REPORT_TAB_VIEWS.indexOf(view)
    if (nextIndex === -1) return

    setReportTransition(nextIndex >= previousReportTab.current ? 'next' : 'prev')
    previousReportTab.current = nextIndex
  }, [route, view])


  const isInProfileSub = route === 'profile' && (view === 'budgets' || view === 'subscriptions' || view === 'notes' || view === 'debt' || view === 'cashflow' || view === 'calendar' || view === 'caprices')
  useMobileBackDismiss(isInProfileSub, exitTool)

  useEffect(() => {
    if (route !== 'profile') return
    const nextIndex = TOOL_VIEWS.indexOf(view)
    if (nextIndex === -1) return

    setToolTransition(nextIndex >= previousToolTab.current ? 'next' : 'prev')
    previousToolTab.current = nextIndex
  }, [route, view])

  useEffect(() => {
    if (!sharedReceipt?.length) return
    setQuickAddMode('expense')
    setRoute('add')
  }, [sharedReceipt])

  useEffect(() => {
    if (!appShortcut) return
    const shortcut = appShortcut.id
    if (shortcut === 'add-expense' || shortcut === 'add-income') {
      // Mismo flujo que el botón + de la barra inferior — nunca la hoja
      // reducida: el widget y la notificación persistente deben abrir
      // exactamente la misma pantalla que se usa dentro de la app.
      setQuickAddMode(shortcut === 'add-expense' ? 'expense' : 'income')
      setRoute('add')
    } else if (shortcut === 'reports') {
      // 'accounts' es la vista por defecto de la ruta "reports" (ver
      // routeFromView): el ViewId 'reports' no mapea a ninguna ruta movil.
      gotoViewRef.current('accounts')
    } else if (shortcut === 'collect') {
      // Entra directo a Negocio, que abre en Cobros: quien revende abre la
      // app para esto y tenia que pasar por el inicio y una pestana.
      setRoute('business')
    } else if (shortcut === 'accounts') {
      gotoViewRef.current('accounts')
    } else if (shortcut === 'budgets') {
      gotoViewRef.current('budgets')
    } else if (shortcut === 'converter') {
      setConverterOpen(true)
    }
    onConsumeAppShortcut?.()
  }, [appShortcut, onConsumeAppShortcut])

  // Adónde lleva cada tipo de aviso — lo usan tanto el aviso nativo (tocado
  // desde la bandeja de Android) como una entrada de Historial dentro de la
  // propia campanita, para no duplicar el mapeo en dos lugares.
  const applyNotificationTarget = (type: NotificationTargetType) => {
    if (type === 'budget') {
      gotoViewRef.current('budgets')
    } else if (type === 'recurring' || type === 'lowfunds') {
      gotoViewRef.current('accounts')
    } else if (type === 'subscription') {
      gotoViewRef.current('subscriptions')
    } else if (type === 'goal') {
      gotoViewRef.current('goals')
    } else if (type === 'weekly') {
      setAnalyticsInitialPeriod('week')
      gotoViewRef.current('stats')
    } else if (type === 'fx') {
      setConverterOpen(true)
    } else if (type === 'charge') {
      // Un aviso de cobro lleva a Negocio: quedarse en Inicio obligaria a
      // buscar en el menu justo lo que el aviso acaba de nombrar.
      gotoViewRef.current('business')
    } else if (type === 'caprice') {
      gotoViewRef.current('caprices')
    } else if (type === 'debt') {
      gotoViewRef.current('debt')
    } else if (type === 'cashflow') {
      gotoViewRef.current('cashflow')
    } else if (type === 'anomaly' || type === 'activity') {
      gotoViewRef.current('transactions')
    }
  }

  // Al tocar un aviso nativo (campanita del sistema: presupuesto, semanal,
  // pago próximo...) la app debe abrir la pantalla que ese aviso describe, no
  // quedarse en Inicio (queja explícita: "vi la semanal pero no me llevó a
  // ningún lado"). Ver useNotificationTarget para el mecanismo de entrega.
  useEffect(() => {
    if (!notificationTarget) return
    applyNotificationTarget(notificationTarget.id)
    onConsumeNotificationTarget?.()
  }, [notificationTarget, onConsumeNotificationTarget])

  const goRoute = (next: MobileRoute) => {
    rememberScroll()
    /*
     * HACIA DONDE SE MOVIO.
     *
     * El boton central «+» no entra en el orden de la barra, asi que no tiene
     * direccion: abrir Agregar no es ir a la derecha de nada. Cuando alguno de
     * los dos no esta en la lista, se conserva la ultima direccion en vez de
     * inventar una.
     */
    const desde = ROUTE_ORDER.indexOf(route)
    const hasta = ROUTE_ORDER.indexOf(next)
    if (desde >= 0 && hasta >= 0 && desde !== hasta) {
      setRouteDir(hasta > desde ? 'next' : 'prev')
    }
    if (next !== 'add') {
      setQuickAddMode(null)
      onConsumeSharedReceipt?.()
    }
    setRoute(next)
    if (next !== 'add') setView(viewFromRoute(next))
  }

  const renderReportsRoute = () => {
    const goalsRenderer = mobileViews.goals

    return (
      <>
        {/* SIN selector Cuentas/Metas.
            Eran dos pantallas distintas compartiendo una pestaña de la barra
            inferior: el selector se comia 60px de alto en TODAS las visitas a
            Cuentas para ofrecer un salto que casi nadie da, y dejaba a Metas
            escondida detras de un control que no se ve desde ningun otro
            sitio. Cuentas es Cuentas; Metas vive en el menu ☰, que es donde
            estan las demas herramientas.

            La vista 'goals' sigue existiendo y se puede abrir (desde ☰ o
            desde un aviso de meta): solo deja de tener este selector. */}
        <div className={`mobile-report-pane mobile-report-pane-${reportTransition}`} key={view}>
          {view === 'goals'
            ? (goalsRenderer && (
                <ViewErrorBoundary resetKey={`${route}:goals`}>
                  {goalsRenderer(viewProps)}
                </ViewErrorBoundary>
              ))
            : (
              <Suspense fallback={<MobileSkeletonScreen />}>
                <MobileAccounts mkey={mkey} createRequest={viewProps.createRequest} onEditTx={onEditTx} onDeleteTx={viewProps.onDeleteTx} onImport={() => setCsvOpen(true)} />
              </Suspense>
            )}
        </div>
      </>
    )
  }

  const renderMain = () => {
    if (route === 'add') {
      const batch = batchReceipts ?? (sharedReceipt && sharedReceipt.length > 1 ? sharedReceipt : null)
      if (batch) {
        return (
          <Suspense fallback={null}>
            <MobileReceiptBatch
              receipts={batch}
              onDone={() => {
                setQuickAddMode(null)
                setBatchReceipts(null)
                setRoute('home')
                setView('transactions')
                onConsumeSharedReceipt?.()
              }}
              onCancel={() => {
                setQuickAddMode(null)
                setBatchReceipts(null)
                setRoute('home')
                onConsumeSharedReceipt?.()
              }}
            />
          </Suspense>
        )
      }
      return (
        <MobileCreateFlow
          key={createKey}
          mkey={mkey}
          initialMode={quickAddMode ?? undefined}
          receiptPreview={sharedReceipt?.[0] ?? undefined}
          onOpenBatch={setBatchReceipts}
          onSaved={() => {
            setQuickAddMode(null)
            setRoute('home')
            setView('transactions')
            onConsumeSharedReceipt?.()
          }}
        />
      )
    }

    if (route === 'home') {
      return (
        <MobileMovements
          mkey={mkey}
          onAdd={() => setRoute('add')}
          onEditTx={onEditTx}
          onDeleteTx={viewProps.onDeleteTx}
          onOpenSecurity={() => onSettings('pin')}
          onOpenBackup={() => onSettings('export')}
          onOpenDetection={() => onSettings('bankNotifications')}
        />
      )
    }

    if (route === 'analysis') {
      return (
        <Suspense fallback={<MobileSkeletonScreen />}>
          <MobileAnalytics mkey={mkey} onBudgets={() => gotoView('budgets')} onAccounts={() => gotoView('accounts')} onEditTx={onEditTx} initialPeriod={analyticsInitialPeriod} />
        </Suspense>
      )
    }

    if (route === 'reports') {
      return renderReportsRoute()
    }

    /*
     * NEGOCIO, con su propia ruta.
     *
     * No pasa por el envoltorio de «herramienta» (`mobile-tool-pane`) porque ya
     * no lo es: es una pestaña de la barra, y ese envoltorio trae la animación
     * de entrar y salir de una herramienta, que aquí mentiría sobre de dónde
     * vienes.
     */
    if (route === 'business') {
      const renderer = mobileViews.business
      return renderer ? (
        <ViewErrorBoundary resetKey="business">
          {renderer(viewProps)}
        </ViewErrorBoundary>
      ) : null
    }

    if (route === 'profile') {
      if (view === 'subscriptions') {
        return (
          <div className={`mobile-tool-pane mobile-tool-pane-${toolTransition}`} key={view}>
            <Suspense fallback={<MobileSkeletonScreen />}>
              <MobileSubscriptions />
            </Suspense>
          </div>
        )
      }
      // Negocio comparte el camino de Presupuestos y Listas: su renderizador
      // vive en `mobileViews`, asi que entra en la misma rama en vez de
      // repetir el envoltorio una cuarta vez.
      if (view === 'budgets' || view === 'notes' || view === 'caprices') {
        const renderer = mobileViews[view]
        return renderer ? (
          <div className={`mobile-tool-pane mobile-tool-pane-${toolTransition}`} key={view}>
            <ViewErrorBoundary resetKey={`${route}:${view}`}>
              {renderer(viewProps)}
            </ViewErrorBoundary>
          </div>
        ) : null
      }
      if (view === 'debt') {
        return (
          <div className={`mobile-tool-pane mobile-tool-pane-${toolTransition}`} key={view}>
            <Suspense fallback={<MobileSkeletonScreen />}>
              <MobileDebt />
            </Suspense>
          </div>
        )
      }
      if (view === 'cashflow') {
        return (
          <div className={`mobile-tool-pane mobile-tool-pane-${toolTransition}`} key={view}>
            <Suspense fallback={<MobileSkeletonScreen />}>
              <MobileCashflow />
            </Suspense>
          </div>
        )
      }
      if (view === 'calendar') {
        return (
          <div className={`mobile-tool-pane mobile-tool-pane-${toolTransition}`} key={view}>
            <Suspense fallback={<MobileSkeletonScreen />}>
              <MobileCalendar mkey={mkey} onEditTx={onEditTx} onDeleteTx={viewProps.onDeleteTx} />
            </Suspense>
          </div>
        )
      }
      return (
        <Suspense fallback={<MobileSkeletonScreen />}>
          <MobileProfile
            userName={userName}
            goto={gotoView}
          />
        </Suspense>
      )
    }

    return null
  }

  const topBarBack = (() => {
    if (route === 'add') {
      return () => {
        setQuickAddMode(null)
        setBatchReceipts(null)
        setRoute('home')
        setView('transactions')
        onConsumeSharedReceipt?.()
      }
    }
    if (isInProfileSub) return exitTool
    return undefined
  })()
  const routeResetKey = `${route}:${view}:${mkey}`
  useEffect(() => {
    activeScrollKey.current = routeResetKey
    if (route === 'add') return
    const scroller = contentRef.current
    if (!scroller) return
    const top = scrollPositions.current[routeResetKey] ?? 0
    requestAnimationFrame(() => scroller.scrollTo({ top, behavior: 'auto' }))
  }, [routeResetKey, route])

  /*
   * TIRAR DE LA LISTA.
   *
   * El gesto vive aquí y no en Movimientos porque lo que se desplaza es este
   * contenedor: todas las pestañas lo heredan, y no hay dos implementaciones
   * compitiendo por el mismo `touchmove`.
   *
   * Mientras se está creando un movimiento no hay tirón: esa pantalla tiene
   * su propio teclado y arrastrarla sería un accidente, no una intención.
   */
  const pullPhase = usePullToRefresh(contentRef, async () => {
    const cambiaron = await syncExchangeRates(true)
    toast(t('ratesUpdatedToast'), { icon: cambiaron ? 'refresh' : 'check', type: 'ok' })
  }, route !== 'add')

  const handleContentScroll = () => {
    const scroller = contentRef.current
    if (!scroller || !activeScrollKey.current) return
    scrollPositions.current[activeScrollKey.current] = scroller.scrollTop
  }

  /*
   * LA ACCION DE CADA PANTALLA.
   *
   * El calendario solo sirve en Movimientos, pero la barra cargaba los mismos
   * iconos en todas partes: ninguna pantalla tenia el suyo y todas llevaban
   * los de las demas. Un hueco, no un cajon.
   *
   * Negocio no pone ninguna a proposito: exportar ya vive al pie de su lista,
   * junto a los cobros que exporta, y repetirlo arriba seria ofrecer dos
   * puertas a lo mismo.
   */
  const topAction = route === 'home'
    ? { icon: 'calendar' as const, label: t('calendarLabel'), onPress: () => gotoView('calendar') }
    : null

  /*
   * PASAR DE PESTAÑA CON EL DEDO.
   *
   * La transicion ya existia pero solo se disparaba tocando la barra de
   * abajo. Deslizar es como la gente espera moverse entre pestañas vecinas.
   *
   * Solo entre las cuatro de la barra, y solo en su pantalla principal: dentro
   * de una herramienta del menu ☰ no hay «pestaña siguiente», y deslizar ahi
   * sacaria al usuario de donde estaba sin que lo haya pedido.
   */
  const swipeActivo = !isInProfileSub && route !== 'add'
  const irRelativo = (paso: number) => {
    const i = ROUTE_ORDER.indexOf(route)
    if (i < 0) return
    const siguiente = ROUTE_ORDER[i + paso]
    if (siguiente) goRoute(siguiente)
  }
  const swipeRef = useSwipeRoute<HTMLDivElement>(
    () => irRelativo(1),
    () => irRelativo(-1),
    swipeActivo,
  )

  const mainContent = (
    <ViewErrorBoundary resetKey={routeResetKey}>
      {renderMain()}
    </ViewErrorBoundary>
  )

  return (
    <main className={`mobile-shell${primeraVez ? ' mobile-shell-entrada' : ''}`}>
      {csvOpen && (
        <Suspense fallback={<div className="mobile-loading-overlay mobile-loading-skeleton" aria-live="polite"><MobileSkeletonScreen /></div>}>
          <MobileCSVImport onClose={() => setCsvOpen(false)} />
        </Suspense>
      )}
      {avatarOpen && (
        <MobileAvatarSheet
          onClose={() => setAvatarOpen(false)}
          onProfile={() => goRoute('profile')}
          onNotifications={openNotifications}
          onSettings={() => onSettings()}
          notifCount={notifFeed.unseenCount}
        />
      )}
      {currencyOpen && (
        <Suspense fallback={null}>
          <MobileCurrencySheet onClose={() => setCurrencyOpen(false)} />
        </Suspense>
      )}
      {converterOpen && (
        <Suspense fallback={null}>
          <MobileCurrencyConverter onClose={() => setConverterOpen(false)} />
        </Suspense>
      )}
      {searchOpen && (
        <Suspense fallback={null}>
          <MobileGlobalSearch
            onClose={() => setSearchOpen(false)}
            onEditTx={onEditTx}
            onGotoAccounts={() => gotoView('accounts')}
            onGotoCategories={() => gotoView('budgets')}
            onGotoGoals={() => gotoView('goals')}
            onGoView={v => gotoView(v)}
            onUtil={openUtil}
            onSettings={sheet => onSettings(sheet ?? undefined)}
          />
        </Suspense>
      )}
      {notifOpen && (
        <Suspense fallback={null}>
          <MobileNotificationCenter
            onClose={() => setNotifOpen(false)}
            onGotoBudgets={() => gotoView('budgets')}
            onGotoTarget={applyNotificationTarget}
            onOpenDetection={() => onSettings('bankNotifications')}
            onEditTx={onEditTx}
          />
        </Suspense>
      )}
      {exportOpen && <ExportSheet mkey={mkey} onImport={() => setCsvOpen(true)} onClose={() => setExportOpen(false)} />}
      {toolsOpen && (
        <SheetPortal>
        <div
          ref={toolsRef}
          className="mobile-detail-sheet mobile-tools-sheet-wrap"
          role="dialog"
          aria-modal="true"
          aria-label={t('toolsLabel')}
          onClick={() => setToolsOpen(false)}
        >
          <section className="mobile-tools-sheet" onClick={event => event.stopPropagation()}>
            <header>
              <span>{t('toolsLabel')}</span>
              <button aria-label={t('close')} onClick={() => setToolsOpen(false)}>
                <Icon name="close" size={18} />
              </button>
            </header>

            {/* H1–H4 · Mosaicos con su dato, buscador, avisos y favoritas. */}
            <ToolsMenu
              onGo={v => { setToolsOpen(false); gotoView(v) }}
              onUtil={u => { setToolsOpen(false); openUtil(u) }}
              onSettings={sheet => { setToolsOpen(false); onSettings(sheet) }}
              onOpenSearch={() => { setToolsOpen(false); setSearchOpen(true) }}
            />
          </section>
        </div>
        </SheetPortal>
      )}
      <MobileTopBar
        route={route}
        view={view}
        mkey={activeMkey}
        monthKeys={keys}
        title={(route === 'reports' || route === 'profile') ? internalTitles(t)[view] : undefined}
        onBack={topBarBack}
        onMenu={route === 'home' ? (() => setToolsOpen(true)) : undefined}
        menuBadge={toolsAttention}
        onSelectMonth={onMonth}
        onAvatar={() => setAvatarOpen(true)}
        onCurrency={() => setCurrencyOpen(true)}
        onSearch={() => setSearchOpen(true)}
        notifCount={notifFeed.unseenCount}
        action={topAction}
      />
      {route === 'add' ? (
        mainContent
      ) : (
        <>
          <div className="mobile-content" ref={contentRef} onScroll={handleContentScroll} data-ptr={pullPhase}>
            {/* El indicador del tirón vive DENTRO del bloque que se desplaza,
                con altura cero: así solo asoma cuando se tira, y no deja un
                hueco en blanco arriba de la pantalla cuando no se usa. */}
            <div className="mobile-ptr" aria-hidden={pullPhase === 'idle'}>
              <span className="mobile-ptr-inner">
                <Icon name="refresh" size={14} />
                {pullPhase === 'armed' ? t('releaseToRefreshHint') : t('pullToRefreshHint')}
              </span>
            </div>
            <div ref={swipeRef} className={`mobile-route mobile-route-${routeDir}`} key={routeResetKey}>
              {mainContent}
            </div>
          </div>
          <MobileBottomNav
            route={route}
            onRoute={goRoute}
            onQuickAdd={mode => {
              setQuickAddMode(mode)
              setRoute('add')
            }}
            fabContext={route === 'reports' ? (view === 'goals' ? 'goals' : 'accounts') : null}
            mainGoalName={mainGoal?.name ?? null}
            onFabAction={action => {
              if (action === 'contributeMain') useGoalsRequest.getState().ask('contributeMain')
              else if (action === 'newGoal') useGoalsRequest.getState().ask('new')
              else if (action === 'newAccount') useCreateRequest.getState().askNewAccount()
              else if (action === 'transfer') { setQuickAddMode('transfer'); setRoute('add') }
            }}
          />
        </>
      )}
    </main>
  )
}
