import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecoverySnapshot } from './recovery'
import { getDataHealthStatus } from './dataHealth'
import type { FinanceState } from '@/store/finance'

const { isSessionStoredInPlaintextMock } = vi.hoisted(() => ({ isSessionStoredInPlaintextMock: vi.fn(() => false) }))
vi.mock('@/lib/secureAuthStorage', () => ({ isSessionStoredInPlaintext: isSessionStoredInPlaintextMock }))

function installMemoryStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  })
}

const state = {
  accounts: [{ id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 500, last4: null }],
  categories: [{ id: 'food', name: 'Comida', type: 'expense', color: '#fff', budget: 100, icon: 'food' }],
  goals: [],
  goalContributions: [],
  transactions: [{ id: 'tx', type: 'expense', amount: 25, accountId: 'cash', categoryId: 'food', date: '2026-06-04', note: 'Cena' }],
  currency: 'DOP',
} as unknown as FinanceState

describe('data health status', () => {
  beforeEach(() => {
    installMemoryStorage()
    isSessionStoredInPlaintextMock.mockReturnValue(false)
  })

  it('sin advertencias cuando todo esta al dia', () => {
    createRecoverySnapshot(state, 'manual')
    localStorage.setItem('sharky-cloud-backup-last-v1:user-1', '2026-06-04T01:00:00.000Z')
    const health = getDataHealthStatus(state, 'user-1')
    expect(health.riskLevel).toBe('ok')
    expect(health.warnings).toEqual([])
  })

  it('advierte cuando no hay cuentas ni categorias', () => {
    const empty = { ...state, accounts: [], categories: [] } as unknown as FinanceState
    createRecoverySnapshot(empty, 'manual')
    const health = getDataHealthStatus(empty, 'user-1')
    expect(health.warnings).toContain('No hay cuentas configuradas.')
    expect(health.warnings).toContain('No hay categorias configuradas.')
  })

  it('detecta una cuenta con saldo descuadrado (balance != opening + movimientos)', () => {
    const drifted = {
      ...state,
      accounts: [{ id: 'cash', name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: 999999, openingBalance: 500, last4: null }],
    } as unknown as FinanceState
    const health = getDataHealthStatus(drifted, 'user-1')
    expect(health.driftedAccounts).toBe(1)
    expect(health.warnings.some(w => w.includes('saldo descuadrado'))).toBe(true)
  })

  it('detecta una meta con ahorro descuadrado (saved != openingSaved + aportes)', () => {
    const drifted = {
      ...state,
      goals: [{ id: 'g1', name: 'Meta', target: 1000, saved: 999999, openingSaved: 0, color: '#fff', icon: 'target' }],
      goalContributions: [{ id: 'c1', goalId: 'g1', amount: 100, fromAccountId: 'cash', date: '2026-06-01' }],
    } as unknown as FinanceState
    const health = getDataHealthStatus(drifted, 'user-1')
    expect(health.driftedGoals).toBe(1)
    expect(health.warnings.some(w => w.includes('ahorro descuadrado'))).toBe(true)
  })

  it('advierte cuando la sesion quedo guardada sin cifrar (Keystore no disponible)', () => {
    isSessionStoredInPlaintextMock.mockReturnValue(true)
    const health = getDataHealthStatus(state, 'user-1')
    expect(health.sessionStoredInPlaintext).toBe(true)
    expect(health.warnings.some(w => w.includes('sin cifrar'))).toBe(true)
  })

  it('advierte cuando faltan backups cloud en datos con movimientos', () => {
    createRecoverySnapshot(state, 'manual')
    const health = getDataHealthStatus(state, 'user-1')

    expect(health.recoveryPoints).toBe(1)
    expect(health.riskLevel).toBe('warning')
    expect(health.warnings).toContain('No hay backup cloud reciente registrado.')
  })

  it('lee fechas de backup cloud y sync cuando existen', () => {
    localStorage.setItem('sharky-cloud-backup-last-v1:user-1', '2026-06-04T01:00:00.000Z')
    localStorage.setItem('sharky-cloud-sync-v1:user-1', JSON.stringify({ lastSyncAt: '2026-06-04T02:00:00.000Z' }))
    createRecoverySnapshot(state, 'manual')

    const health = getDataHealthStatus(state, 'user-1')
    expect(health.lastCloudBackupAt).toBe('2026-06-04T01:00:00.000Z')
    expect(health.lastSyncAt).toBe('2026-06-04T02:00:00.000Z')
  })
})
