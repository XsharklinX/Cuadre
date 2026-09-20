import { create } from 'zustand'
import { recordAuditEvent } from '@/data/audit'
import { maybeCreateAutoCloudBackup } from '@/data/cloudBackup'
import { tt } from '@/i18n'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useFinance, type FinanceState } from '@/store/finance'
import type { Account, Category, Goal, GoalContribution, Transaction } from '@/types'

type SyncTable = 'accounts' | 'categories' | 'goals' | 'transactions' | 'goal_contributions'
type SyncEntity = Account | Category | Goal | Transaction | GoalContribution
type Baseline = Partial<Record<SyncTable, Record<string, string>>>

export interface SyncConflict {
  table: SyncTable
  localId: string
  label: string
  /** Versión de este dispositivo. `undefined` si se eliminó localmente. */
  local?: SyncEntity
  /** Versión en la nube. `undefined` si se eliminó en la nube. */
  remote?: SyncEntity
}

interface SyncMetadata {
  baseline: Baseline
  lastSyncAt?: string
  version?: number
}

interface CloudSyncState {
  busy: boolean
  pending: boolean
  lastSyncAt?: string
  conflicts: SyncConflict[]
  error?: string
  loadForUser: (userId?: string) => void
  setPending: (pending: boolean) => void
  syncNow: () => Promise<void>
}

const META_KEY_PREFIX = 'sharky-cloud-sync-v1:'
const TOMBSTONE = '__deleted__'
/**
 * Versión del formato de baseline. v2 = fingerprint estable + mappers con
 * todos los campos del modelo. Los baselines anteriores (sin versión) se
 * generaron con un formato que perdía campos y era sensible al orden de
 * claves: al detectarlos, el sync entra en "modo semilla" (local gana) en
 * lugar de producir una oleada de conflictos falsos o pisar datos locales.
 */
const BASELINE_VERSION = 2

function metadataKey(userId: string): string {
  return `${META_KEY_PREFIX}${userId}`
}

function readMetadata(userId: string): SyncMetadata {
  try {
    return JSON.parse(localStorage.getItem(metadataKey(userId)) ?? '{"baseline":{}}') as SyncMetadata
  } catch {
    return { baseline: {} }
  }
}

function writeMetadata(userId: string, metadata: SyncMetadata): void {
  localStorage.setItem(metadataKey(userId), JSON.stringify(metadata))
}

function setBaselineEntry(userId: string, table: SyncTable, id: string, hash: string): void {
  const metadata = readMetadata(userId)
  const baseline = { ...metadata.baseline }
  baseline[table] = { ...baseline[table], [id]: hash }
  writeMetadata(userId, { ...metadata, baseline })
}

function replaceEntity<T extends { id: string }>(arr: T[], id: string, entity: T | undefined): T[] {
  if (!entity) return arr.filter(item => item.id !== id)
  const index = arr.findIndex(item => item.id === id)
  return index >= 0 ? arr.map((item, i) => (i === index ? entity : item)) : [...arr, entity]
}

