import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useDialogs } from '@/components/ui/DialogProvider'
import { isDuplicateTransaction } from '@/data/bankCsv'
import { accountCurrency, dateLocale, fmt, localToday } from '@/data/helpers'
import { buildTxEntry, readTxEntry, routeTx } from '@/data/txCurrency'
import { CURRENCIES as CURRENCY_METAS, getCurrencyMeta } from '@/data/currencies'
import { CURRENCIES } from '@/data/seed'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { useT } from '@/i18n'
import { playConfirmSound, playDeleteSound } from '@/lib/sound'
import { MobileAmountSheet } from '@/mobile/MobileAmountSheet'
import { MobileTextSheet } from '@/mobile/MobileTextSheet'
import { MobileDatePicker } from '@/mobile/MobileDatePicker'
import { useMobileBackDismiss } from '@/mobile/useMobileBackDismiss'
import { useSubmitGuard } from '@/mobile/useSubmitGuard'
import { SheetPortal } from '@/mobile/SheetPortal'
import type { CurrencyCode, IconName, RecurrenceFrequency, Transaction, TxSplit, TxType } from '@/types'
import { MobileDescriptionSheet } from '@/mobile/MobileDescriptionSheet'
import { useMissingField } from '@/mobile/useMissingField'
import { setCloseGuard } from '@/mobile/closeGuard'
import { takeTxFormIntent } from '@/mobile/txFormIntent'

function currencyPrefix(c: CurrencyCode): string {
  return CURRENCIES[c].symbol
}

type Sub = 'amount' | 'note' | 'account' | 'category' | 'date' | 'recurEnd' | 'fromAccount' | 'toAccount' | null
type SplitSub = { kind: 'amount' | 'category'; index: number } | null
/** Campos que pueden faltar para guardar, en el orden en que se ven. */
type Field = 'amount' | 'note' | 'account' | 'category' | 'from' | 'to' | 'splits'

const ACCT_ICONS: Record<string, IconName> = {
  cash: 'wallet', debit: 'cards', savings: 'piggy', credit: 'cards',
}

