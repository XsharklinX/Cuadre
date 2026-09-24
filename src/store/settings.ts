import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ThemeName, DensityName, OverdraftPolicy } from '@/types'
import { isAndroidTauri } from '@/lib/secureBlob'
import { saveAppLock } from '@/lib/appLockStorage'
import { EMPTY_SNOOZE, type SnoozeState } from '@/data/updatePrompt'
import { setPrivacyMasked } from '@/data/helpers'
import type { ReminderKind } from '@/data/reminderKinds'

interface SettingsState {
  theme:             ThemeName
  accent:            string
  density:           DensityName
  font:              string
  showSidebarLabels: boolean
  authEnabled:       boolean
  overdraftPolicy:   OverdraftPolicy
  budgetAlertThresholds: number[]
  anomalySensitivity: 'strict' | 'balanced' | 'relaxed'
  anomalyAlertsEnabled: boolean
  releaseChannel: 'stable' | 'beta'
  errorTelemetryEnabled: boolean
  displayName: string
  /** Data URL (JPEG, ya recortada a cuadrado y reducida) de la foto de perfil; `null` = usar la inicial del nombre. */
  profilePhoto: string | null
  language: 'en' | 'es'
  languageAutoDetected: boolean
  requireBiometric: boolean
  appPin: string | null
  appPattern: string | null
  soundsEnabled: boolean
  soundProfile: 'silent' | 'soft' | 'full'
  soundVolume: number
  /** Vibración al tocar/confirmar/borrar. Independiente del sonido: en modo
   *  silencio la vibración es justo lo que sustituye al audio, así que no debe
   *  apagarse con él. */
  hapticsEnabled: boolean
  /** Escala del tamaño de fuente / de toda la UI (1 = normal). Se aplica como
   *  `zoom` en la raíz, así que agranda texto Y espaciado de forma uniforme. */
  fontScale: number
  compactNumbers: boolean
  dismissedAlerts: string[]
  /**
   * Cuántas veces y cuándo se pospuso el aviso de actualizar.
   *
   * Va aquí y no en `dismissedAlerts` porque no es un "ya lo vi": es un
   * historial con el que se decide cuánto insistir. Ver `data/updatePrompt.ts`.
   */
  updateSnooze: SnoozeState
  /**
   * MODO PRIVADO: los montos salen tapados (•••) en toda la app.
   *
   * Abrir la app de tus finanzas en la guagua, en la fila del banco o con
   * alguien al lado significa enseñarle a un desconocido cuanto ganas y cuanto
   * debes. Hasta ahora la unica defensa era el bloqueo con PIN, que es todo o
   * nada: o no ves nada, o lo ve todo el mundo.
   *
   * Tapa solo las CIFRAS. Las categorias, las fechas y los conceptos se
   * quedan: se puede seguir usando la app con normalidad.
   */
  privacyMode: boolean
  /**
   * Calcular el 0.15% de la Ley 288-04 en los gastos pagados desde una cuenta
   * de banco.
   *
   * Encendido por defecto: el banco lo retiene, asi que no contarlo deja el
   * libro con mas dinero del que hay. Pero se puede apagar — no todos los
   * bancos lo aplican igual en todas las operaciones, y es peor pelear con la
   * app que dejar que el usuario decida.
   */
  lawTaxEnabled: boolean
  /**
   * Como se ven las tarjetas en Cuentas.
   *
   * El carrusel luce con tres y estorba con nueve: hay que deslizar a ciegas
   * para encontrar una. La lista enseña todas de golpe. No hay una respuesta
   * buena para todo el mundo, asi que decide el usuario.
   */
  cardsView: 'carousel' | 'list'
  /**
   * Descuadres de Salud de datos que el usuario ya revisó y da por buenos.
   *
   * Guarda la huella del descuadre CONCRETO (cuenta + importe), no la cuenta:
   * si la diferencia cambia, vuelve a avisar. Ver `data/healthDismissals.ts`.
   */
  dismissedDrifts: string[]
  /**
   * Pagos recurrentes (ids de plantilla) que no deben volver a avisar NUNCA.
   * Va aparte de `dismissedAlerts` porque aquel descarta por ocurrencia
   * (`recurring:{id}:{fecha}`) y el aviso reaparecía al mes siguiente con id
   * nueva — para un cargo que el usuario hace a mano y ya tiene controlado,
   * eso es ruido permanente.
   */
  silencedRecurring: string[]
  notifiedAlerts: string[]
  hasSeenOnboarding: boolean
  remindersEnabled: boolean
  /**
   * QUE avisos quieres, uno por uno.
   *
   * `remindersEnabled` era todo o nada: a quien le molestaba el resumen
   * semanal solo le quedaba apagarlo TODO, incluido el aviso de que se pasa
   * del presupuesto. Un interruptor unico para ocho cosas distintas se acaba
   * apagando por la mas molesta, y con el se van las siete utiles.
   *
   * Ausente = encendido, para que las instalaciones existentes no pierdan
   * avisos al actualizar.
   */
  reminderKinds: Partial<Record<ReminderKind, boolean>>
  quickAddNotification: boolean
  /** Muestra la fila de "Rápidos" en el formulario de crear. Hay quien prefiere
   *  el formulario limpio; se puede apagar. */
  quickAddsEnabled: boolean
  /** Cómo tratar las cuentas marcadas como "no incluidas" (ocultas). El usuario
   *  decide dónde aparecen: sus movimientos en la lista, su saldo en el balance
   *  total y sus montos en el resumen de ingresos/gastos del mes. */
  hiddenShowInMovements: boolean
  hiddenCountInBalance: boolean
  hiddenCountInSummary: boolean
  /** Global: arrastra el sobrante/exceso de CADA presupuesto al mes siguiente. */
  budgetRollover: boolean
  widgetAccountIds: string[]
  /** Cuándo se guardó la última copia MANUAL (ISO). El backup semanal usa
   *  lastWeeklyBackupAt; la tarjeta de estado toma la más reciente de las dos. */
  lastManualBackupAt: string | null
  /** Colchón que se aparta del "seguro para gastar" en Flujo de caja. 0 = sin colchón. */
  cashflowBuffer: number
  lastWeeklyBackupAt: string | null
  weeklyAutoBackupEnabled: boolean
  weeklyAutoBackupDay: number
  weeklyAutoBackupHour: number
  /** Carpeta destino elegida por el usuario para el backup (manual y automático). `null` = predeterminada ("Cuadre"). */
  weeklyBackupFolder: string | null
  fxAlertEnabled: boolean
  fxAlertCurrency: string
  fxAlertThreshold: number
  fxAlertDirection: 'above' | 'below'

