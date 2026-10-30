import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { IconTile, NxSheet } from '@/components/ui/Phrase'
import { toast } from '@/components/ui/Toast'
import { CatBadge } from '@/views/shared'
import { accountCurrency, currentMonthKey, dateLocale, fmt, getAccount, getCategory, shortMonth } from '@/data/helpers'
import { matchSynonymCategoryIds, normalizeSearchText, parseSearchQuery } from '@/data/searchQuery'
import { amountDistance, matchesNearAmount, parseNearAmount } from '@/data/amountSearch'
import { groupByMerchant, monthsBackKeys, type MerchantGroup } from '@/data/searchGroups'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useT } from '@/i18n'
import type { Account, AccountType, Transaction } from '@/types'
import { CategoryPickSheet } from './MobileTxQuickMenu'
import { AccountPickSheet } from './goals/GoalBits'
import { META, UTILS, type ToolId, type UtilId } from './ToolsMenu'
import { SEARCH_INDEX, normalize } from './settings/searchIndex'
import type { ViewId } from '@/types'
import { useMobileBackDismiss } from './useMobileBackDismiss'

const MAX_RESULTS = 8
const MAX_TX_RESULTS = 20
const RECENTS_KEY = 'cuadre-search-recents'

const ACCOUNT_TYPE_ICON: Record<AccountType, 'wallet' | 'cards'> = {
  cash:    'wallet',
  debit:   'cards',
  savings: 'cards',
  credit:  'cards',
}

type Period = 'month' | 'lastMonth' | 'year'
interface Filters { type?: 'expense' | 'income'; categoryId?: string; period?: Period; min?: number; accountId?: string }

function txDateLabel(date: string, locale: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
}

function signedAmount(tx: Transaction, currency: Parameters<typeof fmt>[1]): string {
  if (tx.type === 'income') return `+${fmt(tx.amount, currency)}`
  if (tx.type === 'expense') return `-${fmt(tx.amount, currency)}`
  return fmt(tx.amount, currency)
}

function accountLabel(account: Account | undefined, fallback: string): string {
  return account?.name ?? fallback
}

function readRecents(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]') as string[] } catch { return [] }
}

/*
 * EL BUSCADOR (2.8).
 *
 *  S1  Agrupa por comercio y suma: «Supermercado Nacional · 24 compras ·
 *      RD$48,300», con sus meses y qué hacer después. Antes devolvía treinta
 *      filas iguales.
 *  S2  Abre con tus búsquedas recientes, preguntas hechas para ti y filtros en
 *      pastillas, como los de Movimientos.
 *  S3  Un solo buscador para todo: movimientos, cuentas, categorías, metas,
 *      clientes, servicios, herramientas y ajustes. El del menú ☰ abre este.
 */
