import { useMemo, useState } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Icon } from '@/components/ui/Icon'
import { projectCashflow } from '@/data/cashflowProjection'
import { amountForCategory, currentMonthKey, dateLocale, localToday, txForMonth } from '@/data/helpers'
import { isGoalDone } from '@/data/goalPlans'
import { remaining as capriceRemaining } from '@/data/caprices'
import { firstRecurrenceDate } from '@/hooks/useRecurring'
import { useFmt } from '@/hooks/useFmt'
import { useT, type LangKey } from '@/i18n'
import { playSoftHaptic } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { isOwed, monthsLabel, simulatePayoff, useDebt } from '@/store/debt'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { IconName, ViewId } from '@/types'
import { SEARCH_INDEX, normalize } from './settings/searchIndex'
import type { Sheet as SettingsSheetId } from './settings/shared'

export type ToolId = 'budgets' | 'goals' | 'caprices' | 'subscriptions' | 'debt' | 'cashflow'
export type UtilId = 'notes' | 'converter' | 'calendar' | 'export' | 'import'

const GROUPS: { key: LangKey; tools: ToolId[] }[] = [
  { key: 'toolsPlan', tools: ['budgets', 'goals', 'caprices'] },
  { key: 'commitmentsGroup', tools: ['subscriptions', 'debt', 'cashflow'] },
]

/*
 * EL ORDEN Y LAS FAVORITAS DE CADA PERSONA (H4).
 * Se recuerda en el dispositivo: es cómo te gusta tener el menú, no un dato.
 */
export const useToolsLayout = create<{
  order: ToolId[]
  pinned: ToolId[]
  move: (id: ToolId, dir: -1 | 1) => void
  togglePin: (id: ToolId) => void
}>()(persist((set, get) => ({
  order: [],
  pinned: [],
  move: (id, dir) => {
    const base = get().order.length ? get().order : GROUPS.flatMap(g => g.tools)
    const order = [...base]
    const i = order.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    set({ order })
  },
  togglePin: id => set(s => ({ pinned: s.pinned.includes(id) ? s.pinned.filter(x => x !== id) : [...s.pinned, id] })),
}), { name: 'cuadre-tools-v1', storage: createJSONStorage(() => localStorage) }))

export const META: Record<ToolId, { icon: IconName; color: string; label: LangKey }> = {
  budgets: { icon: 'wallet', color: '#22c55e', label: 'budgets' },
  goals: { icon: 'target', color: '#35d0a2', label: 'goals' },
  caprices: { icon: 'piggy', color: '#ff9a3d', label: 'capTitle' },
  subscriptions: { icon: 'repeat', color: '#5bc0ff', label: 'subscriptions' },
  debt: { icon: 'dollar', color: '#6366f1', label: 'debtsLabel' },
  cashflow: { icon: 'trend', color: '#38bdf8', label: 'cashflowTitle' },
}

export const UTILS: { id: UtilId; icon: IconName; label: LangKey }[] = [
  { id: 'notes', icon: 'clipboard', label: 'listsTitle' },
  { id: 'converter', icon: 'coins', label: 'converterTitle' },
  { id: 'calendar', icon: 'calendar', label: 'calendarLabel' },
  { id: 'export', icon: 'download', label: 'exportData' },
  { id: 'import', icon: 'upload', label: 'importLabel' },
]

function endOfMonth(today: string): string {
  const d = new Date(`${today}T00:00:00`)
  d.setMonth(d.getMonth() + 1, 0)
  return localToday(d)
}

interface ToolState { sub: string; badge?: number; warn?: boolean; pct?: number; ring?: number }

/**
 * Lo que dice cada mosaico. Solo se calcula con el menú abierto. Exportada
 * para el punto de aviso del ☰ de la cabecera (H3), que cuenta los avisos.
 */