/**
 * Serialización canónica para fingerprints: claves ordenadas recursivamente,
 * y tratando como "ausentes" `undefined`, `null` y arrays vacíos. El
 * `JSON.stringify` plano anterior dependía del orden de inserción de las
 * claves y distinguía `tags: []`/`recurring: null` de la clave omitida, así
 * que la misma entidad restaurada de un backup (o reconstruida por el mapper
 * remoto) generaba conflictos falsos en cada sync.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
  return `{${entries.join(',')}}`
}

function fingerprint(entity: SyncEntity | undefined): string {
  return entity ? stableStringify(entity) : TOMBSTONE
}

function byId<T extends { id: string }>(entities: T[]): Map<string, T> {
  return new Map(entities.map(entity => [entity.id, entity]))
}

function labelFor(entity: SyncEntity | undefined, localId: string): string {
  if (!entity) return localId
  if ('name' in entity) return entity.name
  return 'note' in entity && entity.note ? entity.note : localId
}

function accountFromRow(row: Record<string, unknown>): Account {
  return {
    id: String(row.local_id),
    name: String(row.name),
    short: String(row.short_name),
    type: row.account_type as Account['type'],
    color: String(row.color),
    balance: Number(row.balance),
    last4: row.last_four ? String(row.last_four) : null,
    ...(row.credit_limit === null || row.credit_limit === undefined ? {} : { limit: Number(row.credit_limit) }),
    ...(row.overdraft_policy ? { overdraftPolicy: row.overdraft_policy as Account['overdraftPolicy'] } : {}),
    ...(row.opening_balance === null || row.opening_balance === undefined ? {} : { openingBalance: Number(row.opening_balance) }),
    ...(row.include_in_total === null || row.include_in_total === undefined ? {} : { includeInTotal: Boolean(row.include_in_total) }),
    ...(row.currency ? { currency: row.currency as Account['currency'] } : {}),
  }
}

function categoryFromRow(row: Record<string, unknown>): Category {
  return {
    id: String(row.local_id),
    name: String(row.name),
    type: row.category_type as Category['type'],
    color: String(row.color),
    budget: Number(row.budget),
    icon: row.icon as Category['icon'],
    ...(row.weekly_budget === null || row.weekly_budget === undefined ? {} : { weeklyBudget: Number(row.weekly_budget) }),
    ...(row.annual_budget === null || row.annual_budget === undefined ? {} : { annualBudget: Number(row.annual_budget) }),
    ...(row.rollover_enabled === null || row.rollover_enabled === undefined ? {} : { rolloverEnabled: Boolean(row.rollover_enabled) }),
  }
}

function goalFromRow(row: Record<string, unknown>): Goal {
  return {
    id: String(row.local_id),
    name: String(row.name),
    target: Number(row.target),
    saved: Number(row.saved),
    color: String(row.color),
    icon: row.icon as Goal['icon'],
    ...(row.deadline ? { deadline: String(row.deadline) } : {}),
    ...(row.auto_contribute && typeof row.auto_contribute === 'object'
      ? { autoContribute: row.auto_contribute as Goal['autoContribute'] }
      : {}),
  }
}

function transactionFromRow(row: Record<string, unknown>, remoteToLocal: Map<string, string>): Transaction {
  return {
    id: String(row.local_id),
    type: row.transaction_type as Transaction['type'],
    amount: Number(row.amount),
    date: String(row.transaction_date),
    note: String(row.note),
    ...(row.category_id ? { categoryId: remoteToLocal.get(String(row.category_id)) } : {}),
    ...(row.account_id ? { accountId: remoteToLocal.get(String(row.account_id)) } : {}),
    ...(Array.isArray(row.splits) && row.splits.length ? { splits: row.splits as Transaction['splits'] } : {}),
    ...(row.from_account_id ? { fromAccount: remoteToLocal.get(String(row.from_account_id)) } : {}),
    ...(row.to_account_id ? { toAccount: remoteToLocal.get(String(row.to_account_id)) } : {}),
    ...(row.to_amount === null || row.to_amount === undefined ? {} : { toAmount: Number(row.to_amount) }),
    ...(row.recurring ? { recurring: row.recurring as Transaction['recurring'] } : {}),
    ...(row.recurring_start ? { recurringStart: String(row.recurring_start) } : {}),
    ...(row.recurring_end ? { recurringEnd: String(row.recurring_end) } : {}),
    ...(row.recurring_next ? { recurringNext: String(row.recurring_next) } : {}),
    ...(Array.isArray(row.skipped_dates) && row.skipped_dates.length ? { skippedDates: row.skipped_dates.map(String) } : {}),
    ...(Array.isArray(row.tags) && row.tags.length ? { tags: row.tags.map(String) } : {}),
  }
}

function contributionFromRow(row: Record<string, unknown>, remoteToLocal: Map<string, string>): GoalContribution {
  return {
    id: String(row.local_id),
    goalId: remoteToLocal.get(String(row.goal_id)) ?? '',
    fromAccountId: remoteToLocal.get(String(row.from_account_id)) ?? '',
    amount: Number(row.amount),
    date: String(row.contributed_at).slice(0, 10),
    ...(row.note ? { note: String(row.note) } : {}),
  }
}

export function mergeTable<T extends SyncEntity>(
  table: SyncTable,
  local: T[],
  remoteRows: Record<string, unknown>[],
  fromRow: (row: Record<string, unknown>) => T,
  baseline: Record<string, string>,
): { merged: T[]; push: T[]; removeRemote: string[]; conflicts: SyncConflict[]; nextBaseline: Record<string, string> } {
  const localMap = byId(local)
  const remoteMap = new Map(remoteRows.map(row => [String(row.local_id), row]))
  const ids = new Set([...baseline ? Object.keys(baseline) : [], ...localMap.keys(), ...remoteMap.keys()])
  const merged = new Map(localMap)
  const push: T[] = []
  const removeRemote: string[] = []
  const conflicts: SyncConflict[] = []
  const nextBaseline = { ...baseline }

  ids.forEach(localId => {
    const localEntity = localMap.get(localId)
    const remoteRow = remoteMap.get(localId)
    const remoteEntity = remoteRow && !remoteRow.deleted_at ? fromRow(remoteRow) : undefined
    const previous = baseline[localId]
    const localHash = fingerprint(localEntity)
    const remoteHash = fingerprint(remoteEntity)

    if (localHash === remoteHash) {
      if (localEntity) merged.set(localId, localEntity)
      else merged.delete(localId)
      nextBaseline[localId] = localHash
      return
    }

    const localChanged = previous === undefined ? !!localEntity : localHash !== previous
    const remoteChanged = previous === undefined ? !!remoteEntity : remoteHash !== previous

    if (localChanged && remoteChanged) {
      conflicts.push({
        table, localId, label: labelFor(localEntity ?? remoteEntity, localId),
        local: localEntity, remote: remoteEntity,
      })
      return
    }

    if (localChanged) {
      if (localEntity) push.push(localEntity)
      else removeRemote.push(localId)
      nextBaseline[localId] = localHash
      return
    }

    if (remoteEntity) merged.set(localId, remoteEntity)
    else merged.delete(localId)
    nextBaseline[localId] = remoteHash
  })

  return { merged: [...merged.values()], push, removeRemote, conflicts, nextBaseline }
}

/**
 * Plan "semilla": este dispositivo gana. Se usa cuando el baseline local fue
 * generado por el motor v1 (que perdía campos al hacer round-trip): la copia
 * en la nube es incompleta por definición, así que se sube todo lo local, se
 * marca tombstone en lo que solo exista remoto, y NO se baja nada.
 */
