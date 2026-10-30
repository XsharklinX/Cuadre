import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { accountCurrency, dateLocale } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { useFinance } from '@/store/finance'
import { creditCardsAsDebts } from '@/data/creditCard'
import {
  useDebt, simulatePayoff, debtProgress, monthlyPaymentPlan, payoffTargetId,
  freedomDate, isOwed, lastPaymentDate, monthsLabel,
  type Debt, type DebtKind, type PayoffMethod,
} from '@/store/debt'
import {
  dueStatus,
} from '@/data/debtSchedule'
import { localToday } from '@/data/helpers'
import { DayOfMonthSheet, PercentSheet } from './MobileNumberSheets'
import { IconTile, NxRow, NxSheet, Phrase } from '@/components/ui/Phrase'
import { SheetSelectList } from '@/components/ui/SheetSelect'
import { MobileTextSheet } from './MobileTextSheet'
import { playConfirmSound, playDeleteSound, playSuccessHaptic } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { MobileAmountSheet } from './MobileAmountSheet'
import { SheetPortal } from './SheetPortal'

const COLORS = ['#ff6b8a', '#5bc0ff', '#35d0a2', '#a78bfa', '#f59e0b', '#ffdd3d']
const EMPTY: Omit<Debt, 'id'> = {
  name: '', balance: 0, rate: 0, minPayment: 0, color: COLORS[0], direction: 'owed',
}

/**
 * EL AVISO DE VENCIMIENTO, en una linea.
 *
 * No hay icono de alarma ni color rojo salvo cuando de verdad toca: la deuda
 * que vence dentro de tres semanas no debe gritar igual que la de mañana, o
 * deja de distinguirse cual es cual.
 */
/** El icono del tipo. Un préstamo del banco y lo que le debes a tu primo no
 *  se parecen en nada, y hasta ahora se veían exactamente igual. */
const KIND_LABEL = (t: ReturnType<typeof useT>): Record<DebtKind, string> => ({
  loan: t('debtKindLoan'), card: t('debtKindCard'),
  store: t('debtKindStore'), personal: t('debtKindPersonal'),
})

/** El icono del tipo: un préstamo del banco y lo que le debes a tu primo no se parecen. */
const KIND_ICON: Record<DebtKind, Parameters<typeof IconTile>[0]['icon']> = {
  loan: 'landmark', card: 'cards', store: 'bag', personal: 'heart',
}