export function useToolStates(): Record<ToolId, ToolState> {
  const t = useT()
  const fmtVal = useFmt()
  const lang = useSettings(s => s.language)
  const { transactions, accounts, categories, goals, currency } = useFinance()
  const debts = useDebt(s => s.debts)
  const extra = useDebt(s => s.extraPayment)
  const caprices = useCaprices(s => s.items)
  const today = localToday()

  return useMemo(() => {
    // Presupuestos: lo que queda del total y cuántas categorías se pasaron.
    const monthTx = txForMonth(transactions, currentMonthKey())
    const withBudget = categories.filter(c => c.type === 'expense' && c.budget > 0)
    let budgetTotal = 0, spentTotal = 0, over = 0
    for (const c of withBudget) {
      const spent = monthTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + amountForCategory(tx, c.id), 0)
      budgetTotal += c.budget
      spentTotal += spent
      if (spent >= c.budget) over += 1
    }
    const leftPct = budgetTotal > 0 ? Math.max(0, Math.round(100 - (spentTotal / budgetTotal) * 100)) : null

    // Meta principal: la primera sin lograr.
    const main = goals.find(g => !isGoalDone(g))
    const mainPct = main ? Math.min(100, Math.round((main.saved / main.target) * 100)) : null

    // Caprichos: lo que falta por recuperar.
    const capLeft = caprices.filter(c => !c.closed).reduce((s, c) => s + Math.max(0, capriceRemaining(c)), 0)

    // Suscripciones: gastos que se repiten. Total al mes y la próxima.
    const subs = transactions.filter(tx => tx.recurring && tx.type === 'expense')
    const perMonth = subs.reduce((s, tx) => s + (tx.recurring === 'weekly' ? tx.amount * 52 / 12 : tx.amount), 0)
    const next = subs.map(tx => ({ tx, date: firstRecurrenceDate(tx) })).filter(x => x.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
    const soonDays = next ? Math.round((new Date(`${next.date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000) : null

    // Deudas: lo que debes, en cuánto lo saldas y si una cuota vence ya.
    const owed = debts.filter(isOwed)
    const debtTotal = owed.reduce((s, d) => s + d.balance, 0)
    const day = Number(today.slice(8, 10))
    const dueSoon = owed.filter(d => d.balance > 0 && d.dueDay && d.dueDay >= day && d.dueDay - day <= 3).length

    // Flujo: cómo cierras el mes.
    const cash = projectCashflow(transactions, accounts, goals, endOfMonth(today), today, currency)

    return {
      budgets: withBudget.length
        ? { sub: t('toolsBudgetLeft').replace('{pct}', String(leftPct ?? 0)), pct: leftPct ?? 0, badge: over || undefined, warn: over > 0 }
        : { sub: t('budgetsQuickDesc') },
      goals: main
        ? { sub: `${main.name} ${mainPct}%`, ring: mainPct ?? 0 }
        : { sub: t('goalsQuickDesc') },
      caprices: capLeft > 0 ? { sub: t('toolsCapLeft').replace('{amount}', fmtVal(capLeft, currency)) } : { sub: t('capQuickDesc') },
      subscriptions: subs.length
        ? {
            sub: next
              ? t('toolsSubNext').replace('{name}', next.tx.note).replace('{date}', new Date(`${next.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })).replace('{amount}', fmtVal(perMonth, currency))
              : t('toolsSubTotal').replace('{amount}', fmtVal(perMonth, currency)),
            badge: soonDays !== null && soonDays <= 2 ? 1 : undefined,
          }
        : { sub: t('subscriptionsQuickDesc') },
      debt: owed.length
        ? { sub: `${fmtVal(debtTotal, currency)} · ${monthsLabel(simulatePayoff(owed, extra, 'avalanche').months, t)}`, badge: dueSoon || undefined, warn: dueSoon > 0 }
        : { sub: t('debtQuickDesc') },
      cashflow: { sub: t('cashflowMenuSub').replace('{amount}', fmtVal(cash.endBalance, currency)), warn: cash.endBalance < 0, badge: cash.endBalance < 0 ? 1 : undefined },
    }
  }, [transactions, accounts, categories, goals, currency, debts, extra, caprices, today, t, fmtVal, lang])
}

