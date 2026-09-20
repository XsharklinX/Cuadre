import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mergeTable, resolveConflict, stableStringify, type SyncConflict } from '@/data/cloudSync'
import { useAuth } from '@/store/auth'
import { useFinance } from '@/store/finance'
import { useCloudSync } from '@/data/cloudSync'
import type { Account, Transaction } from '@/types'

const base: Account = {
  id: 'acc_1',
  name: 'Efectivo',
  short: 'Cash',
  type: 'cash',
  color: '#3b82f6',
  balance: 100,
  last4: null,
}

const baseline = { [base.id]: stableStringify(base) }

function row(account: Account, deletedAt: string | null = null): Record<string, unknown> {
  return { ...account, local_id: account.id, deleted_at: deletedAt }
}

function fromRow(value: Record<string, unknown>): Account {
  const account = { ...value }
  delete account.local_id
  delete account.deleted_at
  return account as unknown as Account
}

describe('stableStringify (fingerprint canónico)', () => {
  it('es insensible al orden de las claves', () => {
    const a = { id: 'x', name: 'A', balance: 10 }
    const b = { balance: 10, id: 'x', name: 'A' }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })

  it('trata null, undefined y arrays vacíos como clave ausente', () => {
    const explicit = { id: 'x', recurring: null, tags: [] as string[], note: undefined }
    const omitted = { id: 'x' }
    expect(stableStringify(explicit)).toBe(stableStringify(omitted))
  })

  it('ordena claves también en objetos anidados y respeta arrays con contenido', () => {
    const a = { id: 'x', splits: [{ categoryId: 'c1', amount: 5 }, { amount: 3, categoryId: 'c2' }] }
    const b = { splits: [{ amount: 5, categoryId: 'c1' }, { categoryId: 'c2', amount: 3 }], id: 'x' }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })
})

describe('cloud sync merge', () => {
  it('sube un cambio que solo existe localmente', () => {
    const changed = { ...base, balance: 125 }
    const plan = mergeTable('accounts', [changed], [row(base)], fromRow, baseline)
    expect(plan.push).toEqual([changed])
    expect(plan.conflicts).toEqual([])
  })

  it('descarga un cambio que solo existe remotamente', () => {
    const changed = { ...base, balance: 140 }
    const plan = mergeTable('accounts', [base], [row(changed)], fromRow, baseline)
    expect(plan.merged).toEqual([changed])
    expect(plan.push).toEqual([])
  })

  it('crea un tombstone remoto cuando se elimina localmente', () => {
    const plan = mergeTable('accounts', [], [row(base)], fromRow, baseline)
    expect(plan.removeRemote).toEqual([base.id])
    expect(plan.merged).toEqual([])
  })

  it('no sobrescribe cambios concurrentes', () => {
    const local = { ...base, balance: 125 }
    const remote = { ...base, balance: 140 }
    const plan = mergeTable('accounts', [local], [row(remote)], fromRow, baseline)
    expect(plan.push).toEqual([])
    expect(plan.conflicts).toEqual([{ table: 'accounts', localId: base.id, label: base.name, local, remote }])
    expect(plan.merged).toEqual([local])
  })

  it('no genera conflicto falso cuando solo cambia el orden de las claves', () => {
    // La misma cuenta con claves en otro orden (p.ej. restaurada de un backup)
    const reordered = JSON.parse(JSON.stringify({
      balance: base.balance, last4: base.last4, color: base.color,
      type: base.type, short: base.short, name: base.name, id: base.id,
    })) as Account
    const plan = mergeTable('accounts', [reordered], [row(base)], fromRow, baseline)
    expect(plan.conflicts).toEqual([])
    expect(plan.push).toEqual([])
  })

  it('preserva campos nuevos (multi-moneda, apertura) en el round-trip', () => {
    const rich: Account = {
      ...base, id: 'acc_usd', openingBalance: 50, includeInTotal: false, currency: 'USD',
    }
    const richBaseline = { [rich.id]: stableStringify(rich) }
    // Con los mappers v2 el remoto devuelve la entidad completa: sin cambios,
    // sin push, sin conflicto. (El bug v1 era que el mapper la devolvía sin
    // estos campos y el merge la aplicaba localmente, borrando datos.)
    const plan = mergeTable('accounts', [rich], [row(rich)], fromRow, richBaseline)
    expect(plan.conflicts).toEqual([])
    expect(plan.push).toEqual([])
    expect(plan.merged).toEqual([rich])
  })

  it('sincroniza transacciones con splits y toAmount sin conflicto falso', () => {
    const tx: Transaction = {
      id: 'tx_1', type: 'expense', amount: 500, date: '2026-07-01', note: 'Súper',
      accountId: 'acc_1', categoryId: 'cat_a',
      splits: [{ categoryId: 'cat_a', amount: 300 }, { categoryId: 'cat_b', amount: 200 }],
    }
    const txBaseline = { [tx.id]: stableStringify(tx) }
    const remoteRow = { ...tx, local_id: tx.id, deleted_at: null }
    const fromTxRow = (value: Record<string, unknown>): Transaction => {
      const cleaned = { ...value }
      delete cleaned.local_id
      delete cleaned.deleted_at
      return cleaned as unknown as Transaction
    }
    const plan = mergeTable('transactions', [tx], [remoteRow], fromTxRow, txBaseline)
    expect(plan.conflicts).toEqual([])
    expect(plan.push).toEqual([])
    expect(plan.merged).toEqual([tx])
  })
})