function seedPlan<T extends SyncEntity>(
  local: T[],
  remoteRows: Record<string, unknown>[],
): { merged: T[]; push: T[]; removeRemote: string[]; conflicts: SyncConflict[]; nextBaseline: Record<string, string> } {
  const localIds = new Set(local.map(entity => entity.id))
  const removeRemote = remoteRows
    .filter(row => !row.deleted_at && row.local_id && !localIds.has(String(row.local_id)))
    .map(row => String(row.local_id))
  const nextBaseline: Record<string, string> = {}
  local.forEach(entity => { nextBaseline[entity.id] = fingerprint(entity) })
  return { merged: local, push: [...local], removeRemote, conflicts: [], nextBaseline }
}

function planTable<T extends SyncEntity>(
  seedMode: boolean,
  table: SyncTable,
  local: T[],
  remoteRows: Record<string, unknown>[],
  fromRow: (row: Record<string, unknown>) => T,
  baseline: Record<string, string>,
): ReturnType<typeof mergeTable<T>> {
  return seedMode ? seedPlan(local, remoteRows) : mergeTable(table, local, remoteRows, fromRow, baseline)
}

async function readRows(table: SyncTable): Promise<Record<string, unknown>[]> {
  if (!supabase) throw new Error(tt('errCloudNotConfigured'))
  const { data, error } = await supabase.from(table).select('*')
  if (error) throw new Error(error.message)
  return data as Record<string, unknown>[]
}

