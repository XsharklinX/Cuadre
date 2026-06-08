import { lazy, Suspense, useEffect, useState } from 'react'
import { ViewErrorBoundary } from '@/components/ui/ErrorBoundary'
import type { AppShortcut } from '@/hooks/useAppShortcut'
import type { SharedReceipt } from '@/hooks/useTauri'
import type { Transaction, ViewId, ViewProps } from '@/types'
import { MobileBottomNav, type MobileRoute, type QuickAddMode } from './MobileBottomNav'
import { MobileAnalytics } from './MobileAnalytics'
import { MobileAnnual } from './MobileAnnual'
import { MobileCreateFlow } from './MobileCreateFlow'
import { MobileCurrencySheet } from './MobileCurrencySheet'
import { MobileHome } from './MobileHome'
import { MobileProfile } from './MobileProfile'
import { MobileReports } from './MobileReports'
import { MobileDebt } from './MobileDebt'
import { MobileSubscriptions } from './MobileSubscriptions'
const MobileCSVImport = lazy(() => import('./MobileCSVImport').then(m => ({ default: m.MobileCSVImport })))
import { MobileTopBar } from './MobileTopBar'
import { useMobileBackDismiss } from './useMobileBackDismiss'

type MobileViewRenderer = (props: ViewProps) => React.ReactNode

function routeFromView(view: ViewId): MobileRoute {
  if (view === 'stats') return 'analytics'
  if (view === 'annual' || view === 'budgets' || view === 'goals' || view === 'calendar' || view === 'reports' || view === 'subscriptions' || view === 'debt') return 'reports'
  return 'home'
}

function viewFromRoute(route: Exclude<MobileRoute, 'add'>): ViewId {
  if (route === 'analytics') return 'stats'
  if (route === 'reports') return 'reports'
  return 'dashboard'
}

const INTERNAL_TITLES: Partial<Record<ViewId, string>> = {
  annual:        'Informe anual',
  calendar:      'Calendario',
  budgets:       'Presupuestos',
  goals:         'Metas',
  reports:       'Reportes',
  subscriptions: 'Suscripciones',
  debt:          'Calculadora de deudas',
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
}: {
  view: ViewId
  setView: (view: ViewId) => void
  viewProps: ViewProps
  mobileViews: Partial<Record<ViewId, MobileViewRenderer>>
  mkey: string
  keys: string[]
  onMonth: (mkey: string) => void
  onSettings: () => void
  onEditTx: (transaction: Transaction) => void
  userName?: string
  sharedReceipt?: SharedReceipt | null
  onConsumeSharedReceipt?: () => void
  appShortcut?: AppShortcut | null
  onConsumeAppShortcut?: () => void
}) {
  const [route, setRoute] = useState<MobileRoute>(routeFromView(view))
  const [quickAddMode, setQuickAddMode] = useState<QuickAddMode | null>(null)
  const [currencyOpen, setCurrencyOpen] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const mIdx = keys.indexOf(mkey)

  // Back navigation: add-flow → home
  useMobileBackDismiss(route === 'add', () => {
    setRoute('home')
    setView('dashboard')
    onConsumeSharedReceipt?.()
  })
  // Back navigation: sub-views inside reports → main reports
  const isInSubView = route === 'reports' && view !== 'reports'
  useMobileBackDismiss(isInSubView, () => setView('reports'))
  // Recibo compartido desde otra app (Galería, WhatsApp, etc.) → abrir "agregar gasto" con vista previa
  useEffect(() => {
    if (!sharedReceipt) return
    setQuickAddMode('expense')
    setRoute('add')
  }, [sharedReceipt])
  // Accesos directos del ícono (mantener presionado — ver res/xml/shortcuts.xml)
  useEffect(() => {
    if (!appShortcut) return
    if (appShortcut === 'add-expense' || appShortcut === 'add-income') {
      setQuickAddMode(appShortcut === 'add-expense' ? 'expense' : 'income')
      setRoute('add')
    } else if (appShortcut === 'reports') {
      setRoute('reports')
      setView('reports')
    }
    onConsumeAppShortcut?.()
  }, [appShortcut])

  const goRoute = (next: MobileRoute) => {
    if (next !== 'add') {
      setQuickAddMode(null)
      onConsumeSharedReceipt?.()
    }
    setRoute(next)
    if (next !== 'add') setView(viewFromRoute(next))
  }

  const renderMain = () => {
    if (route === 'add') {
      return (
        <MobileCreateFlow
          mkey={mkey}
          initialMode={quickAddMode ?? undefined}
          receiptPreview={sharedReceipt ?? undefined}
          onSaved={() => {
            setQuickAddMode(null); setRoute('home'); setView('dashboard')
            onConsumeSharedReceipt?.()
          }}
        />
      )
    }

    if (route === 'home') {
      return (
        <MobileHome
          mkey={mkey}
          onAdd={() => setRoute('add')}
          onEditTx={onEditTx}
          onDeleteTx={viewProps.onDeleteTx}
        />
      )
    }

    if (route === 'analytics') {
      return (
        <MobileAnalytics
          mkey={mkey}
          onBudgets={() => { setRoute('reports'); setView('budgets') }}
        />
      )
    }

    if (route === 'reports') {
      if (view === 'annual') return <MobileAnnual mkey={mkey} />
      if (view === 'subscriptions') return <MobileSubscriptions />
      if (view === 'debt') return <MobileDebt />
      const renderer = mobileViews[view]
      if (renderer) {
        return (
          <ViewErrorBoundary resetKey={`${route}:${view}`}>
            {renderer(viewProps)}
          </ViewErrorBoundary>
        )
      }
      return <MobileReports goto={v => setView(v)} onImport={() => setCsvOpen(true)} mkey={mkey} />
    }

    if (route === 'profile') {
      return (
        <MobileProfile
          userName={userName}
          onSettings={onSettings}
          createRequest={viewProps.createRequest}
          goto={next => { setRoute('reports'); setView(next) }}
        />
      )
    }

    return null
  }

  return (
    <main className="mobile-shell">
      {csvOpen && (
        <Suspense fallback={null}>
          <MobileCSVImport onClose={() => setCsvOpen(false)} />
        </Suspense>
      )}
      {currencyOpen && <MobileCurrencySheet onClose={() => setCurrencyOpen(false)} />}
      <MobileTopBar
        route={route}
        mkey={mkey}
        title={route === 'reports' ? INTERNAL_TITLES[view] : undefined}
        canGoBack={mIdx > 0}
        canGoForward={mIdx >= 0 && mIdx < keys.length - 1}
        onPrevMonth={() => mIdx > 0 && onMonth(keys[mIdx - 1])}
        onNextMonth={() => mIdx >= 0 && mIdx < keys.length - 1 && onMonth(keys[mIdx + 1])}
        onSettings={onSettings}
        onCurrency={() => setCurrencyOpen(true)}
      />
      {route === 'add' ? (
        renderMain()
      ) : (
        <>
          <div className="mobile-content">
            {renderMain()}
          </div>
          <MobileBottomNav route={route} onRoute={goRoute}
            onQuickAdd={mode => { setQuickAddMode(mode); setRoute('add') }} />
        </>
      )}
    </main>
  )
}