describe('resolveConflict', () => {
  const local: Account = { ...base, balance: 125 }
  const remote: Account = { ...base, balance: 140 }
  const conflict: SyncConflict = { table: 'accounts', localId: base.id, label: base.name, local, remote }
  const userId = 'user_test_1'
  const metadataKey = `sharky-cloud-sync-v1:${userId}`

  beforeEach(() => {
    useAuth.setState({ user: { id: userId, name: 'Test', email: 't@test.com', mode: 'cloud' } })
    useFinance.setState({ accounts: [local], categories: [], goals: [], transactions: [], goalContributions: [], currency: 'DOP' })
    useCloudSync.setState({ conflicts: [conflict], busy: false, pending: false, syncNow: async () => {} })
    localStorage.removeItem(metadataKey)
  })

  afterEach(() => {
    useAuth.setState({ user: null })
    localStorage.removeItem(metadataKey)
  })

  it('ignore: solo quita el conflicto, sin tocar datos ni baseline', async () => {
    await resolveConflict(conflict, 'ignore')
    expect(useCloudSync.getState().conflicts).toEqual([])
    expect(useFinance.getState().accounts).toEqual([local])
    expect(localStorage.getItem(metadataKey)).toBeNull()
  })

  it('local: mantiene la versión local y marca el baseline para subirla', async () => {
    await resolveConflict(conflict, 'local')
    expect(useFinance.getState().accounts).toEqual([local])
    expect(useCloudSync.getState().conflicts).toEqual([])
    const metadata = JSON.parse(localStorage.getItem(metadataKey)!)
    expect(metadata.baseline.accounts[base.id]).toBe(stableStringify(remote))
  })

  it('cloud: aplica la versión remota y deja el baseline al día', async () => {
    await resolveConflict(conflict, 'cloud')
    // La versión remota pasa por sanitize, que back-deriva el saldo de apertura
    // (sin movimientos en el fixture: opening = balance).
    expect(useFinance.getState().accounts).toEqual([{ ...remote, openingBalance: remote.balance }])
    expect(useCloudSync.getState().conflicts).toEqual([])
    const metadata = JSON.parse(localStorage.getItem(metadataKey)!)
    expect(metadata.baseline.accounts[base.id]).toBe(stableStringify(remote))
  })

  it('duplicate: conserva ambas versiones como entidades separadas', async () => {
    await resolveConflict(conflict, 'duplicate')
    const accounts = useFinance.getState().accounts
    expect(accounts).toHaveLength(2)
    expect(accounts[0]).toEqual({ ...local, openingBalance: local.balance })
    // El duplicado conserva TODO menos el tipo cuando el original es efectivo:
    // el efectivo es unico en la app, asi que la copia se degrada a ahorro.
    // Lo que importa es que el dinero no desaparezca — por eso siguen siendo
    // dos cuentas y el saldo se mantiene.
    const { type: _remoteType, ...remoteRest } = remote
    expect(accounts[1]).toMatchObject({ ...remoteRest, id: expect.stringContaining(`${base.id}_dup_`) })
    expect(accounts[1].balance).toBe(remote.balance)
    expect(accounts[1].type).toBe(remote.type === 'cash' ? 'savings' : remote.type)
    expect(useCloudSync.getState().conflicts).toEqual([])
    const metadata = JSON.parse(localStorage.getItem(metadataKey)!)
    expect(metadata.baseline.accounts[base.id]).toBe(stableStringify(remote))
  })
})
