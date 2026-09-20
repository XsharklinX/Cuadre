import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { CatBadge } from '@/views/shared'
import { ACCENT_COLORS } from '@/constants'
import { accountActivity, accountBalanceInBase, creditCardsOwedInBase, accountCurrency, dateLocale, fmt, getAccount, getCategory, localToday, monthlyAccountSeries, visibleAccounts } from '@/data/helpers'
import { CURRENCIES as CURRENCY_LIST, convertCurrency, getCurrencyMeta } from '@/data/currencies'
import { CARD_NETWORKS, networkMeta } from '@/data/cardNetwork'
import {
  creditCycle, creditUsed, creditUsedInPrimary, creditUtilization, hasSecondaryBalance,
  hasSplitLimits, minimumPayment, projectMinimumPayoff, secondaryUtilization, utilizationBand,
} from '@/data/creditCard'
import { canDeleteAccountType, canHaveNetwork, creatableTypes, guessNetwork } from '@/data/cardNetwork'
import { findBank, guessBank } from '@/data/banks'
import { MobileBankPicker } from './MobileBankPicker'
import { NetworkMark } from '@/components/ui/NetworkMark'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { playAccountsSound, playConfirmSound, playDeleteSound } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { translateCategoryName, useT } from '@/i18n'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useSubmitGuard } from './useSubmitGuard'
import { playSuccessHaptic } from '@/lib/sound'
import { MobileAmountSheet } from './MobileAmountSheet'
import { DayOfMonthSheet, PercentSheet } from './MobileNumberSheets'
import { MobileTextSheet } from './MobileTextSheet'
import { MobileDigitSheet } from './MobileDigitSheet'
import { MobileTransactionList } from './MobileTransactionList'
import { SheetPortal } from './SheetPortal'
import type { Account, AccountType, OverdraftPolicy, Transaction, ViewProps } from '@/types'

const COLORS = ACCENT_COLORS

const EMPTY_ACCOUNT: Omit<Account, 'id'> = {
  name: '', short: '', type: 'debit', color: COLORS[1], balance: 0, last4: null,
}

function getTypeMeta(t: ReturnType<typeof useT>): Record<AccountType, { label: string; group: string; icon: Parameters<typeof Icon>[0]['name'] }> {
  return {
    cash:    { label: t('cash'),    group: t('cash'),                    icon: 'wallet' },
    debit:   { label: t('debit'),   group: t('bankAccountsGroupLabel'),  icon: 'cards'  },
    savings: { label: t('savings'), group: t('bankAccountsGroupLabel'),  icon: 'piggy'  },
    credit:  { label: t('credit'),  group: t('creditCardsGroupLabel'),   icon: 'cards'  },
  }
}

function accountKind(a: Account): 'asset' | 'debt' {
  return a.balance < 0 ? 'debt' : 'asset'
}

