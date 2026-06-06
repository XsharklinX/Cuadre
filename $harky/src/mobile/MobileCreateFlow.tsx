import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { fmt, fmtCompact } from '@/data/helpers'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { useFinance } from '@/store/finance'
import { useT } from '@/i18n'
import { MobileDatePicker } from './MobileDatePicker'
import type { Category, IconName, RecurrenceFrequency, Transaction } from '@/types'
import { useMobileBackDismiss } from './useMobileBackDismiss'

type MobileTxMode = Transaction['type']

const today = () => new Date().toISOString().slice(0, 10)
const keypad = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', 'back'] as const
const CATEGORY_COLORS = ['#ffdd3d', '#35d0a2', '#5bc0ff', '#a78bfa', '#ff6b8a', '#f59e0b']
const CATEGORY_ICONS: IconName[] = [
  'cart', 'food', 'car', 'bolt', 'heart', 'home',
  'bag', 'book', 'wallet', 'laptop', 'trend', 'play',
  'music', 'coffee', 'phone', 'gym', 'bus', 'building',
  'gamepad', 'gift', 'scissors', 'baby', 'paw', 'pill',
  'plane', 'briefcase', 'shirt', 'pizza', 'star', 'fuel', 'flame', 'soda',
  'tree', 'sun', 'bike', 'train', 'tv', 'monitor', 'headphones', 'clock',
  'key', 'tool', 'brush', 'graduation', 'stethoscope', 'salad', 'wine',
  'crown', 'trophy', 'shield', 'map', 'package',
]

const ACCT_ICONS: Record<string, IconName> = {
  cash: 'wallet', debit: 'cards', savings: 'piggy', credit: 'cards',
}

function cleanAmount(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [integer = '', ...rest] = normalized.split('.')
  const decimal = rest.join('').slice(0, 2)
  const safeInteger = integer.replace(/^0+(?=\d)/, '')
  return rest.length ? `${safeInteger || '0'}.${decimal}` : safeInteger
}

