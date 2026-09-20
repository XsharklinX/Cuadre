import { useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { resolveConflict, useCloudSync, type SyncConflict } from '@/data/cloudSync'
import { accountCurrency, fmt } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useT } from '@/i18n'
import type { Account, Category, Goal, GoalContribution, Transaction } from '@/types'
import { SettingsSheet, type SheetProps } from './shared'

function getTableLabel(t: ReturnType<typeof useT>): Record<SyncConflict['table'], string> {
  return {
    accounts: t('account'),
    categories: t('category'),
    goals: t('savingsGoalLabel'),
    transactions: t('transactionLabel'),
    goal_contributions: t('goalContributionLabel'),
  }
}

function getAccountTypeLabel(t: ReturnType<typeof useT>): Record<Account['type'], string> {
  return { cash: t('cash'), debit: t('debit'), savings: t('savings'), credit: t('credit') }
}

function getTxTypeLabel(t: ReturnType<typeof useT>): Record<Transaction['type'], string> {
  return { income: t('income'), expense: t('expense'), transfer: t('transfer') }
}

type Field = { label: string; value: string }

function describeEntity(table: SyncConflict['table'], entity: SyncConflict['local'], currency: ReturnType<typeof useFinance.getState>['currency'], t: ReturnType<typeof useT>): Field[] {
  if (!entity) return [{ label: '', value: t('deletedLabel') }]

  const accountTypeLabel = getAccountTypeLabel(t)
  const txTypeLabel = getTxTypeLabel(t)

  switch (table) {
    case 'accounts': {
      const a = entity as Account
      return [
        { label: t('name'), value: a.name },
        { label: t('type'), value: accountTypeLabel[a.type] },
        { label: t('balance'), value: fmt(a.balance, accountCurrency(a, currency)) },
      ]
    }
    case 'categories': {
      const c = entity as Category
      return [
        { label: t('name'), value: c.name },
        { label: t('type'), value: c.type === 'income' ? t('income') : t('expense') },
        { label: t('monthlyBudget'), value: fmt(c.budget, currency) },
      ]
    }
    case 'goals': {
      const g = entity as Goal
      const fields: Field[] = [
        { label: t('name'), value: g.name },
        { label: t('target'), value: fmt(g.target, currency) },
        { label: t('saved'), value: fmt(g.saved, currency) },
      ]
      if (g.deadline) fields.push({ label: t('deadline'), value: g.deadline })
      return fields
    }
    case 'transactions': {
      const tx = entity as Transaction
      const fields: Field[] = [
        { label: t('type'), value: txTypeLabel[tx.type] },
        { label: t('amount'), value: fmt(tx.amount, currency) },
        { label: t('date'), value: tx.date },
      ]
      if (tx.note) fields.push({ label: t('note'), value: tx.note })
      return fields
    }
    case 'goal_contributions': {
      const c = entity as GoalContribution
      const fields: Field[] = [
        { label: t('amount'), value: fmt(c.amount, currency) },
        { label: t('date'), value: c.date },
      ]
      if (c.note) fields.push({ label: t('note'), value: c.note })
      return fields
    }
  }
}

function ConflictCard({ conflict, currency }: { conflict: SyncConflict; currency: ReturnType<typeof useFinance.getState>['currency'] }) {
  const t = useT()
  const tableLabel = getTableLabel(t)
  const [busy, setBusy] = useState<'local' | 'cloud' | 'duplicate' | 'ignore' | null>(null)

  const act = async (action: 'local' | 'cloud' | 'duplicate' | 'ignore') => {
    setBusy(action)
    try {
      await resolveConflict(conflict, action)
      toast(t('conflictResolved'), { icon: 'check', type: 'ok' })
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotResolveConflict'), { icon: 'alert' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mset-conflict-card">
      <strong>{tableLabel[conflict.table]}: {conflict.label}</strong>
      <div className="mset-conflict-compare">
        <div className="mset-conflict-side">
          <span className="mset-conflict-side-title">{t('thisDevice')}</span>
          {describeEntity(conflict.table, conflict.local, currency, t).map((f, i) => (
            <div className="mset-conflict-field" key={i}>
              {f.label && <span>{f.label}</span>}
              <strong>{f.value}</strong>
            </div>
          ))}
        </div>
        <div className="mset-conflict-side">
          <span className="mset-conflict-side-title">{t('theCloud')}</span>
          {describeEntity(conflict.table, conflict.remote, currency, t).map((f, i) => (
            <div className="mset-conflict-field" key={i}>
              {f.label && <span>{f.label}</span>}
              <strong>{f.value}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="mset-conflict-actions">
        <button className="mset-sheet-confirm" disabled={busy !== null} onClick={() => act('local')}>
          {t('keepThisDevice')}
        </button>
        <button className="mset-sheet-confirm" disabled={busy !== null} onClick={() => act('cloud')}>
          {t('useCloudVersion')}
        </button>
        {conflict.local && conflict.remote && (
          <button className="mset-sheet-cancel" disabled={busy !== null} onClick={() => act('duplicate')}>
            {t('keepBoth')}
          </button>
        )}
        <button className="mset-sheet-cancel" disabled={busy !== null} onClick={() => act('ignore')}>
          {t('ignoreForNow')}
        </button>
      </div>
    </div>
  )
}

export function SettingsSyncConflicts({ activeSheet, onClose }: SheetProps) {
  const t = useT()
  const conflicts = useCloudSync(s => s.conflicts)
  const currency = useFinance(s => s.currency)

  if (activeSheet !== 'syncConflicts') return null

  return (
    <SettingsSheet title={t('syncConflictsLabel')} onClose={onClose}>
      <div className="mset-sheet-body">
        {conflicts.length === 0 ? (
          <p className="mset-legal-intro">{t('noPendingConflicts')}</p>
        ) : (
          conflicts.map(c => (
            <ConflictCard key={`${c.table}:${c.localId}`} conflict={c} currency={currency} />
          ))
        )}
      </div>
    </SettingsSheet>
  )
}
