import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { toast } from '@/components/ui/Toast'
import { accountCurrency, currentMonthKey, dateLocale, fmt, localToday } from '@/data/helpers'
import { detectSubscriptions, subscriptionInsightKey as insightKey, type SubscriptionInsight } from '@/data/financeIntelligence'
import { deleteWithUndo } from '@/lib/undoDelete'
import { CURRENCIES } from '@/data/seed'
import { SUBSCRIPTION_CATALOG, suggestedCategoryId, type SubscriptionCatalogItem } from '@/data/subscriptionCatalog'
import { initialRecurringDates } from '@/data/subscriptionSchedule'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useDismissals } from '@/store/dismissals'
import { translateCategoryName, useT } from '@/i18n'
import { MobileAmountSheet } from './MobileAmountSheet'
import { MobileTextSheet } from './MobileTextSheet'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'
import type { Account, Category, CurrencyCode, IconName, RecurrenceFrequency, Transaction } from '@/types'

const today = localToday

const ACCT_ICONS: Record<string, IconName> = {
  cash: 'wallet', debit: 'cards', savings: 'piggy', credit: 'cards',
}

// Días de la semana empezando en lunes, con su índice JS (0=Dom … 6=Sáb).
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]
function weekdayShortLabels(locale: string): string[] {
  // 2024-01-01 fue lunes: generamos etiquetas cortas localizadas lunes→domingo.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }).replace('.', '').slice(0, 3))
}

type SubscriptionFormFields = {
  note: string
  amount: number
  categoryId: string
  accountId: string
  recurring: RecurrenceFrequency
  chargeWeekday: number | null
  chargeMonthDay: number | null
  serviceId?: string
}

function lacksFunds(account: Account, amount: number): boolean {
  if (account.type === 'credit') return false
  return account.balance < amount
}

/**
 * Baldosa de servicio consistente en toda la pantalla: cuadro redondeado del
 * color de la marca con el glifo en blanco (logo real si existe, si no el
 * icono genérico). Así todos los iconos se ven parejos y "profesionales", en
 * vez de mezclar chips blancos con chips de color tenue.
 */
function ServiceTile({ item, size = 46, glyph = 24 }: { item: SubscriptionCatalogItem; size?: number; glyph?: number }) {
  return (
    <span className="msub-service-tile" style={{ width: size, height: size, background: item.color }}>
      {item.logoSlug
        ? <BrandLogo slug={item.logoSlug} size={glyph} color="#fff" />
        : <Icon name={item.icon} size={glyph} />}
    </span>
  )
}

/** Baldosa para una fila de suscripción real: usa la marca si se conoce, si no la categoría. */
function RowTile({ item, fallbackColor, fallbackIcon, size = 46, glyph = 22 }: {
  item?: SubscriptionCatalogItem
  fallbackColor: string
  fallbackIcon: IconName
  size?: number
  glyph?: number
}) {
  if (item) return <ServiceTile item={item} size={size} glyph={glyph} />
  return (
    <span className="msub-service-tile" style={{ width: size, height: size, background: fallbackColor }}>
      <Icon name={fallbackIcon} size={glyph} />
    </span>
  )
}

function nextDate(tx: Transaction): string {
  return tx.recurringNext ?? tx.date
}

function nextLabel(tx: Transaction, locale: string): string {
  return new Date(`${nextDate(tx)}T00:00:00`).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
}

/** Días desde hoy hasta la fecha ISO (negativo = ya pasó). */
function daysUntil(iso: string, todayISO: string): number {
  const a = new Date(`${iso}T00:00:00`).getTime()
  const b = new Date(`${todayISO}T00:00:00`).getTime()
  return Math.round((a - b) / 86_400_000)
}

function freqLabel(tx: Transaction, t: ReturnType<typeof useT>) {
  return tx.recurring === 'weekly' ? t('perWeekShort') : t('perMonthShort')
}

