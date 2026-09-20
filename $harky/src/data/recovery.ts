import { createBackup, parseBackup, type FinanceBackup } from './backup'
import { tt } from '@/i18n'
import type { FinanceState } from '@/store/finance'

export interface RecoverySnapshot {
  id: string
  createdAt: string
  reason: 'auto' | 'manual' | 'pre-restore' | 'pre-round'
  backup: FinanceBackup
}

const RECOVERY_KEY = 'sharky-recovery-v1'
const MAX_SNAPSHOTS = 3

export function listRecoverySnapshots(): RecoverySnapshot[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECOVERY_KEY) ?? '[]') as RecoverySnapshot[]
    return Array.isArray(value) ? value.filter(isRecoverySnapshot).slice(0, MAX_SNAPSHOTS) : []
  } catch {
    return []
  }
}

let lastAutoFingerprint = ''

export function createRecoverySnapshot(state: FinanceState, reason: RecoverySnapshot['reason'] = 'auto'): RecoverySnapshot {
  const backup = createBackup(state)

  if (reason === 'auto') {
    const fingerprint = `${state.transactions.length}:${state.accounts.length}:${state.transactions[0]?.id ?? ''}:${state.transactions[0]?.amount ?? 0}:${state.accounts.reduce((s, a) => s + a.balance, 0)}`
    if (fingerprint === lastAutoFingerprint) return { id: '', createdAt: backup.exportedAt, reason, backup }
    lastAutoFingerprint = fingerprint
  }

  const snapshot: RecoverySnapshot = {
    id: `recovery_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: backup.exportedAt,
    reason,
    backup,
  }
  const snapshots = listRecoverySnapshots()
  localStorage.setItem(RECOVERY_KEY, JSON.stringify([snapshot, ...snapshots].slice(0, MAX_SNAPSHOTS)))
  return snapshot
}

export function readRecoverySnapshot(id: string): FinanceBackup['data'] {
  const snapshot = listRecoverySnapshots().find(item => item.id === id)
  if (!snapshot) throw new Error(tt('errRecoveryGone'))
  return parseBackup(JSON.stringify(snapshot.backup))
}

function isRecoverySnapshot(value: unknown): value is RecoverySnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<RecoverySnapshot>
  return typeof snapshot.id === 'string'
    && typeof snapshot.createdAt === 'string'
    && ['auto', 'manual', 'pre-restore', 'pre-round'].includes(snapshot.reason ?? '')
    && !!snapshot.backup
}
