import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ThemeName, DensityName, OverdraftPolicy } from '@/types'

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
  releaseChannel: 'stable' | 'beta'
  errorTelemetryEnabled: boolean
  displayName: string
  language: 'en' | 'es'
  requireBiometric: boolean
  appPin: string | null
  soundsEnabled: boolean
  soundVolume: number
  dismissedAlerts: string[]
  notifiedAlerts: string[]

  setTheme:             (v: ThemeName)  => void
  setAccent:            (v: string)     => void
  setDensity:           (v: DensityName)=> void
  setFont:              (v: string)     => void
  setShowSidebarLabels: (v: boolean)    => void
  setAuthEnabled:       (v: boolean)    => void
  setOverdraftPolicy:   (v: OverdraftPolicy) => void
  setBudgetAlertThresholds: (v: number[]) => void
  setAnomalySensitivity: (v: SettingsState['anomalySensitivity']) => void
  setReleaseChannel: (v: SettingsState['releaseChannel']) => void
  setErrorTelemetryEnabled: (v: boolean) => void
  setDisplayName: (v: string) => void
  setLanguage: (v: 'en' | 'es') => void
  setRequireBiometric: (v: boolean) => void
  setAppPin: (v: string | null) => void
  setSoundsEnabled: (v: boolean) => void
  setSoundVolume: (v: number) => void
  dismissAlert: (id: string) => void
  markAlertNotified: (id: string) => void
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
      releaseChannel: 'stable',
      errorTelemetryEnabled: false,
      displayName: '',
      language: 'es',
      requireBiometric: false,
      appPin: null,
      soundsEnabled: true,
      soundVolume: 1,
      dismissedAlerts: [],
      notifiedAlerts: [],

      setTheme:             (theme)             => set({ theme }),
      setAccent:            (accent)            => set({ accent }),
      setDensity:           (density)           => set({ density }),
      setFont:              (font)              => set({ font }),
      setShowSidebarLabels: (showSidebarLabels) => set({ showSidebarLabels }),
      setAuthEnabled:       (authEnabled)       => set({ authEnabled }),
      setOverdraftPolicy:   (overdraftPolicy)   => set({ overdraftPolicy }),
      setBudgetAlertThresholds: (budgetAlertThresholds) => set({ budgetAlertThresholds }),
      setAnomalySensitivity: (anomalySensitivity) => set({ anomalySensitivity }),
      setReleaseChannel: (releaseChannel) => set({ releaseChannel }),
      setErrorTelemetryEnabled: (errorTelemetryEnabled) => set({ errorTelemetryEnabled }),
      setDisplayName: (displayName) => set({ displayName }),
      setLanguage: (language) => set({ language }),
      setRequireBiometric: (requireBiometric) => set({ requireBiometric }),
      setAppPin: (appPin) => set({ appPin }),
      setSoundsEnabled: (soundsEnabled) => set({ soundsEnabled }),
      setSoundVolume: (soundVolume) => set({ soundVolume: Math.min(1, Math.max(0, soundVolume)) }),
      dismissAlert: (id) => set(state =>
        state.dismissedAlerts.includes(id) ? state : { dismissedAlerts: [...state.dismissedAlerts, id] }),
      markAlertNotified: (id) => set(state =>
        state.notifiedAlerts.includes(id) ? state : { notifiedAlerts: [...state.notifiedAlerts, id] }),
    }),
    {
      name:    'sharky-settings-v2',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = persisted as Partial<SettingsState>
        const oldDark = ['midnight', 'slate', 'carbon']
        const theme = oldDark.includes(p.theme as string) ? 'dark' : (p.theme === 'light' ? 'light' : current.theme)
        return { ...current, ...p, theme }
      },
    },
  ),
)
