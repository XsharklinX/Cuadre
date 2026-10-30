import { useMemo, useState } from 'react'
import { SheetSelect } from '@/components/ui/SheetSelect'
import { AccountPickerRow } from '@/components/ui/AccountPickerRow'
import { Icon } from '@/components/ui/Icon'
import { BrandLogo } from '@/components/ui/BrandLogo'
import { toast } from '@/components/ui/Toast'
import { currentMonthKey, dateLocale, fmt, localToday } from '@/data/helpers'
import { serviceCostPerMonth, type Service } from '@/data/business'
import { detectSubscriptions, subscriptionInsightKey as insightKey, type SubscriptionInsight } from '@/data/financeIntelligence'
import { useBusiness } from '@/store/business'
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
import { IconTile, NxSheet } from '@/components/ui/Phrase'
import { MobileDatePicker } from './MobileDatePicker'
import { AccountPickSheet } from './goals/GoalBits'
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

  const convertRef = useDialogA11y<HTMLDivElement>(() => setConverting(null), !!converting)
  useMobileBackDismiss(adding, () => setAdding(false))
  const addRef = useDialogA11y<HTMLDivElement>(() => setAdding(false), adding)

  // Only recurring templates (not the generated instances — those have no recurring field)
  // Lo cancelado («La cancelé» pone `recurringEnd`) deja de contar: su historia
  // sigue en los movimientos, pero ya no se paga cada mes.
  const recurring = transactions.filter(tx => tx.recurring && (!tx.recurringEnd || tx.recurringEnd >= today()))

  /*
   * LO QUE REVENDES NO ES GASTO TUYO.
   *
   * Quien revende Netflix lo tiene apuntado dos veces —la suscripción real y
   * el servicio de su negocio— y esta pantalla sumaba ese Netflix a «lo que
   * gastas al mes en suscripciones». No lo está gastando: lo cubren sus
   * clientes, y la cifra que de verdad quería ver salía inflada.
   *
   * Las dos siguen contando en el libro, porque el dinero sí sale de su
   * cuenta. Lo que cambia es de quién se dice que es el gasto.
   */
  const services = useBusiness(s => s.services)
  const esRevendida = (tx: Transaction) =>
    !!tx.resoldAs && services.some(v => v.id === tx.resoldAs)

  const revendidas = recurring.filter(esRevendida)
  const propias = recurring.filter(tx => !esRevendida(tx))

  const totalMonthly = propias.reduce((s, tx) => s + monthlyEquivalent(tx), 0)
  const totalResold = revendidas.reduce((s, tx) => s + monthlyEquivalent(tx), 0)
  const totalAnnual = totalMonthly * 12

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

  // ── 2.8 · SUSCRIPCIONES CON LAS PIEZAS DE LA APP (U1–U7) ─────────────
  const todayISO = today()
  const [bizFor, setBizFor] = useState<SubscriptionInsight | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [verNegocio, setVerNegocio] = useState(false)
  const [remind, setRemind] = useState<string[]>(readRemind)

  // U1 · Qué parte de lo que entra: la media de ingresos de los tres últimos meses.
  const incomeAvg = useMemo(() => {
    const keys = [1, 2, 3].map(k => { const d = new Date(); d.setMonth(d.getMonth() - k); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` })
    const total = transactions.filter(tx => tx.type === 'income' && keys.includes(tx.date.slice(0, 7))).reduce((s, tx) => s + tx.amount, 0)
    return total / 3
  }, [transactions])
  const sharePct = incomeAvg > 0 ? Math.round((totalMonthly / incomeAvg) * 100) : null

  // U1 · Una sola lista, por el próximo cobro.
  const lista = useMemo(
    () => [...propias].filter(tx => !tx.recurringEnd || nextDate(tx) <= tx.recurringEnd).sort((a, b) => nextDate(a).localeCompare(nextDate(b))),
    [propias],
  )
  const enTira = lista.filter(tx => daysUntil(nextDate(tx), todayISO) >= 0 && daysUntil(nextDate(tx), todayISO) <= 31).slice(0, 6)

  // U6 · La subida de precio, en la fila de su suscripción.
  const hikeFor = (tx: Transaction) => {
    const n = tx.note.trim().toLowerCase()
    return priceHikes.find(h => h.merchant.trim().toLowerCase() === n)?.priceIncrease ?? null
  }
  const hikesSinFila = priceHikes.filter(h => !recurring.some(tx => tx.note.trim().toLowerCase() === h.merchant.trim().toLowerCase()))

  // U5 · El repaso, una vez al trimestre.
  const reviewDue = (() => {
    if (propias.length < 2) return false
    try {
      const last = Number(localStorage.getItem(REVIEW_KEY) ?? 0)
      return Date.now() - last > 90 * 86_400_000
    } catch { return false }
  })()

  const relLabel = (iso: string): string => {
    const d = daysUntil(iso, todayISO)
    if (d < 0) return t('overdueLabel')
    if (d === 0) return t('todayLabel')
    if (d === 1) return t('tomorrowLabel')
    return t('inDaysLabel').replace('{n}', String(d))
  }

  const fila = (tx: Transaction) => {
    const cat = categories.find(c => c.id === tx.categoryId)
    const acct = accounts.find(a => a.id === tx.accountId)
    const service = tx.serviceId ? SUBSCRIPTION_CATALOG.find(c => c.id === tx.serviceId) : undefined
    const iso = nextDate(tx)
    const overdue = daysUntil(iso, todayISO) < 0
    const lowFunds = !!acct && lacksFunds(acct, tx.amount)
    const hike = hikeFor(tx)
    return (
      <button key={tx.id} className="u28-row" onClick={() => setSheet({ tx, confirm: false })}>
        <RowTile item={service} fallbackColor={service?.color ?? cat?.color ?? '#888'} fallbackIcon={cat?.icon ?? 'repeat'} size={40} glyph={20} />
        <span className="u28-row-main">
          <b>{tx.note || (cat ? translateCategoryName(cat, lang) : '—')}</b>
          <small className={overdue || lowFunds ? 'bad' : ''}>
            {new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            {' · '}{relLabel(iso)}
            {lowFunds && !overdue && acct ? ` · ${t('u28NotEnough').replace('{account}', acct.short || acct.name)}` : acct ? ` · ${acct.short || acct.name}` : ''}
          </small>
          {hike && (
            <small className="bad">{t('u28Hike').replace('{from}', fmt(hike.from, currency)).replace('{year}', fmt((hike.to - hike.from) * 12, currency))}</small>
          )}
        </span>
        <span className="u28-row-v">
          <b>−{fmt(tx.amount, currency)}</b>
          <small>{freqLabel(tx, t)}</small>
        </span>
      </button>
    )
  }

  const detectada = detected[0]

  // U2 · «Es del negocio»: se crea ya enlazada a su servicio.
  const asBusiness = (insight: SubscriptionInsight, serviceId: string) => {
    const day = Number(insight.lastDate.slice(8, 10)) || null
    const { start, next } = initialRecurringDates('monthly', null, day)
    addTx({
      type: 'expense',
      amount: Math.round(insight.amount * 100) / 100,
      date: start,
      note: titleCase(insight.merchant),
      categoryId: insight.categoryId,
      accountId: insight.accountId,
      recurring: 'monthly',
      recurringStart: start,
      recurringNext: next,
      resoldAs: serviceId,
    })
    const svc = services.find(v => v.id === serviceId)
    toast(t('subResoldSaved').replace('{name}', svc?.name ?? ''), { icon: 'check', type: 'ok' })
    setBizFor(null)
  }

  const toggleRemind = (id: string) => {
    const next = remind.includes(id) ? remind.filter(x => x !== id) : [...remind, id]
    setRemind(next)
    try { localStorage.setItem(REMIND_KEY, JSON.stringify(next)) } catch { /* sin almacenamiento no se recuerda */ }
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
    <div className="msub-root u28">
      {/* U1 · Lo que pagas, y el mes con los logos en su día. */}
      <section className="u28-hero">
        <div className="u28-hero-top">
          <span className="u28-label">{t('u28PayMonthly')}</span>
          <button className="u28-add" onClick={() => setAdding(true)}>+ {t('u28Add')}</button>
        </div>
        <b className="u28-big">{fmt(totalMonthly, currency)}</b>
        <small className="u28-sub">
          {t(propias.length === 1 ? 'recurringPaymentSingular' : 'recurringPaymentPlural').replace('{n}', String(propias.length))}
          {' · '}{t('annualEquivalentLabel').replace('{amount}', fmt(totalAnnual, currency))}
          {sharePct !== null && sharePct > 0 && ` · ${t('u28OfIncome').replace('{pct}', String(sharePct))}`}
        </small>
        {enTira.length > 0 && (
          <div className="u28-strip" aria-label={t('upcomingChargesTitle')}>
            <span className="today"><b>{new Date(`${todayISO}T00:00:00`).getDate()}</b><small>{t('todayLabel')}</small></span>
            {enTira.map(tx => {
              const service = tx.serviceId ? SUBSCRIPTION_CATALOG.find(c => c.id === tx.serviceId) : undefined
              const cat = categories.find(c => c.id === tx.categoryId)
              return (
                <button key={tx.id} onClick={() => setSheet({ tx, confirm: false })} aria-label={tx.note}>
                  <b>{new Date(`${nextDate(tx)}T00:00:00`).getDate()}</b>
                  <RowTile item={service} fallbackColor={service?.color ?? cat?.color ?? '#888'} fallbackIcon={cat?.icon ?? 'repeat'} size={24} glyph={13} />
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* U2 · Las detectadas, una pregunta a la vez. */}
      {detectada && (
        <section className="u28-ask">
          <div className="u28-ask-top">
            <IconTile icon="info" color="var(--m-primary)" size={34} />
            <span>
              <b>{t('u28AskTitle')}</b>
              <small>{t('u28AskSub').replace('{n}', String(detectada.months))}{detected.length > 1 ? ` · ${t('u28AskCount').replace('{n}', String(detected.length))}` : ''}</small>
            </span>
          </div>
          <div className="u28-ask-row">
            <span className="u28-row-main"><b>{titleCase(detectada.merchant)}</b><small>{t('u28AskDay').replace('{d}', String(Number(detectada.lastDate.slice(8, 10))))}</small></span>
            <b className="u28-ask-amt">−{fmt(detectada.amount, currency)}</b>
          </div>
          <div className="u28-ask-acts">
            <button onClick={() => {
              dismissSuggestion(insightKey(detectada))
              toast(t('subscriptionIgnoredToast').replace('{name}', titleCase(detectada.merchant)), { icon: 'check', type: 'ok' })
            }}>{t('u28No')}</button>
            {services.length > 0 && <button onClick={() => setBizFor(detectada)}>{t('u28IsBusiness')}</button>}
            <button className="pri" onClick={() => setConverting(detectada)}>{t('yes')}</button>
          </div>
        </section>
      )}

      {/* U5 · El repaso, una vez al trimestre. */}
      {reviewDue && (
        <button className="u28-review" onClick={() => setReviewing(true)}>
          <IconTile icon="eye" color="#a78bfa" size={34} />
          <span><b>{t('u28ReviewTitle')}</b><small>{t('u28ReviewSub')}</small></span>
          <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} />
        </button>
      )}

      {hikesSinFila.map(hike => (
        <div key={insightKey(hike)} className="u28-review" role="alert">
          <IconTile icon="arrowUp" color="var(--m-expense)" size={34} />
          <span>
            <b>{t('priceIncreaseTitle').replace('{name}', titleCase(hike.merchant))}</b>
            <small>{t('priceIncreaseText').replace('{from}', fmt(hike.priceIncrease!.from, currency)).replace('{to}', fmt(hike.priceIncrease!.to, currency)).replace('{pct}', String(hike.priceIncrease!.pct))}</small>
          </span>
          <button className="u28-x" aria-label={t('ignoreSuggestionLabel')} onClick={() => dismissSuggestion(insightKey(hike))}><Icon name="close" size={13} /></button>
        </div>
      ))}

      {lista.length > 0 && (
        <>
          <p className="u28-title">{t('upcomingChargesTitle')}</p>
          <div className="u28-card">{lista.map(fila)}</div>
        </>
      )}

      {/* U7 · Lo que revendes, aparte: lo cubren tus clientes. */}
      {revendidas.length > 0 && (
        <>
          <button className="u28-title u28-title-btn" onClick={() => setVerNegocio(v => !v)} aria-expanded={verNegocio}>
            {t('u28FromBusiness').replace('{amount}', fmt(totalResold, currency))}
            <span>{verNegocio ? t('nxkHide') : t('nxkShow')}</span>
          </button>
          {verNegocio && <div className="u28-card">{revendidas.map(fila)}</div>}
        </>
      )}

      {!reviewDue && propias.length >= 2 && (
        <button className="u28-link" onClick={() => setReviewing(true)}>{t('u28ReviewLink')}</button>
      )}

      {/* U3 · La ficha de una suscripción. */}
      {sheet && (
        <SubscriptionDetail
          tx={sheet.tx}
          services={services}
          remind={remind.includes(sheet.tx.id)}
          onToggleRemind={() => toggleRemind(sheet.tx.id)}
          onClose={() => setSheet(null)}
          onSkip={() => handleSkipNext(sheet.tx)}
          onEnd={() => handleEnd(sheet.tx)}
          onDelete={() => handleDelete(sheet.tx)}
          onResold={id => {
            // `undefined` quita el enlace, no cadena vacía (lista blanca de normalizeTransaction).
            updateTx(sheet.tx.id, { resoldAs: id || undefined })
            const svc = services.find(v => v.id === id)
            if (svc) toast(t('subResoldSaved').replace('{name}', svc.name), { icon: 'check', type: 'ok' })
            setSheet(st => st ? { ...st, tx: { ...st.tx, resoldAs: id || undefined } } : st)
          }}
          onChange={patch => { updateTx(sheet.tx.id, patch); setSheet(st => st ? { ...st, tx: { ...st.tx, ...patch } } : st) }}
        />
      )}

      {bizFor && (
        <NxSheet title={t('u28WhichService')} sub={titleCase(bizFor.merchant)} onClose={() => setBizFor(null)}>
          <div className="nx-list">
            {services.filter(v => !v.archivedAt).map(v => (
              <button key={v.id} className="an28-pick" onClick={() => asBusiness(bizFor, v.id)}>
                <span className="an28-row-main"><b>{v.name}</b></span>
              </button>
            ))}
          </div>
        </NxSheet>
      )}

      {reviewing && (
        <ReviewSheet
          txs={propias}
          currency={currency}
          onClose={() => setReviewing(false)}
          onDone={() => { try { localStorage.setItem(REVIEW_KEY, String(Date.now())) } catch { /* nada */ } }}
          onOpen={tx => { setReviewing(false); setSheet({ tx, confirm: false }) }}
        />
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

const REVIEW_KEY = 'cuadre-subs-review-at'
const REMIND_KEY = 'cuadre-sub-remind'
function readRemind(): string[] {
  try { return JSON.parse(localStorage.getItem(REMIND_KEY) ?? '[]') as string[] } catch { return [] }
}

/*
 * U3 · LA FICHA DE UNA SUSCRIPCIÓN (2.8).
 *
 * El precio en grande, lo que es al año, cuánto llevas pagándola y cómo ha
 * cambiado su precio. Filas que se editan en el sitio y tres salidas: saltar
 * el próximo cobro, «la cancelé» (deja de contarla y guarda su historia) o
 * borrarla.
 */
function SubscriptionDetail({ tx, services, remind, onToggleRemind, onClose, onSkip, onEnd, onDelete, onResold, onChange }: {
  tx: Transaction
  services: Service[]
  remind: boolean
  onToggleRemind: () => void
  onClose: () => void
  onSkip: () => void
  onEnd: () => void
  onDelete: () => void
  onResold: (serviceId: string) => void
  onChange: (patch: Partial<Transaction>) => void
}) {
  const t = useT()
  const { transactions, accounts, currency } = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const [sub, setSub] = useState<'date' | 'account' | null>(null)
  const [confirm, setConfirm] = useState(false)
  const service = tx.serviceId ? SUBSCRIPTION_CATALOG.find(c => c.id === tx.serviceId) : undefined
  const acct = accounts.find(a => a.id === tx.accountId)
  const history = useMemo(() => priceHistory(transactions, tx), [transactions, tx])
  const since = tx.recurringStart ?? tx.date
  const months = Math.max(0, Math.round(daysUntil(today(), since) / 30.4))
  const last = history[history.length - 1]
  const first = history[0]
  const changed = history.length > 1
  const max = Math.max(1, ...history.map(h => h.amount))
  const min = Math.min(...history.map(h => h.amount))

  return (
    <>
      <NxSheet
        title={tx.note}
        sub={service?.name && service.name !== tx.note ? service.name : undefined}
        onClose={onClose}
        footer={confirm ? (
          <>
            <button className="nx-btn" onClick={() => setConfirm(false)}>{t('cancel')}</button>
            <button className="nx-btn danger" onClick={onDelete}>{t('delete')}</button>
          </>
        ) : undefined}
      >
        <div className="u28-detail-top">
          <RowTile item={service} fallbackColor={service?.color ?? '#888'} fallbackIcon="repeat" size={46} glyph={22} />
          <span>
            <b className="u28-big">{fmt(tx.amount, currency)}<em>{freqLabel(tx, t)}</em></b>
            <small className="u28-sub">
              {t('annualEquivalentLabel').replace('{amount}', fmt(monthlyEquivalent(tx) * 12, currency))}
              {months >= 1 && ` · ${t('u28Since').replace('{n}', String(months))}`}
            </small>
          </span>
        </div>

        {changed && (
          <div className="u28-history">
            <span className="u28-label">{t('u28PriceHistory')}</span>
            <svg viewBox="0 0 300 54" width="100%" height="54" preserveAspectRatio="none" aria-hidden="true">
              <polyline
                fill="none"
                stroke="var(--m-primary)"
                strokeWidth="2.2"
                points={history.flatMap((h, i) => {
                  const x0 = (i / history.length) * 300, x1 = ((i + 1) / history.length) * 300
                  const y = 48 - ((h.amount - min) / Math.max(1, max - min)) * 40
                  return [`${x0},${y}`, `${x1},${y}`]
                }).join(' ')}
              />
            </svg>
            <small className={last.amount > first.amount ? 'bad' : 'ok'}>
              {t(last.amount > first.amount ? 'u28WentUp' : 'u28WentDown')
                .replace('{from}', fmt(first.amount, currency))
                .replace('{to}', fmt(last.amount, currency))
                .replace('{date}', new Date(`${last.since}T00:00:00`).toLocaleDateString(locale, { month: 'short', year: 'numeric' }))}
            </small>
          </div>
        )}

        <div className="nx-list">
          <button className="an28-pick" onClick={() => setSub('date')}>
            <span className="an28-row-main"><b>{t('u28NextCharge')}</b></span>
            <span className="u28-v">{new Date(`${nextDate(tx)}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</span>
          </button>
          <button className="an28-pick" onClick={() => setSub('account')}>
            <span className="an28-row-main"><b>{t('account')}</b></span>
            <span className="u28-v">{acct?.name ?? '—'}</span>
          </button>
          <button className="an28-pick" onClick={onToggleRemind} aria-pressed={remind}>
            <span className="an28-row-main"><b>{t('u28RemindMe')}</b><small>{t('u28RemindHint')}</small></span>
            <span className={`u28-v${remind ? ' ok' : ''}`}>{remind ? t('yes') : t('no')}</span>
          </button>
        </div>

        <ResoldRow tx={tx} services={services} currency={currency} t={t} onPick={onResold} />

        {!confirm && (
          <div className="nx-actions">
            <button onClick={onSkip}>{t('u28Skip')}</button>
            <button onClick={onEnd}>{t('u28Cancelled')}</button>
            <button className="danger" onClick={() => setConfirm(true)}>{t('delete')}</button>
          </div>
        )}
        {confirm && <p className="nx-note">{t('deleteTemplateConfirm').replace('{name}', tx.note)}</p>}
      </NxSheet>

      {sub === 'date' && (
        <MobileDatePicker value={nextDate(tx)} onChange={v => { onChange({ recurringNext: v }); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'account' && (
        <AccountPickSheet title={t('account')} accounts={accounts} value={tx.accountId ?? ''} onPick={id => { onChange({ accountId: id }); setSub(null) }} onClose={() => setSub(null)} />
      )}
    </>
  )
}

/** El precio de una suscripción a lo largo del tiempo, por tramos («desde» → monto). */
export function priceHistory(transactions: Transaction[], tx: Transaction): { since: string; amount: number }[] {
  const n = tx.note.trim().toLowerCase()
  const cargos = transactions
    .filter(x => x.type === 'expense' && x.note.trim().toLowerCase() === n && x.date <= today())
    .sort((a, b) => a.date.localeCompare(b.date))
  const out: { since: string; amount: number }[] = []
  for (const c of cargos) {
    const prev = out[out.length - 1]
    if (!prev || Math.abs(prev.amount - c.amount) > 0.5) out.push({ since: c.date, amount: c.amount })
  }
  if (!out.length) out.push({ since: tx.recurringStart ?? tx.date, amount: tx.amount })
  else if (Math.abs(out[out.length - 1].amount - tx.amount) > 0.5) out.push({ since: tx.recurringNext ?? today(), amount: tx.amount })
  return out
}

/*
 * U5 · EL REPASO: «¿SIGUES USÁNDOLA?».
 *
 * De una en una, con lo que cuesta al año. Nada se cancela solo: al final
 * queda la lista de las que puedes dejar y cuánto ahorrarías.
 */
function ReviewSheet({ txs, currency, onClose, onDone, onOpen }: {
  txs: Transaction[]
  currency: CurrencyCode
  onClose: () => void
  onDone: () => void
  onOpen: (tx: Transaction) => void
}) {
  const t = useT()
  const [i, setI] = useState(0)
  const [drop, setDrop] = useState<string[]>([])
  const fin = i >= txs.length
  const actual = txs[i]
  const ahorro = txs.filter(tx => drop.includes(tx.id)).reduce((s, tx) => s + monthlyEquivalent(tx) * 12, 0)
  const answer = (dejar: boolean) => {
    if (dejar && actual) setDrop(d => [...d, actual.id])
    const next = i + 1
    setI(next)
    if (next >= txs.length) onDone()
  }
  return (
    <NxSheet title={t('u28ReviewTitle')} sub={fin ? undefined : t('u28ReviewStep').replace('{n}', String(i + 1)).replace('{of}', String(txs.length))} onClose={onClose}>
      {!fin && actual ? (
        <div className="u28-rev">
          <b className="u28-rev-name">{actual.note}</b>
          <b className="u28-big">{fmt(monthlyEquivalent(actual) * 12, currency)}<em>{t('u28PerYear')}</em></b>
          <small className="u28-sub">{fmt(actual.amount, currency)} {freqLabel(actual, t)}</small>
          <div className="u28-ask-acts">
            <button onClick={() => answer(true)}>{t('u28CanDrop')}</button>
            <button className="pri" onClick={() => answer(false)}>{t('u28StillUse')}</button>
          </div>
        </div>
      ) : (
        <div className="u28-rev">
          {drop.length ? (
            <>
              <b className="u28-rev-name">{t('u28ReviewSave').replace('{n}', String(drop.length)).replace('{amount}', fmt(ahorro, currency))}</b>
              <small className="u28-sub">{t('u28ReviewSaveHint')}</small>
              <div className="nx-list">
                {txs.filter(tx => drop.includes(tx.id)).map(tx => (
                  <button key={tx.id} className="an28-pick" onClick={() => onOpen(tx)}>
                    <span className="an28-row-main"><b>{tx.note}</b><small>{fmt(monthlyEquivalent(tx) * 12, currency)} {t('u28PerYear')}</small></span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <b className="u28-rev-name">{t('u28ReviewAllUsed')}</b>
          )}
        </div>
      )}
    </NxSheet>
  )
}

/**
 * «ESTA LA REVENDO»: el enlace con un servicio de Negocio.
 *
 * Va en la hoja de la suscripción y no en la ficha del servicio porque es
 * aquí, mirando el recibo, donde al usuario se le ocurre que ese gasto no es
 * suyo del todo.
 *
 * ── EL AVISO DEL DESCUADRE ────────────────────────────────────────────
 * Si el recibo son 750 al mes y en el servicio declaró 600, su ganancia está
 * calculada con 600 y se cree 150 más rico cada mes. Son dos números que el
 * usuario escribió en sitios distintos sin forma de compararlos; una vez
 * enlazados, la app puede decirlo. No se corrige solo: cuál de los dos es el
 * bueno lo sabe él, no la app.
 */
function ResoldRow({ tx, services, currency, t, onPick }: {
  tx: Transaction
  services: Service[]
  currency: CurrencyCode
  t: ReturnType<typeof useT>
  onPick: (serviceId: string) => void
}) {
  const enlazado = services.find(v => v.id === tx.resoldAs)

  if (!services.length) {
    return <p className="msub-resold-empty">{t('subResoldNoServices')}</p>
  }

  const declarado = enlazado ? serviceCostPerMonth(enlazado, currency) : 0
  const real = monthlyEquivalent(tx)
  // Un peso de diferencia es redondeo, no un descuadre que merezca un aviso.
  const descuadra = !!enlazado && Math.abs(declarado - real) > 1

  return (
    <div className="msub-resold">
      <label className="msub-resold-label" htmlFor="msub-resold-pick">
        {t('subResoldTitle')}
      </label>
      <SheetSelect
        id="msub-resold-pick"
        className="msub-resold-pick"
        title={t('subResoldTitle')}
        value={tx.resoldAs ?? ''}
        onChange={onPick}
        options={[{ value: '', label: t('subResoldNone') }, ...services.map(v => ({ value: v.id, label: v.name }))]}
      />
      <small>{t('subResoldHint')}</small>
      {descuadra && (
        <p className="msub-resold-warn">
          {t('subResoldMismatch')
            .replace('{name}', enlazado.name)
            .replace('{declared}', fmt(declarado, currency))
            .replace('{real}', fmt(real, currency))}
        </p>
      )}
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
  const [q, setQ] = useState('')
  const catalogo = q.trim() ? SUBSCRIPTION_CATALOG.filter(i => i.name.toLowerCase().includes(q.trim().toLowerCase())) : SUBSCRIPTION_CATALOG

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
          <label className="u28-search">
            <Icon name="search" size={16} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={t('u28SearchBrand')} aria-label={t('u28SearchBrand')} />
          </label>
          <div className="msub-catalog-grid">
            {catalogo.map(item => (
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
  const transactions = useFinance(st => st.transactions)
  // U4 · Si ya hay un cobro con ese nombre, su monto, su día y su cuenta se proponen.
  const parecido = useMemo(() => {
    if (!item) return null
    const n = item.name.toLowerCase()
    return [...transactions]
      .filter(tx => tx.type === 'expense' && tx.note.toLowerCase().includes(n))
      .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
  }, [item, transactions])

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
      initialAmount={parecido?.amount ?? 0}
      initialMonthDay={parecido ? Number(parecido.date.slice(8, 10)) : null}
      hint={parecido ? <p className="u28-sub" style={{ margin: '4px 2px 0' }}>{t('u28Suggested')}</p> : undefined}
      initialCategoryId={parecido?.categoryId ?? (item ? suggestedCategoryId(item.categoryHint, categories) : (expenseCategories[0]?.id ?? ''))}
      initialAccountId={parecido?.accountId ?? accounts[0]?.id ?? ''}
      initialFrequency="monthly"
      initialServiceId={item?.id}
      onClose={onClose}
      onBack={onBack}
      onConfirm={onConfirm}
    />
  )
}

type RecurringFormSub = 'amount' | 'name' | 'account' | 'category' | 'when' | null

function RecurringTxForm({
  dialogRef, title, preview, hint, confirmLabel, categories, accounts, currency, lang, t,
  initialNote, initialAmount, initialCategoryId, initialAccountId, initialFrequency, initialServiceId, initialMonthDay,
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
  initialMonthDay?: number | null
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
  const [chargeMonthDay, setChargeMonthDay] = useState<number | null>(initialMonthDay ?? null)
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

              <button className="mpr-form-row" onClick={() => setSub('when')}>
                <Icon name="repeat" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
                <span className="mpr-form-row-label">{t('n28Every')}</span>
                <span className="mpr-form-row-val">
                  {frequency === 'weekly'
                    ? `${t('weekly')}${chargeWeekday !== null ? ` · ${weekdayLabels[WEEKDAY_ORDER.indexOf(chargeWeekday)]}` : ''}`
                    : `${t('monthly')}${chargeMonthDay !== null ? ` · ${t('bizDayShort').replace('{n}', String(chargeMonthDay))}` : ''}`}
                </span>
                {arrow}
              </button>
            </div>

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

      {sub === 'when' && (
        <NxSheet title={t('chargeDayLabel')} onClose={() => setSub(null)} footer={<button className="nx-btn pri" onClick={() => setSub(null)}>{t('done')}</button>}>
          <div className="mpr-pill-row" style={{ marginBottom: 12 }}>
            {(['weekly', 'monthly'] as RecurrenceFrequency[]).map(f => (
              <button key={f} className={`mpr-pill${frequency === f ? ' on' : ''}`} onClick={() => setFrequency(f)}>
                {f === 'weekly' ? t('weekly') : t('monthly')}
              </button>
            ))}
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

        </NxSheet>
      )}

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
          suggestFor={{ categoryId }}
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
                <AccountPickerRow
                  key={a.id}
                  account={a}
                  selected={a.id === accountId}
                  onSelect={() => { setAccountId(a.id); setSub(null) }}
                />
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