function formatDateShort(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

export function MobileCreateFlow({
  mkey,
  onSaved,
}: {
  mkey: string
  onSaved: () => void
}) {
  const t = useT()
  const { accounts, categories, currency, addTx, transfer, addCategory } = useFinance()
  const [mode, setMode] = useState<MobileTxMode>('expense')
  const [amountText, setAmountText] = useState('')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [accountId, setAccountId] = useState<string | null>(null)   // no default account
  const [fromAccount, setFromAccount] = useState(accounts[0]?.id ?? '')
  const [toAccount, setToAccount] = useState(accounts[1]?.id ?? accounts[0]?.id ?? '')
  const [note, setNote] = useState('')
  const [categoryEditorOpen, setCategoryEditorOpen] = useState(false)
  const [transferPicker, setTransferPicker] = useState<'from' | 'to' | null>(null)
  const [accountPicker, setAccountPicker] = useState(false)
  const [datePicker, setDatePicker] = useState(false)
  const [date, setDate] = useState(() => {
    const current = today()
    return current.startsWith(mkey) ? current : `${mkey}-01`
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [shaking,   setShaking]   = useState(false)
  const [recurring, setRecurring] = useState(false)
  const [recurFreq, setRecurFreq] = useState<RecurrenceFrequency>('monthly')
  const [recurEnd,  setRecurEnd]  = useState('')
  const [recurEndPicker, setRecurEndPicker] = useState(false)

  const amount = Number(amountText || 0)
  const categoryType = mode === 'income' ? 'income' : 'expense'
  const visibleCategories = useMemo(
    () => categories.filter(c => c.type === categoryType).slice(0, 24),
    [categories, categoryType],
  )
  const activeCategory = visibleCategories.find(c => c.id === categoryId) ?? null
  const activeAccountId = accountId && accounts.some(a => a.id === accountId) ? accountId : null
  const activeAccount = activeAccountId ? accounts.find(a => a.id === activeAccountId) : null
  const fromAccountObj = accounts.find(a => a.id === fromAccount)
  const toAccountObj = accounts.find(a => a.id === toAccount)
  const validTransfer = mode === 'transfer' && !!fromAccount && !!toAccount && fromAccount !== toAccount

  // Save is only allowed when account is explicitly selected
  const canSave = amount > 0 && date && (
    mode === 'transfer'
      ? validTransfer
      : !!activeCategory && !!activeAccountId
  )
  const isToday = date === today()

  useMobileBackDismiss(categoryEditorOpen, () => setCategoryEditorOpen(false))
  useMobileBackDismiss(!!transferPicker, () => setTransferPicker(null))
  useMobileBackDismiss(accountPicker, () => setAccountPicker(false))
  useMobileBackDismiss(datePicker, () => setDatePicker(false))
  useMobileBackDismiss(recurEndPicker, () => setRecurEndPicker(false))

  const switchMode = (next: MobileTxMode) => { setMode(next); setCategoryId(null); setNote(''); setAccountId(null) }

  const pressKey = (key: (typeof keypad)[number]) => {
    setFormError(null)
    if (key === 'back') { setAmountText(v => v.slice(0, -1)); return }
    if (key === '.' && amountText.includes('.')) return
    setAmountText(v => cleanAmount(v + key))
  }

  const triggerShake = () => {
    setShaking(true)
    setTimeout(() => setShaking(false), 420)
  }

  const save = () => {
    if (!canSave) {
      const msg = amount <= 0
        ? 'Enter an amount greater than 0'
        : mode !== 'transfer' && !activeCategory
          ? 'Select a category'
          : mode !== 'transfer' && !activeAccountId
            ? 'Select an account'
            : mode === 'transfer' && fromAccount === toAccount
              ? 'Choose two different accounts'
              : 'Fill in all fields'
      setFormError(msg)
      triggerShake()
      return
    }
    setFormError(null)
    try {
      if (mode === 'transfer') {
        transfer({ fromAccount, toAccount, amount, date, note: note.trim() || 'Transfer' })
      } else {
        addTx({
          type: mode, amount, date,
          note: note.trim() || activeCategory!.name,
          categoryId: activeCategory!.id,
          accountId: activeAccountId!,
          ...(recurring ? {
            recurring: recurFreq,
            recurringStart: date,
            recurringEnd: recurEnd || undefined,
            recurringNext: advanceRecurrenceDate(date, recurFreq),
          } : {}),
        })
      }
      navigator.vibrate?.(18)
      toast(
        recurring
          ? `${recurFreq === 'weekly' ? 'Weekly' : 'Monthly'} recurring movement scheduled`
          : mode === 'transfer' ? 'Transfer recorded' : 'Movement saved',
        { icon: 'check', type: 'ok' },
      )
      setAmountText('')
      setNote('')
      setCategoryId(null)
      setAccountId(null)
      setRecurring(false)
      setRecurEnd('')
      onSaved()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Could not save.', { icon: 'alert' })
    }
  }

  const createCategory = (fields: { name: string; icon: IconName; color: string; budget: number }) => {
    const name = fields.name.trim()
    if (!name) { toast('Enter a category name.', { icon: 'alert' }); return }
    addCategory({ name, icon: fields.icon, color: fields.color, budget: fields.budget, type: categoryType })
    toast(`Category "${name}" created`, { icon: 'check', type: 'ok' })
    setCategoryEditorOpen(false)
  }

  const amountColor = mode === 'income' ? '#35d0a2' : mode === 'transfer' ? '#ffdd3d' : '#f65574'
  const currencyPrefix = currency === 'DOP' ? 'RD$' : currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency

  return (
    <div className="mobile-create-flow" aria-label="Add movement">

      {/* ─── Scrollable top section ─── */}
      <div className="mobile-create-scroll">

        {/* Mode tabs */}
        <div className="mobile-segment" role="tablist" aria-label="Movement type">
          {([['expense', t('expense')], ['income', t('income')], ['transfer', t('transfer')]] as const).map(([value, label]) => (
            <button key={value} className={mode === value ? 'on' : ''} role="tab" aria-selected={mode === value}
              onClick={() => switchMode(value)}>
              {label}
            </button>
          ))}
        </div>

        {mode !== 'transfer' ? (
          <>
            {/* Category header */}
            <div className="mobile-create-section-header">
              <span>{t('category')}</span>
              <button className="mobile-create-new-btn" onClick={() => setCategoryEditorOpen(true)}>
                <Icon name="plus" size={12} /> New
              </button>
            </div>

            {/* Category grid */}
            {visibleCategories.length ? (
              <div className="mobile-category-grid">
                {visibleCategories.map(category => {
                  const selected = activeCategory?.id === category.id
                  return (
                    <button key={category.id} className={selected ? 'on' : ''} aria-pressed={selected}
                      onClick={() => setCategoryId(category.id)}>
                      <span style={{ color: category.color, background: `color-mix(in oklab, ${category.color} 22%, transparent)` }}>
                        <Icon name={category.icon} size={20} />
                      </span>
                      <small>{category.name}</small>
                    </button>
                  )
                })}
                <button className="mobile-category-add" onClick={() => setCategoryEditorOpen(true)}>
                  <span><Icon name="plus" size={20} /></span>
                  <small>New</small>
                </button>
              </div>
            ) : (
              <button className="mobile-empty-action" onClick={() => setCategoryEditorOpen(true)}>
                Create a category to continue
              </button>
            )}

            {/* Account picker card + Date */}
            <div className="mobile-create-meta-row">
              <button
                className={`mobile-create-account-pill${!activeAccount ? ' unset' : ''}`}
                onClick={() => setAccountPicker(true)}
              >
                <span style={{ color: activeAccount?.color ?? 'var(--m-muted)' }}>
                  <Icon name={activeAccount ? ACCT_ICONS[activeAccount.type] : 'cards'} size={15} />
                </span>
                <span className="mobile-create-account-name">
                  {activeAccount ? activeAccount.name : t('account')}
                </span>
                <Icon name="arrowDn" size={12} style={{ color: 'var(--m-muted)', marginLeft: 'auto' }} />
              </button>
              <button className="mobile-create-date-pill" onClick={() => setDatePicker(true)}>
                <Icon name="calendar" size={13} />
                <span>{isToday ? t('today') : formatDateShort(date)}</span>
              </button>
            </div>

            {/* Note */}
            <div className="mobile-create-note-input">
              <Icon name="edit" size={14} />
              <input
                type="text"
                value={note}
                placeholder={activeCategory ? `e.g. ${activeCategory.name}` : mode === 'income' ? 'e.g. Payment received' : 'e.g. Purchase'}
                enterKeyHint="done"
                autoCapitalize="sentences"
                autoCorrect="on"
                onChange={e => setNote(e.target.value)}
              />
            </div>

            {/* Recurring toggle */}
            <button
              className={`mobile-create-recurring-toggle${recurring ? ' active' : ''}`}
              onClick={() => setRecurring(r => !r)}
            >
              <span className="mobile-recur-icon">
                <Icon name="repeat" size={15} />
              </span>
              <span className="mobile-recur-label">Repeat movement</span>
              <span className={`mobile-recur-switch${recurring ? ' on' : ''}`} />
            </button>

            {recurring && (
              <div className="mobile-create-recurring-opts">
                <div className="mobile-segment mobile-recur-freq">
                  <button className={recurFreq === 'weekly' ? 'on' : ''} onClick={() => setRecurFreq('weekly')}>
                    {t('weekly')}
                  </button>
                  <button className={recurFreq === 'monthly' ? 'on' : ''} onClick={() => setRecurFreq('monthly')}>
                    {t('monthly')}
                  </button>
                </div>
                <button className="mobile-create-date-pill" onClick={() => setRecurEndPicker(true)}>
                  <Icon name="calendar" size={13} />
                  <span>{recurEnd ? `Until ${formatDateShort(recurEnd)}` : 'No end date'}</span>
                  {recurEnd && (
                    <span style={{ marginLeft: 'auto' }} onClick={e => { e.stopPropagation(); setRecurEnd('') }}>
                      <Icon name="close" size={12} />
                    </span>
                  )}
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Transfer: visual account cards */}
            <div className="mobile-transfer-cards">
              <button className="mobile-transfer-card" onClick={() => setTransferPicker('from')}>
                <span style={{ color: fromAccountObj?.color ?? '#ffdd3d', background: `color-mix(in oklab, ${fromAccountObj?.color ?? '#ffdd3d'} 16%, transparent)` }}>
                  <Icon name={ACCT_ICONS[fromAccountObj?.type ?? 'cash']} size={26} />
                </span>
                <b>{fromAccountObj?.name ?? 'Origin'}</b>
                <small>{fromAccountObj ? fmtCompact(fromAccountObj.balance, currency) : '—'}</small>
                <em>From</em>
              </button>
              <div className="mobile-transfer-arrow">→</div>
              <button className="mobile-transfer-card" onClick={() => setTransferPicker('to')}>
                <span style={{ color: toAccountObj?.color ?? '#35d0a2', background: `color-mix(in oklab, ${toAccountObj?.color ?? '#35d0a2'} 16%, transparent)` }}>
                  <Icon name={ACCT_ICONS[toAccountObj?.type ?? 'cash']} size={26} />
                </span>
                <b>{toAccountObj?.name ?? 'Destination'}</b>
                <small>{toAccountObj ? fmtCompact(toAccountObj.balance, currency) : '—'}</small>
                <em>To</em>
              </button>
            </div>

            <div className="mobile-create-meta-row">
              <button className="mobile-create-date-pill" style={{ flex: 1 }} onClick={() => setDatePicker(true)}>
                <Icon name="calendar" size={13} />
                <span>{isToday ? t('today') : formatDateShort(date)}</span>
              </button>
            </div>

            <div className="mobile-create-note-input">
              <Icon name="edit" size={14} />
              <input
                type="text"
                value={note}
                placeholder="e.g. Transfer to savings"
                enterKeyHint="done"
                autoCapitalize="sentences"
                autoCorrect="on"
                onChange={e => setNote(e.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {/* ─── Fixed bottom: amount + keypad + save ─── */}
      <div className="mobile-create-bottom">
        {/* Amount display */}
        <div className={`mobile-create-amount-row${shaking ? ' shake' : ''}`}>
          <span className="mobile-create-amount-label">
            {mode === 'expense' ? t('expense') : mode === 'income' ? t('income') : t('amount')}
          </span>
          <strong className="mobile-create-amount-value" style={{ color: amountText ? amountColor : '#3a3a3a' }}>
            {amountText
              ? fmt(amount, currency, { decimals: amountText.includes('.') ? 2 : 0 })
              : `${currencyPrefix} 0`}
          </strong>
        </div>
        {formError && (
          <div className="mobile-create-error">
            <Icon name="alert" size={13} />
            {formError}
          </div>
        )}

        {/* Numpad */}
        <div className="mobile-keypad-compact">
          {keypad.map(key => (
            <button key={key} onClick={() => pressKey(key)}>
              {key === 'back' ? <Icon name="close" size={18} /> : key}
            </button>
          ))}
        </div>

        {/* Save */}
        <button className="mobile-save-button" disabled={!canSave} onClick={save}>
          <Icon name="check" size={20} />
          {mode === 'transfer' ? 'Transfer' : t('save')}
        </button>
      </div>

      {/* Single account picker */}
      {accountPicker && (
        <div className="mobile-detail-sheet" role="dialog" aria-modal="true" onClick={() => setAccountPicker(false)}>
          <section onClick={e => e.stopPropagation()}>
            <header>
              <span>Select account</span>
              <button onClick={() => setAccountPicker(false)}><Icon name="close" size={18} /></button>
            </header>
            {accounts.length === 0 ? (
              <div className="mobile-picker-list" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)' }}>
                No accounts yet. Add one from your Profile.
              </div>
            ) : (
              <div className="mobile-picker-list">
                {accounts.map(account => (
                  <button key={account.id}
                    className={`mobile-picker-row${account.id === activeAccountId ? ' active' : ''}`}
                    onClick={() => { setAccountId(account.id); setAccountPicker(false) }}>
                    <span style={{ color: account.color }}>
                      <Icon name={ACCT_ICONS[account.type] ?? 'wallet'} size={22} />
                    </span>
                    <b>{account.name}</b>
                    <small>{fmtCompact(account.balance, currency)}</small>
                    {account.id === activeAccountId && <Icon name="check" size={16} style={{ color: '#ffdd3d', marginLeft: 4 }} />}
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Transfer account picker sheet */}
      {transferPicker && (
        <div className="mobile-detail-sheet" role="dialog" aria-modal="true" onClick={() => setTransferPicker(null)}>
          <section onClick={e => e.stopPropagation()}>
            <header>
              <span>{transferPicker === 'from' ? 'Source account' : 'Destination account'}</span>
              <button onClick={() => setTransferPicker(null)}><Icon name="close" size={18} /></button>
            </header>
            <div className="mobile-picker-list">
              {accounts
                .filter(a => transferPicker === 'from' ? a.id !== toAccount : a.id !== fromAccount)
                .map(account => (
                  <button key={account.id} className="mobile-picker-row"
                    onClick={() => {
                      if (transferPicker === 'from') setFromAccount(account.id)
                      else setToAccount(account.id)
                      setTransferPicker(null)
                    }}>
                    <span style={{ color: account.color }}>
                      <Icon name={ACCT_ICONS[account.type] ?? 'wallet'} size={22} />
                    </span>
                    <b>{account.name}</b>
                    <small>{fmtCompact(account.balance, currency)}</small>
                  </button>
                ))}
            </div>
          </section>
        </div>
      )}

      {/* Date picker */}
      {datePicker && (
        <MobileDatePicker
          value={date}
          onChange={setDate}
          onClose={() => setDatePicker(false)}
          mkey={mkey}
        />
      )}

      {/* Recurring end date picker */}
      {recurEndPicker && (
        <MobileDatePicker
          value={recurEnd || date}
          onChange={v => setRecurEnd(v)}
          onClose={() => setRecurEndPicker(false)}
          mkey={mkey}
        />
      )}

      {categoryEditorOpen && (
        <MobileCategoryEditor
          type={categoryType}
          onClose={() => setCategoryEditorOpen(false)}
          onSave={createCategory}
        />
      )}
    </div>
  )
}

export type MobileCreateTarget = Transaction | 'new'

function MobileCategoryEditor({
  type,
  onClose,
  onSave,
}: {
  type: Category['type']
  onClose: () => void
  onSave: (fields: { name: string; icon: IconName; color: string; budget: number }) => void
}) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<IconName>(type === 'income' ? 'wallet' : 'cart')
  const [color, setColor] = useState(type === 'income' ? '#35d0a2' : '#ffdd3d')
  const [budget, setBudget] = useState('')

  useMobileBackDismiss(true, onClose)

  return (
    <div className="mobile-editor-screen" role="dialog" aria-modal="true">
      <header>
        <button onClick={onClose}>Cancel</button>
        <strong>New category</strong>
        <button onClick={() => onSave({ name, icon, color, budget: Number(budget) || 0 })}>Create</button>
      </header>
      <div className="mobile-editor-body">
        <label>
          <span>Type</span>
          <input value={type === 'income' ? 'Income' : 'Expense'} readOnly />
        </label>
        <label>
          <span>Name</span>
          <input
            autoFocus
            type="text"
            value={name}
            placeholder={type === 'income' ? 'e.g. Bonus' : 'e.g. Pets'}
            autoCapitalize="words"
            autoCorrect="on"
            enterKeyHint="done"
            onChange={event => setName(event.target.value)}
          />
        </label>
        {type === 'expense' && (
          <label>
            <span>Monthly budget</span>
            <input type="number" value={budget} placeholder="0" onChange={event => setBudget(event.target.value)} />
          </label>
        )}
        <div>
          <span className="mobile-editor-label">Icon</span>
          <div className="mobile-icon-grid">
            {CATEGORY_ICONS.map(item => (
              <button key={item} className={icon === item ? 'on' : ''} onClick={() => setIcon(item)}>
                <Icon name={item} size={22} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="mobile-editor-label">Color</span>
          <div className="mobile-color-grid">
            {CATEGORY_COLORS.map(item => (
              <button key={item} className={color === item ? 'on' : ''} style={{ background: item }} onClick={() => setColor(item)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
