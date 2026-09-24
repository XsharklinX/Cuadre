import { lazy, Suspense, useEffect, useState } from 'react'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { currentMonthKey, monthKeys } from '@/data/helpers'
import { ToastHost } from '@/components/ui/Toast'
import { deleteWithUndo } from '@/lib/undoDelete'
import { DialogProvider } from '@/components/ui/DialogProvider'
import { useRecurring } from '@/hooks/useRecurring'
import { useGoalAutoContributions } from '@/hooks/useGoalAutoContributions'
import { useNotifications } from '@/hooks/useNotifications'
import { useUpcomingPaymentAlerts } from '@/hooks/useUpcomingPaymentAlerts'
import { useNotificationActions } from '@/hooks/useNotificationActions'
import { useLocalReminders } from '@/hooks/useLocalReminders'
import { useBankNotifications } from '@/hooks/useBankNotifications'
import { useHomeWidget } from '@/hooks/useHomeWidget'
import { useSharedReceipt } from '@/hooks/useSharedReceipt'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { useAndroidChrome } from '@/hooks/useAndroidChrome'
import { useAppShortcut } from '@/hooks/useAppShortcut'
import { useNotificationTarget } from '@/hooks/useNotificationTarget'
import { useAutoBackup } from '@/hooks/useAutoBackup'
import { useScheduledBackup } from '@/hooks/useScheduledBackup'
import { useWeeklyAutoBackup } from '@/hooks/useWeeklyAutoBackup'
import { useUpdateCheck } from '@/hooks/useUpdateCheck'
import { useLiveExchangeRates } from '@/hooks/useLiveExchangeRates'
import { useAppLockHydration } from '@/hooks/useAppLockHydration'
import { MobileBiometricGate } from '@/mobile/MobileBiometricGate'
import { MobilePinGate } from '@/mobile/MobilePinGate'
import { MobilePatternGate } from '@/mobile/MobilePatternGate'
import { MobileShell } from '@/mobile/MobileShell'
import { MobileRatingPrompt } from '@/mobile/MobileRatingPrompt'
import { useRatingPrompt } from '@/hooks/useRatingPrompt'
import { useStartupPrompts } from '@/hooks/useStartupPrompts'
import { useWhatsNew } from '@/hooks/useWhatsNew'
import { MobileBatteryGuide } from '@/mobile/MobileBatteryGuide'
import { MobileCardRescue } from '@/mobile/MobileCardRescue'
import { MobileWhatsNew } from '@/mobile/MobileWhatsNew'
import { useExitConfirm } from '@/mobile/useExitConfirm'
import { useMobileBackDismiss } from '@/mobile/useMobileBackDismiss'
import type { Sheet } from '@/mobile/settings/shared'
import type { Transaction, ViewId, ViewProps } from '@/types'

// Diferidas: no hacen falta en el primer render de Movimientos. Se cargan al
// abrirlas (agregar, engranaje, navegar a Presupuestos/Metas, onboarding), lo
// que reduce el bundle inicial y el tiempo hasta interactivo en gama baja.
const MobileWelcomeHub = lazy(() => import('@/mobile/MobileWelcomeHub').then(m => ({ default: m.MobileWelcomeHub })))
const TransactionForm = lazy(() => import('@/modals/TransactionForm').then(m => ({ default: m.TransactionForm })))
const MobileUpdateDialog = lazy(() => import('@/mobile/MobileUpdateDialog').then(m => ({ default: m.MobileUpdateDialog })))
const MobileSettings = lazy(() => import('@/mobile/MobileSettings').then(m => ({ default: m.MobileSettings })))
const MobileBudgets = lazy(() => import('@/mobile/MobileBudgets').then(m => ({ default: m.MobileBudgets })))
const MobileGoals = lazy(() => import('@/mobile/MobileGoals').then(m => ({ default: m.MobileGoals })))

const CalendarView = lazy(() => import('@/views/Calendar').then(m => ({ default: m.Calendar })))
const MobileNotesView = lazy(() => import('@/mobile/MobileNotes').then(m => ({ default: m.MobileNotes })))