function fmtDate(iso: string, locale: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function TransactionForm({ value, mkey, onClose, onDelete }: {
  value: Transaction | 'new'
  mkey: string
  onClose: () => void
  onDelete?: (id: string) => void
}) {
  const { accounts, categories, currency, transactions, addTx, updateTx, deleteTx } = useFinance()
  const settings = useSettings()
  const overdraftPolicy = settings.overdraftPolicy
  const locale = dateLocale(settings.language)
  const { confirm } = useDialogs()
  const t = useT()
  const editing = value !== 'new'
  // Las transferencias solo se crean desde el flujo dedicado (MobileCreateFlow);
  // este formulario las edita, pero nunca las convierte en gasto/ingreso ni
  // viceversa — el store ya rechaza ese cambio de tipo.
  const isTransfer = editing && value.type === 'transfer'

  const [type,           setType]           = useState<Exclude<TxType, 'transfer'>>('expense')
  const [amount,         setAmount]         = useState(0)
  // Divisa en que se teclea. null = seguir a la cuenta. Al editar se rellena
  // con la divisa REAL del movimiento, no con la de su cuenta.
  const [entryCurrency,  setEntryCurrency]  = useState<CurrencyCode | null>(null)
  const [currencyPicker, setCurrencyPicker] = useState(false)
  const [note,           setNote]           = useState('')
  const [description,    setDescription]    = useState('')
  const [descOpen,       setDescOpen]       = useState(false)
  const [date,           setDate]           = useState(`${mkey}-01`)
  const [accountId,      setAccountId]      = useState(accounts[0]?.id ?? '')
  const [categoryId,     setCategoryId]     = useState('')
  const [fromAccount,    setFromAccount]    = useState('')
  const [toAccount,      setToAccount]      = useState('')
  const [recurring,      setRecurring]      = useState(false)
  const [recurFreq,      setRecurFreq]      = useState<RecurrenceFrequency>('monthly')
  const [recurringStart, setRecurringStart] = useState(`${mkey}-01`)
  const [recurringEnd,   setRecurringEnd]   = useState('')
  const [tags,           setTags]           = useState<string[]>([])
  const [sub,            setSub]            = useState<Sub>(null)
  const [splitOn,        setSplitOn]        = useState(false)
  const [splits,         setSplits]         = useState<TxSplit[]>([])
  const [splitSub,       setSplitSub]       = useState<SplitSub>(null)
  const { submitting, beginSubmit, endSubmit } = useSubmitGuard()
  const [moreOpen,       setMoreOpen]       = useState(false)
  const [compact,        setCompact]        = useState(false)
  // Al crear no hay nada que cargar; al editar, el efecto de abajo lo marca.
  const [loaded,         setLoaded]         = useState(!editing)
  const reach = useMissingField<Field>()

  useEffect(() => {
    if (!editing) return
    setLoaded(true)
    // «Mas detalles» se abre solo si el movimiento ya trae algo de ahi dentro:
    // si no, quien lo edita no sabria que tiene descripcion o que se repite.
    setMoreOpen(!!(value.description || value.recurring || (value.splits && value.splits.length >= 2)))
    if (value.type === 'transfer') {
      setAmount(value.amount)
      setNote(value.note)
      setDescription(value.description ?? '')
      setDate(value.date)
      setFromAccount(value.fromAccount ?? '')
      setToAccount(value.toAccount ?? '')
      return
    }
    setType(value.type === 'income' ? 'income' : 'expense')
    // Se devuelve lo que el usuario TECLEO, no el monto convertido: quien
    // registro "US$ 25" espera ver 25 y poder cambiarlo a 30, no ver 1,540
    // pesos y tener que hacer la division mental.
    {
      const account = accounts.find(a => a.id === value.accountId)
      const entry = readTxEntry(value, account, currency)
      setAmount(entry.amount)
      setEntryCurrency(entry.currency)
    }
    setNote(value.note)
    /*
     * SE PERDIA AQUI, Y ERA PERDIDA DE DATOS.
     *
     * Esta rama —gastos e ingresos, o sea casi todo— no cargaba la
     * descripcion. El estado se quedaba en '' y al guardar se enviaba
     * `description: undefined`, que al fusionarse con el movimiento BORRABA
     * la que hubiera. Bastaba editar para cambiar el monto y la descripcion
     * desaparecia sin avisar.
     *
     * Y explicaba el segundo sintoma: la ficha del movimiento si sabe pintar
     * la descripcion, pero no quedaba ninguna que pintar.
     */
    setDescription(value.description ?? '')
    setDate(value.date)
    setAccountId(value.accountId ?? accounts[0]?.id ?? '')
    setCategoryId(value.categoryId ?? '')
    setRecurring(!!value.recurring)
    setRecurFreq(value.recurring ?? 'monthly')
    setRecurringStart(value.recurringStart ?? value.date)
    setRecurringEnd(value.recurringEnd ?? '')
    setTags(value.tags ?? [])
    if (value.splits && value.splits.length >= 2) {
      setSplitOn(true)
      setSplits(value.splits)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleCats = categories.filter(c => c.type === type)
  // La categoría solo se limpia cuando el usuario cambia el TIPO (gasto/ingreso)
  // a uno donde la categoría elegida ya no aplica. NO se limpia en el montaje:
  // al editar, la categoría ya viene cargada y coincide con su tipo. El efecto
  // anterior corría en cada render y, en el montaje, pisaba con '' la categoría
  // recién cargada (dos setStates en el mismo commit, ganaba el vacío) → al
  // editar cualquier movimiento se perdía la categoría.
  const didInitCat = useRef(false)
  useEffect(() => {
    if (!didInitCat.current) { didInitCat.current = true; return }
    setCategoryId(prev => (!prev || categories.some(c => c.id === prev && c.type === type)) ? prev : '')
  }, [type, categories])

  const activeAccount  = accounts.find(a => a.id === accountId)  ?? null
  const activeCategory = visibleCats.find(c => c.id === categoryId) ?? null
  const typeColor      = type === 'income' ? '#35d0a2' : '#f65574'
  const fromAccountObj = accounts.find(a => a.id === fromAccount) ?? null
  const toAccountObj   = accounts.find(a => a.id === toAccount) ?? null

  useMobileBackDismiss(sub !== null || splitSub !== null, () => { setSub(null); setSplitSub(null) })

  const splitsSum = splits.reduce((sum, split) => sum + split.amount, 0)
  const splitsRemaining = amount - splitsSum
  const splitsActive = splitOn && type === 'expense'

  const toggleSplit = () => {
    if (splitOn) { setSplitOn(false); return }
    setSplits(current => current.length >= 2 ? current : [
      { categoryId: categoryId || '', amount },
      { categoryId: '', amount: 0 },
    ])
    setSplitOn(true)
  }

  const updateSplit = (index: number, patch: Partial<TxSplit>) => {
    setSplits(current => current.map((split, i) => i === index ? { ...split, ...patch } : split))
  }

  const submitTransfer = () => {
    if (value === 'new') return
    if (!amount)
      return toast(t('amountError'), { icon: 'alert' })
    if (!fromAccount || !toAccount)
      return toast(t('accountError'), { icon: 'alert' })
    if (fromAccount === toAccount)
      return toast(t('errSameAccount'), { icon: 'alert' })
    if (!beginSubmit()) return

    try {
      updateTx(value.id, { amount, date, note: note.trim() || t('transfer'), description: description.trim() || undefined, fromAccount, toAccount })
    } catch (err) {
      endSubmit()
      toast(err instanceof Error ? err.message : t('couldNotSave'), { icon: 'alert' }); return
    }
    playConfirmSound()
    toast(t('movementUpdated'), { icon: 'check', type: 'ok' })
    onClose()
  }

  const submit = () => {
    if (isTransfer) { submitTransfer(); return }
    if (!amount)
      return toast(t('amountError'), { icon: 'alert' })
    if (!note.trim())
      return toast(t('fillAllError'), { icon: 'alert' })
    if (!accountId)
      return toast(t('accountError'), { icon: 'alert' })

    let cleanSplits: TxSplit[] | undefined
    let mainCategoryId = categoryId
    if (splitsActive) {
      cleanSplits = splits.filter(split => split.categoryId && split.amount > 0)
      if (cleanSplits.length < 2)
        return toast(t('splitNeedsTwoParts'), { icon: 'alert' })
      const sum = cleanSplits.reduce((total, split) => total + split.amount, 0)
      if (Math.abs(sum - amount) >= 0.01)
        return toast(t('splitSumMismatch'), { icon: 'alert' })
      // La categoría principal es la parte de mayor monto (para listas/búsqueda)
      mainCategoryId = [...cleanSplits].sort((a, b) => b.amount - a.amount)[0].categoryId
    }
    if (!mainCategoryId)
      return toast(t('categoryError'), { icon: 'alert' })

    // `buildTxEntry` devuelve SIEMPRE las claves FX (en undefined cuando no
    // aplican). Es lo que permite que editar un movimiento de dolares a pesos
    // borre su rastro en vez de dejarlo con la tasa vieja.
    const entry = buildTxEntry(amount, routing)
    const fields = {
      type, note: note.trim(), description: description.trim() || undefined, date, accountId, categoryId: mainCategoryId,
      ...entry,
      splits: cleanSplits,
      ...(recurring ? {
        recurring: recurFreq,
        recurringStart,
        recurringEnd: recurringEnd || undefined,
        recurringNext: editing && value.recurringNext
          ? value.recurringNext
          : advanceRecurrenceDate(recurringStart || date, recurFreq),
      } : { recurring: null, recurringStart: undefined, recurringEnd: undefined, recurringNext: undefined }),
      tags: tags.length ? tags : undefined,
    }

    const acct = accounts.find(a => a.id === accountId)
    const prev = editing && value.type === 'expense' && value.accountId === accountId ? value.amount : 0
    if (type === 'expense' && acct?.type !== 'credit' && (acct?.balance ?? 0) + prev < entry.amount
      && (acct?.overdraftPolicy ?? overdraftPolicy) === 'warn')
      toast(t('negativeBalanceWarn').replace('{name}', acct?.name ?? t('account')), { icon: 'alert' })

    const duplicate = !editing && isDuplicateTransaction(transactions, { date, amount: entry.amount, note: fields.note, accountId })

    if (!beginSubmit()) return
    try {
      if (editing) updateTx(value.id, fields)
      else addTx(fields)
    } catch (err) {
      endSubmit()
      toast(err instanceof Error ? err.message : t('couldNotSave'), { icon: 'alert' }); return
    }
    playConfirmSound()
    toast(duplicate ? t('possibleDuplicateMovement') : editing ? t('movementUpdated') : t('movementSaved'),
      { icon: duplicate ? 'alert' : 'check', type: duplicate ? undefined : 'ok' })
    onClose()
  }

  const remove = () => {
    if (!editing) return
    void confirm({ title: t('deleteMovementTitle'), description: t('actionCannotBeUndone'), confirmLabel: t('delete'), icon: 'trash' })
      .then(ok => { if (ok) { playDeleteSound(); if (onDelete) onDelete(value.id); else { deleteTx(value.id); toast(t('movementDeleted'), { icon: 'trash' }) }; onClose() } })
  }

  /*
   * CAMBIOS SIN GUARDAR.
   *
   * La X y el atras cerraban sin preguntar aunque hubieras cambiado cinco
   * cosas. Se compara con la foto tomada justo despues de cargar: si difiere,
   * se pregunta antes de descartar. Sin cambios, cierra directo como siempre.
   */
  const snapshot = JSON.stringify([type, amount, entryCurrency, note, description, date, accountId, categoryId,
    fromAccount, toAccount, recurring, recurFreq, recurringEnd, splitOn, splits])
  const baseline = useRef<string | null>(null)
  useEffect(() => {
    if (loaded && baseline.current === null) baseline.current = snapshot
  }, [loaded, snapshot])

  // «Dividir» o «Hacer recurrente» desde el menú rápido: se aplican DESPUÉS de
  // tomar la foto, para que cuenten como cambio y cerrar pregunte.
  const intentDone = useRef(false)
  useEffect(() => {
    if (intentDone.current || baseline.current === null) return
    intentDone.current = true
    const intent = takeTxFormIntent()
    if (intent === 'split' && !isTransfer && type === 'expense') {
      setSplits(current => current.length >= 2 ? current : [{ categoryId: categoryId || '', amount }, { categoryId: '', amount: 0 }])
      setSplitOn(true)
      setMoreOpen(true)
    } else if (intent === 'recurring' && !isTransfer) {
      setRecurring(true)
      setMoreOpen(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, snapshot])
  const dirtyRef = useRef(false)
  dirtyRef.current = baseline.current !== null && baseline.current !== snapshot

  const requestClose = useCallback(() => {
    if (!dirtyRef.current) { onClose(); return }
    void confirm({
      title: t('discardChangesTitle'),
      description: t('discardChangesDesc'),
      confirmLabel: t('discardLabel'),
      cancelLabel: t('keepEditingLabel'),
      tone: 'danger',
    }).then(ok => { if (ok) onClose() })
  }, [confirm, onClose, t])

  // El atras lo maneja App: le decimos que pregunte aqui antes de cerrar.
  useEffect(() => {
    setCloseGuard(() => {
      if (!dirtyRef.current) return false
      requestClose()
      return true
    })
    return () => setCloseGuard(null)
  }, [requestClose])

  const arrow = <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)', flexShrink: 0 }} />
  // El monto se registra en la divisa de la cuenta seleccionada (origen, si es transferencia)
  // MISMA decision que el flujo de crear (`data/txCurrency.ts`): cuando cada
  // formulario la resolvia por su cuenta, editar un gasto en dolares lo
  // devolvia a pesos en silencio.
  const routing = routeTx(activeAccount, entryCurrency, currency)
  const txCurrency = isTransfer
    ? (fromAccountObj?.currency ?? currency)
    : routing.typedCurrency
  const pfx = currencyPrefix(txCurrency)

  /*
   * LA FECHA ESTABA DEBAJO DEL PIE.
   *
   * Era la ultima fila, despues del monto gigante, la divisa, el concepto, la
   * descripcion, la cuenta y la categoria. En un movil de pantalla corta, o con
   * la letra o el «tamaño de pantalla» de Android en grande, quedaba tapada por
   * el pie y nada decia que la hoja seguia: para esa persona la fecha no
   * existia. Ahora va arriba, en chips, y lo opcional se pliega en «Mas
   * detalles». La prueba `e2e/form-reach.spec.ts` vigila que no vuelva a pasar.
   */
  const todayISO = localToday()
  const yesterdayISO = (() => {
    const d = new Date(`${todayISO}T00:00:00`)
    d.setDate(d.getDate() - 1)
    return localToday(d)
  })()
  const otherDay = date !== todayISO && date !== yesterdayISO

  // ── Lo que falta para poder guardar, en el orden en que aparece ──
  const splitsInvalid = splitsActive && (() => {
    const clean = splits.filter(split => split.categoryId && split.amount > 0)
    return clean.length < 2 || Math.abs(clean.reduce((total, split) => total + split.amount, 0) - amount) >= 0.01
  })()
  const missing: Field | null = isTransfer
    ? (!amount ? 'amount' : !fromAccount ? 'from' : (!toAccount || toAccount === fromAccount) ? 'to' : null)
    : (!amount ? 'amount'
      : !accountId ? 'account'
      : !splitsActive && !categoryId ? 'category'
      : !note.trim() ? 'note'
      : splitsInvalid ? 'splits'
      : null)
  const fieldLabel: Record<Field, string> = {
    amount: t('amount'), note: t('conceptLabel'), account: t('account'), category: t('category'),
    from: t('sourceAccount'), to: t('destinationAccount'), splits: t('splitToggleLabel'),
  }
  const fieldSheet: Partial<Record<Field, Sub>> = {
    amount: 'amount', note: 'note', account: 'account', category: 'category', from: 'fromAccount', to: 'toAccount',
  }
  const onSavePress = () => {
    if (!missing) { submit(); return }
    if (missing === 'splits') setMoreOpen(true)
    reach.goTo(missing)
    const sheet = fieldSheet[missing]
    // Primero se ve el campo resaltado; luego se abre su selector.
    if (sheet) setTimeout(() => setSub(sheet), 450)
  }

  const amountColor = amount > 0 ? (isTransfer ? 'var(--m-primary)' : typeColor) : 'var(--m-muted)'
  const amountText = amount > 0
    ? `${pfx} ${amount.toLocaleString('en-US', { minimumFractionDigits: CURRENCIES[txCurrency].decimals, maximumFractionDigits: CURRENCIES[txCurrency].decimals })}`
    : `${pfx} 0`

  return (
    <>
      {/* ── Full-screen overlay ── */}
      <div className="txf-overlay" role="dialog" aria-modal="true" aria-label={isTransfer ? t('transfer') : editing ? t('editMovement') : t('newMovement')}>

        <header className="mpr-editor-header">
          <div className="mpr-editor-header-icon" style={{ background: `color-mix(in oklab, ${isTransfer ? 'var(--m-primary)' : typeColor} 16%, transparent)`, color: isTransfer ? 'var(--m-primary)' : typeColor }}>
            <Icon name={isTransfer ? 'repeat' : type === 'income' ? 'arrowUp' : 'arrowDn'} size={18} />
          </div>
          <span className="mpr-editor-name-input" style={{ cursor: 'default' }}>
            {isTransfer ? t('transfer') : editing ? t('editMovement') : t('newMovement')}
          </span>
          <button className="mpr-editor-close" aria-label={t('close')} onClick={requestClose}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="txf-body" onScroll={e => setCompact(e.currentTarget.scrollTop > 24)}>

          {/* Tipo + monto en una sola franja que se encoge al desplazar */}
          <div className={`txf-top${compact ? ' compact' : ''}`}>
            <div className="txf-top-row">
              {!isTransfer && (
                <div className="txf-type-seg">
                  <button
                    className={type === 'expense' ? 'on expense' : ''}
                    aria-pressed={type === 'expense'}
                    onClick={() => setType('expense')}
                  >
                    {t('expense')}
                  </button>
                  <button
                    className={type === 'income' ? 'on income' : ''}
                    aria-pressed={type === 'income'}
                    onClick={() => setType('income')}
                  >
                    {t('income')}
                  </button>
                </div>
              )}
              {/* Divisa del movimiento. Solo fuera de transferencias: ahi la divisa
                  la fijan las dos cuentas y `toAmount` ya resuelve el cruce. */}
              {!isTransfer && (
                <button
                  type="button"
                  className={`txf-currency-chip${routing.typedCurrency !== (activeAccount ? accountCurrency(activeAccount, currency) : currency) ? ' foreign' : ''}`}
                  onClick={() => setCurrencyPicker(true)}
                  aria-label={t('currency')}
                >
                  <span>{getCurrencyMeta(routing.typedCurrency).flag}</span>
                  {routing.typedCurrency}
                </button>
              )}
            </div>
            <button
              ref={reach.register('amount')}
              className={`txf-amount-btn${reach.flashClass('amount')}`}
              aria-label={`${t('amount')}: ${amountText}`}
              onClick={() => setSub('amount')}
            >
              <span className="txf-amount-value" style={{ color: amountColor }}>{amountText}</span>
              <Icon name="edit" size={14} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
            </button>
            {!isTransfer && routing.toSecondary && (
              <span className="txf-currency-note">{t('goesToSecondLine')}</span>
            )}
            {!isTransfer && !routing.toSecondary && routing.typedCurrency !== routing.targetCurrency && amount > 0 && (
              <span className="txf-currency-note">
                ≈ {fmt(buildTxEntry(amount, routing).amount, routing.targetCurrency)}
              </span>
            )}
          </div>

          {currencyPicker && (
            <div className="mobile-detail-sheet" style={{ zIndex: 430 }} role="dialog" aria-modal="true" onClick={() => setCurrencyPicker(false)}>
              <section className="mcur-sheet" onClick={e => e.stopPropagation()}>
                <header>
                  <span>{t('currency')}</span>
                  <button aria-label={t('close')} onClick={() => setCurrencyPicker(false)}><Icon name="close" size={18} /></button>
                </header>
                <div className="mcur-list">
                  {CURRENCY_METAS.map(c => {
                    const selected = routing.typedCurrency === c.code
                    const isSecondLine = activeAccount?.secondaryCurrency === c.code
                    return (
                      <button
                        key={c.code}
                        className={`mcur-row${selected ? ' on' : ''}`}
                        onClick={() => { setEntryCurrency(c.code); setCurrencyPicker(false) }}
                      >
                        <span className="mcur-flag">{c.flag}</span>
                        <div className="mcur-info">
                          <strong>{c.code}</strong>
                          <small>{isSecondLine ? t('goesToSecondLine') : c.name}</small>
                        </div>
                        <div className="mcur-right">
                          {selected && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </section>
            </div>
          )}

          {/* Fecha: siempre a la vista, justo debajo del monto */}
          <div className="txf-date">
            <span className="txf-section-label">{t('date')}</span>
            <div className="txf-date-chips">
              <button className={`txf-chip${date === todayISO ? ' on' : ''}`} aria-pressed={date === todayISO} onClick={() => setDate(todayISO)}>
                {t('today')}
              </button>
              <button className={`txf-chip${date === yesterdayISO ? ' on' : ''}`} aria-pressed={date === yesterdayISO} onClick={() => setDate(yesterdayISO)}>
                {t('yesterday')}
              </button>
              <button className={`txf-chip${otherDay ? ' on' : ''}`} aria-pressed={otherDay} onClick={() => setSub('date')}>
                <Icon name="calendar" size={13} />
                {otherDay ? fmtDate(date, locale) : t('pickDayLabel')}
              </button>
            </div>
          </div>

          {/* Lo de siempre: cuenta, categoria y concepto */}
          <div className="mpr-form-rows txf-rows">
            {isTransfer ? (
              <>
                <button ref={reach.register('from')} className={`mpr-form-row${reach.flashClass('from')}`} onClick={() => setSub('fromAccount')}>
                  <Icon
                    name={fromAccountObj ? ACCT_ICONS[fromAccountObj.type] : 'wallet'}
                    size={16}
                    style={{ color: fromAccountObj?.color ?? 'var(--m-muted)', flexShrink: 0 }}
                  />
                  <span className="mpr-form-row-label">{t('sourceAccount')}</span>
                  <span className={fromAccountObj ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                    {fromAccountObj?.name ?? t('selectLabel')}
                  </span>
                  {arrow}
                </button>
                <button ref={reach.register('to')} className={`mpr-form-row${reach.flashClass('to')}`} onClick={() => setSub('toAccount')}>
                  <Icon
                    name={toAccountObj ? ACCT_ICONS[toAccountObj.type] : 'wallet'}
                    size={16}
                    style={{ color: toAccountObj?.color ?? 'var(--m-muted)', flexShrink: 0 }}
                  />
                  <span className="mpr-form-row-label">{t('destinationAccount')}</span>
                  <span className={toAccountObj ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                    {toAccountObj?.name ?? t('selectLabel')}
                  </span>
                  {arrow}
                </button>
              </>
            ) : (
              <button ref={reach.register('account')} className={`mpr-form-row${reach.flashClass('account')}`} onClick={() => setSub('account')}>
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
            )}

            {!isTransfer && !splitsActive && (
              <button ref={reach.register('category')} className={`mpr-form-row${reach.flashClass('category')}`} onClick={() => setSub('category')}>
                <Icon
                  name={(activeCategory?.icon as IconName | undefined) ?? 'tag'}
                  size={16}
                  style={{ color: activeCategory?.color ?? 'var(--m-muted)', flexShrink: 0 }}
                />
                <span className="mpr-form-row-label">{t('category')}</span>
                <span className={activeCategory ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                  {activeCategory?.name ?? t('selectLabel')}
                </span>
                {arrow}
              </button>
            )}

            {/* CONCEPTO, no "Descripcion": es el texto corto que se ve en la
                lista. La descripcion larga vive en «Mas detalles». */}
            <button ref={reach.register('note')} className={`mpr-form-row${reach.flashClass('note')}`} onClick={() => setSub('note')}>
              <Icon name="edit" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
              <span className="mpr-form-row-label">{t('conceptLabel')}</span>
              <span className={note ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>{note || t('requiredLabel')}</span>
              {arrow}
            </button>
          </div>

          {/* Lo opcional, plegado. Se abre solo si el movimiento ya trae algo. */}
          <button
            className={`txf-more-toggle${moreOpen ? ' open' : ''}`}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(open => !open)}
          >
            <Icon name="dots" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
            <span className="txf-more-title">{t('moreDetailsLabel')}</span>
            <small>{isTransfer ? t('descriptionLabel') : t('moreDetailsHint')}</small>
            <Icon name="arrowUp" size={12} className="txf-more-chev" />
          </button>

          {moreOpen && (
            <div className="txf-more">
              {/* La descripcion larga: opcional siempre. */}
              <div className="mpr-form-rows txf-rows">
                <button className="mpr-form-row" onClick={() => setDescOpen(true)}>
                  <Icon name="clipboard" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
                  <span className="mpr-form-row-label">{t('descriptionLabel')}</span>
                  <span className={description ? 'mpr-form-row-val txf-desc-preview' : 'mpr-form-row-dim'}>
                    {description || t('optionalLabel')}
                  </span>
                  {arrow}
                </button>
              </div>

              {/* Split entre categorías (solo gastos) */}
              {!isTransfer && type === 'expense' && (
                <button
                  className={`mobile-create-recurring-toggle${splitOn ? ' active' : ''}`}
                  onClick={toggleSplit}
                >
                  <span className="mobile-recur-icon"><Icon name="scissors" size={15} /></span>
                  <span className="mobile-recur-label">{t('splitToggleLabel')}</span>
                  <span className={`mobile-recur-switch${splitOn ? ' on' : ''}`} />
                </button>
              )}

              {splitsActive && (
                <div ref={reach.register('splits')} className={`mpr-form-rows txf-rows txf-splits${reach.flashClass('splits')}`}>
                  {splits.map((split, index) => {
                    const cat = visibleCats.find(c => c.id === split.categoryId) ?? null
                    return (
                      <div className="mpr-form-row txf-split-row" key={index}>
                        <button className="txf-split-cat" onClick={() => setSplitSub({ kind: 'category', index })}>
                          <Icon
                            name={(cat?.icon as IconName | undefined) ?? 'tag'}
                            size={16}
                            style={{ color: cat?.color ?? 'var(--m-muted)', flexShrink: 0 }}
                          />
                          <span className={cat ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                            {cat?.name ?? t('selectLabel')}
                          </span>
                        </button>
                        <button className="txf-split-amount" onClick={() => setSplitSub({ kind: 'amount', index })}>
                          {split.amount > 0 ? fmt(split.amount, txCurrency) : `${pfx} 0`}
                        </button>
                        {splits.length > 2 && (
                          <button
                            className="txf-split-remove"
                            aria-label={t('delete')}
                            onClick={() => setSplits(current => current.filter((_, i) => i !== index))}
                          >
                            <Icon name="close" size={14} />
                          </button>
                        )}
                      </div>
                    )
                  })}
                  <div className="txf-split-footer">
                    <button className="txf-split-add" onClick={() => setSplits(current => [...current, { categoryId: '', amount: 0 }])}>
                      <Icon name="plus" size={13} /> {t('splitAddPart')}
                    </button>
                    <span className={`txf-split-remaining${Math.abs(splitsRemaining) < 0.01 ? ' ok' : ''}`}>
                      {Math.abs(splitsRemaining) < 0.01
                        ? t('splitBalanced')
                        : t('splitRemaining').replace('{amount}', fmt(splitsRemaining, txCurrency))}
                    </span>
                  </div>
                </div>
              )}

              {/* Recurring (no aplica a transferencias) */}
              {!isTransfer && (
                <button
                  className={`mobile-create-recurring-toggle${recurring ? ' active' : ''}`}
                  onClick={() => setRecurring(r => !r)}
                >
                  <span className="mobile-recur-icon"><Icon name="repeat" size={15} /></span>
                  <span className="mobile-recur-label">{t('scheduleRecurrenceLabel')}</span>
                  <span className={`mobile-recur-switch${recurring ? ' on' : ''}`} />
                </button>
              )}

              {!isTransfer && recurring && (
                <div className="mpr-form-rows txf-rows">
                  <div className="mpr-form-row">
                    <Icon name="repeat" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
                    <span className="mpr-form-row-label">{t('frequencyLabel')}</span>
                    <div className="mpr-pill-row" style={{ flex: 1, justifyContent: 'flex-end' }}>
                      {(['weekly', 'monthly'] as RecurrenceFrequency[]).map(f => (
                        <button
                          key={f}
                          className={`mpr-pill${recurFreq === f ? ' on' : ''}`}
                          style={recurFreq === f ? { borderColor: 'var(--m-text)', color: 'var(--m-text)' } : {}}
                          onClick={() => setRecurFreq(f)}
                        >
                          {f === 'weekly' ? t('weekly') : t('monthly')}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="mpr-form-row" onClick={() => setSub('recurEnd')}>
                    <Icon name="calendar" size={16} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
                    <span className="mpr-form-row-label">{t('until')}</span>
                    <span className={recurringEnd ? 'mpr-form-row-val' : 'mpr-form-row-dim'}>
                      {recurringEnd ? fmtDate(recurringEnd, locale) : t('noEndDate')}
                    </span>
                    {arrow}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        <div className="mpr-editor-actions">
          {editing && (
            <button className="mpr-del-btn txf-del-icon" aria-label={t('delete')} onClick={remove}>
              <Icon name="trash" size={16} />
            </button>
          )}
          <button
            className={`mpr-btn-save${missing ? ' form-save-missing' : ''}`}
            disabled={submitting}
            onClick={onSavePress}
          >
            {missing
              ? t('missingFieldLabel').replace('{field}', fieldLabel[missing])
              : editing ? t('saveChangesLabel') : t('add')}
          </button>
        </div>

      </div>

      {/* ── Sub-sheets ── */}

      {sub === 'amount' && (
        <MobileAmountSheet
          title={t('amount')}
          value={amount}
          currency={txCurrency}
          onDone={v => { setAmount(v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {descOpen && (
        <MobileDescriptionSheet
          value={description}
          onDone={value => { setDescription(value); setDescOpen(false) }}
          onClose={() => setDescOpen(false)}
        />
      )}


      {sub === 'note' && (
        <MobileTextSheet
          title={t('descriptionLabel')}
          value={note}
          placeholder={t('notePlaceholder')}
          onDone={v => { setNote(v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {sub === 'date' && (
        <MobileDatePicker
          value={date}
          onChange={v => { setDate(v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {sub === 'recurEnd' && (
        <MobileDatePicker
          value={recurringEnd || date}
          onChange={v => { setRecurringEnd(v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {sub === 'account' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 200 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
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

      {(sub === 'fromAccount' || sub === 'toAccount') && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 200 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section onClick={e => e.stopPropagation()}>
            <header>
              <span>{sub === 'fromAccount' ? t('sourceAccount') : t('destinationAccount')}</span>
              <button aria-label={t('close')} onClick={() => setSub(null)}><Icon name="close" size={18} /></button>
            </header>
            <div className="mobile-picker-list">
              {accounts.map(a => {
                const current = sub === 'fromAccount' ? fromAccount : toAccount
                const setCurrent = sub === 'fromAccount' ? setFromAccount : setToAccount
                return (
                  <button
                    key={a.id}
                    className={`mobile-picker-row${a.id === current ? ' active' : ''}`}
                    onClick={() => { setCurrent(a.id); setSub(null) }}
                  >
                    <span style={{ color: a.color }}>
                      <Icon name={ACCT_ICONS[a.type]} size={22} />
                    </span>
                    <b>{a.name}</b>
                    <small>{fmt(a.balance, accountCurrency(a, currency))}</small>
                    {a.id === current && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 4 }} />}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
        </SheetPortal>
      )}

      {splitSub?.kind === 'amount' && (
        <MobileAmountSheet
          title={t('amount')}
          value={splits[splitSub.index]?.amount ?? 0}
          currency={txCurrency}
          onDone={v => { updateSplit(splitSub.index, { amount: v }); setSplitSub(null) }}
          onClose={() => setSplitSub(null)}
        />
      )}

      {splitSub?.kind === 'category' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 200 }} role="dialog" aria-modal="true" onClick={() => setSplitSub(null)}>
          <section className="mobile-detail-sheet mpr-editor-sheet" onClick={e => e.stopPropagation()}>
            <header className="mpr-editor-header">
              <span className="mpr-editor-name-input" style={{ cursor: 'default' }}>{t('selectCategory')}</span>
              <button className="mpr-editor-close" onClick={() => setSplitSub(null)}>
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="mpr-editor-body" style={{ overflowY: 'auto' }}>
              <div className="mobile-category-grid">
                {visibleCats.map(c => (
                  <button
                    key={c.id}
                    className={splits[splitSub.index]?.categoryId === c.id ? 'on' : ''}
                    aria-pressed={splits[splitSub.index]?.categoryId === c.id}
                    onClick={() => { updateSplit(splitSub.index, { categoryId: c.id }); setSplitSub(null) }}
                  >
                    <span style={{ color: c.color, background: `color-mix(in oklab, ${c.color} 22%, transparent)` }}>
                      <Icon name={c.icon as IconName} size={20} />
                    </span>
                    <small>{c.name}</small>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
        </SheetPortal>
      )}

      {sub === 'category' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 200 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section className="mobile-detail-sheet mpr-editor-sheet" onClick={e => e.stopPropagation()}>
            <header className="mpr-editor-header">
              <span className="mpr-editor-name-input" style={{ cursor: 'default' }}>{t('selectCategory')}</span>
              <button className="mpr-editor-close" onClick={() => setSub(null)}>
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="mpr-editor-body" style={{ overflowY: 'auto' }}>
              <div className="mobile-category-grid">
                {visibleCats.map(c => (
                  <button
                    key={c.id}
                    className={categoryId === c.id ? 'on' : ''}
                    aria-pressed={categoryId === c.id}
                    onClick={() => { setCategoryId(c.id); setSub(null) }}
                  >
                    <span style={{ color: c.color, background: `color-mix(in oklab, ${c.color} 22%, transparent)` }}>
                      <Icon name={c.icon as IconName} size={20} />
                    </span>
                    <small>{c.name}</small>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
        </SheetPortal>
      )}
    </>
  )
}