async function tombstone(table: SyncTable, localIds: string[]): Promise<void> {
  if (!supabase || localIds.length === 0) return
  const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).in('local_id', localIds)
  if (error) throw new Error(error.message)
}

async function upsert(table: SyncTable, rows: Record<string, unknown>[]): Promise<void> {
  if (!supabase || rows.length === 0) return
  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'user_id,local_id' })
  if (error) throw new Error(error.message)
}

async function synchronize(): Promise<{ lastSyncAt: string; conflicts: SyncConflict[] }> {
  if (!supabase) throw new Error(tt('errCloudNotConfigured'))
  const authUser = useAuth.getState().user
  if (!authUser?.id || authUser.mode !== 'cloud') throw new Error(tt('errSignInCloudSync'))
  const userId = authUser.id
  const state = useFinance.getState()
  const metadata = readMetadata(userId)
  const baseline = metadata.baseline ?? {}
  const conflicts: SyncConflict[] = []
  // Baseline creado por el motor v1 (formato con pérdida de campos): la copia
  // remota no es confiable — se resiembra desde este dispositivo.
  const seedMode = !!metadata.lastSyncAt && metadata.version !== BASELINE_VERSION

  const accountRows = await readRows('accounts')
  const accountPlan = planTable(seedMode, 'accounts', state.accounts, accountRows, accountFromRow, baseline.accounts ?? {})
  await upsert('accounts', accountPlan.push.map(account => ({
    user_id: userId, local_id: account.id, name: account.name, short_name: account.short,
    account_type: account.type, color: account.color, balance: account.balance,
    last_four: account.last4, credit_limit: account.limit ?? null,
    overdraft_policy: account.overdraftPolicy ?? null,
    opening_balance: account.openingBalance ?? null,
    include_in_total: account.includeInTotal ?? null,
    currency: account.currency ?? null,
    deleted_at: null,
  })))
  await tombstone('accounts', accountPlan.removeRemote)
  conflicts.push(...accountPlan.conflicts)

  const categoryRows = await readRows('categories')
  const categoryPlan = planTable(seedMode, 'categories', state.categories, categoryRows, categoryFromRow, baseline.categories ?? {})
  await upsert('categories', categoryPlan.push.map(category => ({
    user_id: userId, local_id: category.id, name: category.name, category_type: category.type,
    color: category.color, budget: category.budget, weekly_budget: category.weeklyBudget ?? null,
    annual_budget: category.annualBudget ?? null, icon: category.icon,
    rollover_enabled: category.rolloverEnabled ?? null,
    deleted_at: null,
  })))
  await tombstone('categories', categoryPlan.removeRemote)
  conflicts.push(...categoryPlan.conflicts)

  const goalRows = await readRows('goals')
  const goalPlan = planTable(seedMode, 'goals', state.goals, goalRows, goalFromRow, baseline.goals ?? {})
  await upsert('goals', goalPlan.push.map(goal => ({
    user_id: userId, local_id: goal.id, name: goal.name, target: goal.target, saved: goal.saved,
    color: goal.color, icon: goal.icon, deadline: goal.deadline ?? null,
    // jsonb con IDs locales (fromAccountId) — consistente en ambas direcciones
    auto_contribute: goal.autoContribute ?? null,
    deleted_at: null,
  })))
  await tombstone('goals', goalPlan.removeRemote)
  conflicts.push(...goalPlan.conflicts)

  const refreshedAccounts = await readRows('accounts')
  const refreshedCategories = await readRows('categories')
  const refreshedGoals = await readRows('goals')
  const localToRemote = new Map<string, string>()
  const remoteToLocal = new Map<string, string>()
  ;[...refreshedAccounts, ...refreshedCategories, ...refreshedGoals].forEach(row => {
    if (!row.deleted_at && row.local_id && row.id) {
      localToRemote.set(String(row.local_id), String(row.id))
      remoteToLocal.set(String(row.id), String(row.local_id))
    }
  })

  const transactionRows = await readRows('transactions')
  const transactionPlan = planTable(
    seedMode,
    'transactions',
    state.transactions,
    transactionRows,
    row => transactionFromRow(row, remoteToLocal),
    baseline.transactions ?? {},
  )
  await upsert('transactions', transactionPlan.push.map(transaction => ({
    user_id: userId, local_id: transaction.id, transaction_type: transaction.type,
    amount: transaction.amount, transaction_date: transaction.date, note: transaction.note,
    category_id: transaction.categoryId ? localToRemote.get(transaction.categoryId) : null,
    account_id: transaction.accountId ? localToRemote.get(transaction.accountId) : null,
    // jsonb con IDs locales de categoría — consistente en ambas direcciones
    splits: transaction.splits ?? null,
    from_account_id: transaction.fromAccount ? localToRemote.get(transaction.fromAccount) : null,
    to_account_id: transaction.toAccount ? localToRemote.get(transaction.toAccount) : null,
    to_amount: transaction.toAmount ?? null,
    recurring: transaction.recurring ?? null, recurring_start: transaction.recurringStart ?? null,
    recurring_end: transaction.recurringEnd ?? null, recurring_next: transaction.recurringNext ?? null,
    skipped_dates: transaction.skippedDates ?? null,
    tags: transaction.tags ?? [], deleted_at: null,
  })))
  await tombstone('transactions', transactionPlan.removeRemote)
  conflicts.push(...transactionPlan.conflicts)

  const contributionRows = await readRows('goal_contributions')
  const contributionPlan = planTable(
    seedMode,
    'goal_contributions',
    state.goalContributions,
    contributionRows,
    row => contributionFromRow(row, remoteToLocal),
    baseline.goal_contributions ?? {},
  )
  await upsert('goal_contributions', contributionPlan.push.map(contribution => ({
    user_id: userId, local_id: contribution.id,
    goal_id: localToRemote.get(contribution.goalId),
    from_account_id: localToRemote.get(contribution.fromAccountId),
    amount: contribution.amount, contributed_at: contribution.date, note: contribution.note ?? null,
    deleted_at: null,
  })))
  await tombstone('goal_contributions', contributionPlan.removeRemote)
  conflicts.push(...contributionPlan.conflicts)

  const lastSyncAt = new Date().toISOString()
  const nextState: Pick<FinanceState, 'accounts' | 'transactions' | 'categories' | 'goals' | 'goalContributions' | 'currency'> = {
    accounts: accountPlan.merged,
    categories: categoryPlan.merged,
    goals: goalPlan.merged,
    transactions: transactionPlan.merged,
    goalContributions: contributionPlan.merged,
    currency: state.currency,
  }
  useFinance.getState().restoreBackup(nextState)
  writeMetadata(userId, {
    lastSyncAt,
    version: BASELINE_VERSION,
    baseline: {
      accounts: accountPlan.nextBaseline,
      categories: categoryPlan.nextBaseline,
      goals: goalPlan.nextBaseline,
      transactions: transactionPlan.nextBaseline,
      goal_contributions: contributionPlan.nextBaseline,
    },
  })
  recordAuditEvent('account', 'Sincronización cloud completada', conflicts.length ? `${conflicts.length} conflicto(s)` : 'Sin conflictos')
  await maybeCreateAutoCloudBackup()
  return { lastSyncAt, conflicts }
}

