import { useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { fmtCompact } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import type { Account, AccountType } from '@/types'

const TYPE_META: Record<AccountType, { label: string; group: string; icon: Parameters<typeof Icon>[0]['name'] }> = {
  cash:    { label: 'Cash',    group: 'Cash',         icon: 'wallet' },
  debit:   { label: 'Debit',  group: 'Bank accounts', icon: 'cards'  },
  savings: { label: 'Savings',group: 'Bank accounts', icon: 'piggy'  },
  credit:  { label: 'Credit', group: 'Credit cards',  icon: 'cards'  },
}

function accountKind(a: Account): 'asset' | 'debt' {
  return a.type === 'credit' || a.balance < 0 ? 'debt' : 'asset'
}

export function MobileReports() {
  const { accounts, currency } = useFinance()

  const summary = useMemo(() => {
    const assets      = accounts.filter(a => accountKind(a) === 'asset').reduce((s, a) => s + Math.max(0, a.balance), 0)
    const liabilities = accounts.filter(a => accountKind(a) === 'debt').reduce((s, a) => s + Math.abs(Math.min(0, a.balance)), 0)
    return { assets, liabilities, net: assets - liabilities }
  }, [accounts])

  const groups = ['Cash', 'Bank accounts', 'Credit cards'].map(group => ({
    group,
    accounts: accounts.filter(a => TYPE_META[a.type].group === group),
  })).filter(g => g.accounts.length)

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0)

  return (
    <div className="mrep-root">

      {/* Net worth hero */}
      <div className="mrep-hero">
        <span className="mrep-hero-label">Net worth</span>
        <strong className="mrep-hero-value">{fmtCompact(summary.net, currency)}</strong>
        <div className="mrep-hero-bar">
          {summary.assets + summary.liabilities > 0 && (
            <div
              className="mrep-hero-bar-fill"
              style={{ width: `${Math.min(100, summary.assets / (summary.assets + summary.liabilities) * 100)}%` }}
            />
          )}
        </div>
        <div className="mrep-hero-row">
          <div className="mrep-hero-stat">
            <span className="mrep-hero-dot asset" />
            <div>
              <small>Assets</small>
              <strong>{fmtCompact(summary.assets, currency)}</strong>
            </div>
          </div>
          <div className="mrep-hero-stat">
            <span className="mrep-hero-dot debt" />
            <div>
              <small>Liabilities</small>
              <strong>{fmtCompact(summary.liabilities, currency)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Accounts breakdown */}
      {accounts.length === 0 ? (
        <div className="mrep-empty">
          <Icon name="cards" size={40} style={{ opacity: .25 }} />
          <p>No accounts yet. Add them from your Profile.</p>
        </div>
      ) : (
        <>
          {/* Allocation bar */}
          {accounts.length > 1 && (
            <div className="mrep-allocation">
              <span className="mrep-section-title">Allocation</span>
              <div className="mrep-alloc-bar">
                {accounts.map(a => (
                  <div
                    key={a.id}
                    className="mrep-alloc-segment"
                    style={{
                      flex: Math.max(0, a.balance) / Math.max(1, totalBalance),
                      background: a.color,
                    }}
                    title={`${a.name}: ${fmtCompact(a.balance, currency)}`}
                  />
                ))}
              </div>
              <div className="mrep-alloc-legend">
                {accounts.map(a => (
                  <div key={a.id} className="mrep-legend-item">
                    <span style={{ background: a.color }} />
                    <small>{a.short || a.name}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Groups */}
          {groups.map(({ group, accounts: accs }) => (
            <div key={group} className="mrep-group">
              <div className="mrep-group-header">
                <span>{group}</span>
                <strong>{fmtCompact(accs.reduce((s, a) => s + a.balance, 0), currency)}</strong>
              </div>
              {accs.map(a => {
                const used    = a.type === 'credit' && a.limit ? Math.abs(Math.min(0, a.balance)) : null
                const utilPct = used !== null && a.limit ? Math.min(100, used / a.limit * 100) : null
                return (
                  <div key={a.id} className="mrep-account-row">
                    <span className="mrep-account-icon" style={{ background: a.color + '22', color: a.color }}>
                      <Icon name={TYPE_META[a.type].icon} size={20} />
                    </span>
                    <div className="mrep-account-info">
                      <b>{a.name}</b>
                      <small>{TYPE_META[a.type].label}{a.last4 ? ` · ·· ${a.last4}` : ''}</small>
                      {utilPct !== null && a.limit && (
                        <div className="mrep-util-wrap">
                          <div className="mrep-util-bar">
                            <div style={{
                              width: `${utilPct}%`,
                              background: utilPct >= 90 ? '#ff6b8a' : utilPct >= 70 ? '#f59e0b' : '#35d0a2',
                            }} />
                          </div>
                          <span className={utilPct >= 90 ? 'text-expense' : utilPct >= 70 ? 'text-warn' : ''}>
                            {Math.round(utilPct)}% used · {fmtCompact(a.limit - used!, currency)} free
                          </span>
                        </div>
                      )}
                    </div>
                    <strong className={accountKind(a) === 'debt' ? 'text-expense' : ''}>
                      {fmtCompact(a.balance, currency)}
                    </strong>
                  </div>
                )
              })}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