export function MobileAccounts({ mkey, createRequest, onEditTx, onDeleteTx }: {
  mkey: string
  createRequest?: ViewProps['createRequest']
  onEditTx: (transaction: Transaction) => void
  onDeleteTx?: (id: string) => void
}) {
  const { accounts, currency, addAccount, updateAccount, deleteAccount, restoreAccount } = useFinance()
  const lang = useSettings(s => s.language)
  const fmtVal = useFmt()
  const t = useT()
  const TYPE_META = getTypeMeta(t)
  // Guardamos el id, no el objeto: si la cuenta cambia mientras el detalle
  // esta abierto (ej. al conciliar el saldo), `selected` se re-deriva del
  // store en cada render en vez de quedarse con una referencia vieja.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Cuenta desplegada en la lista: al tocarla se abren sus cifras del mes y sus
  // acciones, sin salir de la pantalla.
  const selected = accounts.find(a => a.id === selectedId) ?? null
  const [activityAccount, setActivityAccount] = useState<Account | null>(null)
  const [editingAccount, setEditingAccount] = useState<Account | 'new' | null>(null)

  useMobileBackDismiss(!!editingAccount, () => setEditingAccount(null))

  useEffect(() => { playAccountsSound() }, [])

  useEffect(() => {
    if (createRequest?.target === 'account') setEditingAccount('new')
  }, [createRequest])

  const saveAccount = (fields: Omit<Account, 'id'>) => {
    if (!fields.name.trim() || !fields.short.trim()) {
      toast(t('fillNameAndLabel'), { icon: 'alert' })
      return
    }
    const clean = { ...fields, name: fields.name.trim(), short: fields.short.trim(), last4: fields.last4?.trim() || null }
    if (editingAccount === 'new') addAccount(clean)
    else if (editingAccount) updateAccount(editingAccount.id, clean)
    playConfirmSound()
    toast(editingAccount === 'new' ? t('accountCreated') : t('accountUpdated'), { icon: 'cards', type: 'ok' })
    setEditingAccount(null)
  }

  const deleteAcc = (account: Account) => {
    try {
      deleteWithUndo({
        message: t('accountDeleted'),
        onDelete: () => deleteAccount(account.id),
        onRestore: () => restoreAccount(account),
      })
      playDeleteSound()
      setEditingAccount(null)
      setSelectedId(null)
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotDeleteAccount'), { icon: 'alert' })
    }
  }

  const summary = useMemo(() => {
    const visible     = visibleAccounts(accounts)
    const inBase      = (a: Account) => accountBalanceInBase(a, currency)
    const assets      = visible.filter(a => accountKind(a) === 'asset').reduce((s, a) => s + Math.max(0, inBase(a)), 0)
    const liabilities = visible.filter(a => accountKind(a) === 'debt').reduce((s, a) => s + Math.abs(Math.min(0, inBase(a))), 0)
    const cashCount   = visible.filter(a => TYPE_META[a.type].group === t('cash')).length
    const bankCount   = visible.filter(a => TYPE_META[a.type].group === t('bankAccountsGroupLabel')).length
    const creditCount = visible.filter(a => TYPE_META[a.type].group === t('creditCardsGroupLabel')).length
    return { assets, liabilities, net: assets - liabilities, cashCount, bankCount, creditCount, visibleCount: visible.length }
  }, [accounts, currency, TYPE_META, t])


  const cashAccounts = accounts.filter(a => a.type !== 'credit')
  const creditCards  = accounts.filter(a => a.type === 'credit')
  const cashTotal    = cashAccounts
    .filter(a => a.includeInTotal !== false)
    .reduce((sum, a) => sum + accountBalanceInBase(a, currency), 0)

  /**
   * La tarjeta cuyo pago vence antes. Con dos o tres tarjetas, "¿cuánto debo
   * y cuándo?" es LA pregunta, y antes había que abrir cada ficha por
   * separado para armar la respuesta mentalmente.
   */
  const nextDue = useMemo(() => {
    const withCycle = creditCards
      .map(a => ({ account: a, cycle: creditCycle(a), min: minimumPayment(a) }))
      .filter(x => x.cycle.daysToPayment !== null && creditUsed(x.account.balance) > 0)
      .sort((a, b) => (a.cycle.daysToPayment ?? 0) - (b.cycle.daysToPayment ?? 0))
    return withCycle[0] ?? null
  }, [creditCards])

  const assetShare = summary.assets + summary.liabilities > 0
    ? summary.assets / (summary.assets + summary.liabilities) * 100
    : 100

  return (
    <div className="sacc-root">

      {/* ── Patrimonio ──────────────────────────────────── */}
      <section className="sacc-hero">
        <div>
          <span className="sacc-hero-label">{t('netWorthLabel')}</span>
          <strong className={`sacc-hero-value${summary.net < 0 ? ' negative' : ''}`}>
            {fmtVal(summary.net, currency)}
          </strong>
        </div>
        <div className="sacc-hero-bar" role="img" aria-label={t('assetsLabel')}>
          <i style={{ width: `${assetShare}%` }} />
        </div>
        <div className="sacc-hero-split">
          <div className="sacc-hero-stat asset">
            <small>{t('assetsLabel')}</small>
            <strong>{fmtVal(summary.assets, currency)}</strong>
          </div>
          <div className="sacc-hero-stat debt">
            <small>{t('liabilitiesLabel')}</small>
            <strong>{fmtVal(summary.liabilities, currency)}</strong>
          </div>
        </div>
      </section>

      {/* ── Próximo pago ────────────────────────────────── */}
      {nextDue && (
        <button
          className={`sacc-next${nextDue.cycle.paymentSoon ? '' : ' calm'}`}
          onClick={() => setSelectedId(nextDue.account.id)}
        >
          <Icon name="calendar" size={18} className="sacc-next-ico" />
          <span className="sacc-next-body">
            <b>{t('nextCardPayment').replace('{name}', nextDue.account.name)}</b>
            <small>
              {nextDue.cycle.daysToPayment === 0
                ? t('dueToday')
                : t('dueInDays').replace('{n}', String(nextDue.cycle.daysToPayment))}
            </small>
          </span>
          {nextDue.min !== null && nextDue.min > 0 && (
            <span className="sacc-next-amount">
              {fmtVal(nextDue.min, accountCurrency(nextDue.account, currency))}
            </span>
          )}
        </button>
      )}

      {accounts.length === 0 ? (
        <div className="sacc-empty">
          <Icon name="cards" size={44} className="sacc-empty-ico" />
          <h3>{t('noAccountsShort')}</h3>
          <p>{t('accountsEmptyHint')}</p>
          <button onClick={() => setEditingAccount('new')}>{t('createAccount')}</button>
        </div>
      ) : (
        <>
          {/* ── REGISTRO 1: dinero que tienes ───────────────
              Filas compactas. Un saldo es un número: no necesita una
              tarjeta ni el sparkline de 20px que antes competía con él. */}
          {cashAccounts.length > 0 && (
            <div className="sacc-block">
              <div className="sacc-section">
                <span className="sacc-section-title">{t('yourMoneyLabel')}</span>
                <span className="sacc-section-total">{fmtVal(cashTotal, currency)}</span>
              </div>
              <div className="sacc-rows">
                {cashAccounts.map(a => (
                  <button key={a.id} className="sacc-row" onClick={() => setSelectedId(a.id)}>
                    <span className="sacc-row-ico" style={{ background: `color-mix(in oklab, ${a.color} 16%, transparent)`, color: a.color }}>
                      <Icon name={TYPE_META[a.type].icon} size={19} />
                    </span>
                    <span className="sacc-row-info">
                      <span className="sacc-row-name">
                        {a.name}
                        {a.includeInTotal === false && (
                          <span className="sacc-badge">{t('excludedFromTotalBadge')}</span>
                        )}
                      </span>
                      <span className="sacc-row-meta">
                        {TYPE_META[a.type].label}
                        {a.last4 ? ` · ····${a.last4}` : ''}
                        {a.currency && a.currency !== currency ? ` · ${a.currency}` : ''}
                      </span>
                    </span>
                    <span className="sacc-row-right">
                      {/* La red identifica la tarjeta antes que el nombre que
                          el usuario le puso. Solo si la cuenta lleva plastico. */}
                      {a.network && canHaveNetwork(a.type) && (
                        <NetworkMark network={a.network} size={24} />
                      )}
                      <span className="sacc-row-amount">
                        {fmtVal(a.balance, accountCurrency(a, currency))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── REGISTRO 2: dinero que debes ────────────────
              Tarjeta completa, no fila. Carga cinco veces la información de
              una cuenta de efectivo y merece el espacio. */}
          {creditCards.length > 0 && (
            <div className="sacc-block">
              <div className="sacc-section">
                <span className="sacc-section-title">{t('yourCardsLabel')}</span>
                <span className="sacc-section-total">
                  {fmtVal(creditCardsOwedInBase(accounts, currency), currency)} {t('owedLabel')}
                </span>
              </div>

              {creditCards.map(a => {
                const cur       = accountCurrency(a, currency)
                const owed      = creditUsed(a.balance)
                const util      = creditUtilization(a, currency)
                const band      = util !== null ? utilizationBand(util) : null
                const cycle     = creditCycle(a)
                const min       = minimumPayment(a)
                const payoff    = projectMinimumPayoff(a)
                const dual      = hasSecondaryBalance(a)
                const secOwed   = creditUsed(a.secondaryBalance ?? 0)
                const secUtil   = secondaryUtilization(a)

                return (
                  <button
                    key={a.id}
                    className="sacc-card"
                    style={{ '--rail': a.color } as React.CSSProperties}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <div className="sacc-card-head">
                      <div className="sacc-card-id">
                        <span className="sacc-card-name">
                          {a.name}
                          {a.includeInTotal === false && (
                            <span className="sacc-badge">{t('excludedFromTotalBadge')}</span>
                          )}
                        </span>
                        <span className="sacc-card-bank">
                          {TYPE_META[a.type].label}
                          {(findBank(a.bankId)?.name ?? guessBank(a.name)?.name)
                            ? ` · ${findBank(a.bankId)?.name ?? guessBank(a.name)?.name}` : ''}
                          {a.last4 ? ` · ····${a.last4}` : ''}
                        </span>
                      </div>
                      {/* Si se conoce la red, manda ella: es lo que esta
                          impreso en el plastico y lo que el ojo busca. El
                          icono generico solo aparece cuando no se sabe. */}
                      {a.network ? (
                        <span className="sacc-card-net"><NetworkMark network={a.network} size={30} /></span>
                      ) : (
                        <span
                          className="sacc-card-chip"
                          style={{ background: `color-mix(in oklab, ${a.color} 16%, transparent)`, color: a.color }}
                        >
                          <Icon name="cards" size={17} />
                        </span>
                      )}
                    </div>

                    {/* Los dos saldos a peso igual. Si la tarjeta nunca operó
                        en otra divisa, una sola caja a ancho completo: un
                        "US$ 0.00" que nunca existió es ruido. */}
                    <div className={`sacc-card-balances${dual ? '' : ' single'}`}>
                      <div className="sacc-bal">
                        <span className="sacc-bal-label">
                          <span aria-hidden="true">{getCurrencyMeta(cur).flag}</span> {cur}
                        </span>
                        <span className={`sacc-bal-value${owed > 0 ? ' owed' : ' clear'}`}>
                          {fmtVal(a.balance, cur)}
                        </span>
                      </div>
                      {dual && (
                        <div className="sacc-bal">
                          <span className="sacc-bal-label">
                            <span aria-hidden="true">{getCurrencyMeta(a.secondaryCurrency!).flag}</span> {a.secondaryCurrency}
                          </span>
                          <span className={`sacc-bal-value${secOwed > 0 ? ' owed' : ' clear'}`}>
                            {fmtVal(a.secondaryBalance ?? 0, a.secondaryCurrency!)}
                          </span>
                        </div>
                      )}
                    </div>

                    {util !== null && a.limit && (
                      <div className="sacc-util">
                        <div className="sacc-util-head">
                          <span className="sacc-util-label">
                            {hasSplitLimits(a) ? `${t('creditUsedLabel')} · ${cur}` : t('creditUsedLabel')}
                          </span>
                          <span className={`sacc-util-value ${band}`}>
                            {Math.round(util * 100)}% · {fmtVal(Math.max(0, a.limit - creditUsedInPrimary(a, currency)), cur)}
                          </span>
                        </div>
                        <div
                          className="sacc-util-track"
                          role="progressbar"
                          aria-valuenow={Math.round(util * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${t('creditUsedLabel')} ${a.name}`}
                        >
                          {/* Deja un 2% visible con deuda cero: un canal
                              totalmente vacío se lee como algo que no cargó. */}
                          <div className={`sacc-util-fill ${band}`} style={{ width: `${Math.max(2, util * 100)}%` }} />
                        </div>
                      </div>
                    )}

                    {/* Cupo propio de la línea extranjera, solo si existe. */}
                    {secUtil !== null && a.secondaryLimit && (
                      <div className="sacc-util">
                        <div className="sacc-util-head">
                          <span className="sacc-util-label">{t('creditUsedLabel')} · {a.secondaryCurrency}</span>
                          <span className={`sacc-util-value ${utilizationBand(secUtil)}`}>
                            {Math.round(secUtil * 100)}% · {fmtVal(Math.max(0, a.secondaryLimit - secOwed), a.secondaryCurrency!)}
                          </span>
                        </div>
                        <div className="sacc-util-track">
                          <div
                            className={`sacc-util-fill ${utilizationBand(secUtil)}`}
                            style={{ width: `${Math.max(2, secUtil * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {(cycle.statementDate || cycle.paymentDate || min !== null) && (
                      <dl className="sacc-cycle">
                        <div>
                          <dt>{t('cycleStatement')}</dt>
                          <dd>{cycle.statementDate ? formatCycleDate(cycle.statementDate, lang) : '—'}</dd>
                        </div>
                        <div>
                          <dt>{t('cyclePayment')}</dt>
                          <dd className={cycle.paymentSoon ? 'soon' : ''}>
                            {cycle.paymentDate ? formatCycleDate(cycle.paymentDate, lang) : '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('cycleMinimum')}</dt>
                          <dd>{min !== null ? fmtVal(min, cur) : '—'}</dd>
                        </div>
                      </dl>
                    )}

                    {/* Solo con saldo Y tasa configurada. Dice el costo en
                        dinero y tiempo, no el porcentaje: "24% anual" no
                        significa nada leído de pasada. */}
                    {payoff && owed > 0 && (
                      <p className="sacc-card-warn">
                        <Icon name="alert" size={13} />
                        {payoff.never
                          ? t('minOnlyNever')
                          : t('minOnlyWarning')
                              .replace('{time}', humanMonths(payoff.months, t))
                              .replace('{interest}', fmtVal(payoff.totalInterest, cur))}
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <button className="sacc-add" onClick={() => setEditingAccount('new')}>
            <Icon name="plus" size={16} /> {t('addAccountLabel')}
          </button>
        </>
      )}

      {selected && (
        <AccountDetailSheet
          account={selected}
          mkey={mkey}
          onClose={() => setSelectedId(null)}
          onEdit={a => { setSelectedId(null); setEditingAccount(a) }}
          onViewAll={() => setActivityAccount(selected)}
        />
      )}

      {activityAccount && (
        <AccountActivitySheet
          account={activityAccount}
          onClose={() => setActivityAccount(null)}
          onEditTx={onEditTx}
          onDeleteTx={onDeleteTx}
        />
      )}

      {editingAccount !== null && (
        <AccountEditorSheet
          account={editingAccount === 'new' ? undefined : editingAccount}
          onClose={() => setEditingAccount(null)}
          onSave={saveAccount}
          onDelete={editingAccount !== 'new' ? deleteAcc : undefined}
        />
      )}
    </div>
  )
}

function AccountDetailSheet({ account, mkey, onClose, onEdit, onViewAll }: { account: Account; mkey: string; onClose: () => void; onEdit: (account: Account) => void; onViewAll: () => void }) {
  const { transactions, accounts, categories, currency, reconcileAccount } = useFinance()
  const fmtVal = useFmt()
  const t = useT()
  const lang = useSettings(s => s.language)
  const TYPE_META = getTypeMeta(t)
  const [reconciling, setReconciling] = useState(false)
  const [paying, setPaying] = useState(false)
  const { beginSubmit, endSubmit } = useSubmitGuard()

  useMobileBackDismiss(reconciling, () => setReconciling(false))
  useMobileBackDismiss(!reconciling, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !reconciling)

  const handleReconcile = (realBalance: number) => {
    if (!beginSubmit()) return
    setReconciling(false)
    const diff = reconcileAccount(account.id, realBalance)
    endSubmit()
    if (diff === 0) { toast(t('reconciliationAlreadyMatches'), { icon: 'check', type: 'ok' }); return }
    playConfirmSound()
    toast(t(diff > 0 ? 'reconciliationAdjustmentAdded' : 'reconciliationAdjustmentSubtracted')
      .replace('{amount}', fmtVal(Math.abs(diff), accountCurrency(account, currency))), { icon: 'check', type: 'ok' })
  }

  const series = useMemo(
    () => monthlyAccountSeries(transactions, account.id, mkey, dateLocale(lang)),
    [transactions, account.id, mkey, lang],
  )
  const recent = useMemo(
    () => accountActivity(transactions, account.id)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8),
    [transactions, account.id],
  )

  const maxVal = Math.max(1, ...series.flatMap(s => [s.inflow, s.outflow]))
  // La utilizacion cuenta AMBAS deudas de la tarjeta (local + divisa
  // extranjera): el limite es uno solo y lo consumen las dos.
  const used    = account.type === 'credit' && account.limit ? creditUsedInPrimary(account, currency) : null
  const utilFrac = creditUtilization(account, currency)
  const utilPct = utilFrac !== null ? utilFrac * 100 : null
  const band    = utilFrac !== null ? utilizationBand(utilFrac) : null
  const cycle   = account.type === 'credit' ? creditCycle(account) : null
  const minPay  = account.type === 'credit' ? minimumPayment(account) : null
  const payoff  = account.type === 'credit' ? projectMinimumPayoff(account) : null
  const secondary = hasSecondaryBalance(account)

  return (
    <>
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={account.name} onClick={onClose}>
      <section className="macc-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{account.name}</span>
          <div className="macc-sheet-head-actions">
            <button aria-label={t('edit')} onClick={() => onEdit(account)}><Icon name="edit" size={18} /></button>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
        </header>

        <div className="macc-sheet-body">
          <div className="macc-sheet-head">
            <span className="macc-sheet-icon" style={{ background: account.color + '22', color: account.color }}>
              <Icon name={TYPE_META[account.type].icon} size={24} />
            </span>
            <div className="macc-sheet-head-info">
              <small>{TYPE_META[account.type].label}{account.last4 ? ` - ****${account.last4}` : ''}</small>
              <AnimatedMoney value={account.balance} currency={accountCurrency(account, currency)} className="macc-sheet-balance" />
            </div>
          </div>

          {/* Segundo saldo: al mismo peso que el principal, no como nota al
              pie. Son dos deudas reales y se pagan por separado. */}
          {secondary && (
            <div className="sacc-card-balances">
              <div className="sacc-bal">
                <span className="sacc-bal-label">
                  {getCurrencyMeta(accountCurrency(account, currency)).flag} {accountCurrency(account, currency)}
                </span>
                <strong className={`sacc-bal-value${account.balance < 0 ? ' owed' : ' clear'}`}>
                  {fmtVal(account.balance, accountCurrency(account, currency))}
                </strong>
              </div>
              <div className="sacc-bal">
                <span className="sacc-bal-label">
                  {getCurrencyMeta(account.secondaryCurrency!).flag} {account.secondaryCurrency}
                </span>
                <strong className={`sacc-bal-value${(account.secondaryBalance ?? 0) < 0 ? ' owed' : ' clear'}`}>
                  {fmtVal(account.secondaryBalance ?? 0, account.secondaryCurrency!)}
                </strong>
              </div>
            </div>
          )}

          {/* Misma barra que la lista (`sacc-util`): antes la hoja tenia su
              propia version con clases de Reportes, asi que el mismo dato se
              veia distinto en dos sitios de la misma pantalla. */}
          {utilPct !== null && account.limit && (
            <div className="sacc-util">
              <div className="sacc-util-head">
                <span className="sacc-util-label">{t('creditUsedLabel')}</span>
                <span className={`sacc-util-value ${band}`}>
                  {Math.round(utilPct)}% · {fmtVal(Math.max(0, account.limit - used!), accountCurrency(account, currency))}
                </span>
              </div>
              <div
                className="sacc-util-track"
                role="progressbar"
                aria-valuenow={Math.round(utilPct)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${t('creditUsedLabel')} ${account.name}`}
              >
                <div className={`sacc-util-fill ${band}`} style={{ width: `${Math.max(2, utilPct)}%` }} />
              </div>
            </div>
          )}

          {/* El ciclo es lo que convierte un saldo en una TARJETA: sin corte y
              fecha de pago, el numero no tiene consecuencia. */}
          {cycle && (cycle.statementDate || cycle.paymentDate || minPay !== null) && (
            <dl className="sacc-cycle">
              <div>
                <dt>{t('cycleStatement')}</dt>
                <dd>{cycle.statementDate ? formatCycleDate(cycle.statementDate, lang) : '—'}</dd>
              </div>
              <div>
                <dt>{t('cyclePayment')}</dt>
                <dd className={cycle.paymentSoon ? 'urgent' : ''}>
                  {cycle.paymentDate ? formatCycleDate(cycle.paymentDate, lang) : '—'}
                </dd>
              </div>
              <div>
                <dt>{t('cycleMinimum')}</dt>
                {/* Un dato ausente es '—', nunca 0: minimo cero y minimo
                    desconocido son cosas distintas. */}
                <dd>{minPay !== null ? fmtVal(minPay, accountCurrency(account, currency)) : '—'}</dd>
              </div>
            </dl>
          )}

          {/* Solo con saldo Y tasa configurada. El aviso dice el costo en
              dinero y tiempo, no el porcentaje: "24% anual" no significa nada
              al leerlo de pasada; "4 anos y RD$14,209" si. */}
          {payoff && used !== null && used > 0 && (
            <p className="macc-interest-warn">
              <Icon name="alert" size={14} />
              {payoff.never
                ? t('minOnlyNever')
                : t('minOnlyWarning')
                    .replace('{time}', humanMonths(payoff.months, t))
                    .replace('{interest}', fmtVal(payoff.totalInterest, accountCurrency(account, currency)))}
            </p>
          )}

          {/* Trend chart */}
          <div className="macc-trend">
            {/* ACCIONES, arriba y no al fondo. "Conciliar" vivia despues de la
                lista de actividad: es lo que arregla "mi banco dice otra cosa"
                y habia que hacer scroll por toda la ficha para encontrarlo.
                "Pagar tarjeta" es la accion #1 de una tarjeta y estaba a tres
                toques detras de un "Transferir" generico. */}
            <div className="sacc-actions">
              {account.type === 'credit' && creditUsed(account.balance) > 0 && (
                <button className="sacc-action primary" onClick={() => setPaying(true)}>
                  <Icon name="banknote" size={16} />
                  {t('payCardLabel')}
                </button>
              )}
              <button className="sacc-action" onClick={() => setReconciling(true)}>
                <Icon name="check" size={16} />
                {t('reconcileShort')}
              </button>
              <button className="sacc-action" onClick={() => onEdit(account)}>
                <Icon name="edit" size={16} />
                {t('edit')}
              </button>
            </div>

            <p className="mrep-tools-heading">{t('last6Months')}</p>
            <div className="macc-trend-chart">
              {series.map(b => (
                <div key={b.key} className="macc-trend-col">
                  <div className="macc-trend-bars">
                    <div className="macc-trend-bar in" style={{ height: `${b.inflow / maxVal * 100}%` }} title={fmtVal(b.inflow, currency)} />
                    <div className="macc-trend-bar out" style={{ height: `${b.outflow / maxVal * 100}%` }} title={fmtVal(b.outflow, currency)} />
                  </div>
                  <small>{b.label}</small>
                </div>
              ))}
            </div>
            <div className="macc-trend-legend">
              <span><i className="macc-dot in" />{t('accountInflow')}</span>
              <span><i className="macc-dot out" />{t('accountOutflow')}</span>
            </div>
          </div>

          {/* Recent activity */}
          <div className="macc-recent">
            <div className="macc-recent-head">
              <p className="mrep-tools-heading">{t('recentActivityLabel')}</p>
              {recent.length > 0 && (
                <button className="macc-view-all" onClick={onViewAll}>{t('viewAllLabel')}</button>
              )}
            </div>
            {recent.length === 0 ? (
              <p className="macc-empty">{t('noRecentActivity')}</p>
            ) : (
              <div className="macc-recent-list">
                {recent.map(tx => {
                  if (tx.type === 'transfer') {
                    const isOutflow = tx.fromAccount === account.id
                    return (
                      <div key={tx.id} className="mobile-tx-row">
                        <span className="mobile-transfer-icon"><Icon name="repeat" size={24} /></span>
                        <span>
                          <b>{t('transfer')}</b>
                          <small>{getAccount(tx.fromAccount, accounts)?.name} → {getAccount(tx.toAccount, accounts)?.name}</small>
                        </span>
                        <strong className={isOutflow ? '' : 'income'}>{isOutflow ? '−' : '+'}{fmtVal(tx.amount, currency)}</strong>
                      </div>
                    )
                  }
                  const cat = getCategory(tx.categoryId, categories)
                  const income = tx.type === 'income'
                  return (
                    <div key={tx.id} className="mobile-tx-row">
                      <CatBadge category={cat} size={40} />
                      <span>
                        <b>{tx.note}</b>
                        <small>{cat ? translateCategoryName(cat, lang) : t('noCategoryLabel')}</small>
                      </span>
                      <strong className={income ? 'income' : ''}>{income ? '+' : '−'}{fmtVal(tx.amount, currency)}</strong>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      </section>
    </div>
    </SheetPortal>

    {paying && (
      <PayCardSheet
        card={account}
        onClose={() => setPaying(false)}
        onDone={() => { setPaying(false); onClose() }}
      />
    )}

    {reconciling && (
      <MobileAmountSheet
        title={t('reconcileAccountLabel')}
        value={account.balance}
        currency={accountCurrency(account, currency)}
        allowNegative={account.type === 'credit'}
        onDone={handleReconcile}
        onClose={() => setReconciling(false)}
      />
    )}
    </>
  )
}

function AccountActivitySheet({ account, onClose, onEditTx, onDeleteTx }: {
  account: Account
  onClose: () => void
  onEditTx: (transaction: Transaction) => void
  onDeleteTx?: (id: string) => void
}) {
  const { transactions } = useFinance()
  const t = useT()

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const activity = useMemo(
    () => accountActivity(transactions, account.id).slice().sort((a, b) => b.date.localeCompare(a.date)),
    [transactions, account.id],
  )

  return (
    <SheetPortal>
    <div ref={dialogRef} className="mobile-search-overlay" role="dialog" aria-modal="true" aria-label={account.name}>
      <div className="mobile-search-head">
        <button onClick={onClose}>{t('close')}</button>
        <strong>{account.name}</strong>
        <span />
      </div>
      <MobileTransactionList transactions={activity} onEdit={onEditTx} onDelete={onDeleteTx} />
    </div>
    </SheetPortal>
  )
}

function getOverdraftOptions(t: ReturnType<typeof useT>): { value: OverdraftPolicy | ''; label: string }[] {
  return [
    { value: '',       label: t('globalLabel') },
    { value: 'block',  label: t('overdraftBlock') },
    { value: 'warn',   label: t('overdraftWarn') },
    { value: 'allow',  label: t('overdraftAllow') },
  ]
}

type SubSheet = 'balance' | 'limit' | 'short' | 'last4' | 'accCurrency'
  | 'secondCurrency' | 'secondBalance' | 'statementDay' | 'paymentDay'
  | 'apr' | 'minPct' | 'network' | 'bank' | 'secondLimit' | null

function AccountEditorSheet({
  account,
  onClose,
  onSave,
  onDelete,
}: {
  account?: Account
  onClose: () => void
  onSave: (fields: Omit<Account, 'id'>) => void
  onDelete?: (account: Account) => void
}) {
  const { currency } = useFinance()
  const t = useT()
  const TYPE_META = getTypeMeta(t)
  const OVERDRAFT_OPTIONS = getOverdraftOptions(t)
  const [fields, setFields] = useState<Omit<Account, 'id'>>(account ?? EMPTY_ACCOUNT)
  const [confirmDel, setConfirmDel] = useState(false)
  const allAccounts = useFinance(st => st.accounts)
  // Tipos que este editor puede ofrecer: excluye efectivo si ya existe, salvo
  // que la cuenta que se edita SEA el efectivo.
  const allowedTypes = creatableTypes(allAccounts, account?.type)
  const [sub, setSub] = useState<SubSheet>(null)

  const patch = <K extends keyof typeof fields>(key: K, val: typeof fields[K]) =>
    setFields(cur => {
      const next = { ...cur, [key]: val }
      // Al escribir el nombre se PROPONE la red ("Visa Clasica" -> Visa), pero
      // solo si el usuario no eligio una: una sugerencia nunca pisa una
      // decision suya.
      if (key === 'name' && !cur.network && canHaveNetwork(next.type)) {
        const guessed = guessNetwork(String(val))
        if (guessed) next.network = guessed
      }
      if (key === 'name' && !cur.bankId) {
        const bank = guessBank(String(val))
        if (bank) next.bankId = bank.id
      }
      return next
    })

  useMobileBackDismiss(sub !== null, () => setSub(null))
  useMobileBackDismiss(sub === null, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, sub === null)

  const row = (
    label: string,
    icon: Parameters<typeof Icon>[0]['name'],
    display: string,
    dim: boolean,
    target: SubSheet,
  ) => (
    <button className="mpr-form-row" onClick={() => setSub(target)}>
      <Icon name={icon} size={15} style={{ color: 'var(--m-muted)', flexShrink: 0 }} />
      <span className="mpr-form-row-label">{label}</span>
      <span className={dim ? 'mpr-form-row-dim' : 'mpr-form-row-val'}>{display}</span>
      <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)', flexShrink: 0 }} />
    </button>
  )

  return (
    <>
      <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet mpr-editor-overlay" role="dialog" aria-modal="true" onClick={onClose}>
        <section className="mpr-editor-sheet" onClick={e => e.stopPropagation()}>

          {/* Header compacto con icono dinámico */}
          <header className="mpr-editor-header">
            <div className="mpr-editor-header-icon" style={{ background: fields.color + '28', color: fields.color }}>
              <Icon name={TYPE_META[fields.type].icon} size={22} />
            </div>
            <input
              className="mpr-editor-name-input"
              value={fields.name}
              placeholder={t('accountNamePlaceholder')}
              autoCapitalize="words"
              onChange={e => patch('name', e.target.value)}
            />
            <button className="mpr-editor-close" aria-label={t('close')} onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </header>

          <div className="mpr-editor-body">

            {/* Tipo */}
            <div className="mpr-field-group">
              <span className="mpr-group-label">{t('type')}</span>
              <div className="mpr-form-section">
                {/* Efectivo deja de ofrecerse cuando ya existe: un control
                    que no se puede usar no debe estar activo. */}
                {(Object.entries(TYPE_META) as [AccountType, typeof TYPE_META[AccountType]][])
                  .filter(([type]) => allowedTypes.includes(type))
                  .map(([type, meta]) => (
                  <button
                    key={type}
                    className={`mpr-type-pill${fields.type === type ? ' on' : ''}`}
                    style={fields.type === type ? { borderColor: fields.color, background: fields.color + '20', color: fields.color } : {}}
                    onClick={() => patch('type', type)}
                  >
                    <Icon name={meta.icon} size={14} />
                    {meta.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Color */}
            <div className="mpr-field-group">
              <span className="mpr-group-label">{t('color')}</span>
              <div className="mpr-form-section mpr-color-strip">
                {COLORS.map(c => (
                  <button
                    key={c}
                    className={`mpr-color-dot${fields.color === c ? ' on' : ''}`}
                    style={{ background: c, color: c }}
                    onClick={() => patch('color', c)}
                  />
                ))}
              </div>
            </div>

            {/* Filas tapeables */}
            <span className="mpr-group-label mpr-group-label-rows">{t('detailsLabel')}</span>
            <div className="mpr-form-rows">
              {row(t('balance'), 'coins',
                fields.balance !== 0 ? fmt(fields.balance, fields.currency ?? currency) : '0.00',
                fields.balance === 0, 'balance')}

              {row(t('currency'), 'dollar',
                fields.currency && fields.currency !== currency
                  ? fields.currency
                  : `${currency} · ${t('accountCurrencyDefault')}`,
                !fields.currency || fields.currency === currency, 'accCurrency')}

              {/* BANCO: se elige de una lista, nunca se escribe. Con texto
                  libre el id no coincide y las comisiones automaticas dejan de
                  aplicarse sin que nada lo indique. */}
              {fields.type !== 'cash' && row(t('bankLabel'), 'landmark',
                findBank(fields.bankId)?.name ?? t('notSetLabel'),
                !fields.bankId, 'bank')}

              {/* Red de la tarjeta: solo donde hay plastico. */}
              {canHaveNetwork(fields.type) && row(t('cardNetworkLabel'), 'cards',
                fields.network ? (networkMeta(fields.network)?.name ?? fields.network) : t('notSetLabel'),
                !fields.network, 'network')}

              {fields.type === 'credit' && row(t('creditLimitLabel'), 'cards',
                fields.limit ? fmt(fields.limit, fields.currency ?? currency) : t('noLimitLabel'),
                !fields.limit, 'limit')}

              {/* Segundo saldo: una tarjeta dominicana casi siempre arrastra
                  una deuda en pesos y otra en dolares, y se pagan aparte. */}
              {fields.type === 'credit' && row(t('secondCurrencyLabel'), 'dollar',
                fields.secondaryCurrency
                  ? `${getCurrencyMeta(fields.secondaryCurrency).flag} ${fields.secondaryCurrency}`
                  : t('noneLabel'),
                !fields.secondaryCurrency, 'secondCurrency')}

              {fields.type === 'credit' && fields.secondaryCurrency && row(
                t('secondBalanceLabel'), 'coins',
                fmt(fields.secondaryBalance ?? 0, fields.secondaryCurrency),
                !fields.secondaryBalance, 'secondBalance')}

              {/* Cupo PROPIO de la linea extranjera. Se construyo el modelo y
                  el calculo pero faltaba la fila: el campo existia y nadie
                  podia fijarlo — el mismo hueco que tenia `bankId`. */}
              {fields.type === 'credit' && fields.secondaryCurrency && row(
                t('secondLimitLabel'), 'cards',
                fields.secondaryLimit
                  ? fmt(fields.secondaryLimit, fields.secondaryCurrency)
                  : t('sharedLimitLabel'),
                !fields.secondaryLimit, 'secondLimit')}

              {fields.type === 'credit' && row(t('statementDayLabel'), 'calendar',
                fields.statementDay ? t('dayOfMonth').replace('{d}', String(fields.statementDay)) : t('notSetLabel'),
                !fields.statementDay, 'statementDay')}

              {fields.type === 'credit' && row(t('paymentDayLabel'), 'calendar',
                fields.paymentDay ? t('dayOfMonth').replace('{d}', String(fields.paymentDay)) : t('notSetLabel'),
                !fields.paymentDay, 'paymentDay')}

              {fields.type === 'credit' && row(t('aprLabel'), 'trend',
                fields.apr ? `${fields.apr}%` : t('notSetLabel'),
                !fields.apr, 'apr')}

              {fields.type === 'credit' && row(t('minPaymentPctLabel'), 'receipt',
                fields.minPaymentPct ? `${fields.minPaymentPct}%` : t('notSetLabel'),
                !fields.minPaymentPct, 'minPct')}

              {row(t('labelField'), 'edit',
                fields.short || t('add'),
                !fields.short, 'short')}

              {row(t('last4Label'), 'cards',
                fields.last4 ? `****${fields.last4}` : t('optionalLabel'),
                !fields.last4, 'last4')}
            </div>

            {/* Sobregiro (solo no crédito) */}
            {fields.type !== 'credit' && (
              <div className="mpr-form-section mpr-overdraft-row">
                <span className="mpr-overdraft-label">{t('overdraft')}</span>
                <div className="mpr-pill-row">
                  {OVERDRAFT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      className={`mpr-pill${(fields.overdraftPolicy ?? '') === opt.value ? ' on' : ''}`}
                      style={(fields.overdraftPolicy ?? '') === opt.value
                        ? { borderColor: fields.color, background: fields.color + '22', color: fields.color }
                        : {}}
                      onClick={() => patch('overdraftPolicy', (opt.value || undefined) as OverdraftPolicy | undefined)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Incluir en balance total (no aplica a tarjetas de crédito) */}
            {fields.type !== 'credit' && (
              <div className="mpr-form-section mpr-toggle-row">
                <div className="mpr-toggle-row-text">
                  <span className="mpr-toggle-row-label">{t('includeInTotalLabel')}</span>
                  <small className="mpr-toggle-row-desc">{t('includeInTotalDesc')}</small>
                </div>
                <label className="mset-toggle-wrap">
                  <input
                    type="checkbox"
                    className="mset-toggle-input"
                    checked={fields.includeInTotal !== false}
                    onChange={e => patch('includeInTotal', e.target.checked ? undefined : false)}
                  />
                  <span className="mset-toggle" />
                </label>
              </div>
            )}

            {/* El EFECTIVO no se borra: es la cuenta base de la app y siempre
                hay un bolsillo. Se puede vaciar, no eliminar. En vez del boton
                se explica por que, y hacia donde ir si lo que querian era
                guardar dinero aparte. */}
            {account && account.type === 'cash' && (
              <p className="sacc-locked-note">
                <Icon name="info" size={13} />
                {t('cashIsSingleHint')}
              </p>
            )}

            {/* Eliminar */}
            {account && onDelete && canDeleteAccountType(account) && (
              !confirmDel
                ? <button className="mpr-del-btn" onClick={() => setConfirmDel(true)}>
                    <Icon name="trash" size={15} /> {t('deleteAccountLabel')}
                  </button>
                : <div className="mpr-confirm-del">
                    <p>{t('deleteItemConfirmTitle').replace('{name}', account.name)}</p>
                    <div>
                      <button onClick={() => setConfirmDel(false)}>{t('cancel')}</button>
                      <button className="danger" onClick={() => onDelete(account)}>
                        <Icon name="trash" size={15} /> {t('delete')}
                      </button>
                    </div>
                  </div>
            )}
          </div>

          <div className="mpr-editor-actions">
            <button className="mpr-btn-cancel" onClick={onClose}>{t('cancel')}</button>
            <button className="mpr-btn-save" style={{ background: fields.color }} onClick={() => onSave(fields)}>
              {account ? t('save') : t('createAccount')}
            </button>
          </div>
        </section>
      </div>
      </SheetPortal>

      {sub === 'balance' && (
        <MobileAmountSheet
          title={t('initialBalanceLabel')}
          value={fields.balance}
          currency={fields.currency ?? currency}
          allowNegative
          onDone={v => { patch('balance', v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'limit' && (
        <MobileAmountSheet
          title={t('creditLimitTitle')}
          value={fields.limit ?? 0}
          currency={fields.currency ?? currency}
          onDone={v => { patch('limit', v || undefined); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'secondBalance' && fields.secondaryCurrency && (
        <MobileAmountSheet
          title={t('secondBalanceTitle')}
          value={Math.abs(fields.secondaryBalance ?? 0)}
          currency={fields.secondaryCurrency}
          onDone={v => {
            // La deuda de tarjeta se guarda NEGATIVA, igual que `balance`: el
            // usuario teclea 312 y el libro guarda -312.
            patch('secondaryBalance', v ? -Math.abs(v) : 0)
            setSub(null)
          }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'secondLimit' && fields.secondaryCurrency && (
        <MobileAmountSheet
          title={t('secondLimitLabel')}
          value={fields.secondaryLimit ?? 0}
          currency={fields.secondaryCurrency}
          onDone={v => { patch('secondaryLimit', v || undefined); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'statementDay' && (
        <DayOfMonthSheet
          title={t('statementDayTitle')}
          hint={t('statementDayHint')}
          value={fields.statementDay}
          onDone={v => { patch('statementDay', v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'paymentDay' && (
        <DayOfMonthSheet
          title={t('paymentDayTitle')}
          hint={t('paymentDayHint')}
          value={fields.paymentDay}
          onDone={v => { patch('paymentDay', v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'apr' && (
        <PercentSheet
          title={t('aprTitle')}
          hint={t('aprHint')}
          value={fields.apr}
          max={200}
          onDone={v => { patch('apr', v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'minPct' && (
        <PercentSheet
          title={t('minPaymentPctTitle')}
          hint={t('minPaymentPctHint')}
          value={fields.minPaymentPct}
          max={100}
          onDone={v => { patch('minPaymentPct', v); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'bank' && (
        <MobileBankPicker
          value={fields.bankId}
          onPick={id => { patch('bankId', id); setSub(null) }}
          onClose={() => setSub(null)}
        />
      )}

      {sub === 'network' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section className="mcur-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('cardNetworkLabel')}</span>
              <button aria-label={t('close')} onClick={() => setSub(null)}><Icon name="close" size={18} /></button>
            </header>
            <p className="mcur-subtitle">{t('cardNetworkHint')}</p>
            <div className="mcur-list">
              <button
                className={`mcur-row${!fields.network ? ' on' : ''}`}
                onClick={() => { patch('network', undefined); setSub(null) }}
              >
                <span className="mcur-flag"><Icon name="close" size={16} /></span>
                <div className="mcur-info"><strong>{t('noneLabel')}</strong></div>
              </button>
              {CARD_NETWORKS.map(n => (
                <button
                  key={n.id}
                  className={`mcur-row${fields.network === n.id ? ' on' : ''}`}
                  onClick={() => { patch('network', n.id); setSub(null) }}
                >
                  <span className="mcur-flag"><NetworkMark network={n.id} size={26} /></span>
                  <div className="mcur-info"><strong>{n.name}</strong></div>
                  <div className="mcur-right">
                    {fields.network === n.id && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
        </SheetPortal>
      )}

      {sub === 'secondCurrency' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section className="mcur-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('secondCurrencyTitle')}</span>
              <button aria-label={t('close')} onClick={() => setSub(null)}><Icon name="close" size={18} /></button>
            </header>
            <p className="mcur-subtitle">{t('secondCurrencyHint')}</p>
            <div className="mcur-list">
              <button
                className={`mcur-row${!fields.secondaryCurrency ? ' on' : ''}`}
                onClick={() => {
                  patch('secondaryCurrency', undefined)
                  patch('secondaryBalance', undefined)
                  setSub(null)
                }}
              >
                <span className="mcur-flag"><Icon name="close" size={16} /></span>
                <div className="mcur-info"><strong>{t('noneLabel')}</strong><small>{t('singleCurrencyCardHint')}</small></div>
              </button>
              {CURRENCY_LIST
                // La divisa principal de la tarjeta no puede ser tambien la
                // secundaria: serian el mismo saldo dos veces.
                .filter(c => c.code !== (fields.currency ?? currency))
                .map(c => {
                  const selected = fields.secondaryCurrency === c.code
                  return (
                    <button
                      key={c.code}
                      className={`mcur-row${selected ? ' on' : ''}`}
                      onClick={() => {
                        patch('secondaryCurrency', c.code)
                        if (fields.secondaryBalance === undefined) patch('secondaryBalance', 0)
                        setSub(null)
                      }}
                    >
                      <span className="mcur-flag">{c.flag}</span>
                      <div className="mcur-info"><strong>{c.code}</strong><small>{c.name}</small></div>
                      <div className="mcur-right">{selected && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}</div>
                    </button>
                  )
                })}
            </div>
          </section>
        </div>
        </SheetPortal>
      )}
      {sub === 'accCurrency' && (
        <SheetPortal>
        <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setSub(null)}>
          <section className="mcur-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('accountCurrencyTitle')}</span>
              <button aria-label={t('close')} onClick={() => setSub(null)}><Icon name="close" size={18} /></button>
            </header>
            <p className="mcur-subtitle">{t('accountCurrencyHint')}</p>
            <div className="mcur-list">
              {CURRENCY_LIST.map(c => {
                const selected = (fields.currency ?? currency) === c.code
                return (
                  <button
                    key={c.code}
                    className={`mcur-row${selected ? ' on' : ''}`}
                    onClick={() => { patch('currency', c.code === currency ? undefined : c.code); setSub(null) }}
                  >
                    <span className="mcur-flag">{c.flag}</span>
                    <div className="mcur-info">
                      <strong>{c.code}</strong>
                      <small>{c.name}{c.code === currency ? ` · ${t('accountCurrencyDefault')}` : ''}</small>
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
        </SheetPortal>
      )}
      {sub === 'short' && (
        <MobileTextSheet
          title={t('labelField')}
          value={fields.short}
          placeholder={t('egAccountLabel')}
          maxLength={12}
          onDone={v => patch('short', v)}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'last4' && (
        <MobileDigitSheet
          title={t('last4DigitsTitle')}
          value={fields.last4 ?? ''}
          maxDigits={4}
          onDone={v => patch('last4', v || null)}
          onClose={() => setSub(null)}
        />
      )}
    </>
  )
}

/** Fecha del ciclo en formato corto ("25 sep"): el ano sobra, el ciclo es mensual. */
function formatCycleDate(date: string, lang: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })
}

/**
 * Meses como tiempo humano. "50 meses" obliga a dividir mentalmente; "4 anos y
 * 2 meses" se entiende de golpe, y esa comprension inmediata es todo el punto
 * del aviso de interes.
 */
function humanMonths(months: number, t: ReturnType<typeof useT>): string {
  const years = Math.floor(months / 12)
  const rest = months % 12
  return years > 0
    ? t('yearsMonths').replace('{y}', String(years)).replace('{m}', String(rest))
    : t('monthsOnly').replace('{m}', String(months))
}


/**
 * PAGAR TARJETA.
 *
 * Un pago de tarjeta es una transferencia desde una cuenta de dinero real
 * hacia la tarjeta. Antes había que salir a la pantalla de crear, elegir
 * "Transferencia", buscar las dos cuentas y teclear el monto: cuatro pasos
 * para la acción más frecuente que tiene una tarjeta.
 *
 * Aquí se resuelve en la misma ficha: de dónde sale y cuánto.
 */
function PayCardSheet({
  card,
  onClose,
  onDone,
}: {
  card: Account
  onClose: () => void
  onDone: () => void
}) {
  const t = useT()
  const fmtVal = useFmt()
  const { accounts, currency, transfer } = useFinance()
  const { submitting, beginSubmit, endSubmit } = useSubmitGuard()
  const [fromId, setFromId] = useState('')
  const [amountSheet, setAmountSheet] = useState(false)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  // Solo cuentas con dinero real: no se paga una tarjeta con otra tarjeta.
  const sources = accounts.filter(a => a.type !== 'credit' && a.id !== card.id)
  const owed = creditUsed(card.balance)
  const minimum = minimumPayment(card)

  /**
   * @param amountInCard Monto EN LA DIVISA DE LA TARJETA.
   *
   * `transfer()` interpreta su `amount` en la divisa de la cuenta de ORIGEN,
   * no la de destino. Pagar RD$18,430 desde una cuenta en dólares enviaría
   * 18,430 DÓLARES si no se convierte aquí primero.
   */
  const pay = (amountInCard: number) => {
    if (!fromId || amountInCard <= 0) return
    const source = accounts.find(a => a.id === fromId)
    if (!source) return
    const cardCur = accountCurrency(card, currency)
    const sourceCur = accountCurrency(source, currency)
    const amount = cardCur === sourceCur
      ? amountInCard
      : convertCurrency(amountInCard, cardCur, sourceCur)

    if (!beginSubmit()) return
    try {
      transfer({
        fromAccount: fromId,
        toAccount: card.id,
        amount,
        date: localToday(),
        note: t('payCardLabel'),
      })
      playSuccessHaptic()
      toast(t('cardPaymentRecorded'), { icon: 'check', type: 'ok' })
      onDone()
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
    } finally {
      endSubmit()
    }
  }

  return (
    <>
      <SheetPortal>
        <div ref={dialogRef} className="mobile-detail-sheet" style={{ zIndex: 430 }} role="dialog" aria-modal="true" onClick={onClose}>
          <section className="sacc-pay-sheet" onClick={e => e.stopPropagation()}>
            <header className="mbank-header">
              <span>{t('payCardLabel')}</span>
              <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
            </header>

            <div className="sacc-pay-owed">
              <small>{t('owedLabel')}</small>
              <strong>{fmtVal(owed, accountCurrency(card, currency))}</strong>
              {minimum !== null && minimum > 0 && (
                <span>{t('cycleMinimum')}: {fmtVal(minimum, accountCurrency(card, currency))}</span>
              )}
            </div>

            <p className="mbank-group-title">{t('fromAccountLabel')}</p>
            <div className="sacc-pay-sources">
              {sources.map(a => (
                <button
                  key={a.id}
                  className={`mbank-row${fromId === a.id ? ' on' : ''}`}
                  onClick={() => setFromId(a.id)}
                >
                  <span className="sacc-row-ico" style={{ background: `color-mix(in oklab, ${a.color} 16%, transparent)`, color: a.color }}>
                    <Icon name={a.type === 'cash' ? 'wallet' : a.type === 'savings' ? 'piggy' : 'cards'} size={17} />
                  </span>
                  <span className="mbank-info">
                    <strong>{a.name}</strong>
                    <small>{fmtVal(a.balance, accountCurrency(a, currency))}</small>
                  </span>
                  {fromId === a.id && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
                </button>
              ))}
              {sources.length === 0 && <p className="mbank-empty">{t('noSourceAccounts')}</p>}
            </div>

            {/* Atajos por el monto que la gente de verdad paga: el minimo o
                todo. Teclear el total exacto de memoria es el paso que hace
                que la gente posponga el pago. */}
            <div className="sacc-pay-quick">
              {minimum !== null && minimum > 0 && (
                <button disabled={!fromId || submitting} onClick={() => pay(minimum)}>
                  {t('payMinimum')}
                </button>
              )}
              <button disabled={!fromId || submitting} onClick={() => pay(owed)}>
                {t('payFull')}
              </button>
              <button className="ghost" disabled={!fromId || submitting} onClick={() => setAmountSheet(true)}>
                {t('payOther')}
              </button>
            </div>
          </section>
        </div>
      </SheetPortal>

      {amountSheet && (
        <MobileAmountSheet
          title={t('payCardLabel')}
          value={0}
          currency={accountCurrency(card, currency)}
          onDone={v => { setAmountSheet(false); pay(v) }}
          onClose={() => setAmountSheet(false)}
        />
      )}
    </>
  )
}
