import { lazy, Suspense, useEffect, useState } from 'react'
import { useFinance } from '@/store/finance'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { currentMonthKey, monthKeys } from '@/data/helpers'
import { ToastHost, toast } from '@/components/ui/Toast'
import { DialogProvider } from '@/components/ui/DialogProvider'
import { MobileWelcomeHub } from '@/mobile/MobileWelcomeHub'
import { MobileOnboarding } from '@/mobile/MobileOnboarding'
import { TransactionForm } from '@/modals/TransactionForm'
import { useRecurring } from '@/hooks/useRecurring'
import { useNotifications } from '@/hooks/useNotifications'
import { useNotificationActions } from '@/hooks/useNotificationActions'
import { useSharedReceipt } from '@/hooks/useSharedReceipt'
import { useAppShortcut } from '@/hooks/useAppShortcut'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useCloudWorkspace } from '@/hooks/useCloudWorkspace'
import { useAutoCloudSync } from '@/hooks/useAutoCloudSync'
import { useLiveExchangeRates } from '@/hooks/useLiveExchangeRates'
import { MobileBiometricGate } from '@/mobile/MobileBiometricGate'
import { MobilePinGate } from '@/mobile/MobilePinGate'
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

  const [bioUnlocked, setBioUnlocked]  = useState(!s.requireBiometric)
  const [pinUnlocked, setPinUnlocked]  = useState(!s.appPin)
  const [splashDone,   setSplashDone]   = useState(false)
  const [view,         setView]         = useState<ViewId>('dashboard')
  const [mkey,         setMkey]         = useState(currentMonthKey())
  const [txForm,       setTxForm]       = useState<Transaction | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const initializeAuth = useAuth(state => state.initialize)
  useEffect(() => { initializeAuth() }, [initializeAuth])

  useRecurring()
  useNotifications()
  useNotificationActions()
  const [sharedReceipt, consumeSharedReceipt] = useSharedReceipt()
  const [appShortcut, consumeAppShortcut] = useAppShortcut()
  useAutoBackup()
  useCloudWorkspace()
  useAutoCloudSync()
  useLiveExchangeRates()

  const overlayOpen = !!txForm || settingsOpen
  useMobileBackDismiss(overlayOpen, () => {
    if (settingsOpen) setSettingsOpen(false)
    else if (txForm) setTxForm(null)
  })

  const themeProps = {
    'data-theme':   s.theme,
    'data-density': s.density,
    style: { '--accent': s.accent, fontFamily: `"${s.font}", system-ui, sans-serif` } as React.CSSProperties,
  }

  if (s.requireBiometric && !bioUnlocked) return (
    <div className="app mobile-app" {...themeProps}>
      <MobileBiometricGate onUnlocked={() => setBioUnlocked(true)} />
    </div>
  )

  if (s.appPin && !pinUnlocked) return (
    <div className="app mobile-app" {...themeProps}>
      <MobilePinGate pin={s.appPin} onUnlocked={() => setPinUnlocked(true)} />
    </div>
  )

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
          onSettings={() => setSettingsOpen(true)}
          onEditTx={tx => setTxForm(tx)}
          userName={s.displayName || undefined}
          sharedReceipt={sharedReceipt}
          onConsumeSharedReceipt={consumeSharedReceipt}
          appShortcut={appShortcut}
          onConsumeAppShortcut={consumeAppShortcut}
        />
        <ToastHost />
        {txForm       && <TransactionForm value={txForm} mkey={mkey} onClose={() => setTxForm(null)} onDelete={handleDeleteTx} />}
        {settingsOpen && <MobileSettings mkey={mkey} onClose={() => setSettingsOpen(false)} />}
      </DialogProvider>
    </div>
  )
}