const SYNC_TABLES: SyncTable[] = ['accounts', 'categories', 'goals', 'transactions', 'goal_contributions']

/** Borra permanentemente todas las filas del usuario en las tablas cloud y su metadata local de sincronización. */
export async function wipeCloudData(userId: string): Promise<void> {
  if (!supabase) return
  for (const table of SYNC_TABLES) {
    const { error } = await supabase.from(table).delete().eq('user_id', userId)
    if (error) throw new Error(error.message)
  }
  localStorage.removeItem(metadataKey(userId))
}

export const useCloudSync = create<CloudSyncState>((set) => ({
  busy: false,
  pending: false,
  conflicts: [],

  loadForUser: (userId) => {
    const metadata = userId ? readMetadata(userId) : { baseline: {} }
    set({ busy: false, pending: false, lastSyncAt: metadata.lastSyncAt, conflicts: [], error: undefined })
  },

  setPending: (pending) => set({ pending }),

  syncNow: async () => {
    set({ busy: true, error: undefined })
    try {
      const result = await synchronize()
      set({ busy: false, ...result })
    } catch (cause) {
      set({ busy: false, error: cause instanceof Error ? cause.message : 'No fue posible sincronizar.' })
      throw cause
    }
  },
}))

const TABLE_TO_STATE_KEY = {
  accounts: 'accounts',
  categories: 'categories',
  goals: 'goals',
  transactions: 'transactions',
  goal_contributions: 'goalContributions',
} as const satisfies Record<SyncTable, keyof Pick<FinanceState, 'accounts' | 'categories' | 'goals' | 'transactions' | 'goalContributions'>>