export function MobileDebt() {
  const { currency } = useFinance()
  const fmtVal = useFmt()
  const t = useT()
  const lang = useSettings(s => s.language)
  const { debts: manualDebts, extraPayment, addDebt, updateDebt, deleteDebt, restoreDebt, setExtraPayment } = useDebt()
  const accounts = useFinance(s => s.accounts)
  const baseCurrency = useFinance(s => s.currency)

  // Las tarjetas de credito entran al simulador como deudas derivadas. Antes,
  // `store/debt.ts` y las cuentas de credito eran dos silos que no se hablaban:
  // habia un motor de snowball/avalanche completo que no podia leer ni una
  // tarjeta, y el usuario tenia que teclear su deuda dos veces.
  const cardDebts = useMemo(
    () => creditCardsAsDebts(accounts, baseCurrency),
    [accounts, baseCurrency],
  )
  // Las derivadas van primero: son las que el usuario ya no mantiene a mano.
  // `CardAsDebt` es estructuralmente una `Debt` (todo lo que anade es
  // opcional), asi que la lista unificada se tipa como Debt y el resto de la
  // pantalla no tiene que preguntar de donde sale cada una.
  const all = useMemo<Debt[]>(() => [...cardDebts, ...manualDebts], [cardDebts, manualDebts])
  /*
   * DOS LISTAS, NO UNA.
   *
   * Lo que te deben no es una deuda tuya: no se paga, se cobra; suma como
   * activo y no alarga tu salida de deudas. Mezclarlo con los pasivos inflaba
   * el total que debes con dinero que en realidad te entra.
   */
  const debts = useMemo(() => all.filter(isOwed), [all])
  const lent  = useMemo(() => all.filter(d => !isOwed(d)), [all])
  const today = localToday()
  // Una deuda derivada de una tarjeta NO se edita ni se borra aqui: su fuente
  // de verdad es la cuenta. Se cambia en la cuenta, no en esta pantalla.
  const isDerived = (id: string) => id.startsWith('card:')
  const [method, setMethod] = useState<PayoffMethod>('avalanche')
  const [editing, setEditing] = useState<Debt | 'new' | null>(null)
  const [paying, setPaying] = useState<Debt | null>(null)

  useMobileBackDismiss(!!editing || !!paying, () => { setEditing(null); setPaying(null) })

  const active = useMemo(() => simulatePayoff(debts, extraPayment, method), [debts, extraPayment, method])
  // Meses SIN extra, para poder decir cuántos meses adelanta el extra.
  const baseline = useMemo(() => simulatePayoff(debts, 0, method), [debts, method])
  const plan = useMemo(() => monthlyPaymentPlan(debts, extraPayment, method), [debts, extraPayment, method])
  const targetId = payoffTargetId(debts, method)

  const totalDebt = debts.reduce((s, d) => s + d.balance, 0)
  const totalOriginal = debts.reduce((s, d) => s + (d.originalBalance ?? d.balance), 0)
  const paidPct = totalOriginal > 0 ? Math.round((1 - totalDebt / totalOriginal) * 100) : 0
  const totalMonthPay = plan.reduce((s, line) => s + line.amount, 0)
  const monthsSaved = baseline.months - active.months
  const freeAt = freedomDate(active.months)

  const orderedDebts = useMemo(() => {
    const ord = active.order
    return [...debts].sort((a, b) => {
      const ia = ord.indexOf(a.id), ib = ord.indexOf(b.id)
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    })
  }, [debts, active.order])

  // Tope del deslizador de extra: algo por encima del mínimo total, redondeado,
  // para que arrastrar tenga rango útil sin llegar a cifras absurdas.
  const extraMax = Math.max(10000, Math.ceil((debts.reduce((s, d) => s + d.minPayment, 0) * 3) / 1000) * 1000)

  const kinds = KIND_LABEL(t)
  const locale = dateLocale(lang)
  const monthName = (months: number) => {
    const iso = freedomDate(months)
    const s = iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' }) : ''
    return s.charAt(0).toUpperCase() + s.slice(1)
  }
  const shortMonth = (months: number) => {
    const iso = freedomDate(months)
    return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) : ''
  }
  const [detail, setDetail] = useState<Debt | null>(null)

  /*
   * D1 · DEUDAS: UNA LÍNEA DE TIEMPO HASTA QUEDAR LIBRE.
   *
   * Antes las tarjetas salían con un velo gris que las hacía parecer
   * deshabilitadas, una franja «Pagar» pegada al lado, la cifra roja enorme y
   * el plan, el extra y lo que te deben mezclados. Ahora: la fecha en que
   * quedas libre en grande; una línea de tiempo con un punto por deuda en el
   * mes en que la terminas; las deudas en filas planas en el orden en que
   * conviene pagarlas; el pago extra como deslizador que mueve la fecha; y lo
   * que te deben, aparte, al final.
   */
  if (all.length === 0) return (
    <div className="mdebt-root nx">
      <div className="nx-hero">
        <span className="nx-serif nxd-empty">{t('noDebtsRegistered')}</span>
        <p className="nx-note">{t('addDebtsHint')}</p>
        <button className="nx-btn pri nxd-add" onClick={() => setEditing('new')}>{t('addDebt')}</button>
      </div>
      {editing && <DebtPhraseSheet debt={undefined} onClose={() => setEditing(null)} onSave={d => { addDebt(d); setEditing(null) }} />}
    </div>
  )

  const finished = active.finishedAt ?? {}
  const maxMonths = Math.max(1, active.months)

  return (
    <div className="mdebt-root nx">
      {debts.length > 0 && (
        <div className="nx-hero">
          <small>{freeAt ? t('freeInLabel') : t('keepPayingLabel')}</small>
          <span className="nx-serif nxd-date">{freeAt ? monthName(active.months) : monthsLabel(active.months, t)}</span>
          <small>
            {fmtVal(totalDebt, currency)} · {t('nxdPaidPct').replace('{pct}', String(Math.max(0, paidPct)))}
            {active.totalInterest > 0 && ` · ${t('nxdInterestTotal').replace('{amount}', fmtVal(active.totalInterest, currency))}`}
          </small>
        <div className="nxd-timeline" aria-hidden="true">
          <span className="nxd-line" />
          <span className="nxd-pt start" style={{ left: 0 }} />
          <span className="nxd-lbl bottom" style={{ left: 0 }}>{t('today')}</span>
          {orderedDebts.map((d, i) => {
            const m = finished[d.id] ?? active.months
            const left = `${Math.min(100, (m / maxMonths) * 100)}%`
            return (
              <span key={d.id}>
                <span className="nxd-pt" style={{ left, background: d.color }} />
                <span className={`nxd-lbl ${i % 2 ? 'bottom' : 'top'}${m / maxMonths > .7 ? ' end' : ''}`} style={{ left }}>
                  {shortMonth(m)} · {d.name}
                </span>
              </span>
            )
          })}
        </div>
        </div>
      )}

      {debts.length > 0 && (
        <>
          <p className="nx-label">
            {t('nxdPayFirst')}
            <button onClick={() => setEditing('new')}>+ {t('nxdDebt')}</button>
          </p>
          <div className="nx-list">
            {orderedDebts.map(d => {
              const st = dueStatus(d.dueDay, today, lastPaymentDate(d))
              const meta = [
                d.rate > 0 ? `${d.rate} %` : null,
                d.dueDay ? t('nxdDueDay').replace('{d}', String(d.dueDay)) : null,
                d.minPayment > 0 ? t('nxdMin').replace('{amount}', fmtVal(d.minPayment, currency)) : null,
              ].filter(Boolean).join(' · ')
              return (
                <div key={d.id} className="nxd-row">
                  <IconTile icon={KIND_ICON[d.kind ?? 'loan']} color={d.color} />
                  <button className="nxd-row-main" onClick={() => setDetail(d)}>
                    <b>{d.name}{d.id === targetId && <em>{t('targetTag')}</em>}</b>
                    <small className={st === 'overdue' ? 'bad' : st === 'due-soon' || st === 'due-today' ? 'warn' : ''}>
                      {meta || (d.kind ? kinds[d.kind] : '')}
                      {st === 'overdue' && ` · ${t('nxdOverdue')}`}
                    </small>
                    <span className="nx-thin"><i style={{ width: `${Math.round(debtProgress(d) * 100)}%`, background: d.color }} /></span>
                  </button>
                  <span className="nxd-amt">{fmtVal(d.balance, currency)}</span>
                  <button className="nx-link nxd-pay" onClick={() => setPaying(d)}>{t('nxdPay')}</button>
                </div>
              )
            })}
          </div>

          <div className="nxd-extra">
            <span className="nxd-extra-top">
              {t('nxdExtraLine').replace('{amount}', fmtVal(extraPayment, currency))}
              <b>{monthsSaved > 0 ? t('extraFreesMonths').replace('{n}', String(monthsSaved)) : ''}</b>
            </span>
            <input
              id="debt-extra"
              type="range" min={0} max={extraMax} step={500}
              value={Math.min(extraPayment, extraMax)}
              aria-label={t('extraMonthlyPayment')}
              onChange={e => setExtraPayment(Number(e.target.value))}
            />
            <span className="nxd-method">
              {t('nxdOrder')}{' '}
              <button className={method === 'avalanche' ? 'on' : ''} onClick={() => setMethod('avalanche')}>{t('planInteres')}</button>
              {' · '}
              <button className={method === 'snowball' ? 'on' : ''} onClick={() => setMethod('snowball')}>{t('planImpulso')}</button>
            </span>
            {totalMonthPay > 0 && <span className="nx-note">{t('nxdThisMonth').replace('{amount}', fmtVal(totalMonthPay, currency))}</span>}
          </div>
        </>
      )}

      {lent.length > 0 && (
        <>
          <p className="nx-label">
            {t('nxdLent')}
            <span className="nxd-lent-total">{fmtVal(lent.reduce((n, d) => n + d.balance, 0), currency)}</span>
          </p>
          <div className="nx-list">
            {lent.map(d => (
              <div key={d.id} className="nxd-row">
                <IconTile icon={KIND_ICON[d.kind ?? 'personal']} color={d.color} />
                <button className="nxd-row-main" onClick={() => setDetail(d)}>
                  <b>{d.counterparty || d.name}</b>
                  <small>{d.counterparty ? d.name : kinds[d.kind ?? 'personal']}</small>
                </button>
                <span className="nxd-amt ok">{fmtVal(d.balance, currency)}</span>
                <button className="nx-link nxd-pay" onClick={() => setPaying(d)}>{t('debtCollectAction')}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {debts.length === 0 && <button className="nx-btn nxd-add" onClick={() => setEditing('new')}>{t('addDebt')}</button>}

      {detail && (
        <DebtDetailSheet
          debt={all.find(d => d.id === detail.id) ?? detail}
          derived={isDerived(detail.id)}
          finishMonths={finished[detail.id]}
          monthLabel={shortMonth}
          onClose={() => setDetail(null)}
          onPay={() => { setPaying(all.find(d => d.id === detail.id) ?? detail); setDetail(null) }}
          onEdit={() => { setEditing(all.find(d => d.id === detail.id) ?? detail); setDetail(null) }}
        />
      )}

      {editing !== null && (
        <DebtPhraseSheet
          debt={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={d => {
            if (editing === 'new') addDebt(d)
            else updateDebt(editing.id, d)
            playConfirmSound()
            toast(editing === 'new' ? t('debtAdded') : t('debtUpdated'), { icon: 'check', type: 'ok' })
            setEditing(null)
          }}
          onDelete={editing !== 'new' ? () => {
            const debt = editing
            deleteWithUndo({
              message: t('debtDeleted'),
              onDelete: () => deleteDebt(debt.id),
              onRestore: () => restoreDebt(debt),
            })
            playDeleteSound()
            setEditing(null)
          } : undefined}
        />
      )}

      {paying && <DebtPaymentSheet debt={paying} onClose={() => setPaying(null)} />}
    </div>
  )
}

/*
 * D2 · LA FICHA DE UNA DEUDA.
 *
 * Cuánto llevas pagado, cuánto te cuesta en intereses ESTE mes, cuándo la
 * terminas al ritmo del plan, sus pagos con fecha y el botón de pagar.
 */
function DebtDetailSheet({ debt, derived, finishMonths, monthLabel, onClose, onPay, onEdit }: {
  debt: Debt
  derived: boolean
  finishMonths?: number
  monthLabel: (months: number) => string
  onClose: () => void
  onPay: () => void
  onEdit: () => void
}) {
  const t = useT()
  const fmtVal = useFmt()
  const lang = useSettings(s => s.language)
  const { currency } = useFinance()
  const owed = isOwed(debt)
  const interestMonth = owed && debt.rate > 0 ? (debt.balance * debt.rate) / 100 / 12 : 0
  const pct = Math.round(debtProgress(debt) * 100)
  const pays = [...(debt.payments ?? [])].sort((a, b) => b.date.localeCompare(a.date))
  return (
    <NxSheet
      title={debt.name}
      sub={[debt.counterparty, debt.kind ? KIND_LABEL(t)[debt.kind] : null].filter(Boolean).join(' · ') || undefined}
      onClose={onClose}
      footer={(
        <>
          {!derived && <button className="nx-btn" onClick={onEdit}>{t('edit')}</button>}
          <button className="nx-btn pri" onClick={onPay}>{owed ? t('nxdPay') : t('debtCollectAction')}</button>
        </>
      )}
    >
      <span className={`nx-big${owed ? '' : ' ok'}`}>{fmtVal(debt.balance, currency)}</span>
      {debt.originalBalance && debt.originalBalance > debt.balance && (
        <>
          <span className="nx-thin nxd-detail-bar"><i style={{ width: `${pct}%`, background: debt.color }} /></span>
          <p className="nx-note">{t('nxdPaidOf').replace('{pct}', String(pct)).replace('{amount}', fmtVal(debt.originalBalance, currency))}</p>
        </>
      )}
      {interestMonth > 0 && (
        <p className="nxd-interest">{t('nxdInterestMonth').replace('{amount}', fmtVal(interestMonth, currency))}</p>
      )}
      <div className="nx-list">
        {owed && debt.minPayment > 0 && <NxRow label={t('debtMinPaymentLabel')} value={fmtVal(debt.minPayment, currency)} />}
        {debt.dueDay && <NxRow label={t('debtDueDayLabel')} value={t('nxdDueDay').replace('{d}', String(debt.dueDay))} />}
        {debt.rate > 0 && <NxRow label={t('debtRateLabel')} value={`${debt.rate} %`} />}
        {owed && finishMonths && <NxRow label={t('nxdEndsIn')} value={monthLabel(finishMonths)} />}
        {derived && <NxRow label={t('nxdFromCard')} value="" tone="muted" />}
      </div>
      {pays.length > 0 && (
        <>
          <p className="nx-label">{t('nxdPayments')}</p>
          <div className="nx-list">
            {pays.slice(0, 12).map(p => (
              <NxRow
                key={p.id}
                label={new Date(`${p.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' })}
                value={fmtVal(p.amount, currency)}
              />
            ))}
          </div>
        </>
      )}
    </NxSheet>
  )
}

/*
 * B1 · LA DEUDA, EN UNA FRASE.
 *
 * «Le debo RD$38,500 a Banco Popular en una tarjeta. Pago RD$2,500 el día 2
 * de cada mes, al 60 % anual.» Cada hueco abre su teclado o su lista. Para lo
 * que te deben: «Carlos me debe RD$6,000».
 */
function DebtPhraseSheet({ debt, onClose, onSave, onDelete }: {
  debt?: Debt
  onClose: () => void
  onSave: (d: Omit<Debt, 'id'>) => void
  onDelete?: () => void
}) {
  const { currency } = useFinance()
  const t = useT()
  const fmtVal = useFmt()
  const lang = useSettings(s => s.language)
  const [f, setF] = useState<Omit<Debt, 'id'>>(
    debt ? {
      name: debt.name, balance: debt.balance, rate: debt.rate,
      minPayment: debt.minPayment, color: debt.color,
      direction: debt.direction ?? 'owed', kind: debt.kind,
      counterparty: debt.counterparty, dueDay: debt.dueDay, endDate: debt.endDate,
      originalBalance: debt.originalBalance, payments: debt.payments,
    } : { ...EMPTY, kind: 'loan' },
  )
  const [sub, setSub] = useState<'balance' | 'who' | 'kind' | 'min' | 'day' | 'rate' | 'name' | null>(null)
  const p = <K extends keyof Omit<Debt, 'id'>>(k: K, v: Omit<Debt, 'id'>[K]) => setF(prev => ({ ...prev, [k]: v }))
  const owed = (f.direction ?? 'owed') === 'owed'
  const kinds = KIND_LABEL(t)
  const autoName = f.counterparty ? `${f.kind ? kinds[f.kind] : ''} ${f.counterparty}`.trim() : ''
  const missing = !(f.balance > 0) ? 'balance' : !(f.name.trim() || autoName) ? 'who' : null

  // Lo que significa, en una línea: cuándo la saldas y cuánto pagas de intereses.
  const preview = owed && f.balance > 0 && f.minPayment > 0
    ? simulatePayoff([{ id: 'x', ...f, name: f.name || 'x' } as Debt], 0, 'avalanche')
    : null

  const save = () => {
    if (missing) { setSub(missing === 'balance' ? 'balance' : 'who'); return }
    const name = f.name.trim() || autoName
    onSave({ ...f, name, originalBalance: f.originalBalance ?? f.balance })
  }

  const tk = (key: typeof sub & string, text: string, hint: string) => ({ key, text, hint, onTap: () => setSub(key), active: sub === key })

  return (
    <>
      <NxSheet
        title={debt ? t('editDebt') : t('newDebt')}
        sub={t('nxPhraseHint')}
        onClose={onClose}
        footer={(
          <>
            {onDelete && <button className="nx-btn nxd-del" onClick={onDelete}>{t('delete')}</button>}
            <button className={`nx-btn pri${missing ? ' form-save-missing' : ''}`} onClick={save}>
              {missing ? t('missingFieldLabel').replace('{field}', missing === 'balance' ? t('fieldAmount') : t('nxdWhoField')) : t('save')}
            </button>
          </>
        )}
      >
        <div className="nxd-dir" role="tablist">
          <button role="tab" aria-selected={owed} className={owed ? 'on' : ''} onClick={() => p('direction', 'owed')}>{t('nxdIOwe')}</button>
          <button role="tab" aria-selected={!owed} className={!owed ? 'on' : ''} onClick={() => p('direction', 'lent')}>{t('nxdTheyOwe')}</button>
        </div>
        {owed ? (
          <Phrase parts={[
            t('nxdP1'), tk('balance', f.balance > 0 ? fmtVal(f.balance, currency) : '', t('fieldAmount')),
            t('nxdP2'), tk('who', f.counterparty ?? '', t('nxdWhoHint')),
            t('nxdP3'), tk('kind', f.kind ? kinds[f.kind].toLowerCase() : '', t('nxdKindHint')),
            t('nxdP4'), tk('min', f.minPayment > 0 ? fmtVal(f.minPayment, currency) : '', t('nxdMinHint')),
            t('nxdP5'), tk('day', f.dueDay ? String(f.dueDay) : '', '—'),
            t('nxdP6'), tk('rate', f.rate > 0 ? `${f.rate} %` : '', '0 %'),
            t('nxdP7'),
          ]} />
        ) : (
          <Phrase parts={[
            tk('who', f.counterparty ?? '', t('nxdWhoHint')), t('nxdL1'),
            tk('balance', f.balance > 0 ? fmtVal(f.balance, currency) : '', t('fieldAmount')), '.',
          ]} />
        )}
        <Phrase className="nxd-name" parts={[t('nxdNameP'), tk('name', f.name, autoName || t('nxdNameHint')), '.']} />
        {preview && preview.months > 0 && preview.months < 600 && (
          <p className="nx-note">
            {t('nxdPreview')
              .replace('{date}', (() => { const iso = freedomDate(preview.months); return iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(dateLocale(lang), { month: 'short', year: 'numeric' }) : '' })())
              .replace('{amount}', fmtVal(preview.totalInterest, currency))}
          </p>
        )}
      </NxSheet>

      {sub === 'balance' && <MobileAmountSheet title={t('fieldAmount')} value={f.balance} currency={currency} onDone={v => { p('balance', v); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'min' && <MobileAmountSheet title={t('debtMinPaymentLabel')} value={f.minPayment} currency={currency} onDone={v => { p('minPayment', v); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'who' && <MobileTextSheet title={t('nxdWhoHint')} value={f.counterparty ?? ''} placeholder={t('debtCounterpartyPlaceholder')} onDone={v => { p('counterparty', v.trim() || undefined); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'name' && <MobileTextSheet title={t('name')} value={f.name} placeholder={autoName || t('nxdNameHint')} onDone={v => { p('name', v.trim()); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'day' && <DayOfMonthSheet title={t('debtDueDaySheetTitle')} value={f.dueDay} onDone={day => { p('dueDay', day); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'rate' && <PercentSheet title={t('debtRateLabel')} value={f.rate || undefined} max={200} onDone={v => { p('rate', v ?? 0); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'kind' && (
        <SheetSelectList
          title={t('nxdKindHint')}
          value={f.kind ?? ''}
          options={(['loan', 'card', 'store', 'personal'] as DebtKind[]).map(k => ({ value: k, label: kinds[k] }))}
          onPick={v => { p('kind', v as DebtKind); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
    </>
  )
}

function DebtPaymentSheet({ debt, onClose }: { debt: Debt; onClose: () => void }) {
  const t = useT()
  const fmtVal = useFmt()
  const { accounts, currency } = useFinance()
  const registerPayment = useDebt(s => s.registerPayment)
  const [fromId, setFromId] = useState('')
  const [amountSheet, setAmountSheet] = useState(false)

  useMobileBackDismiss(!amountSheet, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !amountSheet)

  const owed = isOwed(debt)
  // No se paga una deuda con otra tarjeta de crédito: eso no es pagar, es
  // mudar la deuda de sitio, y el libro lo reflejaría como si hubiera bajado.
  const sources = accounts.filter(a => owed ? a.type !== 'credit' : true)

  const pay = (amount: number) => {
    setAmountSheet(false)
    if (amount <= 0 || !fromId) return
    const txId = registerPayment(debt.id, amount, fromId)
    if (!txId) { toast(t('debtPaymentFailed'), { icon: 'alert' }); return }
    playSuccessHaptic()
    toast(t(owed ? 'debtPaymentRegistered' : 'debtCollectRegistered'), { icon: 'check', type: 'ok' })
    onClose()
  }

  return (
    <>
      <SheetPortal>
        <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true"
          aria-label={t('registerPaymentFor').replace('{name}', debt.name)} onClick={onClose}>
          <section className="mdebt-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('registerPaymentFor').replace('{name}', debt.name)}</span>
              <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
            </header>

            <div className="mdebt-sheet-body">
              <div className="mdebt-field">
                <span>{t(owed ? 'debtPayFromLabel' : 'debtCollectIntoLabel')}</span>
                <div className="mdebt-src-list">
                  {sources.map(a => (
                    <button
                      key={a.id}
                      className={`mdebt-src${fromId === a.id ? ' on' : ''}`}
                      style={fromId === a.id ? { borderColor: a.color, background: `${a.color}1f` } : {}}
                      onClick={() => setFromId(a.id)}
                    >
                      <span className="mdebt-src-dot" style={{ background: a.color }} />
                      <span className="mdebt-src-name">{a.name}</span>
                      <span className="mdebt-src-bal">{fmtVal(a.balance, accountCurrency(a, currency))}</span>
                    </button>
                  ))}
                </div>
              </div>

              <p className="mdebt-hint">{t('debtPaymentMovesMoneyHint')}</p>
            </div>

            <div className="mdebt-sheet-actions">
              <button className="mdebt-btn-cancel" onClick={onClose}>{t('cancel')}</button>
              <button
                className="mdebt-btn-save"
                style={{ background: debt.color }}
                onClick={() => fromId ? setAmountSheet(true) : toast(t('debtPickAccountFirst'), { icon: 'alert' })}
              >
                {t('continueBtn')}
              </button>
            </div>
          </section>
        </div>
      </SheetPortal>

      {amountSheet && (
        <MobileAmountSheet
          title={t('registerPaymentFor').replace('{name}', debt.name)}
          value={Math.min(debt.minPayment || 0, debt.balance)}
          currency={currency}
          onDone={pay}
          onClose={() => setAmountSheet(false)}
        />
      )}
    </>
  )
}
