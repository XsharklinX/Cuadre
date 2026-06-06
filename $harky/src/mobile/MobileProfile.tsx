import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { fmtCompact } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import type { Account, AccountType, OverdraftPolicy, ViewId, ViewProps } from '@/types'

const COLORS = ['#ffdd3d','#35d0a2','#5bc0ff','#a78bfa','#ff6b8a','#f59e0b']

const EMPTY_ACCOUNT: Omit<Account, 'id'> = {
  name: '', short: '', type: 'debit', color: COLORS[1], balance: 0, last4: null,
}

const TYPE_META: Record<AccountType, { label: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
  cash:    { label: 'Cash',    icon: 'wallet' },
  debit:   { label: 'Debit',  icon: 'cards'  },
  savings: { label: 'Savings',icon: 'piggy'  },
  credit:  { label: 'Credit', icon: 'cards'  },
}


export function MobileProfile({
  userName,
  onSettings,
  goto,
  createRequest,
}: {
  userName?: string
  onSettings: () => void
  goto: (view: ViewId) => void
  createRequest?: ViewProps['createRequest']
}) {
  const { displayName, setDisplayName } = useSettings()
  const { accounts, currency, addAccount, updateAccount, deleteAccount } = useFinance()

  const [editingName,    setEditingName]    = useState(false)
  const [nameInput,      setNameInput]      = useState(displayName || userName || '')
  const [editingAccount, setEditingAccount] = useState<Account | 'new' | null>(null)

  useMobileBackDismiss(!!editingAccount, () => setEditingAccount(null))

  useEffect(() => {
    if (createRequest?.target === 'account') setEditingAccount('new')
  }, [createRequest])

  const effectiveName = displayName || userName || ''
  const initial       = effectiveName ? effectiveName.slice(0, 1).toUpperCase() : '$'

  const saveName = () => {
    const trimmed = nameInput.trim()
    setDisplayName(trimmed)
    setEditingName(false)
    if (trimmed) toast(`Name updated to "${trimmed}"`, { icon: 'check', type: 'ok' })
  }

  const saveAccount = (fields: Omit<Account, 'id'>) => {
    if (!fields.name.trim() || !fields.short.trim()) {
      toast('Fill in name and label.', { icon: 'alert' })
      return
    }
    const clean = { ...fields, name: fields.name.trim(), short: fields.short.trim(), last4: fields.last4?.trim() || null }
    if (editingAccount === 'new') addAccount(clean)
    else if (editingAccount) updateAccount(editingAccount.id, clean)
    toast(editingAccount === 'new' ? 'Account created' : 'Account updated', { icon: 'cards', type: 'ok' })
    setEditingAccount(null)
  }

  const deleteAcc = (account: Account) => {
    try {
      deleteAccount(account.id)
      toast('Account deleted', { icon: 'trash', type: 'ok' })
      setEditingAccount(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not delete account.', { icon: 'alert' })
    }
  }

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="mpr-root">

      {/* ── Avatar / Name ── */}
      <div className="mpr-hero">
        <div className="mpr-avatar">{initial}</div>
        {editingName ? (
          <div className="mpr-name-editor">
            <input
              autoFocus
              type="text"
              value={nameInput}
              placeholder="Your name"
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
            />
            <div className="mpr-name-actions">
              <button onClick={() => setEditingName(false)}>Cancel</button>
              <button className="primary" onClick={saveName}>Save</button>
            </div>
          </div>
        ) : (
          <>
            <h2>{effectiveName || 'My account'}</h2>
            <button className="mpr-edit-name-btn" onClick={() => { setNameInput(effectiveName); setEditingName(true) }}>
              <Icon name="edit" size={13} />
              {effectiveName ? 'Edit name' : 'Add name'}
            </button>
          </>
        )}

        <div className="mpr-balance-badge">
          <span>Total balance</span>
          <strong>{fmtCompact(totalBalance, currency)}</strong>
        </div>
      </div>

      {/* ── Accounts ── */}
      <div className="mpr-section">
        <div className="mpr-section-header">
          <span>Accounts</span>
          <button className="mpr-add-btn" onClick={() => setEditingAccount('new')}>
            <Icon name="plus" size={15} /> Add
          </button>
        </div>

        {accounts.length === 0 ? (
          <div className="mpr-empty">
            <Icon name="cards" size={28} style={{ opacity: .25 }} />
            <p>No accounts yet</p>
            <button onClick={() => setEditingAccount('new')}>Create account</button>
          </div>
        ) : (
          <div className="mpr-account-list">
            {accounts.map(a => (
              <button key={a.id} className="mpr-account-row" onClick={() => setEditingAccount(a)}>
                <span className="mpr-account-icon" style={{ background: a.color + '22', color: a.color }}>
                  <Icon name={TYPE_META[a.type].icon} size={20} />
                </span>
                <div className="mpr-account-info">
                  <b>{a.name}</b>
                  <small>{TYPE_META[a.type].label}{a.last4 ? ` · ·· ${a.last4}` : ''}</small>
                </div>
                <strong className={a.balance < 0 ? 'text-expense' : ''}>
                  {fmtCompact(a.balance, currency)}
                </strong>
                <Icon name="arrowUp" size={14} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick links ── */}
      <div className="mpr-section">
        <div className="mpr-section-header"><span>Quick links</span></div>
        <div className="mpr-link-list">
          <button onClick={onSettings}><Icon name="settings" size={20} />Settings &amp; backup<Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', marginLeft: 'auto', color: 'var(--m-muted)' }} /></button>
          <button onClick={() => goto('annual')}><Icon name="chart" size={20} />Annual report<Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', marginLeft: 'auto', color: 'var(--m-muted)' }} /></button>
          <button onClick={() => goto('goals')}><Icon name="target" size={20} />Goals<Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', marginLeft: 'auto', color: 'var(--m-muted)' }} /></button>
          <button onClick={() => goto('calendar')}><Icon name="calendar" size={20} />Calendar<Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', marginLeft: 'auto', color: 'var(--m-muted)' }} /></button>
        </div>
      </div>

      {/* ── Account editor sheet ── */}
      {editingAccount !== null && (
        <AccountEditorSheet
          account={editingAccount === 'new' ? undefined : editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={saveAccount}
          onDelete={editingAccount !== 'new' ? deleteAcc : undefined}
        />
      )}
    </div>
  )
}

function AccountEditorSheet({
  account,
  onClose,
  onSave,
  onDelete,
}: {
  account?: Account
  onClose: () => void
  onSave: (fields: Omit<Account, 'id'>) => void
  onDelete?: (account: Account) => void
}) {
  const [fields, setFields] = useState<Omit<Account, 'id'>>(account ?? EMPTY_ACCOUNT)
  const [confirmDel, setConfirmDel] = useState(false)
  const patch = <K extends keyof typeof fields>(key: K, val: typeof fields[K]) =>
    setFields(cur => ({ ...cur, [key]: val }))

  useMobileBackDismiss(true, onClose)

  return (
    <div className="mobile-detail-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="mpr-editor-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{account ? 'Edit account' : 'New account'}</span>
          <button onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mpr-editor-body">
          <label className="mpr-field">
            <span>Name</span>
            <input className="mpr-input" value={fields.name} placeholder="e.g. Main Bank" autoFocus onChange={e => patch('name', e.target.value)} />
          </label>

          <div className="mpr-field-row">
            <label className="mpr-field" style={{ flex: 1 }}>
              <span>Label</span>
              <input className="mpr-input" value={fields.short} placeholder="Debit" onChange={e => patch('short', e.target.value)} />
            </label>
            <label className="mpr-field" style={{ flex: 1 }}>
              <span>Type</span>
              <select className="mpr-input" value={fields.type} onChange={e => patch('type', e.target.value as AccountType)}>
                <option value="cash">Cash</option>
                <option value="debit">Debit</option>
                <option value="savings">Savings</option>
                <option value="credit">Credit</option>
              </select>
            </label>
          </div>

          <div className="mpr-field-row">
            <label className="mpr-field" style={{ flex: 1 }}>
              <span>Balance</span>
              <input className="mpr-input" type="number" value={fields.balance} onChange={e => patch('balance', Number(e.target.value))} />
            </label>
            <label className="mpr-field" style={{ flex: 1 }}>
              <span>Last 4 digits</span>
              <input className="mpr-input" maxLength={4} value={fields.last4 ?? ''} placeholder="Optional" onChange={e => patch('last4', e.target.value)} />
            </label>
          </div>

          {fields.type === 'credit' && (
            <label className="mpr-field">
              <span>Credit limit</span>
              <input className="mpr-input" type="number" value={fields.limit ?? ''} onChange={e => patch('limit', Number(e.target.value) || undefined)} />
            </label>
          )}

          {fields.type !== 'credit' && (
            <label className="mpr-field">
              <span>Overdraft</span>
              <select className="mpr-input" value={fields.overdraftPolicy ?? ''} onChange={e => patch('overdraftPolicy', (e.target.value || undefined) as OverdraftPolicy | undefined)}>
                <option value="">Use global setting</option>
                <option value="block">Block when empty</option>
                <option value="warn">Warn</option>
                <option value="allow">Always allow</option>
              </select>
            </label>
          )}

          <div className="mpr-field">
            <span>Color</span>
            <div className="mpr-color-strip">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`mpr-color-dot${fields.color === c ? ' on' : ''}`}
                  style={{ background: c }}
                  onClick={() => patch('color', c)}
                />
              ))}
            </div>
          </div>

          {account && onDelete && (
            !confirmDel ? (
              <button className="mpr-del-btn" onClick={() => setConfirmDel(true)}>
                <Icon name="trash" size={16} /> Delete account
              </button>
            ) : (
              <div className="mpr-confirm-del">
                <p>Delete "{account.name}"? This cannot be undone.</p>
                <div>
                  <button onClick={() => setConfirmDel(false)}>Cancel</button>
                  <button className="danger" onClick={() => onDelete(account)}>
                    <Icon name="trash" size={16} /> Delete
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        <div className="mpr-editor-actions">
          <button className="mpr-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="mpr-btn-save" style={{ background: fields.color }} onClick={() => onSave(fields)}>
            {account ? 'Save' : 'Create'}
          </button>
        </div>
      </section>
    </div>
  )
}
