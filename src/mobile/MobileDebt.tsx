import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { accountCurrency, dateLocale, fmt } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { useFinance } from '@/store/finance'
import { creditCardsAsDebts } from '@/data/creditCard'
import {
  useDebt, simulatePayoff, debtProgress, monthlyPaymentPlan, payoffTargetId,
  freedomDate, isOwed, lastPaymentDate,
  type Debt, type DebtDirection, type DebtKind, type PayoffMethod,
} from '@/store/debt'
import {
  dueStatus, installmentsLeft, nextDueDate, paymentForTerm, type DueStatus,
} from '@/data/debtSchedule'
import { localToday } from '@/data/helpers'
import { MobileDatePicker } from './MobileDatePicker'
import { DayOfMonthSheet } from './MobileNumberSheets'
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
const KIND_ICON: Record<DebtKind, Parameters<typeof Icon>[0]['name']> = {
  loan: 'landmark', card: 'cards', store: 'bag', personal: 'heart',
}

function DueBadge({ debt, today }: { debt: Debt; today: string }) {
  const t = useT()
  const status: DueStatus = dueStatus(debt.dueDay, today, lastPaymentDate(debt))
  if (status === 'none') return null
  if (status === 'ok') {
    return <span className="mdebt-due ok">{t('debtPaidThisCycle')}</span>
  }
  const due = nextDueDate(debt.dueDay!, today)
  const days = Math.round((new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000)
  const label = status === 'due-today' ? t('debtDueTodayLabel')
    : status === 'overdue' ? t('debtOverdueLabel')
    : t('debtDueSoonLabel').replace('{n}', String(days))
  return <span className={`mdebt-due ${status}`}><Icon name="calendar" size={11} /> {label}</span>
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

  if (all.length === 0) return (
    <div className="mdebt-root">
      <div className="mdebt-empty">
        <Icon name="dollar" size={44} style={{ opacity: .18 }} />
        <p>{t('noDebtsRegistered')}</p>
        <small>{t('addDebtsHint')}</small>
        <button className="mdebt-add-btn" onClick={() => setEditing('new')}>
          <Icon name="plus" size={16} /> {t('addDebt')}
        </button>
      </div>
      {editing && (
        <DebtSheet debt={undefined} onClose={() => setEditing(null)}
          onSave={d => { addDebt(d); setEditing(null) }} />
      )}
    </div>
  )

  return (
    <div className="mdebt-root">

      {/* Héroe: fecha de libertad + progreso. Solo si hay pasivos: con la
          pantalla usada unicamente para apuntar lo que te deben, "libre de
          deudas en marzo" no significa nada. */}
      {debts.length > 0 && <>
      <div className="mdebt-free">
        <span className="mdebt-free-label">{freeAt ? t('freeInLabel') : t('keepPayingLabel')}</span>
        {freeAt && (
          <div className="mdebt-free-date">
            {new Date(`${freeAt}T00:00:00`).toLocaleDateString(dateLocale(lang), { month: 'long', year: 'numeric' })}
          </div>
        )}
        <div className="mdebt-free-owe">
          {t('owedColon').replace('{amount}', fmtVal(totalDebt, currency))}
        </div>
        <div className="mdebt-free-bar"><i style={{ width: `${Math.max(3, paidPct)}%` }} /></div>
        <div className="mdebt-free-meta">
          {t('paidPctMonths').replace('{pct}', String(paidPct)).replace('{months}', String(active.months))}
        </div>

        {/*
          DE QUÉ ESTÁ HECHA TU DEUDA.
          Un total y un porcentaje no dicen nada sobre el reparto: RD$ 80.000
          puede ser una deuda enorme o cinco medianas, y lo que hay que hacer
          en cada caso es distinto. Cada tramo lleva el color de su deuda, así
          que la barra y la lista de abajo se leen juntas sin leyenda.
        */}
        {debts.length > 1 && totalDebt > 0 && (
          <div className="mdebt-mix" aria-hidden="true">
            {[...debts]
              .sort((a, b) => b.balance - a.balance)
              .map(d => (
                <i
                  key={d.id}
                  style={{ width: `${(d.balance / totalDebt) * 100}%`, background: d.color }}
                />
              ))}
          </div>
        )}
      </div>

      {/* Estrategia, sin jerga */}
      <div className="mdebt-plan">
        <button className={method === 'snowball' ? 'on' : ''} aria-pressed={method === 'snowball'} onClick={() => setMethod('snowball')}>
          <b>{t('planImpulso')}</b><small>{t('planImpulsoDesc')}</small>
        </button>
        <button className={method === 'avalanche' ? 'on' : ''} aria-pressed={method === 'avalanche'} onClick={() => setMethod('avalanche')}>
          <b>{t('planInteres')}</b><small>{t('planInteresDesc')}</small>
        </button>
      </div>

      {/* Este mes paga */}
      <div className="mdebt-card">
        <div className="mdebt-card-title">{t('thisMonthPayLabel')}</div>
        {plan.map(line => {
          const debt = debts.find(d => d.id === line.id)
          if (!debt) return null
          return (
            <div key={line.id} className="mdebt-pay-row">
              <span className="mdebt-pay-dot" style={{ background: debt.color }} />
              <span className="mdebt-pay-name">
                {debt.name}
                {line.isTarget && <span className="mdebt-pay-target">{t('targetTag')}</span>}
              </span>
              <span className="mdebt-pay-amt">
                {fmt(line.amount, currency)}
                <small>{line.isTarget && extraPayment > 0 ? t('minPlusExtra') : t('minOnly')}</small>
              </span>
            </div>
          )
        })}
        <div className="mdebt-pay-total">
          <span>{t('monthTotalLabel')}</span>
          <b>{fmtVal(totalMonthPay, currency)}</b>
        </div>
      </div>

      {/* Extra: deslizador que mueve la fecha */}
      <div className="mdebt-card">
        <div className="mdebt-card-title">{t('extraMonthlyPayment')}</div>
        <div className="mdebt-extra">
          <div className="mdebt-extra-top">
            <span>{t('aboveMinimums')}</span>
            <b>{fmt(extraPayment, currency)}</b>
          </div>
          <input
            type="range" min={0} max={extraMax} step={500}
            value={Math.min(extraPayment, extraMax)}
            aria-label={t('extraMonthlyPayment')}
            onChange={e => setExtraPayment(Number(e.target.value))}
          />
          <span className="mdebt-extra-note">
            {monthsSaved > 0
              ? t('extraFreesMonths').replace('{n}', String(monthsSaved))
              : t('extraPromptHint')}
          </span>
        </div>
      </div>

      </>}

      {/* Deudas con progreso, en orden de pago */}
      <div className="mdebt-section-title">
        {t('yourDebtsInOrder')}
        <button className="mdebt-add-inline" onClick={() => setEditing('new')}>
          <Icon name="plus" size={14} /> {t('add')}
        </button>
      </div>
      <div className="mdebt-list">
        {orderedDebts.map(debt => {
          const prog = Math.round(debtProgress(debt) * 100)
          return (
            <div
              key={debt.id}
              className={`mdebt-debt owed${debt.id === targetId ? ' target' : ''}`}
              style={{ '--debt': debt.color } as React.CSSProperties}
            >
              <button
                className="mdebt-debt-main"
                onClick={() => { if (!isDerived(debt.id)) setEditing(debt) }}
                disabled={isDerived(debt.id)}
              >
                <div className="mdebt-debt-top">
                  {/* El icono del tipo en vez del punto de color cuando se
                      sabe qué clase de deuda es: dice más con el mismo sitio. */}
                  <span className="mdebt-kind" style={{ background: `${debt.color}26`, color: debt.color }}>
                    <Icon name={debt.kind ? KIND_ICON[debt.kind] : isDerived(debt.id) ? 'cards' : 'dollar'} size={14} />
                  </span>
                  <b>{debt.name}</b>
                  {isDerived(debt.id) && <span className="mdebt-card-badge">{t('fromCardBadge')}</span>}
                  {debt.rate > 0 && <span className="mdebt-debt-rate">{debt.rate}%</span>}
                  <strong>{fmtVal(debt.balance, currency)}</strong>
                </div>
                <div className="mdebt-debt-bar"><i style={{ width: `${Math.max(2, prog)}%`, background: debt.color }} /></div>
                <div className="mdebt-debt-sub">
                  {isDerived(debt.id)
                    ? t('editOnAccountHint')
                    : t('paidOfOriginal').replace('{pct}', String(prog))}
                </div>
                {/* El calendario, que es lo que de verdad se pregunta la
                    gente: cuando toca pagar y cuanto falta para terminar. */}
                {(debt.dueDay || debt.endDate || debt.counterparty) && (
                  <div className="mdebt-debt-meta">
                    <DueBadge debt={debt} today={today} />
                    {debt.endDate && (
                      <span className="mdebt-meta-chip">
                        {installmentsLeft(debt.endDate, today) > 0
                          ? t('debtInstallmentsLeft').replace('{n}', String(installmentsLeft(debt.endDate, today)))
                          : t('debtLastInstallment')}
                      </span>
                    )}
                    {debt.counterparty && <span className="mdebt-meta-chip">{debt.counterparty}</span>}
                  </div>
                )}
              </button>
              {/* Una tarjeta se "paga" registrando una transferencia real hacia
                  ella, no tocando un numero aqui: su saldo sale del libro. */}
              {!isDerived(debt.id) && (
                <button className="mdebt-debt-pay" onClick={() => setPaying(debt)} aria-label={t('registerPaymentLabel')}>
                  <Icon name="check" size={15} /> {t('payLabel')}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/*
        LO QUE TE DEBEN, en su propia seccion.
        No entra al simulador ni al total que debes: no es un pasivo. Aqui
        "pagar" significa que te cobraron, asi que el dinero ENTRA.
      */}
      {lent.length > 0 && <>
        <div className="mdebt-section-title">
          {t('debtOwedToYouSection')}
          <span className="mdebt-lent-total">{fmtVal(lent.reduce((n, d) => n + d.balance, 0), currency)}</span>
        </div>
        <div className="mdebt-list">
          {lent.map(debt => (
            <div key={debt.id} className="mdebt-debt lent">
              <button className="mdebt-debt-main" onClick={() => setEditing(debt)}>
                <div className="mdebt-debt-top">
                  <span className="mdebt-kind">
                    <Icon name={debt.kind ? KIND_ICON[debt.kind] : 'heart'} size={14} />
                  </span>
                  <b>{debt.name}</b>
                  <span className="mdebt-dir lent">{t('debtDirectionLentShort')}</span>
                  <strong>{fmtVal(debt.balance, currency)}</strong>
                </div>
                {(debt.dueDay || debt.counterparty) && (
                  <div className="mdebt-debt-meta">
                    <DueBadge debt={debt} today={today} />
                    {debt.counterparty && <span className="mdebt-meta-chip">{debt.counterparty}</span>}
                  </div>
                )}
              </button>
              <button className="mdebt-debt-pay" onClick={() => setPaying(debt)} aria-label={t('debtCollectAction')}>
                <Icon name="check" size={15} /> {t('collectShortLabel')}
              </button>
            </div>
          ))}
        </div>
      </>}

      {editing !== null && (
        <DebtSheet
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

function DebtSheet({ debt, onClose, onSave, onDelete }: {
  debt?: Debt
  onClose: () => void
  onSave: (d: Omit<Debt, 'id'>) => void
  onDelete?: () => void
}) {
  const { currency } = useFinance()
  const t = useT()
  const [f, setF] = useState<Omit<Debt, 'id'>>(
    debt ? {
      name: debt.name, balance: debt.balance, rate: debt.rate,
      minPayment: debt.minPayment, color: debt.color,
      direction: debt.direction ?? 'owed', kind: debt.kind,
      counterparty: debt.counterparty, dueDay: debt.dueDay, endDate: debt.endDate,
      // El historial y el saldo original NO se editan: son hechos, no ajustes.
      // Viajan intactos para que guardar no los borre.
      originalBalance: debt.originalBalance, payments: debt.payments,
    } : { ...EMPTY }
  )
  const [confirmDel, setConfirmDel] = useState(false)
  const [sub, setSub] = useState<'balance' | 'rate' | 'minPayment' | 'dueDay' | 'endDate' | 'counterparty' | null>(null)
  const amountSheet = sub === 'balance' || sub === 'rate' || sub === 'minPayment' ? sub : null
  const p = <K extends keyof typeof f>(k: K, v: typeof f[K]) => setF(cur => ({ ...cur, [k]: v }))

  const owed = (f.direction ?? 'owed') === 'owed'
  const today = localToday()
  const KINDS: { value: DebtKind; label: string }[] = [
    { value: 'loan', label: t('debtKindLoan') },
    { value: 'card', label: t('debtKindCard') },
    { value: 'store', label: t('debtKindStore') },
    { value: 'personal', label: t('debtKindPersonal') },
  ]

  /*
   * LA CUOTA QUE SALE DE LA FECHA FINAL.
   *
   * Nadie sabe de memoria el "pago mínimo" de su préstamo, pero todo el mundo
   * sabe que son 36 cuotas y cuándo termina. Con saldo, tasa y fecha final la
   * cuota se calcula sola — es la fórmula del banco. Se OFRECE, no se impone:
   * si el banco cobra otra cosa, manda el banco.
   */
  const suggested = useMemo(() => {
    if (!f.endDate || f.balance <= 0) return null
    const months = installmentsLeft(f.endDate, today)
    if (months <= 0) return null
    const value = paymentForTerm(f.balance, f.rate, months)
    return value > 0 && Math.abs(value - f.minPayment) > 0.5 ? value : null
  }, [f.endDate, f.balance, f.rate, f.minPayment, today])

  useMobileBackDismiss(sub !== null, () => setSub(null))
  useMobileBackDismiss(sub === null, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, sub === null)

  return (
    <>
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={debt ? t('editDebt') : t('newDebt')} onClick={onClose}>
      <section className="mdebt-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{debt ? t('editDebt') : t('newDebt')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mdebt-sheet-body">
          {/* DE QUE LADO ESTAS, lo primero: cambia el significado de todo lo
              que viene debajo. Preguntarlo al final obligaria a releer el
              formulario entero con otra cabeza. */}
          <div className="mdebt-field">
            <span>{t('debtKindLabel')}</span>
            <div className="mdebt-seg">
              {(['owed', 'lent'] as DebtDirection[]).map(d => (
                <button
                  key={d}
                  className={(f.direction ?? 'owed') === d ? 'on' : ''}
                  aria-pressed={(f.direction ?? 'owed') === d}
                  onClick={() => p('direction', d)}
                >
                  {t(d === 'owed' ? 'debtDirectionOwed' : 'debtDirectionLent')}
                </button>
              ))}
            </div>
          </div>

          <label className="mdebt-field">
            <span>{t('name')}</span>
            <input className="mdebt-input" value={f.name}
              placeholder={t('egCreditCard')} onChange={e => p('name', e.target.value)} />
          </label>

          {owed && (
            <div className="mdebt-field">
              <span>{t('debtKindLabel')}</span>
              <div className="mdebt-chips">
                {KINDS.map(k => (
                  <button
                    key={k.value}
                    className={f.kind === k.value ? 'on' : ''}
                    aria-pressed={f.kind === k.value}
                    onClick={() => p('kind', f.kind === k.value ? undefined : k.value)}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mdebt-field">
            <span>{t(owed ? 'debtCounterpartyLabel' : 'debtCounterpartyLent')}</span>
            <button className="mdebt-amount-row" onClick={() => setSub('counterparty')}>
              <span className={f.counterparty ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                {f.counterparty || t('debtCounterpartyPlaceholder')}
              </span>
              <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
            </button>
          </div>

          <div className="mdebt-field-row">
            <div className="mdebt-field" style={{ flex: 1 }}>
              <span>{t('balance')}</span>
              <button className="mdebt-amount-row" onClick={() => setSub('balance')}>
                <span className={f.balance ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                  {f.balance ? fmt(f.balance, currency) : '—'}
                </span>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
              </button>
            </div>
            <div className="mdebt-field" style={{ flex: 1 }}>
              <span>{t('annualInterestPctLabel')}</span>
              <button className="mdebt-amount-row" onClick={() => setSub('rate')}>
                <span className={f.rate ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                  {f.rate ? `${f.rate}%` : '—'}
                </span>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
              </button>
            </div>
          </div>

          <div className="mdebt-field">
            <span>{t('monthlyMinPaymentLabel')}</span>
            <button className="mdebt-amount-row" onClick={() => setSub('minPayment')}>
              <span className={f.minPayment ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                {f.minPayment ? fmt(f.minPayment, currency) : '—'}
              </span>
              <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
            </button>
          </div>

          {/* EL CALENDARIO. Lo que faltaba para poder registrar una deuda en
              condiciones: cuando se paga y hasta cuando dura. */}
          <div className="mdebt-field-row">
            <div className="mdebt-field" style={{ flex: 1 }}>
              <span>{t('debtDueDayLabel')}</span>
              <button className="mdebt-amount-row" onClick={() => setSub('dueDay')}>
                <span className={f.dueDay ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                  {f.dueDay ? String(f.dueDay) : '—'}
                </span>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
              </button>
            </div>
            <div className="mdebt-field" style={{ flex: 1 }}>
              <span>{t('debtEndDateLabel')}</span>
              <button className="mdebt-amount-row" onClick={() => setSub('endDate')}>
                <span className={f.endDate ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                  {f.endDate
                    ? new Date(`${f.endDate}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                    : t('debtNoEndDate')}
                </span>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
              </button>
            </div>
          </div>

          {f.endDate && installmentsLeft(f.endDate, today) > 0 && (
            <p className="mdebt-hint">
              {t('debtInstallmentsLeft').replace('{n}', String(installmentsLeft(f.endDate, today)))}
            </p>
          )}

          {/* La cuota calculada a partir del plazo. Se ofrece; el usuario
              decide, porque quien manda sobre la cuota es su banco. */}
          {suggested !== null && (
            <button className="mdebt-suggest" onClick={() => p('minPayment', suggested)}>
              <Icon name="info" size={13} />
              {t('debtSuggestedPayment').replace('{amount}', fmt(suggested, currency))}
              <b>{t('debtSuggestedPaymentApply')}</b>
            </button>
          )}

          {/* HISTORIAL: lo que ya pagaste, comprobable. Antes solo habia un
              porcentaje que no se podia contrastar con nada. */}
          {debt && (debt.payments?.length ?? 0) > 0 && (
            <div className="mdebt-field">
              <span>{t('debtPaymentHistoryLabel')}</span>
              <div className="mdebt-history">
                {[...debt.payments!].reverse().slice(0, 8).map(payment => (
                  <div key={payment.id} className="mdebt-history-row">
                    <span>{new Date(`${payment.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                    <b>{fmt(payment.amount, currency)}</b>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mdebt-field">
            <span>{t('color')}</span>
            <div className="mdebt-color-row">
              {COLORS.map(c => (
                <button key={c} className={`mdebt-color-dot${f.color === c ? ' on' : ''}`}
                  aria-label={t('colorOption').replace('{c}', c)} aria-pressed={f.color === c}
                  style={{ background: c }} onClick={() => p('color', c)} />
              ))}
            </div>
          </div>

          {debt && onDelete && (
            !confirmDel
              ? <button className="mdebt-del-btn" onClick={() => setConfirmDel(true)}>
                  <Icon name="trash" size={16} /> {t('deleteDebtLabel')}
                </button>
              : <div className="mdebt-confirm-del">
                  <p>{t('deleteQuotedConfirm').replace('{name}', debt.name)}</p>
                  <div>
                    <button onClick={() => setConfirmDel(false)}>{t('cancel')}</button>
                    <button className="danger" onClick={onDelete}>{t('delete')}</button>
                  </div>
                </div>
          )}
        </div>

        <div className="mdebt-sheet-actions">
          <button className="mdebt-btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button className="mdebt-btn-save" style={{ background: f.color }}
            onClick={() => {
              if (!f.name.trim()) { toast(t('enterNamePrompt'), { icon: 'alert' }); return }
              if (f.balance <= 0) { toast(t('balanceMustBePositive'), { icon: 'alert' }); return }
              onSave(f)
            }}>
            {debt ? t('save') : t('add')}
          </button>
        </div>
      </section>
    </div>
    </SheetPortal>

    {amountSheet === 'balance' && (
      <MobileAmountSheet
        title={t('debtBalanceTitle')}
        value={f.balance}
        currency={currency}
        onDone={v => { p('balance', v); setSub(null) }}
        onClose={() => setSub(null)}
      />
    )}
    {amountSheet === 'rate' && (
      <MobileAmountSheet
        title={t('annualInterestPctLabel')}
        value={f.rate}
        unit="%"
        onDone={v => { p('rate', v); setSub(null) }}
        onClose={() => setSub(null)}
      />
    )}
    {amountSheet === 'minPayment' && (
      <MobileAmountSheet
        title={t('monthlyMinPaymentLabel')}
        value={f.minPayment}
        currency={currency}
        onDone={v => { p('minPayment', v); setSub(null) }}
        onClose={() => setSub(null)}
      />
    )}
    {sub === 'dueDay' && (
      <DayOfMonthSheet
        title={t('debtDueDaySheetTitle')}
        value={f.dueDay}
        onDone={day => { p('dueDay', day); setSub(null) }}
        onClose={() => setSub(null)}
      />
    )}
    {sub === 'endDate' && (
      <MobileDatePicker
        value={f.endDate ?? today}
        onChange={v => { p('endDate', v); setSub(null) }}
        onClose={() => setSub(null)}
      />
    )}
    {sub === 'counterparty' && (
      <MobileTextSheet
        title={t(owed ? 'debtCounterpartyLabel' : 'debtCounterpartyLent')}
        value={f.counterparty ?? ''}
        placeholder={t('debtCounterpartyPlaceholder')}
        maxLength={40}
        onDone={v => { p('counterparty', v.trim() || undefined); setSub(null) }}
        onClose={() => setSub(null)}
      />
    )}
    </>
  )
}

/**
 * REGISTRAR UN PAGO.
 *
 * La hoja anterior pedía un monto y ya: bajaba la deuda sin tocar ninguna
 * cuenta. Pagabas RD$ 5.000 de tu préstamo y tu efectivo seguía intacto —
 * dinero que salía de un lado sin entrar en el otro.
 *
 * Ahora el pago **no se puede registrar sin decir de dónde sale**. Es el mismo
 * principio que rige las tarjetas: una cifra de dinero sin un movimiento
 * detrás es una cifra que el libro no puede sostener, y tarde o temprano
 * aparece como "dinero que no tengo".
 *
 * Elegir la cuenta va ANTES del monto a propósito. Al revés, el usuario teclea
 * la cifra, se topa con una pregunta que no esperaba y ya tiene medio trabajo
 * hecho para abandonar.
 */
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