export default function App() {
  const s = useSettings()
  const t = useT()
  const { transactions, addTx, deleteTx } = useFinance()

  const { hydrated } = useAppLockHydration()

  const hasAppLock = !!(s.appPin || s.appPattern)
  const [bioUnlocked, setBioUnlocked]  = useState(!s.requireBiometric)
  const [credUnlocked, setCredUnlocked] = useState(!hasAppLock)
  const [view,         setView]         = useState<ViewId>('dashboard')
  const [mkey,         setMkey]         = useState(currentMonthKey())
  const [txForm,       setTxForm]       = useState<Transaction | 'new' | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsInitialSheet, setSettingsInitialSheet] = useState<Sheet | null>(null)


  // Primer arranque: adoptar el idioma del dispositivo si el usuario aún no
  // pasó por el onboarding (después de eso, respetamos su elección manual).
  useEffect(() => {
    if (!hydrated || s.languageAutoDetected) return
    if (!s.hasSeenOnboarding) {
      const deviceLang = navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'es'
      s.setLanguage(deviceLang)
    }
    s.setLanguageAutoDetected(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, s.languageAutoDetected, s.hasSeenOnboarding])

  // Tras hidratar el PIN/patrón cifrados (Android), re-bloquear si corresponde:
  // `credUnlocked` se inicializó antes de conocer el valor real de `hasAppLock`.
  useEffect(() => {
    if (hydrated && hasAppLock) setCredUnlocked(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  useRecurring()
  useGoalAutoContributions()
  useExitConfirm()
  useNotifications()
  useUpcomingPaymentAlerts()
  useNotificationActions()
  useLocalReminders()
  useHomeWidget()
  // Vive en la raíz (no solo dentro de Ajustes > Detección de transacciones):
  // si el listener solo existiera mientras esa pantalla está montada, cualquier
  // notificación bancaria que llegue en otro momento se pierde sin dejar rastro.
  useBankNotifications()
  const [sharedReceipt, consumeSharedReceipt] = useSharedReceipt()
  const [appShortcut, consumeAppShortcut] = useAppShortcut()
  const [notificationTarget, consumeNotificationTarget] = useNotificationTarget()
  useAutoBackup()
  // Backup semanal: en Android lo ejecuta WorkManager aunque la app esté
  // cerrada (useScheduledBackup mantiene el archivo al día y programa el
  // worker). useWeeklyAutoBackup es el respaldo para desktop/PWA, donde no hay
  // WorkManager: ahí sigue corriendo al abrir la app.
  useScheduledBackup()
  useWeeklyAutoBackup()
  useLiveExchangeRates()
  // Valoracion: se evalua una vez por sesion, con retraso, y solo si el usuario
  // ya lleva tiempo usando la app de verdad (ver `data/ratingPrompt.ts`).
  const whatsNew = useWhatsNew()
  /* Los avisos de arranque van ANTES que la valoracion: pedir una estrella
     encima de "tu tarjeta esta mal capturada" es pedirla en el peor momento
     posible. */
  const startup = useStartupPrompts(whatsNew.open)
  const rating = useRatingPrompt(whatsNew.open || !!startup.rescue || startup.battery)
  /*
   * La actualizacion va la ULTIMA de la cola de arranque.
   *
   * No porque importe menos —importa mas que ninguna—, sino porque es la unica
   * que puede tomar la pantalla completa. Lanzarla encima de "tu tarjeta esta
   * mal capturada" seria enterrar un aviso sobre el dinero de alguien debajo
   * de una descarga.
   */
  const updateOffer = useUpdateCheck(
    whatsNew.open || !!startup.rescue || startup.battery || rating.open,
  )
  // Cerrado en ESTA sesion. Que vuelva a ofrecerse en la siguiente lo decide
  // el aplazamiento persistido, no esta bandera.
  const [updateDismissed, setUpdateDismissed] = useState(false)

  const overlayOpen = !!txForm || settingsOpen
  useMobileBackDismiss(overlayOpen, () => {
    if (settingsOpen) {
      setSettingsOpen(false)
      setSettingsInitialSheet(null)
    }
    else if (txForm) setTxForm(null)
  })

  const resolvedTheme = useResolvedTheme()
  const isAndroidShell = /android/i.test(navigator.userAgent)
  useAndroidChrome(resolvedTheme, isAndroidShell)
  const themeProps = {
    'data-theme':   resolvedTheme,
    'data-density': s.density,
    // `--fs` escala toda la UI (zoom en `.app`, ver base.css). Las alturas de
    // viewport (100dvh/100vw) se dividen por él para que el zoom no desborde.
    style: {
      '--accent': s.accent,
      '--fs': s.fontScale,
      fontFamily: `"${s.font}", system-ui, sans-serif`,
    } as React.CSSProperties,
  }

  if (!hydrated) return <div className="app mobile-app" {...themeProps} />

  if (s.requireBiometric && !bioUnlocked) return (
    <div className="app mobile-app" {...themeProps}>
      <MobileBiometricGate
        onUnlocked={() => setBioUnlocked(true)}
        onUnavailable={() => setBioUnlocked(true)}
      />
    </div>
  )

  if (hasAppLock && !credUnlocked) return (
    <div className="app mobile-app" {...themeProps}>
      {s.appPattern
        ? <MobilePatternGate pattern={s.appPattern} onUnlocked={() => setCredUnlocked(true)} />
        : <MobilePinGate pin={s.appPin!} onUnlocked={() => setCredUnlocked(true)} />}
    </div>
  )

  if (!s.hasSeenOnboarding) return (
    <div className="app mobile-app" {...themeProps}>
      <Suspense fallback={null}><MobileWelcomeHub /></Suspense>
    </div>
  )

  const keys = monthKeys(transactions)

  const handleDeleteTx = (id: string) => {
    const tx = transactions.find(t => t.id === id)
    if (!tx) return
    deleteWithUndo({
      message: t('movementDeleted'),
      onDelete: () => deleteTx(id),
      onRestore: () => addTx(tx),
    })
  }

  const handleEditTx = (tx: Transaction) => {
    setTxForm(tx)
  }

  const viewProps: ViewProps = {
    txns:       transactions,
    mkey,
    onAdd:      () => setTxForm('new'),
    goto:       setView,
    onEditTx:   handleEditTx,
    onDeleteTx: handleDeleteTx,
    createRequest: undefined,
  }

  const mobileViews = {
    budgets: (props: ViewProps) => (
      <Suspense fallback={null}><MobileBudgets {...props} /></Suspense>
    ),
    goals: (props: ViewProps) => (
      <Suspense fallback={null}><MobileGoals {...props} /></Suspense>
    ),
    notes: (props: ViewProps) => (
      <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)' }}>{t('loading')}</div>}>
        <MobileNotesView {...props} />
      </Suspense>
    ),
    calendar: (props: ViewProps) => (
      <Suspense fallback={<div style={{ padding: 24, color: 'var(--text-dim)' }}>{t('loading')}</div>}>
        <CalendarView {...props} />
      </Suspense>
    ),
  } as const

  return (
    <div className="app mobile-app" {...themeProps}>
      <DialogProvider>
        <MobileShell
          view={view}
          setView={setView}
          viewProps={viewProps}
          mobileViews={mobileViews}
          mkey={mkey}
          keys={keys}
          onMonth={setMkey}
          onSettings={(sheet) => {
            setSettingsInitialSheet(sheet ?? null)
            setSettingsOpen(true)
          }}
          onEditTx={handleEditTx}
          userName={s.displayName || undefined}
          sharedReceipt={sharedReceipt}
          onConsumeSharedReceipt={consumeSharedReceipt}
          appShortcut={appShortcut}
          onConsumeAppShortcut={consumeAppShortcut}
          notificationTarget={notificationTarget}
          onConsumeNotificationTarget={consumeNotificationTarget}
        />
        <ToastHost />
        {whatsNew.open && <MobileWhatsNew onClose={whatsNew.close} highlightLatest />}
        {!whatsNew.open && startup.rescue && (
          <MobileCardRescue candidate={startup.rescue} onClose={startup.dismissRescue} />
        )}
        {!whatsNew.open && !startup.rescue && startup.battery && (
          <MobileBatteryGuide onClose={startup.dismissBattery} />
        )}
        {rating.open && (
          <MobileRatingPrompt
            onRated={rating.rated}
            onSnooze={rating.close}
            onFeedback={() => { setSettingsInitialSheet('comments'); setSettingsOpen(true) }}
          />
        )}
        <Suspense fallback={null}>
          {/* Cuándo y cómo se ofrece lo decide `data/updatePrompt.ts`; aquí
              solo se pinta lo que ya se decidió mostrar. */}
          {updateOffer && !updateDismissed && (
            <MobileUpdateDialog offer={updateOffer} onDismiss={() => setUpdateDismissed(true)} />
          )}
          {txForm && <TransactionForm value={txForm} mkey={mkey} onClose={() => setTxForm(null)} onDelete={handleDeleteTx} />}
          {settingsOpen && (
            <MobileSettings
              mkey={mkey}
              initialSheet={settingsInitialSheet}
              onClose={() => {
                setSettingsOpen(false)
                setSettingsInitialSheet(null)
              }}
            />
          )}
        </Suspense>
      </DialogProvider>
    </div>
  )
}
