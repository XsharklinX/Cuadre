import { useMemo, useState } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Icon } from '@/components/ui/Icon'
import { accountBalanceInBase, availableBalanceInBase, convertTxAmountsToBase, fmt, localToday, totals, transactionsForTotals, txForMonth, visibleAccounts } from '@/data/helpers'
import { weeklyDigest } from '@/data/weeklyDigest'
import { proactiveInsights } from '@/data/proactiveInsights'
import { translateCategoryName, useT } from '@/i18n'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { Transaction } from '@/types'
import { MobileTransactionList } from './MobileTransactionList'

const PIN_NUDGE_ID = 'pin-setup-nudge'
const PIN_NUDGE_MIN_TXNS = 3

export function MobileMovements({
  mkey,
  onAdd,
  onEditTx,
  onDeleteTx,
  onOpenSecurity,
}: {
  mkey: string
  onAdd: () => void
  onEditTx: (tx: Transaction) => void
  onDeleteTx?: (id: string) => void
  onOpenSecurity?: () => void
}) {
  const { transactions, accounts, currency, categories } = useFinance()
  const { compactNumbers, appPin, appPattern, dismissedAlerts, dismissAlert, language,
    hiddenShowInMovements, hiddenCountInBalance, hiddenCountInSummary } = useSettings()
  const t = useT()
  const lang = (language ?? 'es') as 'en' | 'es'

  // Resumen semanal proactivo: los últimos 7 días destilados. Se descarta por
  // semana (la clave lleva el inicio de semana), así reaparece cada lunes con
  // datos frescos en vez de quedar oculto para siempre.
  const digest = useMemo(() => weeklyDigest(transactions, categories, localToday()), [transactions, categories])
  const weeklyDismissId = `weekly-${digest.weekStart}`

  // Insights proactivos: el aviso accionable más urgente del mes (presupuesto a
  // punto de agotarse, gasto inusual, etc.), descartable por id.
  const insights = useMemo(() => proactiveInsights({
    txns: transactions, categories, mkey, today: localToday(),
    fmt: (n) => fmt(n, currency),
    translateCategory: (c) => translateCategoryName(c, lang),
  }), [transactions, categories, mkey, currency, lang])
  const topInsight = insights.find(i => !dismissedAlerts.includes(i.id))
  const showWeekly = digest.txCount > 0 && digest.expense > 0 && !dismissedAlerts.includes(weeklyDismissId)
  const topCategory = digest.topCategoryId ? categories.find(c => c.id === digest.topCategoryId) : undefined
  const [showBalanceBreakdown, setShowBalanceBreakdown] = useState(false)
  const showPinNudge = !!onOpenSecurity && !appPin && !appPattern
    && transactions.length >= PIN_NUDGE_MIN_TXNS && !dismissedAlerts.includes(PIN_NUDGE_ID)
  // Cuentas ocultas ("no incluidas"): el usuario decide dónde aparecen desde
  // Configuración. Preparamos ambos conjuntos (con y sin ocultas) y elegimos
  // según cada ajuste.
  const allMonthTx = txForMonth(convertTxAmountsToBase(transactions, accounts, currency), mkey)
  const visibleMonthTx = txForMonth(transactionsForTotals(transactions, accounts, currency), mkey)
  const monthTx = hiddenShowInMovements ? allMonthTx : visibleMonthTx     // lista
  const summary = totals(hiddenCountInSummary ? allMonthTx : visibleMonthTx) // ingresos/gastos
  const activeAccounts = visibleAccounts(accounts)
  const hiddenAccounts = accounts.filter(a => a.includeInTotal === false)
  // "Balance total" = dinero que REALMENTE tienes (efectivo, débito, ahorro). Las
  // tarjetas de crédito NO suman al total (es dinero del banco, no tuyo); su deuda
  // se muestra aparte en el desglose al tocar.
  const assetAccounts = activeAccounts.filter(a => a.type !== 'credit')
  const creditAccounts = activeAccounts.filter(a => a.type === 'credit')
  // Balance total = dinero disponible (sin crédito). Suma las cuentas ocultas
  // solo si el usuario lo activó en Configuración.
  const hiddenAssets = hiddenAccounts
    .filter(a => a.type !== 'credit')
    .reduce((s, a) => s + accountBalanceInBase(a, currency), 0)
  const totalBalance = availableBalanceInBase(accounts, currency) + (hiddenCountInBalance ? hiddenAssets : 0)
  const balancePositive = totalBalance >= 0
  const fmtMoney = (value: number) => new Intl.NumberFormat(undefined, {
    style: 'currency', currency,
    maximumFractionDigits: compactNumbers ? 0 : 2,
    minimumFractionDigits: compactNumbers ? 0 : 2,
  }).format(value)

  return (
    <div className="mobile-movements-screen">
      <section className="mobile-summary-strip mobile-summary-strip-movements">
        <article className="mini-stat">
          <small>{t('incomes')}</small>
          <strong className="income">
            <AnimatedMoney value={summary.income} compact={compactNumbers} />
          </strong>
        </article>
        <article className="mini-stat">
          <small>{t('expenses')}</small>
          <strong className="expense">
            <AnimatedMoney value={summary.expense} compact={compactNumbers} />
          </strong>
        </article>
        <button
          className="mini-stat mini-stat-button"
          aria-expanded={showBalanceBreakdown}
          aria-label={t('accounts')}
          onClick={() => setShowBalanceBreakdown(value => !value)}
        >
          <small>{t('totalBalance')}</small>
          <strong className={balancePositive ? 'income' : 'expense'}>
            {!balancePositive && '-'}
            <AnimatedMoney value={Math.abs(totalBalance)} compact={compactNumbers} />
          </strong>
        </button>
      </section>

      {showBalanceBreakdown && (activeAccounts.length > 0 || hiddenAccounts.length > 0) && (
        <div className="mhome-balance-breakdown mobile-balance-breakdown-inline">
          {assetAccounts.map(account => (
            <div key={account.id} className="mhome-balance-row">
              <span className="mobile-balance-dot" style={{ background: account.color }} />
              <span className="mhome-balance-acct-name">{account.name}</span>
              <strong className={account.balance < 0 ? 'expense' : ''}>{fmtMoney(account.balance)}</strong>
            </div>
          ))}
          {/* Tarjetas de crédito: aparte y con aviso de que NO cuentan en el total. */}
          {creditAccounts.length > 0 && (
            <>
              <div className="mhome-balance-credit-head">
                <span>{t('creditCardsGroupLabel')}</span>
                <small>{t('creditNotInTotal')}</small>
              </div>
              {creditAccounts.map(account => (
                <div key={account.id} className="mhome-balance-row">
                  <span className="mobile-balance-dot" style={{ background: account.color }} />
                  <span className="mhome-balance-acct-name">{account.name}</span>
                  <strong className={account.balance < 0 ? 'expense' : 'muted-amt'}>
                    {account.balance < 0 ? t('owedAmount').replace('{amount}', fmtMoney(Math.abs(account.balance))) : fmtMoney(0)}
                  </strong>
                </div>
              ))}
            </>
          )}
          {/* Cuentas ocultas ("no incluidas"): su saldo se ve aquí al tocar el
              total, aunque no cuente en el balance. */}
          {hiddenAccounts.length > 0 && (
            <>
              <div className="mhome-balance-credit-head">
                <span>{t('hiddenAccountsGroupLabel')}</span>
                <small>{t('creditNotInTotal')}</small>
              </div>
              {hiddenAccounts.map(account => (
                <div key={account.id} className="mhome-balance-row">
                  <span className="mobile-balance-dot" style={{ background: account.color }} />
                  <span className="mhome-balance-acct-name">{account.name}</span>
                  <strong className={account.balance < 0 ? 'expense' : 'muted-amt'}>{fmtMoney(account.balance)}</strong>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {topInsight && (
        <div className={`minsight-card minsight-${topInsight.severity}`}>
          <span className="minsight-ico"><Icon name={topInsight.icon} size={16} /></span>
          <div className="minsight-body">
            <strong>{t(topInsight.titleKey)}</strong>
            <p>{Object.entries(topInsight.params).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), t(topInsight.messageKey))}</p>
          </div>
          <button className="minsight-dismiss" aria-label={t('dismiss')} onClick={() => dismissAlert(topInsight.id)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {showWeekly && (
        <div className="mweek-card">
          <div className="mweek-head">
            <span className="mweek-title"><Icon name="chart" size={13} /> {t('weeklySummaryTitle')}</span>
            <button className="mweek-dismiss" aria-label={t('dismiss')} onClick={() => dismissAlert(weeklyDismissId)}>
              <Icon name="close" size={14} />
            </button>
          </div>
          <div className="mweek-body">
            <div className="mweek-main">
              <small>{t('weeklySpentLabel')}</small>
              <strong>{fmt(digest.expense, currency)}</strong>
              {digest.expenseDeltaPct !== null && (
                <span className={`mweek-delta ${digest.expenseDeltaPct > 0 ? 'up' : 'down'}`}>
                  <Icon name="arrowUp" size={11} style={{ transform: digest.expenseDeltaPct > 0 ? 'none' : 'rotate(180deg)' }} />
                  {Math.abs(Math.round(digest.expenseDeltaPct * 100))}% {t('weeklyVsLastWeek')}
                </span>
              )}
            </div>
            {topCategory && (
              <div className="mweek-top">
                <span className="mweek-top-dot" style={{ background: topCategory.color }} />
                <span className="mweek-top-name">{translateCategoryName(topCategory, lang)}</span>
                <strong>{fmt(digest.topCategoryAmount, currency)}</strong>
              </div>
            )}
          </div>
        </div>
      )}

      {showPinNudge && (
        <div className="mhome-alert warn mhome-alert-standalone">
          <span className="mhome-alert-ico"><Icon name="key" size={16} /></span>
          <p><strong>{t('pinNudgeTitle')}</strong>{t('pinNudgeText')}</p>
          <button className="mhome-alert-action" onClick={onOpenSecurity}>{t('pinNudgeAction')}</button>
          <button aria-label={t('dismissAlertLabel')} onClick={() => dismissAlert(PIN_NUDGE_ID)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {monthTx.length ? (
        <MobileTransactionList
          transactions={monthTx}
          onEdit={onEditTx}
          onDelete={onDeleteTx}
          showSearch={false}
          showFilters
          className="mobile-list-card-flat"
        />
      ) : (
        <div className="mobile-movements-empty">
          <span className="mobile-movements-empty-icon">
            <Icon name="list" size={22} />
          </span>
          <strong>{t('noMovementsTitle')}</strong>
          <p>{t('noMovementsMonth')}</p>
          <button onClick={onAdd}>{t('addMovement')}</button>
        </div>
      )}
    </div>
  )
}

