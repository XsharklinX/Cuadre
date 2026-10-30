import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { SheetSelect } from '@/components/ui/SheetSelect'
import { createPortal } from 'react-dom'
import { sheetRoot } from './SheetPortal'
import { useVirtualizer } from '@tanstack/react-virtual'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { dateLocale, fmt, fmtCompact, localToday } from '@/data/helpers'
import { getCurrencyMeta } from '@/data/currencies'
import { translateCategoryName, useT } from '@/i18n'
import { playDeleteHaptic, playSoftHaptic } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { toast } from '@/components/ui/Toast'
import { useFinance } from '@/store/finance'
import { useJuice } from '@/store/juice'
import { getReceipt } from '@/lib/receiptStore'
import { useSettings } from '@/store/settings'
import type { Transaction } from '@/types'
import { CatBadge } from '@/views/shared'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { MobileTxQuickMenu } from './MobileTxQuickMenu'
import { MobileTxReceipt } from './MobileTxReceipt'

type TxFilter = 'all' | 'expense' | 'income' | 'transfer'

type ListItem =
  | { kind: 'header'; date: string; dayExpense: number; dayIncome: number }
  | { kind: 'tx'; tx: Transaction }

const HEADER_ESTIMATE = 32
const ROW_ESTIMATE = 60

function getFilters(t: ReturnType<typeof useT>): Array<{ id: TxFilter; label: string }> {
  return [
    { id: 'all', label: t('allLabel') },
    { id: 'expense', label: t('expenses') },
    { id: 'income', label: t('incomes') },
    { id: 'transfer', label: t('transfersLabel') },
  ]
}

function dateLabel(date: string, locale: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    weekday: 'long',
  })
}

function signedAmount(tx: Transaction, currency: Parameters<typeof fmt>[1], compact: boolean): string {
  const f = (n: number) => compact ? fmtCompact(n, currency) : fmt(n, currency)
  if (tx.type === 'income') return `+${f(tx.amount)}`
  if (tx.type === 'expense') return `-${f(tx.amount)}`
  return f(tx.amount)
}

function findScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

function mapGet<T>(map: Map<string, T>, id?: string | null): T | undefined {
  return id ? map.get(id) : undefined
}

