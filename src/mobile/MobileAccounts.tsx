import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { CatBadge } from '@/views/shared'
import { ACCENT_COLORS } from '@/constants'
import { accountActivity, accountBalanceInBase, accountCurrency, dateLocale, fmt, getAccount, getCategory, monthlyAccountSeries, visibleAccounts } from '@/data/helpers'
import { CURRENCIES as CURRENCY_LIST, getCurrencyMeta } from '@/data/currencies'
import {
  creditCycle, creditUsedInPrimary, creditUtilization, hasSecondaryBalance,
  minimumPayment, projectMinimumPayoff, utilizationBand,
} from '@/data/creditCard'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { playAccountsSound, playConfirmSound, playDeleteSound } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { translateCategoryName, useT } from '@/i18n'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useSubmitGuard } from './useSubmitGuard'
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
  const { accounts, transactions, currency, addAccount, updateAccount, deleteAccount, restoreAccount } = useFinance()
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
  const [expandedId, setExpandedId] = useState<string | null>(null)
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

  const groups = [t('cash'), t('bankAccountsGroupLabel'), t('creditCardsGroupLabel')].map(group => ({
    group,
    accounts: accounts.filter(a => TYPE_META[a.type].group === group),
    visibleTotal: accounts
      .filter(a => a.includeInTotal !== false && TYPE_META[a.type].group === group)
      .reduce((s, a) => s + accountBalanceInBase(a, currency), 0),
  })).filter(g => g.accounts.length)

  return (
    <div className="mrep-root">

      {/* Net worth hero */}
      <div className="mrep-hero">
        <span className="mrep-hero-label">{t('netWorthLabel')}</span>
        <strong className="mrep-hero-value">{fmtVal(summary.net, currency)}</strong>
        <div className="mrep-hero-bar">
          {summary.assets + summary.liabilities > 0 && (
            <div
              className="mrep-hero-bar-fill"
              style={{ width: `${Math.min(100, summary.assets / (summary.assets + summary.liabilities) * 100)}%` }}
            />
          )}
        </div>
        <div className="mrep-hero-row">
          <div className="mrep-hero-stat">
            <span className="mrep-hero-dot asset" />
            <div>
              <small>{t('assetsLabel')}</small>
              <strong>{fmtVal(summary.assets, currency)}</strong>
            </div>
          </div>
          <div className="mrep-hero-stat">
            <span className="mrep-hero-dot debt" />
            <div>
              <small>{t('liabilitiesLabel')}</small>
              <strong>{fmtVal(summary.liabilities, currency)}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Section header */}
      <div className="macc-section-head">
        <span className="mrep-section-title">{t('accounts')}</span>
        <button className="mpr-add-btn" onClick={() => setEditingAccount('new')}>
          <Icon name="plus" size={15} /> {t('add')}
        </button>
      </div>

      {/* Las tres píldoras de conteo («3 cuentas · 2 bancarias · 1 tarjeta») se
          quitaron: eran contadores, no dinero, y ocupaban el mejor espacio de la
          pantalla. Lo que sí interesa por cuenta aparece ahora al tocarla. */}

      {accounts.length === 0 ? (
        <div className="mrep-empty">
          <Icon name="cards" size={40} style={{ opacity: .25 }} />
          <p>{t('noAccountsShort')}</p>
          <button onClick={() => setEditingAccount('new')}>{t('createAccount')}</button>
        </div>
      ) : (
        <>
          {/* La barra de distribución con leyenda se quitó: era decorativa y con
              4+ cuentas resultaba ilegible. El reparto ya se lee en los totales
              por grupo y en el saldo de cada cuenta. */}

          {/* Groups */}
          {groups.map(({ group, accounts: accs, visibleTotal }) => (
            <div key={group} className="mrep-group">
              <div className="mrep-group-header">
                <span>{group}</span>
                <strong>{fmtVal(visibleTotal, currency)}</strong>
              </div>
              {accs.map(a => {
                const used    = a.type === 'credit' && a.limit ? Math.abs(Math.min(0, a.balance)) : null
                const utilPct = used !== null && a.limit ? Math.min(100, used / a.limit * 100) : null
                const series  = monthlyAccountSeries(transactions, a.id, mkey, dateLocale(lang))
                const maxFlow = Math.max(1, ...series.map(s => Math.abs(s.inflow - s.outflow)))
                return (
                  <div key={a.id} className={`macc-item${expandedId === a.id ? ' open' : ''}`}>
                  <button
                    className="mrep-account-row"
                    aria-expanded={expandedId === a.id}
                    onClick={() => setExpandedId(id => id === a.id ? null : a.id)}
                  >
                    <span className="mrep-account-icon" style={{ background: a.color + '22', color: a.color }}>
                      <Icon name={TYPE_META[a.type].icon} size={20} />
                    </span>
                    <div className="mrep-account-info">
                      <b>
                        <span className="mrep-account-name">{a.name}</span>
                        {a.includeInTotal === false && (
                          <span className="mrep-excluded-badge">{t('excludedFromTotalBadge')}</span>
                        )}
                      </b>
                      <small>
                        {TYPE_META[a.type].label}
                        {a.last4 ? ` - ****${a.last4}` : ''}
                        {a.currency && a.currency !== currency ? ` · ${a.currency}` : ''}
                      </small>
                      {utilPct !== null && a.limit && (
                        <div className="mrep-util-wrap">
                          <div className="mrep-util-bar">
                            <div style={{
                              width: `${utilPct}%`,
                              background: utilPct >= 90 ? '#ff6b8a' : utilPct >= 70 ? '#f59e0b' : '#35d0a2',
                            }} />
                          </div>
                          <span className={utilPct >= 90 ? 'text-expense' : utilPct >= 70 ? 'text-warn' : ''}>
                            {t('pctUsedAvailable').replace('{pct}', String(Math.round(utilPct))).replace('{amount}', fmtVal(a.limit - used!, accountCurrency(a, currency)))}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="macc-spark" title={t('last6Months')}>
                      {series.map(b => {
                        const net = b.inflow - b.outflow
                        return (
                          <span
                            key={b.key}
                            className={`macc-spark-bar ${net >= 0 ? 'pos' : 'neg'}`}
                            style={{ height: `${Math.max(8, Math.round(Math.abs(net) / maxFlow * 100))}%` }}
                          />
                        )
                      })}
                    </div>
                    <strong className={accountKind(a) === 'debt' ? 'text-expense' : ''}>
                      {fmtVal(a.balance, accountCurrency(a, currency))}
                    </strong>
                    <Icon
                      name="arrowUp"
                      size={14}
                      style={{
                        transform: expandedId === a.id ? 'rotate(180deg)' : 'rotate(90deg)',
                        color: 'var(--m-muted)', flexShrink: 0,
                      }}
                    />
                  </button>
                  {expandedId === a.id && (() => {
                    const month = series[series.length - 1]
                    const moves = transactions.filter(tx =>
                      tx.date.startsWith(mkey)
                      && (tx.accountId === a.id || tx.fromAccount === a.id || tx.toAccount === a.id)).length
                    return (
                      <div className="macc-expand">
                        <div className="macc-expand-stats">
                          <div>
                            <small>{t('movementsThisMonth')}</small>
                            <b>{moves}</b>
                          </div>
                          <div>
                            <small>{t('accountInflow')}</small>
                            <b className="text-income">{fmtVal(month?.inflow ?? 0, currency)}</b>
                          </div>
                          <div>
                            <small>{t('accountOutflow')}</small>
                            <b className="text-expense">{fmtVal(month?.outflow ?? 0, currency)}</b>
                          </div>
                        </div>
                        <div className="macc-expand-actions">
                          <button onClick={() => setSelectedId(a.id)}>
                            <Icon name="chart" size={15} /> {t('viewDetailLabel')}
                          </button>
                          <button onClick={() => setEditingAccount(a)}>
                            <Icon name="edit" size={15} /> {t('edit')}
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                  </div>
                )
              })}
            </div>
          ))}
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
            <div className="macc-dual">
              <div className="macc-dual-cell">
                <span className="macc-dual-label">
                  {getCurrencyMeta(accountCurrency(account, currency)).flag} {accountCurrency(account, currency)}
                </span>
                <strong className={account.balance < 0 ? 'macc-dual-debt' : 'macc-dual-zero'}>
                  {fmtVal(account.balance, accountCurrency(account, currency))}
                </strong>
              </div>
              <div className="macc-dual-cell">
                <span className="macc-dual-label">
                  {getCurrencyMeta(account.secondaryCurrency!).flag} {account.secondaryCurrency}
                </span>
                <strong className={(account.secondaryBalance ?? 0) < 0 ? 'macc-dual-debt' : 'macc-dual-zero'}>
                  {fmtVal(account.secondaryBalance ?? 0, account.secondaryCurrency!)}
                </strong>
              </div>
            </div>
          )}

          {utilPct !== null && account.limit && (
            <div className="mrep-util-wrap">
              <div className="mrep-util-bar">
                {/* Deja un 2% visible con deuda cero: un canal totalmente
                    vacio se lee como un componente que no cargo. */}
                <div className={`macc-util-fill band-${band}`} style={{ width: `${Math.max(2, utilPct)}%` }} />
              </div>
              <span className={band === 'high' ? 'text-expense' : band === 'watch' ? 'text-warn' : ''}>
                {t('pctUsedAvailable')
                  .replace('{pct}', String(Math.round(utilPct)))
                  .replace('{amount}', fmtVal(account.limit - used!, accountCurrency(account, currency)))}
              </span>
            </div>
          )}

          {/* El ciclo es lo que convierte un saldo en una TARJETA: sin corte y
              fecha de pago, el numero no tiene consecuencia. */}
          {cycle && (cycle.statementDate || cycle.paymentDate || minPay !== null) && (
            <dl className="macc-cycle">
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

          <button className="macc-view-all" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }} onClick={() => setReconciling(true)}>
            <Icon name="check" size={14} style={{ marginRight: 4 }} />{t('reconcileAccountLabel')}
          </button>
        </div>
      </section>
    </div>
    </SheetPortal>

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
  | 'apr' | 'minPct' | null

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
  const [sub, setSub] = useState<SubSheet>(null)

  const patch = <K extends keyof typeof fields>(key: K, val: typeof fields[K]) =>
    setFields(cur => ({ ...cur, [key]: val }))

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
                {(Object.entries(TYPE_META) as [AccountType, typeof TYPE_META[AccountType]][]).map(([type, meta]) => (
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

            {/* Eliminar */}
            {account && onDelete && (
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
