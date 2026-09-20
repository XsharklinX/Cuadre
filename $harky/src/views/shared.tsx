import type { CSSProperties, ReactNode } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Icon } from '@/components/ui/Icon'
import { AreaLine } from '@/components/ui/charts'
import { dateLocale, fmtCompact, getAccount, getCategory } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { Category, IconName, Transaction } from '@/types'

export function Card({ title, sub, action, children, style }: {
  title?: string; sub?: string; action?: ReactNode; children: ReactNode; style?: CSSProperties
}) {
  return <section className="card" style={style}>
    {(title || action) && <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
      <div>{title && <h3 style={{ margin: 0, fontSize: 14.5 }}>{title}</h3>}{sub && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>{sub}</p>}</div>
      {action}
    </header>}
    {children}
  </section>
}

export function CatBadge({ category, size = 38 }: { category?: Category; size?: number }) {
  if (!category) return null
  return <span style={{ width: size, height: size, borderRadius: size * .32, flex: '0 0 auto', display: 'grid', placeItems: 'center', color: category.color, background: `color-mix(in oklab, ${category.color} 18%, transparent)` }}>
    <Icon name={category.icon} size={size * .5} />
  </span>
}

export function TxRow({ tx, onClick }: { tx: Transaction; onClick?: () => void }) {
  const { accounts, categories, currency } = useFinance()
  const lang = useSettings(s => s.language)
  const day = new Date(`${tx.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: '2-digit', month: 'short' })
  if (tx.type === 'transfer') {
    return <div className="txrow" onClick={onClick}><Icon name="cards" size={20} style={{ color: 'var(--accent)' }} />
      <div style={{ flex: 1 }}><b>Transferencia</b><small>{getAccount(tx.fromAccount, accounts)?.name} → {getAccount(tx.toAccount, accounts)?.name}</small></div>
      <div className="tx-amount">{fmtCompact(tx.amount, currency)}<small>{day}</small></div>
    </div>
  }
  const cat = getCategory(tx.categoryId, categories)
  const income = tx.type === 'income'
  return <div className="txrow" onClick={onClick}><CatBadge category={cat} />
    <div style={{ minWidth: 0, flex: 1 }}><b>{tx.note}</b><small>{cat?.name} · {getAccount(tx.accountId, accounts)?.name}</small></div>
    <div className="tx-amount" style={{ color: income ? 'var(--income)' : 'var(--text)' }}>{income ? '+' : '−'}{fmtCompact(tx.amount, currency)}<small>{day}</small></div>
  </div>
}

export function MiniStat({ label, amount, value, color = 'var(--text)' }: { label: string; amount?: number; value?: string; color?: string }) {
  return <div className="card mini-stat"><small>{label}</small><strong style={{ color }}>{amount == null ? value : <AnimatedMoney value={amount} decimals={0} />}</strong></div>
}

export function StatTile({ label, amount, icon, accent, footer, sparkline }: {
  label:      string
  amount:     number
  icon:       IconName
  accent:     string
  footer?:    string
  sparkline?: number[]   // net worth trend: 12 puntos
}) {
  return (
    <div className="card stat-tile">
      <div><small>{label}</small><Icon name={icon} size={16} style={{ color: accent }} /></div>
      <strong><AnimatedMoney value={amount} compact /></strong>
      {sparkline && sparkline.length > 1 && (
        <div className="stat-tile-sparkline">
          <AreaLine points={sparkline} height={28} color={accent} />
        </div>
      )}
      {footer && <small>{footer}</small>}
    </div>
  )
}

export function Legend({ color, label }: { color: string; label: string }) {
  return <span className="legend"><i style={{ background: color }} />{label}</span>
}

export function Empty({ title = 'Todavía no hay datos', text, icon = 'shark', action }: {
  title?: string
  text: string
  icon?: IconName
  action?: ReactNode
}) {
  return <div className="empty-state">
    <span className="empty-ico"><Icon name={icon} size={26} /></span>
    <div><h3>{title}</h3><p>{text}</p></div>
    {action}
  </div>
}

export function BusyButton({ busy, busyLabel = 'Procesando…', children, ...props }: {
  busy: boolean
  busyLabel?: string
  children: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} disabled={busy || props.disabled} aria-busy={busy}>
    {busy ? <><span className="spinner" aria-hidden="true" />{busyLabel}</> : children}
  </button>
}
