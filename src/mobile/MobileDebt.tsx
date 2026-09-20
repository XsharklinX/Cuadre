import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { dateLocale, fmt } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { useFinance } from '@/store/finance'
import { creditCardsAsDebts } from '@/data/creditCard'
import { useDebt, simulatePayoff, debtProgress, monthlyPaymentPlan, payoffTargetId, freedomDate, type Debt, type PayoffMethod } from '@/store/debt'
import { playConfirmSound, playDeleteSound, playSuccessHaptic } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { MobileAmountSheet } from './MobileAmountSheet'
import { SheetPortal } from './SheetPortal'

const COLORS = ['#ff6b8a', '#5bc0ff', '#35d0a2', '#a78bfa', '#f59e0b', '#ffdd3d']
const EMPTY: Omit<Debt, 'id'> = { name: '', balance: 0, rate: 0, minPayment: 0, color: COLORS[0] }

export function MobileDebt() {
  const { currency } = useFinance()
  const fmtVal = useFmt()
  const t = useT()
  const lang = useSettings(s => s.language)
  const { debts: manualDebts, extraPayment, addDebt, updateDebt, deleteDebt, restoreDebt, registerPayment, setExtraPayment } = useDebt()
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
  const debts = useMemo(() => [...cardDebts, ...manualDebts], [cardDebts, manualDebts])
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

  if (debts.length === 0) return (
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

      {/* Héroe: fecha de libertad + progreso */}
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
            <div key={debt.id} className={`mdebt-debt${debt.id === targetId ? ' target' : ''}`}>
              <button
                className="mdebt-debt-main"
                onClick={() => { if (!isDerived(debt.id)) setEditing(debt) }}
                disabled={isDerived(debt.id)}
              >
                <div className="mdebt-debt-top">
                  <span className="mdebt-row-dot" style={{ background: debt.color }} />
                  <b>{debt.name}</b>
                  {isDerived(debt.id) && <span className="mdebt-card-badge">{t('fromCardBadge')}</span>}
                  <span className="mdebt-debt-rate">{debt.rate}%</span>
                  <strong>{fmtVal(debt.balance, currency)}</strong>
                </div>
                <div className="mdebt-debt-bar"><i style={{ width: `${Math.max(2, prog)}%`, background: debt.color }} /></div>
                <div className="mdebt-debt-sub">
                  {isDerived(debt.id)
                    ? t('editOnAccountHint')
                    : t('paidOfOriginal').replace('{pct}', String(prog))}
                </div>
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

      {paying && (
        <MobileAmountSheet
          title={t('registerPaymentFor').replace('{name}', paying.name)}
          value={0}
          currency={currency}
          onDone={v => {
            if (v > 0) {
              registerPayment(paying.id, v)
              playSuccessHaptic()
              toast(t('paymentRegisteredToast').replace('{amount}', fmt(v, currency)), { icon: 'check', type: 'ok' })
            }
            setPaying(null)
          }}
          onClose={() => setPaying(null)}
        />
      )}
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
    debt ? { name: debt.name, balance: debt.balance, rate: debt.rate, minPayment: debt.minPayment, color: debt.color }
         : { ...EMPTY }
  )
  const [confirmDel, setConfirmDel] = useState(false)
  const [amountSheet, setAmountSheet] = useState<'balance' | 'rate' | 'minPayment' | null>(null)
  const p = <K extends keyof typeof f>(k: K, v: typeof f[K]) => setF(cur => ({ ...cur, [k]: v }))

  useMobileBackDismiss(amountSheet !== null, () => setAmountSheet(null))
  useMobileBackDismiss(amountSheet === null, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, amountSheet === null)

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
          <label className="mdebt-field">
            <span>{t('name')}</span>
            <input className="mdebt-input" value={f.name}
              placeholder={t('egCreditCard')} onChange={e => p('name', e.target.value)} />
          </label>

          <div className="mdebt-field-row">
            <div className="mdebt-field" style={{ flex: 1 }}>
              <span>{t('balance')}</span>
              <button className="mdebt-amount-row" onClick={() => setAmountSheet('balance')}>
                <span className={f.balance ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                  {f.balance ? fmt(f.balance, currency) : '—'}
                </span>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
              </button>
            </div>
            <div className="mdebt-field" style={{ flex: 1 }}>
              <span>{t('annualInterestPctLabel')}</span>
              <button className="mdebt-amount-row" onClick={() => setAmountSheet('rate')}>
                <span className={f.rate ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                  {f.rate ? `${f.rate}%` : '—'}
                </span>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
              </button>
            </div>
          </div>

          <div className="mdebt-field">
            <span>{t('monthlyMinPaymentLabel')}</span>
            <button className="mdebt-amount-row" onClick={() => setAmountSheet('minPayment')}>
              <span className={f.minPayment ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                {f.minPayment ? fmt(f.minPayment, currency) : '—'}
              </span>
              <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
            </button>
          </div>

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
        onDone={v => { p('balance', v); setAmountSheet(null) }}
        onClose={() => setAmountSheet(null)}
      />
    )}
    {amountSheet === 'rate' && (
      <MobileAmountSheet
        title={t('annualInterestPctLabel')}
        value={f.rate}
        unit="%"
        onDone={v => { p('rate', v); setAmountSheet(null) }}
        onClose={() => setAmountSheet(null)}
      />
    )}
    {amountSheet === 'minPayment' && (
      <MobileAmountSheet
        title={t('monthlyMinPaymentLabel')}
        value={f.minPayment}
        currency={currency}
        onDone={v => { p('minPayment', v); setAmountSheet(null) }}
        onClose={() => setAmountSheet(null)}
      />
    )}
    </>
  )
}
