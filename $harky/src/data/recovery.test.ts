import { beforeEach, describe, expect, it } from 'vitest'
import { createRecoverySnapshot, listRecoverySnapshots, readRecoverySnapshot } from './recovery'
import { listAuditEvents, recordAuditEvent } from './audit'
import type { FinanceState } from '@/store/finance'

function installMemoryStorage() {
  const values = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
}

const emptyState = {
  accounts: [],
  categories: [],
  goals: [],
  transactions: [],
  currency: 'DOP',
} as unknown as FinanceState

describe('recuperación local', () => {
  beforeEach(installMemoryStorage)

  it('crea snapshots restaurables y evita duplicados consecutivos via fingerprint', () => {
    const first = createRecoverySnapshot(emptyState)
    const duplicate = createRecoverySnapshot(emptyState)
    expect(duplicate.id).toBe('')
    expect(listRecoverySnapshots()).toHaveLength(1)
    expect(readRecoverySnapshot(first.id)).toEqual({
      accounts: [], categories: [], goals: [], goalContributions: [], transactions: [], currency: 'DOP',
    })
  })

  it('conserva solo los tres snapshots más recientes', () => {
    for (let index = 0; index < 5; index++) {
      createRecoverySnapshot({ ...emptyState, currency: index % 2 ? 'USD' : 'DOP', accounts: [{
        id: `cash_${index}`, name: 'Efectivo', short: 'Cash', type: 'cash', color: '#fff', balance: index, last4: null,
      }] } as FinanceState)
    }
    expect(listRecoverySnapshots()).toHaveLength(3)
  })
})

describe('auditoría local', () => {
  beforeEach(installMemoryStorage)

  it('registra eventos recientes sin exceder la retención', () => {
    for (let index = 0; index < 44; index++) recordAuditEvent('backup', `Evento ${index}`)
    const events = listAuditEvents()
    expect(events).toHaveLength(40)
    expect(events[0].label).toBe('Evento 43')
  })
})