function monthlyEquivalent(tx: Transaction): number {
  return tx.recurring === 'weekly' ? tx.amount * 4.33 : tx.amount
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

type SheetMode = { tx: Transaction; confirm: boolean } | null

export function MobileSubscriptions() {
  const { transactions, categories, accounts, currency, addTx, updateTx, deleteTx } = useFinance()
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const [sheet, setSheet] = useState<SheetMode>(null)
  const [converting, setConverting] = useState<SubscriptionInsight | null>(null)
  const [adding, setAdding] = useState(false)

  useMobileBackDismiss(!!sheet, () => setSheet(null))
  const dialogRef = useDialogA11y<HTMLDivElement>(() => setSheet(null), !!sheet)
  const convertRef = useDialogA11y<HTMLDivElement>(() => setConverting(null), !!converting)
  useMobileBackDismiss(adding, () => setAdding(false))
  const addRef = useDialogA11y<HTMLDivElement>(() => setAdding(false), adding)

  // Only recurring templates (not the generated instances — those have no recurring field)
  const recurring = transactions.filter(tx => tx.recurring)
  const monthly   = recurring.filter(tx => tx.recurring === 'monthly')
  const weekly    = recurring.filter(tx => tx.recurring === 'weekly')

  const totalMonthly = recurring.reduce((s, tx) => s + monthlyEquivalent(tx), 0)
  const totalAnnual = totalMonthly * 12
  const nextRecurring = [...recurring].sort((a, b) => (a.recurringNext ?? a.date).localeCompare(b.recurringNext ?? b.date))[0]

  const dismissed = useDismissals(state => state.dismissed)
  const dismissSuggestion = useDismissals(state => state.dismiss)

  const allInsights = useMemo(
    () => detectSubscriptions(transactions, currentMonthKey()),
    [transactions],
  )

  const detected = useMemo(
    () => allInsights.filter(s => !s.alreadyRecurring && !dismissed.includes(insightKey(s))),
    [allInsights, dismissed],
  )

  // Subidas de precio en cualquier suscripción (incluidas las que ya son
  // recurrentes, que quedan fuera de `detected`) — es el aviso «te subieron el
  // precio», el punto donde de verdad conviene enterarse.
  const priceHikes = useMemo(
    () => allInsights.filter(s => s.priceIncrease && !dismissed.includes(insightKey(s))),
    [allInsights, dismissed],
  )

  const handleEnd = (tx: Transaction) => {
    updateTx(tx.id, { recurringEnd: today() })
    toast(t('stoppedToast').replace('{name}', tx.note), { icon: 'check', type: 'ok' })
    setSheet(null)
  }

  const handleSkipNext = (tx: Transaction) => {
    const next = tx.recurringNext ?? tx.date
    updateTx(tx.id, {
      skippedDates: [...(tx.skippedDates ?? []), next],
      recurringNext: advanceRecurrenceDate(next, tx.recurring!),
    })
    toast(t('skippedOccurrenceToast').replace('{name}', tx.note), { icon: 'check', type: 'ok' })
    setSheet(null)
  }

  const handleDelete = (tx: Transaction) => {
    deleteWithUndo({
      message: t('deletedToast').replace('{name}', tx.note),
      onDelete: () => deleteTx(tx.id),
      onRestore: () => addTx(tx),
    })
    setSheet(null)
  }

  const handleConvert = (fields: SubscriptionFormFields) => {
    const { start, next } = initialRecurringDates(fields.recurring, fields.chargeWeekday, fields.chargeMonthDay)
    try {
      addTx({
        type: 'expense',
        amount: fields.amount,
        date: start,
        note: fields.note,
        categoryId: fields.categoryId,
        accountId: fields.accountId,
        recurring: fields.recurring,
        recurringStart: start,
        recurringNext: next,
      })
      toast(t('scheduledAsRecurringToast').replace('{name}', fields.note), { icon: 'check', type: 'ok' })
      setConverting(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotCreateRecurrence'), { icon: 'alert' })
    }
  }

  const handleAddSubscription = (fields: SubscriptionFormFields) => {
    const { start, next } = initialRecurringDates(fields.recurring, fields.chargeWeekday, fields.chargeMonthDay)
    try {
      addTx({
        type: 'expense',
        amount: fields.amount,
        date: start,
        note: fields.note,
        categoryId: fields.categoryId,
        accountId: fields.accountId,
        recurring: fields.recurring,
        recurringStart: start,
        recurringNext: next,
        serviceId: fields.serviceId,
      })
      toast(t('subscriptionAddedToast').replace('{name}', fields.note), { icon: 'check', type: 'ok' })
      setAdding(false)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotCreateRecurrence'), { icon: 'alert' })
    }
  }

  if (recurring.length === 0 && detected.length === 0) {
    return (
      <div className="msub-root">
        <div className="msub-empty">
          <Icon name="repeat" size={40} style={{ opacity: .2 }} />
          <p>{t('noRecurringPayments')}</p>
          <small>{t('addRecurringHint')}</small>
          <button className="msub-empty-cta" onClick={() => setAdding(true)}>
            <Icon name="plus" size={16} /> {t('addFirstSubscription')}
          </button>
        </div>
        {adding && (
          <AddSubscriptionSheet dialogRef={addRef} categories={categories} accounts={accounts} currency={currency}
            lang={lang} t={t} onClose={() => setAdding(false)} onConfirm={handleAddSubscription} />
        )}
      </div>
    )
  }

  return (
    <div className="msub-root">
      <div className="msub-header-row">
        <button className="msub-add-btn" onClick={() => setAdding(true)}>
          <Icon name="plus" size={16} /> {t('addSubscriptionLabel')}
        </button>
      </div>

      {priceHikes.length > 0 && (
        <div className="msub-hikes">
          {priceHikes.map(hike => (
            <div key={insightKey(hike)} className="msub-hike" role="alert">
              <span className="msub-hike-icon"><Icon name="arrowUp" size={16} /></span>
              <div className="msub-hike-text">
                <b>{t('priceIncreaseTitle').replace('{name}', titleCase(hike.merchant))}</b>
                <small>
                  {t('priceIncreaseText')
                    .replace('{from}', fmt(hike.priceIncrease!.from, currency))
                    .replace('{to}', fmt(hike.priceIncrease!.to, currency))
                    .replace('{pct}', String(hike.priceIncrease!.pct))}
                </small>
              </div>
              <button className="msub-hike-dismiss" aria-label={t('ignoreSuggestionLabel')} onClick={() => dismissSuggestion(insightKey(hike))}>
                <Icon name="close" size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hero stat */}
      {recurring.length > 0 && (
        <div className="msub-hero">
          <div>
            <div className="msub-hero-label">{t('monthlyRecurringLabel')}</div>
            <div className="msub-hero-amount">{fmt(totalMonthly, currency)}</div>
            <div className="msub-hero-count">
              {t(recurring.length === 1 ? 'recurringPaymentSingular' : 'recurringPaymentPlural').replace('{n}', String(recurring.length))}
              {' · '}{t('annualEquivalentLabel').replace('{amount}', fmt(totalAnnual, currency))}
            </div>
          </div>
          <span className="msub-hero-icon">
            <Icon name="repeat" size={26} />
          </span>
        </div>
      )}

      {recurring.length > 0 && (
        <div className="msub-overview">
          <article>
            <small>{t('monthly')}</small>
            <strong>{monthly.length}</strong>
          </article>
          <article>
            <small>{t('weekly')}</small>
            <strong>{weekly.length}</strong>
          </article>
          <article>
            <small>{t('nextAbbrev')}</small>
            <strong>{nextRecurring ? nextLabel(nextRecurring, locale) : '—'}</strong>
          </article>
        </div>
      )}

      {/* Próximos cobros: la secuencia real de lo que viene, ordenada por fecha */}
      {recurring.length > 0 && (
        <UpcomingChargesSection txs={recurring} categories={categories} accounts={accounts}
          currency={currency} locale={locale} lang={lang} t={t} onOpen={tx => setSheet({ tx, confirm: false })} />
      )}

      {/* Detected subscriptions */}
      {detected.length > 0 && (
        <DetectedSection items={detected} categories={categories} accounts={accounts}
          currency={currency} t={t} onConvert={setConverting}
          onDismiss={item => {
            dismissSuggestion(insightKey(item))
            toast(t('subscriptionIgnoredToast').replace('{name}', titleCase(item.merchant)), { icon: 'check', type: 'ok' })
          }} />
      )}

      {/* Monthly group */}
      {monthly.length > 0 && (
        <Section title={t('monthly')} txs={monthly} categories={categories} accounts={accounts}
          currency={currency} locale={locale} lang={lang} t={t} onOpen={tx => setSheet({ tx, confirm: false })} />
      )}

      {weekly.length > 0 && (
        <Section title={t('weekly')} txs={weekly} categories={categories} accounts={accounts}
          currency={currency} locale={locale} lang={lang} t={t} onOpen={tx => setSheet({ tx, confirm: false })} />
      )}

      {/* Action sheet */}
      {sheet && (
        <SheetPortal>
        <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={sheet.tx.note} onClick={() => setSheet(null)}>
          <section className="msub-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{sheet.tx.note}</span>
              <button aria-label={t('close')} onClick={() => setSheet(null)}><Icon name="close" size={18} /></button>
            </header>
            <div className="msub-sheet-body">
              <div className="msub-sheet-amount">
                {fmt(sheet.tx.amount, currency)}
                <span>{freqLabel(sheet.tx, t)}</span>
              </div>
              <div className="msub-sheet-meta">
                {t('nextColon')} <strong>{nextLabel(sheet.tx, locale)}</strong>
              </div>

              {!sheet.confirm ? (
                <>
                  <button className="msub-action-btn" onClick={() => handleSkipNext(sheet.tx)}>
                    <Icon name="calendar" size={16} /> {t('skipNextOccurrence')}
                  </button>
                  <button className="msub-action-btn warn" onClick={() => handleEnd(sheet.tx)}>
                    <Icon name="close" size={16} /> {t('stopFutureOccurrences')}
                  </button>
                  <button className="msub-action-btn danger"
                    onClick={() => setSheet(s => s ? { ...s, confirm: true } : s)}>
                    <Icon name="trash" size={16} /> {t('deleteTemplateLabel')}
                  </button>
                </>
              ) : (
                <div className="msub-confirm">
                  <p>{t('deleteTemplateConfirm').replace('{name}', sheet.tx.note)}</p>
                  <div className="msub-confirm-row">
                    <button onClick={() => setSheet(s => s ? { ...s, confirm: false } : s)}>{t('cancel')}</button>
                    <button className="danger" onClick={() => handleDelete(sheet.tx)}>{t('delete')}</button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
        </SheetPortal>
      )}

      {/* Convert detected subscription to recurrence */}
      {converting && (
        <ConvertSheet dialogRef={convertRef} insight={converting} categories={categories} accounts={accounts}
          currency={currency} lang={lang} t={t} onClose={() => setConverting(null)} onConfirm={handleConvert} />
      )}

      {/* Add subscription from catalog */}
      {adding && (
        <AddSubscriptionSheet dialogRef={addRef} categories={categories} accounts={accounts} currency={currency}
          lang={lang} t={t} onClose={() => setAdding(false)} onConfirm={handleAddSubscription} />
      )}
    </div>
  )
}

function DetectedSection({ items, categories, accounts, currency, t, onConvert, onDismiss }: {
  items: SubscriptionInsight[]
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  t: ReturnType<typeof useT>
  onConvert: (insight: SubscriptionInsight) => void
  onDismiss: (insight: SubscriptionInsight) => void
}) {
  return (
    <div className="msub-section">
      <div className="msub-section-header">
        <span>{t('detectedAutomaticallyLabel')}</span>
      </div>
      {items.map(item => {
        const cat = categories.find(c => c.id === item.categoryId)
        const acct = accounts.find(a => a.id === item.accountId)
        return (
          <div key={insightKey(item)} className="msub-row msub-detected-row">
            <RowTile fallbackColor={cat?.color ?? '#888'} fallbackIcon={cat?.icon ?? 'repeat'} />
            <div className="msub-row-info">
              <b>{titleCase(item.merchant)}</b>
              <small>
                {item.months} {t(item.months === 1 ? 'monthsSingular' : 'monthsPlural')} · {t('confidencePct').replace('{pct}', String(item.confidence))}
                {acct && <> · <span style={{ color: acct.color }}>●</span> {acct.short}</>}
              </small>
            </div>
            <div className="msub-row-right">
              <strong className="text-expense">−{fmt(item.amount, currency)}</strong>
              <div className="msub-detected-actions">
                <button className="msub-convert-btn" onClick={() => onConvert(item)}>
                  <Icon name="repeat" size={14} /> {t('convertLabel')}
                </button>
                <button className="msub-dismiss-btn" aria-label={t('ignoreSuggestionLabel')} onClick={() => onDismiss(item)}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ConvertSheet({ dialogRef, insight, categories, accounts, currency, lang, t, onClose, onConfirm }: {
  dialogRef: React.RefObject<HTMLDivElement>
  insight: SubscriptionInsight
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  lang: 'en' | 'es'
  t: ReturnType<typeof useT>
  onClose: () => void
  onConfirm: (fields: SubscriptionFormFields) => void
}) {
  const expenseCategories = categories.filter(c => c.type === 'expense')

  return (
    <RecurringTxForm
      dialogRef={dialogRef}
      title={t('convertToRecurrenceTitle')}
      confirmLabel={t('createRecurrenceLabel')}
      categories={categories}
      accounts={accounts}
      currency={currency}
      lang={lang}
      t={t}
      initialNote={titleCase(insight.merchant)}
      initialAmount={Math.round(insight.amount)}
      initialCategoryId={insight.categoryId ?? expenseCategories[0]?.id ?? ''}
      initialAccountId={insight.accountId ?? accounts[0]?.id ?? ''}
      initialFrequency="monthly"
      hint={
        <p className="msub-detected-hint">
          {t('detectedInPrefix')} {insight.months} {t(insight.months === 1 ? 'monthsSingular' : 'monthsPlural')} · {t('lastChargeSuffix').replace('{amount}', fmt(insight.amount, currency))}
        </p>
      }
      onClose={onClose}
      onConfirm={onConfirm}
    />
  )
}

function Section({ title, txs, categories, accounts, currency, locale, lang, t, onOpen }: {
  title: string
  txs: Transaction[]
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  locale: string
  lang: 'en' | 'es'
  t: ReturnType<typeof useT>
  onOpen: (tx: Transaction) => void
}) {
  const sectionTotal = txs.reduce((s, tx) => s + tx.amount, 0)

  return (
    <div className="msub-section">
      <div className="msub-section-header">
        <span>{title}</span>
        <span>{fmt(sectionTotal, currency)}</span>
      </div>
      {txs.map(tx => {
        const cat  = categories.find(c => c.id === tx.categoryId)
        const acct = accounts.find(a => a.id === tx.accountId)
        const isPast = (tx.recurringNext ?? tx.date) < today()
        const service = tx.serviceId ? SUBSCRIPTION_CATALOG.find(c => c.id === tx.serviceId) : undefined
        const chipColor = service?.color ?? cat?.color ?? '#888'
        const lowFunds = tx.type === 'expense' && !!acct && lacksFunds(acct, tx.amount)
        return (
          <button key={tx.id} className="msub-row" onClick={() => onOpen(tx)}>
            <RowTile item={service} fallbackColor={chipColor} fallbackIcon={cat?.icon ?? 'repeat'} />
            <div className="msub-row-info">
              <b>{tx.note || (cat ? translateCategoryName(cat, lang) : '—')}</b>
              <small>
                {t('nextAbbrev')} {nextLabel(tx, locale)}
                {isPast && <span className="msub-overdue"> · {t('overdueLabel')}</span>}
                {lowFunds && <span className="msub-lowfunds"> · {t('lowFundsWarningShort')}</span>}
                {acct && <> · <span style={{ color: acct.color }}>●</span> {acct.short}</>}
              </small>
            </div>
            <div className="msub-row-right">
              <strong className={tx.type === 'expense' ? 'text-expense' : 'text-income'}>
                {tx.type === 'expense' ? '−' : '+'}{fmt(tx.amount, currency)}
              </strong>
              <small>{t('annualEquivalentLabel').replace('{amount}', fmt(monthlyEquivalent(tx) * 12, currency))}</small>
            </div>
          </button>
        )
      })}
    </div>
  )
}

/**
 * «Próximos cobros»: los siguientes cargos de todas las suscripciones activas,
 * ordenados por fecha. Antes había que abrir cada grupo y sumar de cabeza qué
 * venía primero; aquí se lee la secuencia real de un vistazo, con un contador
 * relativo («en 3 días», «hoy», «vencido») que es lo que de verdad importa.
 */
function UpcomingChargesSection({ txs, categories, accounts, currency, locale, lang, t, onOpen }: {
  txs: Transaction[]
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  locale: string
  lang: 'en' | 'es'
  t: ReturnType<typeof useT>
  onOpen: (tx: Transaction) => void
}) {
  const todayISO = today()
  const upcoming = useMemo(
    () => [...txs]
      .filter(tx => !tx.recurringEnd || nextDate(tx) <= tx.recurringEnd)
      .sort((a, b) => nextDate(a).localeCompare(nextDate(b)))
      .slice(0, 6),
    [txs],
  )
  if (upcoming.length === 0) return null

  const relLabel = (iso: string): string => {
    const d = daysUntil(iso, todayISO)
    if (d < 0) return t('overdueLabel')
    if (d === 0) return t('todayLabel')
    if (d === 1) return t('tomorrowLabel')
    return t('inDaysLabel').replace('{n}', String(d))
  }

  return (
    <div className="msub-section">
      <div className="msub-section-header">
        <span>{t('upcomingChargesTitle')}</span>
      </div>
      <div className="msub-timeline">
        {upcoming.map(tx => {
          const cat = categories.find(c => c.id === tx.categoryId)
          const acct = accounts.find(a => a.id === tx.accountId)
          const service = tx.serviceId ? SUBSCRIPTION_CATALOG.find(c => c.id === tx.serviceId) : undefined
          const iso = nextDate(tx)
          const overdue = daysUntil(iso, todayISO) < 0
          const lowFunds = !!acct && lacksFunds(acct, tx.amount)
          return (
            <button key={tx.id} className="msub-timeline-row" onClick={() => onOpen(tx)}>
              <span className={`msub-timeline-date${overdue ? ' overdue' : ''}`}>
                <b>{new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric' })}</b>
                <small>{new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: 'short' }).replace('.', '')}</small>
              </span>
              <RowTile item={service} fallbackColor={service?.color ?? cat?.color ?? '#888'} fallbackIcon={cat?.icon ?? 'repeat'} size={38} glyph={18} />
              <div className="msub-timeline-info">
                <b>{tx.note || (cat ? translateCategoryName(cat, lang) : '—')}</b>
                <small className={overdue ? 'msub-overdue' : lowFunds ? 'msub-lowfunds' : ''}>
                  {relLabel(iso)}{lowFunds && !overdue && ` · ${t('lowFundsWarningShort')}`}
                </small>
              </div>
              <strong className="text-expense">−{fmt(tx.amount, currency)}</strong>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AddSubscriptionSheet({ dialogRef, categories, accounts, currency, lang, t, onClose, onConfirm }: {
  dialogRef: React.RefObject<HTMLDivElement>
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  lang: 'en' | 'es'
  t: ReturnType<typeof useT>
  onClose: () => void
  onConfirm: (fields: SubscriptionFormFields) => void
}) {
  const [picked, setPicked] = useState<{ item: SubscriptionCatalogItem | null } | null>(null)

  if (!picked) {
    return (
      <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet centered" role="dialog" aria-modal="true" aria-label={t('addSubscriptionLabel')} onClick={onClose}>
        <section className="msub-picker-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('chooseServiceLabel')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          <div className="msub-picker-copy">
            <strong>{t('addSubscriptionLabel')}</strong>
            <p>{t('subscriptionsQuickDesc')}</p>
          </div>
          <div className="msub-catalog-grid">
            {SUBSCRIPTION_CATALOG.map(item => (
              <button key={item.id} className="msub-catalog-item" onClick={() => setPicked({ item })}>
                <ServiceTile item={item} size={52} glyph={28} />
                <span>{item.name}</span>
              </button>
            ))}
            <button className="msub-catalog-item" onClick={() => setPicked({ item: null })}>
              <span className="msub-service-tile msub-service-tile-custom">
                <Icon name="plus" size={26} />
              </span>
              <span>{t('customServiceLabel')}</span>
            </button>
          </div>
        </section>
      </div>
      </SheetPortal>
    )
  }

  return (
    <AddSubscriptionForm dialogRef={dialogRef} item={picked.item} categories={categories} accounts={accounts} currency={currency}
      lang={lang} t={t} onClose={onClose} onBack={() => setPicked(null)} onConfirm={onConfirm} />
  )
}

function AddSubscriptionForm({ dialogRef, item, categories, accounts, currency, lang, t, onClose, onBack, onConfirm }: {
  dialogRef: React.RefObject<HTMLDivElement>
  item: SubscriptionCatalogItem | null
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  lang: 'en' | 'es'
  t: ReturnType<typeof useT>
  onClose: () => void
  onBack: () => void
  onConfirm: (fields: SubscriptionFormFields) => void
}) {
  const expenseCategories = categories.filter(c => c.type === 'expense')

  return (
    <RecurringTxForm
      dialogRef={dialogRef}
      title={item?.name ?? t('customServiceLabel')}
      preview={item && (
        <div className="msub-catalog-preview">
          <ServiceTile item={item} size={60} glyph={32} />
        </div>
      )}
      confirmLabel={t('createRecurrenceLabel')}
      categories={categories}
      accounts={accounts}
      currency={currency}
      lang={lang}
      t={t}
      initialNote={item?.name ?? ''}
      initialAmount={0}
      initialCategoryId={item ? suggestedCategoryId(item.categoryHint, categories) : (expenseCategories[0]?.id ?? '')}
      initialAccountId={accounts[0]?.id ?? ''}
      initialFrequency="monthly"
      initialServiceId={item?.id}
      onClose={onClose}
      onBack={onBack}
      onConfirm={onConfirm}
    />
  )
}

type RecurringFormSub = 'amount' | 'name' | 'account' | 'category' | null

function RecurringTxForm({
  dialogRef, title, preview, hint, confirmLabel, categories, accounts, currency, lang, t,
  initialNote, initialAmount, initialCategoryId, initialAccountId, initialFrequency, initialServiceId,
  onClose, onBack, onConfirm,
}: {
  dialogRef: React.RefObject<HTMLDivElement>
  title: string
  preview?: React.ReactNode
  hint?: React.ReactNode
  confirmLabel: string
  categories: Category[]
  accounts: Account[]
  currency: CurrencyCode
  lang: 'en' | 'es'
  t: ReturnType<typeof useT>
  initialNote: string
  initialAmount: number
  initialCategoryId: string
  initialAccountId: string
  initialFrequency: RecurrenceFrequency
  initialServiceId?: string
  onClose: () => void
  onBack?: () => void
  onConfirm: (fields: SubscriptionFormFields) => void
}) {
  const expenseCategories = categories.filter(c => c.type === 'expense')
  const [note, setNote] = useState(initialNote)
  const [amount, setAmount] = useState(initialAmount)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [accountId, setAccountId] = useState(initialAccountId)
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(initialFrequency)
  const [chargeWeekday, setChargeWeekday] = useState<number | null>(null)
  const [chargeMonthDay, setChargeMonthDay] = useState<number | null>(null)
  const [sub, setSub] = useState<RecurringFormSub>(null)

  useMobileBackDismiss(sub !== null, () => setSub(null))

  const activeAccount = accounts.find(a => a.id === accountId) ?? null
  const activeCategory = expenseCategories.find(c => c.id === categoryId) ?? null
  const canSave = note.trim().length > 0 && amount > 0 && !!categoryId && !!accountId
  const pfx = CURRENCIES[currency].symbol
  const arrow = <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)', flexShrink: 0 }} />
  const weekdayLabels = useMemo(() => weekdayShortLabels(dateLocale(lang)), [lang])
  const annualEquivalent = amount > 0 ? amount * (frequency === 'weekly' ? 52 : 12) : 0

  return (
    <>
      <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet centered" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
        <section className="msub-form-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{title}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          <div className="msub-form-body">
            {preview}

            <button className="txf-amount-hero" onClick={() => setSub('amount')}>
              <span className="txf-amount-label">{t('amount')}</span>
              <span className="txf-amount-value" style={{ color: amount > 0 ? '#f65574' : 'var(--m-muted)' }}>
                {amount > 0
                  ? `${pfx} ${amount.toLocaleString('en-US', { minimumFractionDigits: CURRENCIES[currency].decimals, maximumFractionDigits: CURRENCIES[currency].decimals })}`
                  : `${pfx} 0`}
              </span>
              <span className="txf-amount-tap">
                {amount > 0 ? t('annualEquivalentLabel').replace('{amount}', fmt(annualEquivalent, currency)) : t('tapToEditLabel')}
              </span>
            </button>

            <div className="mpr-form-rows txf-rows">
              <button className="mpr-form-row" onClick={() => setSub('name')}>
                <Icon name="edit" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
                <span className="mpr-form-row-label">{t('name')}</span>
                <span className={note ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>{note || t('requiredLabel')}</span>
                {arrow}
              </button>

              <button className="mpr-form-row" onClick={() => setSub('account')}>
                <Icon
                  name={activeAccount ? ACCT_ICONS[activeAccount.type] : 'wallet'}
                  size={16}
                  style={{ color: activeAccount?.color ?? 'var(--m-muted)', flexShrink: 0 }}
                />
                <span className="mpr-form-row-label">{t('account')}</span>
                <span className={activeAccount ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                  {activeAccount?.name ?? t('selectLabel')}
                </span>
                {arrow}
              </button>

              <button className="mpr-form-row" onClick={() => setSub('category')}>
                <Icon
                  name={(activeCategory?.icon as IconName | undefined) ?? 'tag'}
                  size={16}
                  style={{ color: activeCategory?.color ?? 'var(--m-muted)', flexShrink: 0 }}
                />
                <span className="mpr-form-row-label">{t('category')}</span>
                <span className={activeCategory ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                  {activeCategory ? translateCategoryName(activeCategory, lang) : t('selectLabel')}
                </span>
                {arrow}
              </button>

              <div className="mpr-form-row">
                <Icon name="repeat" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
                <span className="mpr-form-row-label">{t('frequencyLabel')}</span>
                <div className="mpr-pill-row" style={{ flex: 1, justifyContent: 'flex-end' }}>
                  {(['weekly', 'monthly'] as RecurrenceFrequency[]).map(f => (
                    <button
                      key={f}
                      className={`mpr-pill${frequency === f ? ' on' : ''}`}
                      style={frequency === f ? { borderColor: 'var(--m-text)', color: 'var(--m-text)' } : {}}
                      onClick={() => setFrequency(f)}
                    >
                      {f === 'weekly' ? t('weekly') : t('monthly')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {frequency === 'weekly' && (
              <div className="msub-chargeday">
                <span className="msub-chargeday-title">{t('chargeDayLabel')}</span>
                <div className="msub-weekday-row">
                  {WEEKDAY_ORDER.map((wd, i) => {
                    const on = chargeWeekday === wd
                    return (
                      <button
                        key={wd}
                        type="button"
                        className={`msub-weekday${on ? ' on' : ''}`}
                        onClick={() => setChargeWeekday(on ? null : wd)}
                      >
                        {weekdayLabels[i]}
                      </button>
                    )
                  })}
                </div>
                <small className="msub-chargeday-hint">
                  {chargeWeekday === null ? t('chargeDayAnyHint') : t('chargeDayPickedHint')}
                </small>
              </div>
            )}

            {frequency === 'monthly' && (
              <div className="msub-chargeday">
                <span className="msub-chargeday-title">{t('chargeDayLabel')}</span>
                <div className="msub-monthday-grid">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(day => {
                    const on = chargeMonthDay === day
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`msub-monthday${on ? ' on' : ''}`}
                        onClick={() => setChargeMonthDay(on ? null : day)}
                      >
                        {day}
                      </button>
                    )
                  })}
                </div>
                <small className="msub-chargeday-hint">
                  {chargeMonthDay === null ? t('chargeDayMonthlyAnyHint') : t('chargeDayMonthlyPickedHint')}
                </small>
              </div>
            )}

            {hint}
          </div>
          <div className="msub-form-actions">
            <button className="msub-form-cancel" onClick={onBack ?? onClose}>{onBack ? t('back') : t('cancel')}</button>
            <button className="msub-form-save" disabled={!canSave}
              onClick={() => onConfirm({ note: note.trim(), amount, categoryId, accountId, recurring: frequency, chargeWeekday, chargeMonthDay, serviceId: initialServiceId })}>
              {confirmLabel}
            </button>
          </div>
        </section>
      </div>
      </SheetPortal>

      {sub === 'amount' && (
        <MobileAmountSheet
          title={t('amount')}
          value={amount}
          currency={currency}
          onDone={v => { setAmount(v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {sub === 'name' && (
        <MobileTextSheet
          title={t('name')}
          value={note}
          placeholder={t('notePlaceholder')}
          onDone={v => { setNote(v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {sub === 'account' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('selectAccount')}</span>
              <button aria-label={t('close')} onClick={() => setSub(null)}><Icon name="close" size={18} /></button>
            </header>
            <div className="mobile-picker-list">
              {accounts.map(a => (
                <button
                  key={a.id}
                  className={`mobile-picker-row${a.id === accountId ? ' active' : ''}`}
                  onClick={() => { setAccountId(a.id); setSub(null) }}
                >
                  <span style={{ color: a.color }}>
                    <Icon name={ACCT_ICONS[a.type]} size={22} />
                  </span>
                  <b>{a.name}</b>
                  <small>{fmt(a.balance, accountCurrency(a, currency))}</small>
                  {a.id === accountId && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 4 }} />}
                </button>
              ))}
            </div>
          </section>
        </div>
        </SheetPortal>
      )}

      {sub === 'category' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section className="msub-picker-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('selectCategory')}</span>
              <button onClick={() => setSub(null)}>
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="msub-category-list">
                {expenseCategories.map(c => (
                  <button
                    key={c.id}
                    className={`msub-category-row${categoryId === c.id ? ' on' : ''}`}
                    aria-pressed={categoryId === c.id}
                    onClick={() => { setCategoryId(c.id); setSub(null) }}
                  >
                    <span className="msub-category-icon" style={{ color: c.color, background: `color-mix(in oklab, ${c.color} 22%, transparent)` }}>
                      <Icon name={c.icon as IconName} size={20} />
                    </span>
                    <small>{translateCategoryName(c, lang)}</small>
                    {categoryId === c.id && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto' }} />}
                  </button>
                ))}
            </div>
          </section>
        </div>
        </SheetPortal>
      )}
    </>
  )
}