function applyEntityToFinance(table: SyncTable, localId: string, entity: SyncEntity | undefined, dupId?: string): void {
  const state = useFinance.getState()
  const data = {
    accounts: state.accounts, categories: state.categories, goals: state.goals,
    transactions: state.transactions, goalContributions: state.goalContributions,
    currency: state.currency,
  }
  const key = TABLE_TO_STATE_KEY[table]
  const id = dupId ?? localId
  // @ts-expect-error -- table/entity correspondence is guaranteed by SyncTable
  data[key] = replaceEntity(data[key], id, dupId ? { ...entity, id: dupId } : entity)
  state.restoreBackup(data)
}

function removeConflictFromState(table: SyncTable, localId: string): void {
  useCloudSync.setState(s => ({
    conflicts: s.conflicts.filter(c => !(c.table === table && c.localId === localId)),
  }))
}

/** Aplica la decisión del usuario sobre un conflicto de sincronización. */
export async function resolveConflict(conflict: SyncConflict, action: 'local' | 'cloud' | 'duplicate' | 'ignore'): Promise<void> {
  if (action === 'ignore') {
    removeConflictFromState(conflict.table, conflict.localId)
    return
  }

  const authUser = useAuth.getState().user
  if (!authUser?.id || authUser.mode !== 'cloud') throw new Error(tt('errSignInCloudSync'))
  const userId = authUser.id
  const remoteHash = fingerprint(conflict.remote)

  if (action === 'cloud') {
    applyEntityToFinance(conflict.table, conflict.localId, conflict.remote)
    setBaselineEntry(userId, conflict.table, conflict.localId, remoteHash)
  } else if (action === 'local') {
    setBaselineEntry(userId, conflict.table, conflict.localId, remoteHash)
  } else {
    if (!conflict.local || !conflict.remote) throw new Error(tt('errKeepBothNeedsData'))
    const dupId = `${conflict.localId}_dup_${Date.now().toString(36)}`
    applyEntityToFinance(conflict.table, conflict.localId, conflict.remote, dupId)
    setBaselineEntry(userId, conflict.table, conflict.localId, remoteHash)
  }

  removeConflictFromState(conflict.table, conflict.localId)
  recordAuditEvent('account', 'Conflicto de sincronización resuelto', `${conflict.label} (${action})`)

  try {
    await useCloudSync.getState().syncNow()
  } catch {
    // El baseline ya quedó marcado: se resolverá en el próximo sync automático.
  }
}