  setTheme:             (v: ThemeName)  => void
  setAccent:            (v: string)     => void
  setDensity:           (v: DensityName)=> void
  setFont:              (v: string)     => void
  setShowSidebarLabels: (v: boolean)    => void
  setAuthEnabled:       (v: boolean)    => void
  setOverdraftPolicy:   (v: OverdraftPolicy) => void
  setBudgetAlertThresholds: (v: number[]) => void
  setAnomalySensitivity: (v: SettingsState['anomalySensitivity']) => void
  setAnomalyAlertsEnabled: (v: boolean) => void
  setReleaseChannel: (v: SettingsState['releaseChannel']) => void
  setErrorTelemetryEnabled: (v: boolean) => void
  setDisplayName: (v: string) => void
  setProfilePhoto: (v: string | null) => void
  setLanguage: (v: 'en' | 'es') => void
  setLanguageAutoDetected: (v: boolean) => void
  setRequireBiometric: (v: boolean) => void
  setAppPin: (v: string | null) => void
  setAppPattern: (v: string | null) => void
  setSoundsEnabled: (v: boolean) => void
  setSoundProfile: (v: SettingsState['soundProfile']) => void
  setHapticsEnabled: (v: boolean) => void
  setFontScale: (v: number) => void
  setSoundVolume: (v: number) => void
  setCompactNumbers: (v: boolean) => void
  dismissAlert: (id: string) => void
  setUpdateSnooze: (value: SnoozeState) => void
  togglePrivacyMode: () => void
  setLawTaxEnabled: (v: boolean) => void
  setCardsView: (v: 'carousel' | 'list') => void
  dismissDrift: (key: string) => void
  /** Devuelve todos a la vista. */
  restoreDrifts: () => void
  /** Suelta las huellas que ya no corresponden a ningún descuadre vivo. */
  pruneDrifts: (liveKeys: string[]) => void
  silenceRecurring: (transactionId: string) => void
  unsilenceRecurring: (transactionId: string) => void
  markAlertNotified: (id: string) => void
  markOnboardingSeen: () => void
  setReminderKind: (kind: ReminderKind, on: boolean) => void
  setRemindersEnabled: (v: boolean) => void
  setQuickAddNotification: (v: boolean) => void
  setQuickAddsEnabled: (v: boolean) => void
  setHiddenShowInMovements: (v: boolean) => void
  setHiddenCountInBalance: (v: boolean) => void
  setHiddenCountInSummary: (v: boolean) => void
  setBudgetRollover: (v: boolean) => void
  setWidgetAccountIds: (ids: string[]) => void
  setLastWeeklyBackupAt: (v: string | null) => void
  setLastManualBackupAt: (v: string | null) => void
  setCashflowBuffer: (v: number) => void
  setWeeklyAutoBackupEnabled: (v: boolean) => void
  setWeeklyAutoBackupDay: (v: number) => void
  setWeeklyAutoBackupHour: (v: number) => void
  setWeeklyBackupFolder: (v: string | null) => void
  setFxAlertEnabled:    (v: boolean) => void
  setFxAlertCurrency:   (v: string) => void
  setFxAlertThreshold:  (v: number) => void
  setFxAlertDirection:  (v: 'above' | 'below') => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme:             'dark',
      accent:            '#3b82f6',
      density:           'regular',
      font:              'Plus Jakarta Sans',
      showSidebarLabels: true,
      authEnabled:       false,   // por defecto sin login
      overdraftPolicy:   'warn',
      budgetAlertThresholds: [50, 80, 100],
      anomalySensitivity: 'balanced',
      anomalyAlertsEnabled: false, // opt-in: hay que calibrar sensibilidad con uso real antes de avisar
      releaseChannel: 'stable',
      errorTelemetryEnabled: false,
      displayName: '',
      profilePhoto: null,
      language: 'es',
      languageAutoDetected: false,
      requireBiometric: false,
      appPin: null,
      appPattern: null,
      soundsEnabled: true,
      hapticsEnabled: true,
      fontScale: 1,
      soundProfile: 'soft',
      soundVolume: 0.55,
      compactNumbers: false,
      dismissedAlerts: [],
      updateSnooze: EMPTY_SNOOZE,
      privacyMode: false,
      lawTaxEnabled: true,
      cardsView: 'carousel',
      dismissedDrifts: [],
      silencedRecurring: [],
      notifiedAlerts: [],
      hasSeenOnboarding: false,
      remindersEnabled: true,
      reminderKinds: {},
      quickAddNotification: false,
      quickAddsEnabled: true,
      hiddenShowInMovements: true,
      hiddenCountInBalance: false,
      hiddenCountInSummary: false,
      budgetRollover: false,
      widgetAccountIds: [],
      lastManualBackupAt: null,
      cashflowBuffer: 0,
      lastWeeklyBackupAt: null,
      weeklyAutoBackupEnabled: true,
      weeklyAutoBackupDay: 1,
      weeklyAutoBackupHour: 3,
      weeklyBackupFolder: null,
      fxAlertEnabled: false,
      fxAlertCurrency: 'USD',
      fxAlertThreshold: 60,
      fxAlertDirection: 'above',

