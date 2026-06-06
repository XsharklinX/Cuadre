import { useState, useEffect, useRef, useCallback } from 'react'
import { useFinance } from '@/store/finance'
import { Icon } from '@/components/ui/Icon'
import { fmtCompact } from '@/data/helpers'
import { useT } from '@/i18n'
import type { IconName } from '@/types'

interface Result {
  id:       string
  icon:     IconName
  label:    string
  sub?:     string
  color?:   string
  type:     'tx' | 'account' | 'goal'
  action:   () => void
}

interface Props {
  onClose:  () => void
  goto:     (v: import('@/types').ViewId) => void
  onEditTx: (tx: import('@/types').Transaction) => void
}

export function CommandPalette({ onClose, goto, onEditTx }: Props) {
  const t = useT()
  const { transactions, accounts, goals, categories, currency } = useFinance()
  const [q, setQ]     = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef      = useRef<HTMLInputElement>(null)
  const listRef       = useRef<HTMLDivElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results: Result[] = (() => {
    if (!q.trim()) return []
    const ql = q.toLowerCase()
    const out: Result[] = []

    // Transactions — search note, category name, account name
    transactions.slice(0, 500)
      .filter(tx => {
        const cat  = categories.find(c => c.id === tx.categoryId)
        const acct = accounts.find(a => a.id === tx.accountId)
        return (
          (tx.note ?? '').toLowerCase().includes(ql) ||
          (cat?.name ?? '').toLowerCase().includes(ql) ||
          (acct?.name ?? '').toLowerCase().includes(ql)
        )
      })
      .slice(0, 10)
      .forEach(tx => {
        const cat  = categories.find(c => c.id === tx.categoryId)
        const acct = accounts.find(a => a.id === tx.accountId)
        out.push({
          id:     tx.id,
          icon:   cat?.icon ?? 'list',
          label:  tx.note || cat?.name || '—',
          sub:    `${tx.date}${acct ? ' · ' + acct.name : ''}${cat ? ' · ' + cat.name : ''}`,
          color:  cat?.color,
          type:   'tx',
          action: () => { onEditTx(tx); onClose() },
        })
      })

    // Accounts
    accounts.filter(a => a.name.toLowerCase().includes(ql)).slice(0, 3)
      .forEach(a => out.push({
        id:     a.id,
        icon:   'cards',
        label:  a.name,
        sub:    fmtCompact(a.balance, currency),
        color:  a.color,
        type:   'account',
        action: () => { goto('accounts'); onClose() },
      }))

    // Goals
    goals.filter(g => g.name.toLowerCase().includes(ql)).slice(0, 3)
      .forEach(g => out.push({
        id:     g.id,
        icon:   g.icon,
        label:  g.name,
        sub:    `Goal · ${fmtCompact(g.saved, currency)} saved`,
        color:  g.color,
        type:   'goal',
        action: () => { goto('goals'); onClose() },
      }))

    return out
  })()

  const clampedIdx = Math.min(idx, Math.max(0, results.length - 1))

  const confirm = useCallback(() => {
    results[clampedIdx]?.action()
  }, [clampedIdx, results])

  useEffect(() => { setIdx(0) }, [q])

  useEffect(() => {
    const el = listRef.current?.children[clampedIdx] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [clampedIdx])

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter')     { e.preventDefault(); confirm() }
    if (e.key === 'Escape')    { e.preventDefault(); onClose() }
  }

  const TYPE_LABEL: Record<Result['type'], string> = {
    tx:      'Transaction',
    account: 'Account',
    goal:    'Goal',
  }

  return (
    <div className="cmd-overlay" onMouseDown={onClose}>
      <div className="cmd-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="cmd-input-wrap">
          <Icon name="search" size={17} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="cmd-input"
            placeholder={t('search') + ' transactions, accounts, goals…'}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKey}
            aria-label="Search"
          />
          <kbd className="cmd-esc" onClick={onClose}>Esc</kbd>
        </div>

        {q && results.length > 0 && (
          <div ref={listRef} className="cmd-results" role="listbox">
            {results.map((r, i) => (
              <button
                key={r.id}
                role="option"
                aria-selected={i === clampedIdx}
                className={`cmd-item${i === clampedIdx ? ' on' : ''}`}
                onMouseEnter={() => setIdx(i)}
                onClick={r.action}
              >
                <span className="cmd-icon" style={{ color: r.color ?? 'var(--accent)' }}>
                  <Icon name={r.icon} size={16} />
                </span>
                <span className="cmd-label">{r.label}</span>
                {r.sub && <span className="cmd-sub">{r.sub}</span>}
                <span className="cmd-type-badge">{TYPE_LABEL[r.type]}</span>
              </button>
            ))}
          </div>
        )}

        {q && results.length === 0 && (
          <div className="cmd-empty">No results for "{q}"</div>
        )}

        {!q && (
          <div className="cmd-hint">
            <Icon name="search" size={28} style={{ opacity: .15 }} />
            <p>Search your transactions, accounts and goals</p>
          </div>
        )}
      </div>
    </div>
  )
}