export function MobileGlobalSearch({
  onClose,
  onEditTx,
  onGotoAccounts,
  onGotoCategories,
  onGotoGoals,
  onGoView,
  onUtil,
  onSettings,
}: {
  onClose: () => void
  onEditTx: (tx: Transaction) => void
  onGotoAccounts: () => void
  onGotoCategories: () => void
  onGotoGoals: () => void
  onGoView?: (view: ViewId) => void
  onUtil?: (u: UtilId) => void
  onSettings?: (sheet?: (typeof SEARCH_INDEX)[number]['sheet']) => void
}) {
  const { accounts, categories, goals, transactions, currency, updateTx } = useFinance()
  const clients = useBusiness(s => s.clients)
  const services = useBusiness(s => s.services)
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Filters>({})
  const [sheet, setSheet] = useState<'category' | 'period' | 'amount' | 'account' | 'recat' | null>(null)
  const [focus, setFocus] = useState<string | null>(null)
  const [recents, setRecents] = useState<string[]>(readRecents)

  useMobileBackDismiss(true, onClose)

  const q = query.trim().toLowerCase()
  const hasFilters = Object.values(filters).some(v => v !== undefined)
  const active = !!q || hasFilters

  // Lo buscado se recuerda al salir, para ofrecerlo la próxima vez.
  const qRef = useRef(q)
  qRef.current = q
  useEffect(() => () => {
    const last = qRef.current
    if (last.length < 2) return
    try {
      const next = [last, ...readRecents().filter(r => r !== last)].slice(0, 6)
      localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
    } catch { /* sin almacenamiento no hay recientes, y no pasa nada */ }
  }, [])

  const matchedAccounts = useMemo(() => {
    if (!q) return []
    return accounts.filter(a => a.name.toLowerCase().includes(q) || a.short.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
  }, [accounts, q])

  const matchedCategories = useMemo(() => {
    if (!q) return []
    return categories.filter(c => c.name.toLowerCase().includes(q) || translateCategoryName(c, lang).toLowerCase().includes(q)).slice(0, MAX_RESULTS)
  }, [categories, q, lang])

  const matchedGoals = useMemo(() => {
    if (!q) return []
    return goals.filter(g => g.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS)
  }, [goals, q])

  // S3 · Clientes, servicios, herramientas y ajustes.
  const matchedClients = useMemo(() => {
    if (!q) return []
    return clients.filter(c => !c.deletedAt && (normalize(c.name).includes(normalize(q)) || (c.phone ?? '').includes(q))).slice(0, 5)
  }, [clients, q])
  const matchedServices = useMemo(() => {
    if (!q) return []
    return services.filter(s => !s.archivedAt && normalize(s.name).includes(normalize(q))).slice(0, 5)
  }, [services, q])
  const matchedPlaces = useMemo(() => {
    if (!q) return []
    const n = normalize(q)
    return [
      ...(Object.keys(META) as ToolId[])
        .filter(id => normalize(t(META[id].label)).includes(n))
        .map(id => ({ key: `t:${id}`, icon: META[id].icon, color: META[id].color, label: t(META[id].label), crumb: t('toolsLabel'), go: () => onGoView?.(id as ViewId) })),
      ...UTILS
        .filter(u => normalize(t(u.label)).includes(n))
        .map(u => ({ key: `u:${u.id}`, icon: u.icon, color: '#a3a2a8', label: t(u.label), crumb: t('toolsUtilities'), go: () => onUtil?.(u.id) })),
      ...SEARCH_INDEX
        .filter(e => n.split(/\s+/).every(term => normalize(`${t(e.labelKey)} ${e.keywords}`).includes(term)))
        .map(e => ({ key: `s:${e.labelKey}`, icon: e.icon, color: e.color, label: t(e.labelKey), crumb: `${t('settings')} · ${t(e.crumbKey)}`, go: () => onSettings?.(e.sheet ?? undefined) })),
    ].slice(0, 6)
  }, [q, t, onGoView, onUtil, onSettings])

  const parsedQuery = useMemo(() => q ? parseSearchQuery(q) : null, [q])
  const synonymCategoryIds = useMemo(
    () => parsedQuery?.freeText ? matchSynonymCategoryIds(parsedQuery.freeText, categories) : [],
    [parsedQuery, categories],
  )

  /*
   * BUSCAR POR MONTO APROXIMADO: solo cuando lo tecleado es SOLO una cifra y
   * no hay ya un filtro explícito. Se suma al texto, no lo sustituye.
   */
  const nearAmount = useMemo(
    () => (parsedQuery && !parsedQuery.amountFilter && !parsedQuery.tagFilters.length && !parsedQuery.monthFilter)
      ? parseNearAmount(parsedQuery.freeText)
      : null,
    [parsedQuery],
  )

  // S2 · Los filtros de pastilla, como rango de fechas.
  const periodRange = useMemo(() => {
    if (!filters.period) return null
    const now = currentMonthKey()
    if (filters.period === 'month') return { from: `${now}-01`, to: `${now}-31` }
    if (filters.period === 'lastMonth') { const k = monthsBackKeys(now, 2)[1]; return { from: `${k}-01`, to: `${k}-31` } }
    return { from: `${now.slice(0, 4)}-01-01`, to: `${now.slice(0, 4)}-12-31` }
  }, [filters.period])

  const allMatched = useMemo(() => {
    if (!active) return []
    const monthKeyFilter = parsedQuery?.monthFilter
      ? `${parsedQuery.monthFilter.year}-${String(parsedQuery.monthFilter.month).padStart(2, '0')}`
      : null
    const freeText = parsedQuery ? normalizeSearchText(parsedQuery.freeText) : ''
    const tagFilters = parsedQuery?.tagFilters ?? []

    return transactions
      .filter(tx => {
        if (filters.type && tx.type !== filters.type) return false
        if (filters.categoryId === '__none' ? !!tx.categoryId : filters.categoryId && tx.categoryId !== filters.categoryId && !(tx.splits ?? []).some(s => s.categoryId === filters.categoryId)) return false
        if (filters.accountId && tx.accountId !== filters.accountId && tx.fromAccount !== filters.accountId && tx.toAccount !== filters.accountId) return false
        if (filters.min && tx.amount < filters.min) return false
        if (periodRange && (tx.date < periodRange.from || tx.date > periodRange.to)) return false
        if (monthKeyFilter && tx.date.slice(0, 7) !== monthKeyFilter) return false
        if (parsedQuery?.amountFilter) {
          const { op, value } = parsedQuery.amountFilter
          if (op === 'gt' && !(tx.amount > value)) return false
          if (op === 'lt' && !(tx.amount < value)) return false
        }
        // Un filtro de etiqueta exige TODAS: `#viaje #comida` acota, no ensancha.
        if (tagFilters.length) {
          const txTags = (tx.tags ?? []).map(normalizeSearchText)
          if (!tagFilters.every(tag => txTags.includes(tag))) return false
        }
        if (!freeText) return true
        if (nearAmount && matchesNearAmount(tx.amount, nearAmount)) return true
        const category = getCategory(tx.categoryId, categories)
        if (synonymCategoryIds.length && category && synonymCategoryIds.includes(category.id)) return true
        const account = getAccount(tx.accountId, accounts)
        const from = getAccount(tx.fromAccount, accounts)
        const to = getAccount(tx.toAccount, accounts)
        const haystack = normalizeSearchText([
          tx.note, category?.name, category && translateCategoryName(category, lang), account?.name, from?.name, to?.name,
          ...(tx.tags ?? []),
          String(tx.amount), tx.amount.toFixed(2), fmt(tx.amount, currency).replace(/,/g, ''),
        ].filter(Boolean).join(' '))
        return haystack.includes(freeText)
      })
      // Buscando por monto manda la cercanía a la cifra; si no, la fecha.
      .sort((a, b) => nearAmount
        ? (amountDistance(a.amount, nearAmount) - amountDistance(b.amount, nearAmount)) || b.date.localeCompare(a.date)
        : b.date.localeCompare(a.date))
  }, [active, transactions, categories, accounts, parsedQuery, synonymCategoryIds, lang, currency, nearAmount, filters, periodRange])

  // S1 · Agrupar por comercio: el que más coincide arriba, con su suma.
  const groups = useMemo(() => (q && !nearAmount ? groupByMerchant(allMatched) : []), [q, nearAmount, allMatched])
  const lead: MerchantGroup | null = groups[0] && groups[0].count >= 2 ? groups[0] : null
  const others = groups.slice(lead ? 1 : 0, (lead ? 1 : 0) + 4).filter(g => g.count >= 2)
  const focused = focus ? groups.find(g => g.key === focus) ?? null : null
  const listTx = (focused ? focused.txs : allMatched).slice(0, focused ? 200 : MAX_TX_RESULTS)
  const listTotal = allMatched.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0)

  const leadMonths = useMemo(() => {
    if (!lead) return []
    const keys = monthsBackKeys(currentMonthKey(), 10).reverse()
    return keys.map(k => ({ k, v: lead.txs.filter(tx => tx.date.startsWith(k) && tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0) }))
  }, [lead])
  const leadMax = Math.max(1, ...leadMonths.map(m => m.v))

  // Etiquetas del usuario, por frecuencia: el filtro por `#tag` a la vista.
  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tx of transactions) for (const tag of tx.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 12)
  }, [transactions])

  // S2 · Preguntas hechas para ti, con tu comercio más frecuente del año.
  const topMerchant = useMemo(() => {
    const year = currentMonthKey().slice(0, 4)
    const g = groupByMerchant(transactions.filter(tx => tx.type === 'expense' && tx.date.startsWith(year)))
    return g[0]?.count >= 3 ? g[0] : null
  }, [transactions])
  const uncategorized = useMemo(() => transactions.filter(tx => tx.type === 'expense' && !tx.categoryId && !(tx.splits?.length)).length, [transactions])

  const toggleTag = (tag: string) => {
    const token = `#${tag}`
    const has = parsedQuery?.tagFilters.includes(normalizeSearchText(tag))
    setQuery(prev => {
      if (has) return prev.replace(new RegExp(`#${tag}\\b`, 'i'), '').replace(/\s+/g, ' ').trim()
      return `${prev} ${token}`.replace(/\s+/g, ' ').trim()
    })
  }

  // «Cambiar categoría» de todo un comercio, con deshacer.
  const recategorize = (group: MerchantGroup, categoryId: string) => {
    const before = group.txs.filter(tx => tx.type === 'expense' && !tx.splits?.length).map(tx => ({ id: tx.id, categoryId: tx.categoryId }))
    before.forEach(b => updateTx(b.id, { categoryId }))
    const cat = categories.find(c => c.id === categoryId)
    toast(t('srchRecatDone').replace('{n}', String(before.length)).replace('{name}', cat ? translateCategoryName(cat, lang) : ''), {
      icon: 'check', type: 'ok',
      action: { label: t('undo'), onClick: () => before.forEach(b => updateTx(b.id, { categoryId: b.categoryId })) },
    })
  }

  const hasResults = matchedAccounts.length > 0 || matchedCategories.length > 0 || matchedGoals.length > 0
    || allMatched.length > 0 || matchedClients.length > 0 || matchedServices.length > 0 || matchedPlaces.length > 0

  const periodLabel = (p: Period) => p === 'month' ? t('srchThisMonth') : p === 'lastMonth' ? t('srchLastMonth') : t('srchThisYear')
  const catName = filters.categoryId === '__none' ? t('noCategoryLabel') : (() => { const c = categories.find(x => x.id === filters.categoryId); return c ? translateCategoryName(c, lang) : '' })()

  return (
    <div className="mobile-search-overlay srch28" role="dialog" aria-modal="true" aria-label={t('globalSearchLabel')}>
      <div className="mobile-search-head">
        <button onClick={onClose}>{t('cancel')}</button>
        <strong>{t('search')}</strong>
        <span />
      </div>
      <label className="mobile-search-input">
        <Icon name="search" size={18} />
        <input
          id="global-search"
          autoFocus
          value={query}
          placeholder={t('srchPlaceholder')}
          onChange={event => { setQuery(event.target.value); setFocus(null) }}
        />
        {query && (
          <button type="button" className="mobile-search-wipe" aria-label={t('clearFiltersLabel')} onClick={() => { setQuery(''); setFocus(null) }}>
            <Icon name="close" size={12} />
          </button>
        )}
      </label>

      {/* S2 · Filtros en pastillas, como en Movimientos. */}
      <div className="srch28-pills" role="group" aria-label={t('srchFilters')}>
        <button className={filters.type === 'expense' ? 'on' : ''} onClick={() => setFilters(f => ({ ...f, type: f.type === 'expense' ? undefined : 'expense' }))}>{t('expenses')}</button>
        <button className={filters.type === 'income' ? 'on' : ''} onClick={() => setFilters(f => ({ ...f, type: f.type === 'income' ? undefined : 'income' }))}>{t('incomes')}</button>
        <button className={filters.categoryId ? 'on' : ''} onClick={() => (filters.categoryId ? setFilters(f => ({ ...f, categoryId: undefined })) : setSheet('category'))}>{filters.categoryId ? `${catName} ×` : `${t('srchCategory')} ▾`}</button>
        <button className={filters.period ? 'on' : ''} onClick={() => (filters.period ? setFilters(f => ({ ...f, period: undefined })) : setSheet('period'))}>{filters.period ? `${periodLabel(filters.period)} ×` : `${t('srchWhen')} ▾`}</button>
        <button className={filters.min ? 'on' : ''} onClick={() => (filters.min ? setFilters(f => ({ ...f, min: undefined })) : setSheet('amount'))}>{filters.min ? `${t('srchMoreThan').replace('{amount}', fmt(filters.min, currency, { decimals: 0 }))} ×` : `${t('srchAmount')} ▾`}</button>
        {accounts.length > 1 && (
          <button className={filters.accountId ? 'on' : ''} onClick={() => (filters.accountId ? setFilters(f => ({ ...f, accountId: undefined })) : setSheet('account'))}>{filters.accountId ? `${accounts.find(a => a.id === filters.accountId)?.name ?? ''} ×` : `${t('account')} ▾`}</button>
        )}
      </div>

      {nearAmount && (
        <div className="msearch-near" role="status">
          <Icon name="target" size={12} />
          {t('searchNearAmount').replace('{amount}', fmt(nearAmount.value, currency))}
          <small>{fmt(nearAmount.min, currency)} – {fmt(nearAmount.max, currency)}</small>
        </div>
      )}

      {/* S2 · Antes de escribir ya hay qué tocar. */}
      {!active && (
        <div className="srch28-start">
          {recents.length > 0 && (
            <>
              <span className="mset-section-title">{t('srchRecents')}<button onClick={() => { setRecents([]); try { localStorage.removeItem(RECENTS_KEY) } catch { /* nada */ } }}>{t('srchClear')}</button></span>
              <div className="srch28-chips">{recents.map(r => <button key={r} onClick={() => setQuery(r)}>{r}</button>)}</div>
            </>
          )}
          <span className="mset-section-title">{t('srchAsk')}</span>
          <div className="srch28-chips">
            {topMerchant && <button onClick={() => { setQuery(topMerchant.note); setFilters({ period: 'year' }) }}>{t('srchAskMerchant').replace('{name}', topMerchant.note)}</button>}
            <button onClick={() => setFilters({ type: 'expense', period: 'lastMonth' })}>{t('srchAskLastMonth')}</button>
            <button onClick={() => setFilters({ type: 'expense', min: 5000 })}>{t('srchAskBig')}</button>
            {uncategorized > 0 && <button onClick={() => setFilters({ type: 'expense', categoryId: '__none' })}>{t('srchAskUncat').replace('{n}', String(uncategorized))}</button>}
          </div>
          {topTags.length > 0 && (
            <>
              <span className="mset-section-title">{t('filterByTagLabel')}</span>
              <div className="srch28-chips">{topTags.map(tag => <button key={tag} onClick={() => toggleTag(tag)}><Icon name="tag" size={12} /> {tag}</button>)}</div>
            </>
          )}
          <p className="srch28-hint">{t('srchHint')}</p>
        </div>
      )}

      {active && !hasResults && (
        <div className="mobile-empty-list">
          <Icon name="search" size={40} style={{ opacity: .25 }} />
          <strong>{t('noResultsTitle')}</strong>
          <span>{t('tryAnotherSearchTerm')}</span>
        </div>
      )}

      {/* S1 · El comercio que más coincide, sumado. */}
      {lead && !focused && (
        <section className="srch28-lead">
          <div className="srch28-lead-top">
            <CatBadge category={getCategory(lead.categoryId, categories)} size={40} />
            <span><b>{lead.note}</b><small>{t('srchPurchases').replace('{n}', String(lead.count))}</small></span>
          </div>
          <strong className="srch28-lead-total">{fmt(lead.expense || lead.income, currency)}</strong>
          {lead.months > 1 && <small className="srch28-lead-sub">{t('srchPerMonth').replace('{amount}', fmt((lead.expense || lead.income) / lead.months, currency, { decimals: 0 }))}</small>}
          {leadMonths.some(m => m.v > 0) && (
            <div className="srch28-bars" aria-hidden="true">
              {leadMonths.map(m => <span key={m.k}><i style={{ height: `${Math.max(3, (m.v / leadMax) * 100)}%` }} /><small>{shortMonth(m.k, locale).slice(0, 3)}</small></span>)}
            </div>
          )}
          <div className="srch28-lead-actions">
            <button onClick={() => setFocus(lead.key)}>{t('srchSeeAll').replace('{n}', String(lead.count))}</button>
            {onGoView && <button onClick={() => { onGoView('budgets'); onClose() }}>{t('srchBudget')}</button>}
            {lead.expense > 0 && <button onClick={() => setSheet('recat')}>{t('srchRecat')}</button>}
          </div>
        </section>
      )}

      {others.length > 0 && !focused && (
        <div className="mset-section">
          <span className="mset-section-title">{t('srchAlso')}</span>
          <div className="mset-card">
            {others.map(g => (
              <button key={g.key} className="mset-row" onClick={() => setFocus(g.key)}>
                <CatBadge category={getCategory(g.categoryId, categories)} size={32} />
                <span className="mset-label">{g.note}<small>{t('srchPurchases').replace('{n}', String(g.count))}</small></span>
                <span className="mset-value">{fmt(g.expense || g.income, currency)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {matchedPlaces.length > 0 && !focused && (
        <div className="mset-section">
          <span className="mset-section-title">{t('srchPlaces')}</span>
          <div className="mset-card">
            {matchedPlaces.map(r => (
              <button key={r.key} className="mset-row" onClick={() => { r.go(); onClose() }}>
                <IconTile icon={r.icon} color={r.color} size={32} />
                <span className="mset-label">{r.label}<small>{r.crumb}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {(matchedClients.length > 0 || matchedServices.length > 0) && !focused && (
        <div className="mset-section">
          <span className="mset-section-title">{t('bizTitle')}</span>
          <div className="mset-card">
            {matchedClients.map(c => (
              <button key={c.id} className="mset-row" onClick={() => { onGoView?.('business'); onClose() }}>
                <IconTile icon="user" color="#5bc0ff" size={32} />
                <span className="mset-label">{c.name}<small>{c.concept}</small></span>
                <span className="mset-value">{fmt(c.amount, c.currency ?? currency)}</span>
              </button>
            ))}
            {matchedServices.map(s => (
              <button key={s.id} className="mset-row" onClick={() => { onGoView?.('business'); onClose() }}>
                <IconTile icon="tv" color="#a78bfa" size={32} />
                <span className="mset-label">{s.name}<small>{t('srchService')}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {matchedAccounts.length > 0 && !focused && (
        <div className="mset-section">
          <span className="mset-section-title">{t('accounts')}</span>
          <div className="mset-card">
            {matchedAccounts.map(account => (
              <button key={account.id} className="mset-row" onClick={() => { onGotoAccounts(); onClose() }}>
                <span className="mset-icon" style={{ color: account.color, background: `color-mix(in oklab, ${account.color} 14%, transparent)` }}>
                  <Icon name={ACCOUNT_TYPE_ICON[account.type]} size={18} />
                </span>
                <span className="mset-label">{account.name}</span>
                <span className="mset-value">{fmt(account.balance, accountCurrency(account, currency))}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {matchedCategories.length > 0 && !focused && (
        <div className="mset-section">
          <span className="mset-section-title">{t('categoriesLabel')}</span>
          <div className="mset-card">
            {matchedCategories.map(category => (
              <button key={category.id} className="mset-row" onClick={() => { onGotoCategories(); onClose() }}>
                <CatBadge category={category} size={32} />
                <span className="mset-label">{translateCategoryName(category, lang)}</span>
                <span className="mset-value">{category.type === 'income' ? t('income') : t('expense')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {matchedGoals.length > 0 && !focused && (
        <div className="mset-section">
          <span className="mset-section-title">{t('goals')}</span>
          <div className="mset-card">
            {matchedGoals.map(goal => (
              <button key={goal.id} className="mset-row" onClick={() => { onGotoGoals(); onClose() }}>
                <span className="mset-icon" style={{ color: goal.color, background: `color-mix(in oklab, ${goal.color} 14%, transparent)` }}>
                  <Icon name={goal.icon} size={18} />
                </span>
                <span className="mset-label">{goal.name}</span>
                <span className="mset-value">{fmt(goal.saved, currency)} / {fmt(goal.target, currency)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {listTx.length > 0 && (
        <div className="mset-section">
          <span className="mset-section-title">
            {focused ? focused.note : t('movementsLabel')}
            <span className="srch28-total">
              {t('srchCount').replace('{n}', String(focused ? focused.count : allMatched.length))}
              {(focused ? focused.expense : listTotal) > 0 && ` · ${fmt(focused ? focused.expense : listTotal, currency)}`}
            </span>
          </span>
          {focused && <button className="srch28-back" onClick={() => setFocus(null)}>‹ {t('srchBackAll')}</button>}
          <div className="mobile-list-card">
            {listTx.map(tx => {
              const category = getCategory(tx.categoryId, categories)
              const account = getAccount(tx.accountId, accounts)
              return (
                <button key={tx.id} className="mobile-tx-row" onClick={() => { onEditTx(tx); onClose() }}>
                  {tx.type === 'transfer'
                    ? <span className="mobile-transfer-icon"><Icon name="repeat" size={24} /></span>
                    : <CatBadge category={category} size={40} />}
                  <span>
                    <b>{tx.type === 'transfer' ? t('transfer') : tx.note}</b>
                    <small>{tx.type === 'transfer'
                      ? `${accountLabel(getAccount(tx.fromAccount, accounts), t('origin'))} → ${accountLabel(getAccount(tx.toAccount, accounts), t('destination'))}`
                      : `${txDateLabel(tx.date, locale)} · ${category ? translateCategoryName(category, lang) : t('noCategoryLabel')} · ${account?.name ?? t('noAccountLabel')}`}</small>
                  </span>
                  <strong className={tx.type === 'income' ? 'income' : tx.type === 'transfer' ? 'transfer' : ''}>
                    {signedAmount(tx, currency)}
                  </strong>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {sheet === 'category' && (
        <CategoryPickSheet type={filters.type === 'income' ? 'income' : 'expense'} value="" onPick={id => { setFilters(f => ({ ...f, categoryId: id })); setSheet(null) }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'recat' && lead && (
        <CategoryPickSheet type="expense" value={lead.categoryId ?? ''} onPick={id => { recategorize(lead, id); setSheet(null) }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'account' && (
        <AccountPickSheet title={t('account')} accounts={accounts} value={filters.accountId ?? ''} onPick={id => { setFilters(f => ({ ...f, accountId: id })); setSheet(null) }} onClose={() => setSheet(null)} />
      )}
      {sheet === 'period' && (
        <NxSheet title={t('srchWhen')} onClose={() => setSheet(null)}>
          <div className="nx-list">
            {(['month', 'lastMonth', 'year'] as Period[]).map(p => (
              <button key={p} className="an28-pick" onClick={() => { setFilters(f => ({ ...f, period: p })); setSheet(null) }}>
                <span className="an28-row-main"><b>{periodLabel(p)}</b></span>
              </button>
            ))}
          </div>
        </NxSheet>
      )}
      {sheet === 'amount' && (
        <NxSheet title={t('srchAmount')} onClose={() => setSheet(null)}>
          <div className="nx-list">
            {[1000, 5000, 10000, 25000].map(v => (
              <button key={v} className="an28-pick" onClick={() => { setFilters(f => ({ ...f, min: v })); setSheet(null) }}>
                <span className="an28-row-main"><b>{t('srchMoreThan').replace('{amount}', fmt(v, currency, { decimals: 0 }))}</b></span>
              </button>
            ))}
          </div>
        </NxSheet>
      )}
    </div>
  )
}
