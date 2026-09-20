import { listRecoverySnapshots } from './recovery'
import { accountMovementsTotal, accountSecondaryMovementsTotal } from './helpers'
import { isSessionStoredInPlaintext } from '@/lib/secureAuthStorage'
import type { FinanceState } from '@/store/finance'

export interface DataHealthStatus {
  accounts: number
  transactions: number
  categories: number
  goals: number
  recoveryPoints: number
  lastRecoveryAt?: string
  lastRecoveryReason?: string
  lastCloudBackupAt?: string
  lastSyncAt?: string
  riskLevel: 'ok' | 'warning'
  warnings: string[]
  driftedAccounts: number
  driftedSecondary: number
  driftedGoals: number
  sessionStoredInPlaintext: boolean
}

export function getDataHealthStatus(state: FinanceState, userId?: string): DataHealthStatus {
  const snapshots = listRecoverySnapshots()
  const warnings: string[] = []
  const latest = snapshots[0]
  const lastCloudBackupAt = userId ? localStorage.getItem(`sharky-cloud-backup-last-v1:${userId}`) ?? undefined : undefined
  const lastSyncAt = userId ? readCloudSyncAt(userId) : undefined

  if (!snapshots.length) warnings.push('No hay puntos de recuperacion locales.')
  if (state.transactions.length > 0 && !lastCloudBackupAt) warnings.push('No hay backup cloud reciente registrado.')
  if (state.accounts.length === 0) warnings.push('No hay cuentas configuradas.')
  if (state.categories.length === 0) warnings.push('No hay categorias configuradas.')

  // Deriva de saldos: el saldo guardado no coincide con apertura + movimientos.
  const driftedAccounts = state.accounts.reduce((n, account) => {
    if (account.openingBalance === undefined) return n
    const expected = account.openingBalance + accountMovementsTotal(account.id, state.transactions, state.goalContributions)
    return Math.abs(expected - account.balance) > 0.005 ? n + 1 : n
  }, 0)
  if (driftedAccounts > 0) warnings.push(`${driftedAccounts} cuenta(s) con saldo descuadrado.`)

  // Deriva del SEGUNDO libro de una tarjeta. Se cuenta aparte: una tarjeta
  // cuyo saldo en dolares derivo pero el de pesos no, tambien esta rota, y
  // antes no habia forma de verlo.
  const driftedSecondary = state.accounts.reduce((n, account) => {
    if (account.type !== 'credit' || !account.secondaryCurrency) return n
    if (account.secondaryOpeningBalance === undefined) return n
    const expected = account.secondaryOpeningBalance + accountSecondaryMovementsTotal(account.id, state.transactions)
    return Math.abs(expected - (account.secondaryBalance ?? 0)) > 0.005 ? n + 1 : n
  }, 0)
  if (driftedSecondary > 0) warnings.push(`${driftedSecondary} tarjeta(s) con el saldo en divisa extranjera descuadrado.`)

  // Deriva de metas: el ahorro guardado no coincide con apertura + aportes.
  const driftedGoals = state.goals.reduce((n, goal) => {
    if (goal.openingSaved === undefined) return n
    const contributed = state.goalContributions
      .filter(contribution => contribution.goalId === goal.id)
      .reduce((sum, contribution) => sum + contribution.amount, 0)
    const expected = goal.openingSaved + contributed
    return Math.abs(expected - goal.saved) > 0.005 ? n + 1 : n
  }, 0)
  if (driftedGoals > 0) warnings.push(`${driftedGoals} meta(s) con ahorro descuadrado.`)

  // Respaldo silencioso: el Keystore de Android falló y la sesión quedó sin
  // cifrar en el sandbox privado de la app — antes esto no se mostraba en
  // ningún lado.
  const sessionStoredInPlaintext = isSessionStoredInPlaintext()
  if (sessionStoredInPlaintext) warnings.push('La sesión se guardó sin cifrar (el Keystore del dispositivo no está disponible).')

  return {
    accounts: state.accounts.length,
    transactions: state.transactions.length,
    categories: state.categories.length,
    goals: state.goals.length,
    recoveryPoints: snapshots.length,
    lastRecoveryAt: latest?.createdAt,
    lastRecoveryReason: latest?.reason,
    lastCloudBackupAt,
    lastSyncAt,
    riskLevel: warnings.length ? 'warning' : 'ok',
    warnings,
    driftedAccounts,
    driftedSecondary,
    driftedGoals,
    sessionStoredInPlaintext,
  }
}

function readCloudSyncAt(userId: string): string | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(`sharky-cloud-sync-v1:${userId}`) ?? '{}') as { lastSyncAt?: string }
    return value.lastSyncAt
  } catch {
    return undefined
  }
}
