import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { CatBadge } from '@/views/shared'
import { accountCurrency, dateLocale, fmt, getAccount, getCategory } from '@/data/helpers'
import { matchSynonymCategoryIds, normalizeSearchText, parseSearchQuery } from '@/data/searchQuery'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useT } from '@/i18n'
import type { Account, AccountType, Transaction } from '@/types'
import { useMobileBackDismiss } from './useMobileBackDismiss'

const MAX_RESULTS = 8
const MAX_TX_RESULTS = 20

const ACCOUNT_TYPE_ICON: Record<AccountType, 'wallet' | 'cards'> = {
  cash:    'wallet',
  debit:   'cards',
  savings: 'cards',
  credit:  'cards',
}

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

export function MobileGlobalSearch({
  onClose,
  onEditTx,
  onGotoAccounts,
  onGotoCategories,
  onGotoGoals,
}: {
  onClose: () => void
  onEditTx: (tx: Transaction) => void
  onGotoAccounts: () => void
  onGotoCategories: () => void
  onGotoGoals: () => void
}) {
  const { accounts, categories, goals, transactions, currency } = useFinance()
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const [query, setQuery] = useState('')

  useMobileBackDismiss(true, onClose)

  const q = query.trim().toLowerCase()

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

  // "Búsqueda que entiende": intenta extraer un filtro de monto ("más de
  // $1000") y/o de mes ("en mayo") de la consulta; lo que sobra sigue
  // funcionando como el match por substring de siempre (incl. sinónimos de
  // categoría tipo "comida" → Supermercado/Restaurantes).
  const parsedQuery = useMemo(() => q ? parseSearchQuery(q) : null, [q])
  const synonymCategoryIds = useMemo(
    () => parsedQuery?.freeText ? matchSynonymCategoryIds(parsedQuery.freeText, categories) : [],
    [parsedQuery, categories],
  )

  const matchedTx = useMemo(() => {
    if (!q || !parsedQuery) return []
    const monthKeyFilter = parsedQuery.monthFilter
      ? `${parsedQuery.monthFilter.year}-${String(parsedQuery.monthFilter.month).padStart(2, '0')}`
      : null
    const freeText = normalizeSearchText(parsedQuery.freeText)
    const tagFilters = parsedQuery.tagFilters

    return transactions
      .filter(tx => {
        if (monthKeyFilter && tx.date.slice(0, 7) !== monthKeyFilter) return false
        if (parsedQuery.amountFilter) {
          const { op, value } = parsedQuery.amountFilter
          if (op === 'gt' && !(tx.amount > value)) return false
          if (op === 'lt' && !(tx.amount < value)) return false
        }
        // Un filtro de etiqueta exige que el movimiento las tenga TODAS: `#viaje
        // #comida` es la intersección, no la unión — así se acota, no se ensancha.
        if (tagFilters.length) {
          const txTags = (tx.tags ?? []).map(normalizeSearchText)
          if (!tagFilters.every(tag => txTags.includes(tag))) return false
        }
        if (!freeText) return true

        const category = getCategory(tx.categoryId, categories)
        if (synonymCategoryIds.length && category && synonymCategoryIds.includes(category.id)) return true

        const account = getAccount(tx.accountId, accounts)
        const from = getAccount(tx.fromAccount, accounts)
        const to = getAccount(tx.toAccount, accounts)
        const haystack = normalizeSearchText([
          tx.note, category?.name, category && translateCategoryName(category, lang), account?.name, from?.name, to?.name,
          ...(tx.tags ?? []),
          String(tx.amount), tx.amount.toFixed(2), fmt(tx.amount, currency).replace(/,/g, ''),
        ]
          .filter(Boolean)
          .join(' '))
        return haystack.includes(freeText)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_TX_RESULTS)
  }, [transactions, categories, accounts, q, parsedQuery, synonymCategoryIds, lang, currency])

  // Etiquetas del usuario, por frecuencia — se ofrecen como chips para que el
  // filtro por `#tag` sea descubrible en vez de un truco oculto. Es la potencia
  // dormida del modelo: las etiquetas ya se guardan, solo faltaba dónde tocarlas.
  const topTags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tx of transactions) {
      for (const tag of tx.tags ?? []) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 12)
  }, [transactions])

  // Total de lo filtrado por etiqueta (gastos), para responder «¿cuánto llevo
  // en esto?» de un vistazo — el ejemplo del roadmap.
  const tagFilterTotal = useMemo(() => {
    if (!parsedQuery?.tagFilters.length) return null
    return matchedTx
      .filter(tx => tx.type === 'expense')
      .reduce((sum, tx) => sum + tx.amount, 0)
  }, [matchedTx, parsedQuery])

  const toggleTag = (tag: string) => {
    const token = `#${tag}`
    const has = parsedQuery?.tagFilters.includes(normalizeSearchText(tag))
    setQuery(prev => {
      if (has) return prev.replace(new RegExp(`#${tag}\\b`, 'i'), '').replace(/\s+/g, ' ').trim()
      return `${prev} ${token}`.replace(/\s+/g, ' ').trim()
    })
  }

  const hasResults = matchedAccounts.length > 0 || matchedCategories.length > 0
    || matchedGoals.length > 0 || matchedTx.length > 0

  return (
    <div className="mobile-search-overlay" role="dialog" aria-modal="true" aria-label={t('globalSearchLabel')}>
      <div className="mobile-search-head">
        <button onClick={onClose}>{t('cancel')}</button>
        <strong>{t('search')}</strong>
        <span />
      </div>
      <label className="mobile-search-input">
        <Icon name="search" size={18} />
        <input
          autoFocus
          value={query}
          placeholder={t('searchPlaceholderAll')}
          onChange={event => setQuery(event.target.value)}
        />
      </label>

      {topTags.length > 0 && (
        <div className="mobile-search-tags" role="group" aria-label={t('filterByTagLabel')}>
          {topTags.map(tag => {
            const active = parsedQuery?.tagFilters.includes(normalizeSearchText(tag)) ?? false
            return (
              <button
                key={tag}
                type="button"
                className={`mobile-search-tag${active ? ' on' : ''}`}
                aria-pressed={active}
                onClick={() => toggleTag(tag)}
              >
                <Icon name="tag" size={12} /> {tag}
              </button>
            )
          })}
        </div>
      )}

      {tagFilterTotal !== null && matchedTx.length > 0 && (
        <div className="mobile-search-tagtotal">
          <span>{t('tagTotalLabel').replace('{n}', String(matchedTx.length))}</span>
          <strong className="expense">{fmt(tagFilterTotal, currency)}</strong>
        </div>
      )}

      {!q && (
        <div className="mobile-empty-list">
          <Icon name="search" size={40} style={{ opacity: .25 }} />
          <strong>{t('searchEverywhereTitle')}</strong>
          <span>{t('searchEverywhereHint')}</span>
        </div>
      )}

      {q && !hasResults && (
        <div className="mobile-empty-list">
          <Icon name="search" size={40} style={{ opacity: .25 }} />
          <strong>{t('noResultsTitle')}</strong>
          <span>{t('tryAnotherSearchTerm')}</span>
        </div>
      )}

      {matchedAccounts.length > 0 && (
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

      {matchedCategories.length > 0 && (
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

      {matchedGoals.length > 0 && (
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

      {matchedTx.length > 0 && (
        <div className="mset-section">
          <span className="mset-section-title">{t('movementsLabel')}</span>
          <div className="mobile-list-card">
            {matchedTx.map(tx => {
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
                      : `${category ? translateCategoryName(category, lang) : t('noCategoryLabel')} · ${account?.name ?? t('noAccountLabel')} · ${txDateLabel(tx.date, locale)}`}</small>
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
    </div>
  )
}
