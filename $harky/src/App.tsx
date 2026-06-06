import { lazy, Suspense, useEffect, useState } from 'react'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { currentMonthKey, monthKeys } from '@/data/helpers'
import { ToastHost, toast } from '@/components/ui/Toast'
import { DialogProvider } from '@/components/ui/DialogProvider'
import { CommandPalette } from '@/components/CommandPalette'
import { MobileWelcomeHub } from '@/mobile/MobileWelcomeHub'
import { MobileOnboarding } from '@/mobile/MobileOnboarding'
import { TransactionForm } from '@/modals/TransactionForm'
import { useRecurring } from '@/hooks/useRecurring'
import { useNotifications } from '@/hooks/useNotifications'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useCloudWorkspace } from '@/hooks/useCloudWorkspace'
import { useAutoCloudSync } from '@/hooks/useAutoCloudSync'
import { MobileShell } from '@/mobile/MobileShell'
import { MobileSettings } from '@/mobile/MobileSettings'
import { MobileSplash } from '@/mobile/MobileSplash'
import { MobileBudgets } from '@/mobile/MobileBudgets'
import { MobileGoals } from '@/mobile/MobileGoals'
import { useMobileBackDismiss } from '@/mobile/useMobileBackDismiss'
import type { Transaction, ViewId, ViewProps } from '@/types'

const Goals        = lazy(() => import('@/views/Goals').then(m => ({ default: m.Goals })))
const CalendarView = lazy(() => import('@/views/Calendar').then(m => ({ default: m.Calendar })))

export default function App() {
  const s = useSettings()
  const { transactions, accounts, currency, setCurrency, addTx, deleteTx } = useFinance()

  const [splashDone,   setSplashDone]   = useState(false)
  const [view,         setView]         = useState<ViewId>('dashboard')
  const [mkey,         setMkey]         = useState(currentMonthKey())
  const [txForm,       setTxForm]       = useState<Transaction | 'new' | null>(null)
  const [cmdOpen,      setCmdOpen]      = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useRecurring()
  useNotifications()
  useAutoBackup()
  useCloudWorkspace()
  useAutoCloudSync()

  const overlayOpen = !!txForm || cmdOpen || settingsOpen
  useMobileBackDismiss(overlayOpen, () => {
    if (settingsOpen) setSettingsOpen(false)
    else if (cmdOpen) setCmdOpen(false)
    else if (txForm) setTxForm(null)
  })

  const themeProps = {
    'data-theme':   s.theme,
    'data-density': s.density,
    style: { '--accent': s.accent, fontFamily: `"${s.font}", system-ui, sans-serif` } as React.CSSProperties,
  }

  const hasOnboarded = !!localStorage.getItem('sharky-finance-v2')
  if (!hasOnboarded) return (
    <div className="app mobile-app" {...themeProps}>
      <MobileWelcomeHub />
    </div>
  )

  if (accounts.length === 0) return (
    <div className="app mobile-app" {...themeProps}>
      <ToastHost />
      <MobileOnboarding onDone={() => setMkey(currentMonthKey())} />
    </div>
  )

  const keys = monthKeys(transactions)
  const mIdx = keys.indexOf(mkey)

  const handleDeleteTx = (id: string) => {
    const tx = transactions.find(t => t.id === id)
    if (!tx) return
    deleteTx(id)
    toast('Movimiento eliminado', {
      icon: 'trash',
      duration: 5000,
      action: { label: 'Deshacer', onClick: () => addTx(tx) },
    })
  }

  const viewProps: ViewProps = {
    txns:       transactions,
    mkey,
    onAdd:      () => setTxForm('new'),
    goto:       setView,
    onEditTx:   tx => setTxForm(tx),
    onDeleteTx: handleDeleteTx,
    createRequest: undefined,
  }

  const mobileViews = {
    budgets: (props: ViewProps) => <MobileBudgets {...props} />,
    goals: (props: ViewProps) => <MobileGoals {...props} />,
    calendar: (props: ViewProps) => (
      <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)' }}>Cargando...</div>}>
        <CalendarView {...props} />
      </Suspense>
    ),
  } as const

  return (
    <div className="app mobile-app" {...themeProps}>
      {!splashDone && <MobileSplash onGone={() => setSplashDone(true)} />}
      <DialogProvider>
        <MobileShell
          view={view}
          setView={setView}
          viewProps={viewProps}
          mobileViews={mobileViews}
          mkey={mkey}
          keys={keys}
          onMonth={setMkey}
          onSearch={() => setCmdOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onEditTx={tx => setTxForm(tx)}
          userName={s.displayName || undefined}
        />
        <ToastHost />
        {txForm       && <TransactionForm value={txForm} mkey={mkey} onClose={() => setTxForm(null)} onDelete={handleDeleteTx} />}
        {cmdOpen      && <CommandPalette onClose={() => setCmdOpen(false)} goto={v => { setView(v); setCmdOpen(false) }} onEditTx={tx => { setTxForm(tx); setCmdOpen(false) }} />}
        {settingsOpen && <MobileSettings onClose={() => setSettingsOpen(false)} />}
      </DialogProvider>
    </div>
  )
}