      setTheme:             (theme)             => set({ theme }),
      setAccent:            (accent)            => set({ accent }),
      setDensity:           (density)           => set({ density }),
      setFont:              (font)              => set({ font }),
      setShowSidebarLabels: (showSidebarLabels) => set({ showSidebarLabels }),
      setAuthEnabled:       (authEnabled)       => set({ authEnabled }),
      setOverdraftPolicy:   (overdraftPolicy)   => set({ overdraftPolicy }),
      setBudgetAlertThresholds: (budgetAlertThresholds) => set({ budgetAlertThresholds }),
      setAnomalySensitivity: (anomalySensitivity) => set({ anomalySensitivity }),
      setAnomalyAlertsEnabled: (anomalyAlertsEnabled) => set({ anomalyAlertsEnabled }),
      setReleaseChannel: (releaseChannel) => set({ releaseChannel }),
      setErrorTelemetryEnabled: (errorTelemetryEnabled) => set({ errorTelemetryEnabled }),
      setDisplayName: (displayName) => set({ displayName }),
      setProfilePhoto: (profilePhoto) => set({ profilePhoto }),
      setLanguage: (language) => set({ language }),
      setLanguageAutoDetected: (languageAutoDetected) => set({ languageAutoDetected }),
      setRequireBiometric: (requireBiometric) => set({ requireBiometric }),
      setAppPin: (appPin) => set(state => {
        const appPattern = appPin ? null : state.appPattern
        void saveAppLock(appPin, appPattern)
        return {
          appPin,
          appPattern,
          requireBiometric: state.requireBiometric && !!(appPin || appPattern),
        }
      }),
      setAppPattern: (appPattern) => set(state => {
        const appPin = appPattern ? null : state.appPin
        void saveAppLock(appPin, appPattern)
        return {
          appPattern,
          appPin,
          requireBiometric: state.requireBiometric && !!(appPattern || appPin),
        }
      }),
      setSoundsEnabled: (soundsEnabled) => set({ soundsEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      // Se limita a un rango sensato: por debajo de 0.85 se vuelve ilegible, por
      // encima de 1.35 empieza a apretar los controles fijos.
      setFontScale: (fontScale) => set({ fontScale: Math.min(1.35, Math.max(0.85, Math.round(fontScale * 100) / 100)) }),
      setSoundProfile: (soundProfile) => set({
        soundProfile,
        soundsEnabled: soundProfile !== 'silent',
        soundVolume: soundProfile === 'silent' ? 0 : soundProfile === 'soft' ? 0.45 : 0.8,
      }),
      setSoundVolume: (soundVolume) => set({ soundVolume: Math.min(1, Math.max(0, soundVolume)) }),
      setCompactNumbers: (compactNumbers) => set({ compactNumbers }),
      dismissAlert: (id) => set(state =>
        state.dismissedAlerts.includes(id) ? state : { dismissedAlerts: [...state.dismissedAlerts, id] }),
      setUpdateSnooze: (updateSnooze) => set({ updateSnooze }),
      setLawTaxEnabled: (lawTaxEnabled) => set({ lawTaxEnabled }),
      setCardsView: (cardsView) => set({ cardsView }),
      dismissDrift: (key) => set(state => state.dismissedDrifts.includes(key)
        ? state
        : { dismissedDrifts: [...state.dismissedDrifts, key] }),
      restoreDrifts: () => set({ dismissedDrifts: [] }),
      pruneDrifts: (liveKeys) => set(state => {
        const next = state.dismissedDrifts.filter(k => liveKeys.includes(k))
        return next.length === state.dismissedDrifts.length ? state : { dismissedDrifts: next }
      }),
      togglePrivacyMode: () => set(state => {
        const privacyMode = !state.privacyMode
        // `fmt` no puede leer el store (lo llaman sitios sin React), asi que
        // se le empuja el valor. Ver `setPrivacyMasked` en data/helpers.
        setPrivacyMasked(privacyMode)
        return { privacyMode }
      }),
      silenceRecurring: (transactionId) => set(state =>
        state.silencedRecurring.includes(transactionId)
          ? state
          : { silencedRecurring: [...state.silencedRecurring, transactionId] }),
      unsilenceRecurring: (transactionId) => set(state =>
        ({ silencedRecurring: state.silencedRecurring.filter(id => id !== transactionId) })),
      markAlertNotified: (id) => set(state =>
        state.notifiedAlerts.includes(id) ? state : { notifiedAlerts: [...state.notifiedAlerts, id] }),
      markOnboardingSeen: () => set({ hasSeenOnboarding: true }),
      setRemindersEnabled: (remindersEnabled) => set({ remindersEnabled }),
      setReminderKind: (kind, on) => set(state => ({
        reminderKinds: { ...state.reminderKinds, [kind]: on },
      })),
      setQuickAddNotification: (quickAddNotification) => set({ quickAddNotification }),
      setQuickAddsEnabled: (quickAddsEnabled) => set({ quickAddsEnabled }),
      setHiddenShowInMovements: (hiddenShowInMovements) => set({ hiddenShowInMovements }),
      setHiddenCountInBalance: (hiddenCountInBalance) => set({ hiddenCountInBalance }),
      setHiddenCountInSummary: (hiddenCountInSummary) => set({ hiddenCountInSummary }),
      setBudgetRollover: (budgetRollover) => set({ budgetRollover }),
      setWidgetAccountIds: (widgetAccountIds) => set({ widgetAccountIds }),
      setLastWeeklyBackupAt: (lastWeeklyBackupAt) => set({ lastWeeklyBackupAt }),
      setLastManualBackupAt: (lastManualBackupAt) => set({ lastManualBackupAt }),
      setCashflowBuffer: (cashflowBuffer) => set({ cashflowBuffer: Math.max(0, cashflowBuffer) }),
      setWeeklyAutoBackupEnabled: (weeklyAutoBackupEnabled) => set({ weeklyAutoBackupEnabled }),
      setWeeklyAutoBackupDay: (weeklyAutoBackupDay) => set({ weeklyAutoBackupDay: Math.max(0, Math.min(6, weeklyAutoBackupDay)) }),
      setWeeklyAutoBackupHour: (weeklyAutoBackupHour) => set({ weeklyAutoBackupHour: Math.max(0, Math.min(23, weeklyAutoBackupHour)) }),
      setWeeklyBackupFolder: (weeklyBackupFolder) => set({ weeklyBackupFolder }),
      setFxAlertEnabled:   (fxAlertEnabled) => set({ fxAlertEnabled }),
      setFxAlertCurrency:  (fxAlertCurrency) => set({ fxAlertCurrency }),
      setFxAlertThreshold: (fxAlertThreshold) => set({ fxAlertThreshold: Math.max(0, fxAlertThreshold) }),
      setFxAlertDirection: (fxAlertDirection) => set({ fxAlertDirection }),
    }),
    {
      name:    'sharky-settings-v2',
      storage: createJSONStorage(() => localStorage),
      // En Android, el PIN/patrón se cifran por separado vía Android Keystore
      // (ver src/lib/appLockStorage.ts) y no deben quedar en texto plano aquí.
      partialize: (state) => {
        if (!isAndroidTauri()) return state
        const { appPin: _appPin, appPattern: _appPattern, ...rest } = state
        return rest as SettingsState
      },
      merge: (persisted, current) => {
        const p = persisted as Partial<SettingsState>
        const oldDark = ['midnight', 'slate', 'carbon']
        /*
         * ESTA LISTA HAY QUE AMPLIARLA AL AÑADIR UN TEMA.
         *
         * Se quedo en los cuatro originales cuando se añadieron Oceano,
         * Atardecer y Bosque: elegir uno funcionaba, pero al reabrir la app el
         * filtro no lo reconocia y lo devolvia al anterior. El tema parecia
         * "no guardarse" sin que nada fallara a la vista.
         *
         * `sand` NO esta: se retiro, y quien lo tuviera puesto cae al tema
         * oscuro en vez de quedarse con un tema que ya no existe.
         */
        const validThemes: ThemeName[] = [
          'dark', 'light', 'amoled', 'system', 'ocean', 'sunset', 'forest',
        ]
        const theme = oldDark.includes(p.theme as string)
          ? 'dark'
          : validThemes.includes(p.theme as ThemeName) ? (p.theme as ThemeName) : current.theme
        return { ...current, ...p, theme }
      },
      /*
       * El modo privado se guarda, asi que tiene que seguir tapando al
       * reabrir. Sin esto, `fmt` arrancaba con la bandera en false y los
       * montos salian a la vista un instante —o para siempre, hasta tocar el
       * interruptor— con el ajuste marcado como encendido.
       */
      onRehydrateStorage: () => (state) => {
        setPrivacyMasked(state?.privacyMode ?? false)
      },
    },
  ),
)