export function ToolsMenu({ onGo, onUtil, onSettings, onOpenSearch }: {
  onGo: (view: ViewId) => void
  onUtil: (id: UtilId) => void
  onSettings: (sheet?: SettingsSheetId) => void
  /** S3 (2.8): un solo buscador. Si se pasa, el campo del menú abre el buscador global. */
  onOpenSearch?: () => void
}) {
  const t = useT()
  const states = useToolStates()
  const { order, pinned, move, togglePin } = useToolsLayout()
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)

  const ordered = (ids: ToolId[]) => {
    const pos = (id: ToolId) => { const i = order.indexOf(id); return i < 0 ? 100 + GROUPS.flatMap(g => g.tools).indexOf(id) : i }
    return [...ids].sort((a, b) => pos(a) - pos(b))
  }

  const tile = (id: ToolId, i: number, list: ToolId[]) => {
    const m = META[id], s = states[id]
    const isPinned = pinned.includes(id)
    return (
      <div key={id} className={`mtm-tile${s.warn ? ' warn' : ''}`} style={{ ['--c' as string]: m.color }}>
        <button className="mtm-tile-main" onClick={() => (editing ? undefined : onGo(id as ViewId))} disabled={editing}>
          <span className="mtm-tile-ico"><Icon name={m.icon} size={18} /></span>
          <b>{t(m.label)}</b>
          {s.pct !== undefined && <span className="mtm-tbar"><i style={{ width: `${s.pct}%` }} /></span>}
          {s.ring !== undefined && (
            <svg className="mtm-ring" width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
              <circle cx="11" cy="11" r="8.5" className="trk" />
              <circle cx="11" cy="11" r="8.5" className="val" strokeDasharray={`${(s.ring / 100) * 53.4} 53.4`} />
            </svg>
          )}
          <small>{s.sub}</small>
        </button>
        {s.badge ? <em className="mtm-badge" aria-label={t('toolsNeedsAttention')}>{s.badge}</em> : null}
        {editing && (
          <span className="mtm-edit">
            <button aria-label={t('moveUp')} disabled={i === 0} onClick={() => { move(id, -1); playSoftHaptic() }}><Icon name="arrowUp" size={13} style={{ transform: 'rotate(-90deg)' }} /></button>
            <button aria-label={isPinned ? t('toolsUnpin') : t('toolsPin')} className={isPinned ? 'on' : ''} onClick={() => { togglePin(id); playSoftHaptic() }}><Icon name="pin" size={13} /></button>
            <button aria-label={t('moveDown')} disabled={i === list.length - 1} onClick={() => { move(id, 1); playSoftHaptic() }}><Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} /></button>
          </span>
        )}
      </div>
    )
  }

  // H2 · Buscar herramientas y ajustes a la vez.
  const q = normalize(query.trim())
  const results = q ? [
    ...(Object.keys(META) as ToolId[])
      .filter(id => normalize(`${t(META[id].label)} ${states[id].sub}`).includes(q))
      .map(id => ({ key: `t:${id}`, icon: META[id].icon, color: META[id].color, label: t(META[id].label), crumb: t('toolsLabel'), go: () => onGo(id as ViewId) })),
    ...UTILS
      .filter(u => normalize(t(u.label)).includes(q))
      .map(u => ({ key: `u:${u.id}`, icon: u.icon, color: '#a3a2a8', label: t(u.label), crumb: t('toolsUtilities'), go: () => onUtil(u.id) })),
    ...SEARCH_INDEX
      .filter(e => q.split(/\s+/).every(term => normalize(`${t(e.labelKey)} ${e.keywords}`).includes(term)))
      .map(e => ({ key: `s:${e.labelKey}`, icon: e.icon, color: e.color, label: t(e.labelKey), crumb: `${t('settings')} · ${t(e.crumbKey)}`, go: () => onSettings(e.sheet ?? undefined) })),
  ].slice(0, 12) : []

  const pinnedList = ordered(pinned.filter(id => META[id]))

  return (
    <div className="mtm">
      {onOpenSearch ? (
        <button id="tools-search" className="mtm-search mtm-search-btn" onClick={onOpenSearch}>
          <Icon name="search" size={16} />
          <span>{t('toolsSearchPlaceholder')}</span>
        </button>
      ) : (
      <div className="mtm-search">
        <Icon name="search" size={16} />
        <input
          id="tools-search"
          type="text"
          value={query}
          placeholder={t('toolsSearchPlaceholder')}
          aria-label={t('toolsSearchPlaceholder')}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="search"
          onChange={e => setQuery(e.target.value)}
        />
        {query && <button aria-label={t('close')} onClick={() => setQuery('')}><Icon name="close" size={14} /></button>}
      </div>
      )}

      {q ? (
        <div className="mtm-results">
          {results.length === 0 && <p className="mtm-empty">{t('settingsNoResults').replace('{q}', query.trim())}</p>}
          {results.map(r => (
            <button key={r.key} className="mtm-result" onClick={r.go}>
              <span className="mtm-tile-ico" style={{ ['--c' as string]: r.color }}><Icon name={r.icon} size={16} /></span>
              <span><b>{r.label}</b><small>{r.crumb}</small></span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mtm-head">
            <span />
            <button className="mtm-edit-toggle" onClick={() => { setEditing(e => !e); playSoftHaptic() }}>
              {editing ? t('reorderDone') : t('toolsArrange')}
            </button>
          </div>
          {pinnedList.length > 0 && (
            <>
              <p className="mtm-group">{t('toolsPinned')}</p>
              <div className="mtm-tiles">{pinnedList.map((id, i) => tile(id, i, pinnedList))}</div>
            </>
          )}
          {GROUPS.map(g => {
            const list = ordered(g.tools.filter(id => !pinned.includes(id)))
            if (!list.length) return null
            return (
              <div key={g.key}>
                <p className="mtm-group">{t(g.key)}</p>
                <div className="mtm-tiles">{list.map((id, i) => tile(id, i, list))}</div>
              </div>
            )
          })}
          <p className="mtm-group">{t('toolsUtilities')}</p>
          <div className="mtm-utils">
            {UTILS.map(u => (
              <button key={u.id} onClick={() => onUtil(u.id)}>
                <Icon name={u.icon} size={16} />
                <span>{t(u.label)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** ¿Hay algo en el menú que pida atención? Para el punto del ☰ (H3). */
export function useToolsAttention(): number {
  const s = useToolStates()
  return (Object.values(s) as ToolState[]).reduce((n, x) => n + (x.badge ? 1 : 0), 0)
}
