import { useEffect, useRef } from 'react'
import { useCloudSync } from '@/data/cloudSync'
import { useAuth } from '@/store/auth'
import { useFinance, type FinanceState } from '@/store/finance'

type FinanceData = Pick<FinanceState, 'accounts' | 'transactions' | 'categories' | 'goals' | 'goalContributions' | 'currency'>

const LOCAL_WORKSPACE_KEY = 'sharky-workspace-local-v1'
const CLOUD_WORKSPACE_PREFIX = 'sharky-workspace-cloud-v1:'

function pickFinanceData(state: FinanceState): FinanceData {
  return {
    accounts: state.accounts,
    transactions: state.transactions,
    categories: state.categories,
    goals: state.goals,
    goalContributions: state.goalContributions ?? [],
    currency: state.currency,
  }
}

function saveWorkspace(key: string, data = pickFinanceData(useFinance.getState())): void {
  localStorage.setItem(key, JSON.stringify(data))
}

function readWorkspace(key: string): FinanceData | null {
  try {
    const value = localStorage.getItem(key)
    return value ? JSON.parse(value) as FinanceData : null
  } catch {
    return null
  }
}

function cloudWorkspaceKey(userId: string): string {
  return `${CLOUD_WORKSPACE_PREFIX}${userId}`
}

/** Borra el cache local del workspace cloud de un usuario (tras eliminar sus datos remotos). */
export function clearCloudWorkspaceCache(userId: string): void {
  localStorage.removeItem(cloudWorkspaceKey(userId))
}

export function useCloudWorkspace(): void {
  const user = useAuth(state => state.user)
  const activeCloudUser = useRef<string | null>(null)

  useEffect(() => {
    const nextCloudUser = user?.mode === 'cloud' && user.id ? user.id : null
    const previousCloudUser = activeCloudUser.current
    if (nextCloudUser === previousCloudUser) return

    if (previousCloudUser) saveWorkspace(cloudWorkspaceKey(previousCloudUser))
    else saveWorkspace(LOCAL_WORKSPACE_KEY)

    activeCloudUser.current = nextCloudUser
    useCloudSync.getState().loadForUser(nextCloudUser ?? undefined)

    if (nextCloudUser) {
      const cached = readWorkspace(cloudWorkspaceKey(nextCloudUser))
      if (cached) {
        // Usuario cloud conocido en este dispositivo: retomar su workspace.
        useFinance.getState().restoreBackup(cached)
      } else {
        // Primer inicio de sesión en este dispositivo: adoptar los datos
        // locales actuales como punto de partida del workspace cloud (lo que
        // el usuario espera: "conecto Google y mis datos se suben"). El sync
        // hará merge con lo que exista en la nube.
        saveWorkspace(cloudWorkspaceKey(nextCloudUser))
      }
      // Sync inicial sin esperar a que el usuario edite algo. Los errores se
      // toleran: el auto-sync reintenta con el debounce normal.
      void useCloudSync.getState().syncNow().catch(() => {})
    } else {
      const workspace = readWorkspace(LOCAL_WORKSPACE_KEY)
      if (workspace) useFinance.getState().restoreBackup(workspace)
    }
  }, [user?.id, user?.mode])

  useEffect(() => useFinance.subscribe(state => {
    const key = activeCloudUser.current ? cloudWorkspaceKey(activeCloudUser.current) : LOCAL_WORKSPACE_KEY
    saveWorkspace(key, pickFinanceData(state))
  }), [])
}