export function MobileTransactionList({
  transactions,
  onEdit,
  onDelete,
  compact = false,
  showSearch = true,
  showFilters = false,
  className = '',
}: {
  transactions: Transaction[]
  onEdit: (transaction: Transaction) => void
  onDelete?: (id: string) => void
  compact?: boolean
  showSearch?: boolean
  showFilters?: boolean
  className?: string
}) {
  const { accounts, categories, currency, addTx } = useFinance()
  const landedTxId = useJuice(s => s.landedTxId)
  const updateTx = useFinance(s => s.updateTx)
  const storeDeleteTx = useFinance(s => s.deleteTx)
  const allTransactions = useFinance(s => s.transactions)
  const t = useT()
  const settings = useSettings()
  const { compactNumbers } = settings
  const lang = (settings.language ?? 'es') as 'en' | 'es'
  const locale = dateLocale(settings.language)
  const filters = getFilters(t)
  const [filter, setFilter] = useState<TxFilter>('all')
  const [searchOpen, setSearchOpen] = useState(false)
  // filterOnly: el overlay se abrió desde el embudo "Filtrar" (solo cuenta/
  // categoría/fecha, sin buscador de texto — de eso ya se encarga la lupa de arriba).
  const [filterOnly, setFilterOnly] = useState(false)
  const [query, setQuery] = useState('')
  const [fAccount, setFAccount] = useState('all')
  const [fCategory, setFCategory] = useState('all')
  const [fFrom, setFFrom] = useState('')
  const [fTo, setFTo] = useState('')
  const [selected, setSelected] = useState<Transaction | null>(null)
  /*
   * La foto del recibo se lee de IndexedDB al abrir el detalle, no antes.
   * Son cientos de kilobytes por movimiento: cargarlas con la lista pondría
   * megas en memoria para enseñar filas de texto.
   */
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [receiptFull, setReceiptFull] = useState(false)
  const [openActionId, setOpenActionId] = useState<string | null>(null)
  // Selección múltiple: entra con pulsación larga; en este modo tocar una fila
  // la marca en vez de abrir su detalle, y aparece una barra de acciones en lote.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkCatOpen, setBulkCatOpen] = useState(false)
  // Pulsación larga: menú rápido (cambiar fecha, categoría o cuenta sin abrir nada).
  const [quickTx, setQuickTx] = useState<Transaction | null>(null)
  const quickTxRef = useRef<string | null>(null)
  const pressStart = useRef<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef(0)
  const containerRef = useRef<HTMLElement>(null)
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)
  const startX = useRef(0)
  const overlayStartY = useRef(0)
  const accountMap = useMemo(() => new Map(accounts.map(account => [account.id, account])), [accounts])
  const categoryMap = useMemo(() => new Map(categories.map(category => [category.id, category])), [categories])
  const closeSwipe = () => { setOpenActionId(null) }

  // Los movimientos generados a partir de una plantilla recurrente NO llevan el
  // campo `recurring` (solo lo tiene la plantilla). Para que TODOS los pagos de
  // una recurrencia muestren el ícono, comparamos su firma (tipo+nota+categoría+
  // cuenta), que es exactamente como useRecurring genera las ocurrencias.
  const recurringSignatures = useMemo(() => {
    const set = new Set<string>()
    for (const tx of allTransactions) {
      if (tx.recurring) set.add(`${tx.type}|${tx.note}|${tx.categoryId ?? ''}|${tx.accountId ?? ''}`)
    }
    return set
  }, [allTransactions])
  const isRecurring = (tx: Transaction) =>
    !!tx.recurring || recurringSignatures.has(`${tx.type}|${tx.note}|${tx.categoryId ?? ''}|${tx.accountId ?? ''}`)

  useMobileBackDismiss(searchOpen, () => setSearchOpen(false))
  useMobileBackDismiss(openActionId !== null, closeSwipe)
  const searchRef = useDialogA11y<HTMLDivElement>(() => setSearchOpen(false), searchOpen)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return transactions
      .filter(tx => filter === 'all' || tx.type === filter)
      .filter(tx => fAccount === 'all' || tx.accountId === fAccount || tx.fromAccount === fAccount || tx.toAccount === fAccount)
      .filter(tx => fCategory === 'all' || tx.categoryId === fCategory
        || (tx.splits?.some(split => split.categoryId === fCategory) ?? false))
      .filter(tx => !fFrom || tx.date >= fFrom)
      .filter(tx => !fTo || tx.date <= fTo)
      .filter(tx => {
        if (!q) return true
        const category = mapGet(categoryMap, tx.categoryId)?.name ?? ''
        const account = mapGet(accountMap, tx.accountId)?.name ?? ''
        return `${tx.note} ${category} ${account}`.toLowerCase().includes(q)
      })
  }, [accountMap, categoryMap, filter, query, fAccount, fCategory, fFrom, fTo, transactions])

  const activeFilters = (fAccount !== 'all' ? 1 : 0) + (fCategory !== 'all' ? 1 : 0) + (fFrom ? 1 : 0) + (fTo ? 1 : 0)
  const clearFilters = () => {
    setFAccount('all')
    setFCategory('all')
    setFFrom('')
    setFTo('')
    setQuery('')
  }

  const items = useMemo<ListItem[]>(() => {
    const groups = new Map<string, Transaction[]>()
    for (const tx of rows) {
      const existing = groups.get(tx.date)
      if (existing) existing.push(tx)
      else groups.set(tx.date, [tx])
    }

    const dates = [...groups.keys()].sort((a, b) => b.localeCompare(a))
    const out: ListItem[] = []

    for (const date of dates) {
      const dayRows = groups.get(date)!
      const dayExpense = dayRows.reduce((sum, tx) => sum + (tx.type === 'expense' ? tx.amount : 0), 0)
      const dayIncome = dayRows.reduce((sum, tx) => sum + (tx.type === 'income' ? tx.amount : 0), 0)
      out.push({ kind: 'header', date, dayExpense, dayIncome })
      for (const tx of dayRows) out.push({ kind: 'tx', tx })
    }

    return out
  }, [rows])

  useLayoutEffect(() => {
    const root = containerRef.current
    if (!root) return
    const scrollEl = findScrollParent(root)
    setScrollElement(scrollEl)

    let contentEl: HTMLElement = root
    while (contentEl.parentElement && contentEl.parentElement !== scrollEl) contentEl = contentEl.parentElement

    const recompute = () => {
      const rootRect = root.getBoundingClientRect()
      const scrollRect = scrollEl.getBoundingClientRect()
      const next = rootRect.top - scrollRect.top + scrollEl.scrollTop
      setScrollMargin(prev => Math.abs(next - prev) > 1 ? next : prev)
    }

    recompute()

    const observer = new ResizeObserver(() => requestAnimationFrame(recompute))
    observer.observe(contentEl)
    window.addEventListener('resize', recompute)
    scrollEl.addEventListener('scroll', closeSwipe, { passive: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', recompute)
      scrollEl.removeEventListener('scroll', closeSwipe)
    }
  }, [])

  useEffect(() => {
    closeSwipe()
  }, [filter, query, fAccount, fCategory, fFrom, fTo, transactions])

  // La foto del recibo entra al abrir el detalle y se suelta al cerrarlo.
  useEffect(() => {
    setReceiptFull(false)
    if (!selected?.hasReceipt) { setReceiptUrl(null); setReceiptLoading(false); return }
    let cancelado = false
    setReceiptUrl(null)
    setReceiptLoading(true)
    getReceipt(selected.id)
      .then(url => { if (!cancelado) setReceiptUrl(url) })
      .finally(() => { if (!cancelado) setReceiptLoading(false) })
    return () => { cancelado = true }
  }, [selected])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollElement,
    getItemKey: index => {
      const item = items[index]
      return item?.kind === 'tx' ? `tx:${item.tx.id}` : `header:${item?.date ?? index}`
    },
    estimateSize: index => items[index]?.kind === 'header' ? HEADER_ESTIMATE : ROW_ESTIMATE,
    overscan: 6,
    scrollMargin,
  })

  const showSearchChip = showSearch && !compact
  const showFilterChip = showFilters && !compact

  // Duplica un movimiento: misma info, id nuevo, con la fecha de hoy (el caso
  // típico de duplicar es «lo mismo que ayer, otra vez»). Solo gasto/ingreso;
  // las transferencias mueven saldo entre cuentas y duplicarlas a ciegas es
  // más peligroso que útil, así que ahí no se ofrece.
  const duplicateTx = (tx: Transaction) => {
    addTx({
      type: tx.type,
      amount: tx.amount,
      note: tx.note,
      date: localToday(),
      accountId: tx.accountId,
      categoryId: tx.categoryId,
      tags: tx.tags,
    })
    playSoftHaptic()
    toast(t('movementDuplicated'), { icon: 'check', type: 'ok' })
  }

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const enterSelectMode = (id: string) => {
    setSelectMode(true)
    setSelectedIds(new Set([id]))
    closeSwipe()
    playSoftHaptic()
  }

  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()) }

  // Borrado en lote con un solo «Deshacer» que repone TODOS. Se capturan los
  // objetos antes de borrar; restaurar reusa addTx (preserva id y saldo).
  const bulkDelete = () => {
    const ids = [...selectedIds]
    const snapshots = allTransactions.filter(tx => ids.includes(tx.id))
    playDeleteHaptic()
    deleteWithUndo({
      message: t('nDeleted').replace('{n}', String(snapshots.length)),
      onDelete: () => ids.forEach(id => storeDeleteTx(id)),
      onRestore: () => snapshots.forEach(tx => addTx(tx)),
    })
    exitSelectMode()
  }

  const bulkRecategorize = (categoryId: string) => {
    selectedIds.forEach(id => updateTx(id, { categoryId }))
    setBulkCatOpen(false)
    playSoftHaptic()
    toast(t('nRecategorized').replace('{n}', String(selectedIds.size)), { icon: 'check', type: 'ok' })
    exitSelectMode()
  }

  const renderTxRow = (tx: Transaction) => {
    const category = mapGet(categoryMap, tx.categoryId)
    const account = mapGet(accountMap, tx.accountId)
    const income = tx.type === 'income'
    const opened = openActionId === tx.id
    const isSelected = selectedIds.has(tx.id)
    // La fila recién guardada cae desde arriba y se asienta: cierra el gesto
    // de guardar enseñando dónde fue a parar lo que acabas de anotar.
    const landed = tx.id === landedTxId
    const subtitle = tx.type === 'transfer'
      ? `${mapGet(accountMap, tx.fromAccount)?.name ?? t('origin')} -> ${mapGet(accountMap, tx.toAccount)?.name ?? t('destination')}`
      : `${category ? translateCategoryName(category, lang) : t('noCategoryLabel')} • ${account?.name ?? t('noAccountLabel')}`

    // En modo selección la fila no se desliza ni abre detalle: solo marca.
    return (
      <div
        className={`mobile-tx-swipe${opened ? ' open' : ''}${!selectMode && !compact && tx.type !== 'transfer' ? ' has-dup' : ''}${isSelected ? ' selected' : ''}${landed ? ' landed' : ''}`}
        onTouchStart={selectMode ? undefined : event => { startX.current = event.touches[0]?.clientX ?? 0 }}
        onTouchEnd={selectMode ? undefined : event => {
          const delta = (event.changedTouches[0]?.clientX ?? 0) - startX.current
          if (delta < -42) setOpenActionId(tx.id)
          if (delta > 42) closeSwipe()
        }}
        onClick={opened ? (event => { event.stopPropagation(); closeSwipe() }) : undefined}
      >
        <button
          className="mobile-tx-row"
          onClick={() => {
            if (selectMode) { toggleSelected(tx.id); return }
            // El toque que suelta una pulsación larga no debe abrir además el detalle.
            if (quickTxRef.current === tx.id) { quickTxRef.current = null; return }
            closeSwipe(); setSelected(tx)
          }}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => {
            if (selectMode) return
            quickTxRef.current = null
            pressStart.current = { x: event.clientX, y: event.clientY }
            longPressTimer.current = window.setTimeout(() => {
              closeSwipe()
              playSoftHaptic()
              quickTxRef.current = tx.id
              setQuickTx(tx)
            }, 450)
          }}
          onPointerUp={() => window.clearTimeout(longPressTimer.current)}
          onPointerMove={event => {
            // Un temblor del dedo no cancela la pulsación; desplazarse sí.
            const p = pressStart.current
            if (!p || Math.abs(event.clientX - p.x) > 8 || Math.abs(event.clientY - p.y) > 8) window.clearTimeout(longPressTimer.current)
          }}
          onPointerCancel={() => window.clearTimeout(longPressTimer.current)}
        >
          {selectMode ? (
            <span className={`mobile-tx-check${isSelected ? ' on' : ''}`}>
              {isSelected && <Icon name="check" size={16} />}
            </span>
          ) : tx.type === 'transfer'
            ? <span className="mobile-transfer-icon"><Icon name="repeat" size={24} /></span>
            : <CatBadge category={category} size={40} />}
          <span>
            <b>
              {tx.type === 'transfer' ? t('transfer') : tx.note}
              {tx.type !== 'transfer' && isRecurring(tx) && (
                <i className="mobile-recur-dot" title={t('recurring')}><Icon name="repeat" size={11} /></i>
              )}
              {tx.detectedFrom === 'notification' && (
                <span className="mobile-auto-badge">{t('autoBadge')}</span>
              )}
              {tx.originalCurrency && (
                <span className="mobile-fx-badge" title={`${tx.originalAmount} ${tx.originalCurrency}`}>
                  {getCurrencyMeta(tx.originalCurrency).flag} {tx.originalCurrency}
                </span>
              )}
            </b>
            <small>{subtitle}</small>
          </span>
          <strong className={income ? 'income' : tx.type === 'transfer' ? 'transfer' : ''}>
            {signedAmount(tx, currency, compactNumbers)}
          </strong>
        </button>

        {!compact && (
          <div className="mobile-row-actions" aria-label={t('movementActionsLabel')} onClick={event => event.stopPropagation()}>
            <button onClick={() => { onEdit(tx); closeSwipe() }}>
              <Icon name="edit" size={17} />
              {t('edit')}
            </button>
            {tx.type !== 'transfer' && (
              <button onClick={() => { duplicateTx(tx); closeSwipe() }}>
                <Icon name="repeat" size={17} />
                {t('duplicate')}
              </button>
            )}
            {onDelete && (
              <button
                className="danger"
                onClick={() => {
                  // Borrado directo con «Deshacer» (5 s), como el resto de la
                  // app — ya no hace falta el diálogo de «no se puede deshacer».
                  closeSwipe()
                  playDeleteHaptic()
                  onDelete(tx.id)
                }}
              >
                <Icon name="trash" size={17} />
                {t('delete')}
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderDayHeader = (date: string, dayExpense: number, dayIncome: number) => (
    <div className="mobile-day-header">
      <span>{dateLabel(date, locale)}</span>
      <span className="mobile-day-totals">
        {dayExpense > 0 && <span className="day-exp">-{compactNumbers ? fmtCompact(dayExpense, currency) : fmt(dayExpense, currency)}</span>}
        {dayIncome > 0 && <span className="day-inc">+{compactNumbers ? fmtCompact(dayIncome, currency) : fmt(dayIncome, currency)}</span>}
      </span>
    </div>
  )

  return (
    <section
      ref={containerRef}
      className={`mobile-list-card${compact ? ' compact' : ''}${className ? ` ${className}` : ''}`}
      onClick={openActionId ? closeSwipe : undefined}
    >
      {!compact && (
        <div className="mobile-movement-tools">
          <div className="mobile-filter-chips" role="tablist" aria-label={t('filterMovements')}>
            {filters.map(item => (
              <button
                key={item.id}
                className={filter === item.id ? 'on' : ''}
                aria-selected={filter === item.id}
                role="tab"
                onClick={() => setFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {/* Chips de acción FUERA de la fila scrolleable: quedan fijos a la
              derecha y siempre visibles (antes se salían de vista al hacer scroll). */}
          {/* SOLO EL ICONO. Con la palabra, estos dos chips se comian ~140px y
              los filtros de al lado quedaban cortados a mitad: la fila mostraba
              "Todos · Gastos · Ingresos · Tr" y parecia rota. El icono del
              embudo se entiende solo, y el contador sigue diciendo cuantos
              filtros hay puestos. */}
          {showSearchChip && (
            <button
              className={`mobile-search-chip icon-only${activeFilters > 0 ? ' has-filters' : ''}`}
              aria-label={t('search')}
              onClick={() => { setFilterOnly(false); setSearchOpen(true) }}
            >
              <Icon name="search" size={16} />
              {activeFilters > 0 && <span className="mobile-filter-badge">{activeFilters}</span>}
            </button>
          )}
          {showFilterChip && (
            <button
              className={`mobile-search-chip icon-only${activeFilters > 0 ? ' has-filters' : ''}`}
              aria-label={t('filterLabel')}
              onClick={() => { setFilterOnly(true); setSearchOpen(true) }}
            >
              <Icon name="sliders" size={16} />
              {activeFilters > 0 && <span className="mobile-filter-badge">{activeFilters}</span>}
            </button>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="mobile-empty-list">
          <BrandMark size={48} />
          <strong>{t('noMovementsTitle')}</strong>
          <span>{t('tryOtherFilterHint')}</span>
        </div>
      ) : (
        <div style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map(virtualItem => {
            const item = items[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualItem.start - scrollMargin}px)`,
                }}
              >
                {item.kind === 'header'
                  ? renderDayHeader(item.date, item.dayExpense, item.dayIncome)
                  : renderTxRow(item.tx)}
              </div>
            )
          })}
        </div>
      )}

      {searchOpen && (
        <div
          ref={searchRef}
          className="mobile-search-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('searchMovementsLabel')}
          onTouchStart={event => { overlayStartY.current = event.touches[0]?.clientY ?? 0 }}
          onTouchEnd={event => {
            const delta = (event.changedTouches[0]?.clientY ?? 0) - overlayStartY.current
            if (delta > 88) setSearchOpen(false)
          }}
        >
          <div className="mobile-search-head">
            <button onClick={() => setSearchOpen(false)}>{t('cancel')}</button>
            <strong>{filterOnly ? t('filterLabel') : t('searchAndFilter')}</strong>
            <button className="mobile-search-clear" disabled={activeFilters === 0 && !query} onClick={clearFilters}>{t('clearFiltersLabel')}</button>
          </div>

          {/* En modo "Filtrar" no se muestra el buscador de texto: de eso ya se
              encarga la lupa de arriba (búsqueda global). */}
          {!filterOnly && (
            <label className="mobile-search-input">
              <Icon name="search" size={18} />
              <input value={query} placeholder={t('noteCategoryAccountPlaceholder')} onChange={event => setQuery(event.target.value)} />
            </label>
          )}

          <div className="mobile-filter-panel">
            <div className="mobile-filter-field">
              <label>{t('account')}</label>
              <SheetSelect
                title={t('account')}
                value={fAccount}
                onChange={setFAccount}
                options={[{ value: 'all', label: t('allAccountsOption') }, ...accounts.map(account => ({ value: account.id, label: account.name, color: account.color }))]}
              />
            </div>

            <div className="mobile-filter-field">
              <label>{t('category')}</label>
              <SheetSelect
                title={t('category')}
                value={fCategory}
                onChange={setFCategory}
                options={[{ value: 'all', label: t('allCategoriesOption') }, ...categories.map(category => ({ value: category.id, label: translateCategoryName(category, lang), color: category.color }))]}
              />
            </div>

            <div className="mobile-filter-dates">
              <div className="mobile-filter-field">
                <label>{t('fromDateLabel')}</label>
                <input type="date" value={fFrom} max={fTo || undefined} onChange={event => setFFrom(event.target.value)} />
              </div>
              <div className="mobile-filter-field">
                <label>{t('toDateLabel')}</label>
                <input type="date" value={fTo} min={fFrom || undefined} onChange={event => setFTo(event.target.value)} />
              </div>
            </div>
          </div>

          <div className="mobile-filter-results">{t('resultsCount').replace('{n}', String(rows.length))}</div>
          <MobileTransactionList transactions={rows} onEdit={onEdit} onDelete={onDelete} compact />
        </div>
      )}

      {selected && (
        <MobileTxReceipt
          tx={allTransactions.find(x => x.id === selected.id) ?? selected}
          receiptUrl={receiptUrl}
          receiptLoading={receiptLoading}
          onOpenReceipt={() => setReceiptFull(true)}
          onClose={() => setSelected(null)}
          onEdit={onEdit}
          onDuplicate={duplicateTx}
          onDelete={onDelete}
        />
      )}

      {/* El recibo a pantalla completa: un ticket de supermercado no se lee
          en una miniatura, y leerlo es para lo único que sirve guardarlo. */}
      {receiptFull && receiptUrl && createPortal(
        <div
          className="mtx-receipt-full"
          role="dialog"
          aria-modal="true"
          aria-label={t('receiptLabel')}
          onClick={() => setReceiptFull(false)}
        >
          <img src={receiptUrl} alt={t('receiptLabel')} />
          <button aria-label={t('close')} onClick={() => setReceiptFull(false)}>
            <Icon name="close" size={20} />
          </button>
        </div>,
        sheetRoot(),
      )}

      {selectMode && createPortal(
        <div className="mobile-select-bar" role="toolbar" aria-label={t('bulkActionsLabel')}>
          <button className="mobile-select-cancel" onClick={exitSelectMode} aria-label={t('cancel')}>
            <Icon name="close" size={18} />
          </button>
          <span className="mobile-select-count">{t('nSelected').replace('{n}', String(selectedIds.size))}</span>
          <button
            className="mobile-select-action"
            disabled={selectedIds.size === 0}
            onClick={() => setBulkCatOpen(true)}
          >
            <Icon name="tag" size={17} />
            {t('categoryLabel')}
          </button>
          <button
            className="mobile-select-action danger"
            disabled={selectedIds.size === 0}
            onClick={bulkDelete}
          >
            <Icon name="trash" size={17} />
            {t('delete')}
          </button>
        </div>,
        sheetRoot(),
      )}

      {quickTx && (
        <MobileTxQuickMenu
          tx={allTransactions.find(x => x.id === quickTx.id) ?? quickTx}
          onClose={() => setQuickTx(null)}
          onEdit={onEdit}
          onDuplicate={duplicateTx}
          onDelete={onDelete ? id => { playDeleteHaptic(); onDelete(id) } : undefined}
          onSelectMany={compact ? undefined : enterSelectMode}
        />
      )}

      {bulkCatOpen && createPortal(
        <div className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('categoryLabel')} onClick={() => setBulkCatOpen(false)}>
          <section className="mobile-bulk-cat" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('recategorizeTo')}</span>
              <button aria-label={t('close')} onClick={() => setBulkCatOpen(false)}><Icon name="close" size={18} /></button>
            </header>
            <div className="mobile-bulk-cat-grid">
              {categories.filter(c => c.type === 'expense' || c.type === 'income').map(category => (
                <button key={category.id} onClick={() => bulkRecategorize(category.id)}>
                  <CatBadge category={category} size={38} />
                  <small>{translateCategoryName(category, lang)}</small>
                </button>
              ))}
            </div>
          </section>
        </div>,
        sheetRoot(),
      )}
    </section>
  )
}
