import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ViewErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import type { ShortcutRequest } from '@/hooks/useAppShortcut'
import type { NotificationRequest, NotificationTargetType } from '@/hooks/useNotificationTarget'
import type { SharedReceipt } from '@/hooks/useTauri'
import type { Transaction, ViewId, ViewProps } from '@/types'
import type { BatchReceiptInput } from './MobileReceiptBatch'
import { MobileBottomNav, type MobileRoute, type QuickAddMode } from './MobileBottomNav'
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
import { MobileTopBar } from './MobileTopBar'
import { useNotificationFeed } from '@/hooks/useNotificationFeed'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import type { Sheet } from './settings/shared'

type MobileViewRenderer = (props: ViewProps) => React.ReactNode
// Orden visual de las sub-pestañas: Cuentas primero (landing por defecto del
// tab "Cuentas" en el bottom nav), luego Informes, luego Metas.
const REPORT_TAB_VIEWS: ViewId[] = ['accounts', 'goals']
const TOOL_VIEWS: ViewId[] = ['budgets', 'subscriptions', 'notes', 'debt', 'cashflow', 'calendar']
// Pantallas que se abren como "herramienta" desde el menú (⋯) de Movimientos.
// Al salir de una, volvemos al lugar de origen (normalmente Movimientos, que es
// donde vive el menú de herramientas) en vez de aterrizar en Cuentas.
const TOOL_SCREENS: ViewId[] = ['budgets', 'subscriptions', 'calendar', 'debt', 'cashflow', 'notes']

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
  if (view === 'budgets' || view === 'subscriptions' || view === 'notes' || view === 'debt' || view === 'cashflow' || view === 'calendar') return 'profile'
  return 'home'
}

function viewFromRoute(route: Exclude<MobileRoute, 'add'>): ViewId {
  if (route === 'analysis') return 'stats'
  if (route === 'reports') return 'accounts'
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
  const [notifOpen, setNotifOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [createKey, setCreateKey] = useState(0)
  const [analyticsInitialPeriod, setAnalyticsInitialPeriod] = useState<AnalyticsPeriod | undefined>(undefined)
  const [reportTransition, setReportTransition] = useState<'next' | 'prev'>('next')
  const [toolTransition, setToolTransition] = useState<'next' | 'prev'>('next')
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


  const isInProfileSub = route === 'profile' && (view === 'budgets' || view === 'subscriptions' || view === 'notes' || view === 'debt' || view === 'cashflow' || view === 'calendar')
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
    } else if (type === 'goal') {
      gotoViewRef.current('goals')
    } else if (type === 'weekly') {
      setAnalyticsInitialPeriod('week')
      gotoViewRef.current('stats')
    } else if (type === 'fx') {
      setConverterOpen(true)
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
                <MobileAccounts mkey={mkey} createRequest={viewProps.createRequest} onEditTx={onEditTx} onDeleteTx={viewProps.onDeleteTx} />
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
        />
      )
    }

    if (route === 'analysis') {
      return (
        <Suspense fallback={<MobileSkeletonScreen />}>
          <MobileAnalytics mkey={mkey} onBudgets={() => gotoView('budgets')} onImport={() => setCsvOpen(true)} onEditTx={onEditTx} initialPeriod={analyticsInitialPeriod} />
        </Suspense>
      )
    }

    if (route === 'reports') {
      return renderReportsRoute()
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
      if (view === 'budgets' || view === 'notes') {
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

  const handleContentScroll = () => {
    const scroller = contentRef.current
    if (!scroller || !activeScrollKey.current) return
    scrollPositions.current[activeScrollKey.current] = scroller.scrollTop
  }

  const mainContent = (
    <ViewErrorBoundary resetKey={routeResetKey}>
      {renderMain()}
    </ViewErrorBoundary>
  )

  return (
    <main className="mobile-shell">
      {csvOpen && (
        <Suspense fallback={<div className="mobile-loading-overlay mobile-loading-skeleton" aria-live="polite"><MobileSkeletonScreen /></div>}>
          <MobileCSVImport onClose={() => setCsvOpen(false)} />
        </Suspense>
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

            <div className="mobile-tools-group">
              <div className="mobile-tools-group-title">{t('toolsLabel')}</div>
              <div className="mobile-tools-list">
                <button className="mobile-tools-row" onClick={() => { setToolsOpen(false); gotoView('budgets') }}>
                  <span className="mobile-tools-row-icon" style={{ background: '#22c55e22', color: '#22c55e' }}>
                    <Icon name="wallet" size={20} />
                  </span>
                  <div>
                    <b>{t('budgets')}</b>
                    <small>{t('budgetsQuickDesc')}</small>
                  </div>
                  <Icon name="arrowUp" size={13} className="mobile-tools-row-arrow" />
                </button>
                <button className="mobile-tools-row" onClick={() => { setToolsOpen(false); gotoView('goals') }}>
                  <span className="mobile-tools-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}>
                    <Icon name="target" size={20} />
                  </span>
                  <div>
                    <b>{t('goals')}</b>
                    <small>{t('goalsQuickDesc')}</small>
                  </div>
                  <Icon name="arrowUp" size={13} className="mobile-tools-row-arrow" />
                </button>
                <button className="mobile-tools-row" onClick={() => { setToolsOpen(false); gotoView('notes') }}>
                  <span className="mobile-tools-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}>
                    <Icon name="clipboard" size={20} />
                  </span>
                  <div>
                    <b>{t('listsTitle')}</b>
                    <small>{t('listsQuickDesc')}</small>
                  </div>
                  <Icon name="arrowUp" size={13} className="mobile-tools-row-arrow" />
                </button>
                <button className="mobile-tools-row" onClick={() => { setToolsOpen(false); setConverterOpen(true) }}>
                  <span className="mobile-tools-row-icon" style={{ background: '#ffdd3d22', color: '#eab308' }}>
                    <Icon name="coins" size={20} />
                  </span>
                  <div>
                    <b>{t('converterTitle')}</b>
                    <small>{t('converterQuickDesc')}</small>
                  </div>
                  <Icon name="arrowUp" size={13} className="mobile-tools-row-arrow" />
                </button>
              </div>
            </div>
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
        onSelectMonth={onMonth}
        onSettings={() => onSettings()}
        onCurrency={() => setCurrencyOpen(true)}
        onCalendar={route === 'home' ? () => gotoView('calendar') : undefined}
        onSearch={() => setSearchOpen(true)}
        onBell={openNotifications}
        notifCount={notifFeed.unseenCount}
      />
      {route === 'add' ? (
        mainContent
      ) : (
        <>
          <div className="mobile-content" ref={contentRef} onScroll={handleContentScroll}>
            <div className="mobile-route" key={routeResetKey}>
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
          />
        </>
      )}
    </main>
  )
}
