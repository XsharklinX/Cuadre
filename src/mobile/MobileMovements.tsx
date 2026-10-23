import { useMemo, useState } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { accountBalanceInBase, accountCurrency, availableBalanceInBase, convertTxAmountsToBase, dateLocale, fmt, localToday, monthLabel, totals, transactionsForTotals, txForMonth, visibleAccounts } from '@/data/helpers'
import { creditUsed } from '@/data/creditCard'
import { backupNudge } from '@/data/backupNudge'
import { lastMonthClose, monthCloseAlertId } from '@/data/monthClose'
import { useDetectionHealth } from '@/hooks/useDetectionHealth'
import { weeklyDigest } from '@/data/weeklyDigest'
import { proactiveInsights } from '@/data/proactiveInsights'
import { translateCategoryName, useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { useFinance } from '@/store/finance'
import { useIncidents } from '@/store/incidents'
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
  onOpenBackup,
  onOpenDetection,
}: {
  mkey: string
  onAdd: () => void
  onEditTx: (tx: Transaction) => void
  onDeleteTx?: (id: string) => void
  onOpenSecurity?: () => void
  onOpenBackup?: () => void
  onOpenDetection?: () => void
}) {
  const { transactions, accounts, currency, categories, addTx } = useFinance()
  const { compactNumbers, appPin, appPattern, dismissedAlerts, dismissAlert, language,
    hiddenShowInMovements, hiddenCountInBalance, hiddenCountInSummary,
    lastManualBackupAt, lastWeeklyBackupAt, backupNudgeDismissedAt, dismissBackupNudge } = useSettings()
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const lang = (language ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)

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
  /*
   * LA RACHA YA NO VIVE AQUÍ.
   *
   * Estuvo una versión como tarjeta fija desde el tercer día, y era un error:
   * esta pantalla es para DINERO, y la racha es un apunte al margen ocupando
   * el sitio de más peso de la app. Un premio que te persigue todos los días
   * deja de ser un premio a los dos días.
   *
   * Sigue contándose (`loggingStreak`) y sigue celebrándose, pero solo en los
   * días redondos y FUERA de la app, como aviso. El contador se puede mirar en
   * Perfil quien quiera.
   */

  /*
   * EL MES QUE CIERRAS EN VERDE.
   *
   * Si sobró dinero, eso es exactamente lo que la app existe para ayudarte a
   * conseguir y merece decirse. Si el mes salió mal, no se dice nada: nadie
   * necesita que su teléfono le recuerde que se pasó.
   */
  const close = useMemo(
    () => lastMonthClose(convertTxAmountsToBase(transactions, accounts, currency), localToday()),
    [transactions, accounts, currency],
  )
  const closeDismissId = close ? monthCloseAlertId(close.monthKey) : null
  const showClose = !!close && !!closeDismissId && !dismissedAlerts.includes(closeDismissId)

  /*
   * EL DETECTOR CALLADO.
   *
   * `detectionHealth` ya existía y ya sabía distinguir «apagado» de «el
   * permiso está dado pero Android soltó el servicio» de «lleva diez días sin
   * captar nada». Lo que faltaba era que se viera: hasta ahora solo aparecía
   * en el centro de notificaciones, una pantalla a la que hay que entrar a
   * propósito — y el sentido entero de este aviso es que NO vas a entrar.
   */
  /*
   * EL FALLO, CONTADO EN EL MOMENTO.
   *
   * Un guardado que no ocurrió deja constancia aquí hasta que alguien la lee.
   * Va por delante de todo lo demás, incluido el detector: esto no es «algo
   * puede estar fallando», es «este dinero NO está anotado».
   */
  const incidents = useIncidents(s => s.items)
  const takeIncident = useIncidents(s => s.take)
  const dismissIncident = useIncidents(s => s.dismiss)
  const recordSaveFailure = useIncidents(s => s.recordSaveFailure)
  const topIncident = incidents[0]

  const retryIncident = (id: string) => {
    const incident = takeIncident(id)
    if (!incident) return
    try {
      addTx(incident.payload)
      toast(t('movementSaved'), { icon: 'check', type: 'ok' })
    } catch (error) {
      // Sigue sin poder guardarse: vuelve a la lista con el motivo NUEVO, que
      // puede no ser el de antes. Perderlo aquí sería borrar el intento justo
      // en el sitio que existe para no perderlo.
      recordSaveFailure(incident.payload, error instanceof Error ? error.message : t('couldNotSave'))
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
    }
  }

  const detection = useDetectionHealth()
  const detectionDismissId = detection ? `detection-${detection.state}-${detection.daysSilent ?? 'never'}` : null
  const showDetection = !!detection?.alert && !!detectionDismissId && !dismissedAlerts.includes(detectionDismissId)

  /*
   * LA COPIA DE SEGURIDAD, DICHA DONDE SE VE.
   *
   * Estos datos viven solo en este teléfono: no hay servidor ni cuenta. La
   * copia lleva versiones existiendo en Ajustes, esperando a que alguien entre
   * a buscarla, y nadie entra a Ajustes a hacer una copia.
   */
  const nudge = useMemo(() => {
    // La más reciente de las dos: da igual si la copia fue manual o semanal.
    const fechas = [lastManualBackupAt, lastWeeklyBackupAt].filter(Boolean) as string[]
    const ultima = fechas.length ? fechas.sort()[fechas.length - 1] : null
    return backupNudge({
      lastBackupAt: ultima,
      txCount: transactions.length,
      dismissedAt: backupNudgeDismissedAt,
      now: Date.now(),
    })
  }, [lastManualBackupAt, lastWeeklyBackupAt, transactions.length, backupNudgeDismissedAt])

  const [showBalanceBreakdown, setShowBalanceBreakdown] = useState(false)
  const showPinNudge = !!onOpenSecurity && !appPin && !appPattern
    && transactions.length >= PIN_NUDGE_MIN_TXNS && !dismissedAlerts.includes(PIN_NUDGE_ID)
  // Cuentas ocultas ("no incluidas"): el usuario decide dónde aparecen desde
  // Configuración. Preparamos ambos conjuntos (con y sin ocultas) y elegimos
  // según cada ajuste.
  const allMonthTx = txForMonth(convertTxAmountsToBase(transactions, accounts, currency), mkey)
  const visibleMonthTx = txForMonth(transactionsForTotals(transactions, accounts, currency, categories), mkey)
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
            <AnimatedMoney value={summary.income} compact={compactNumbers} fit />
          </strong>
        </article>
        <article className="mini-stat">
          <small>{t('expenses')}</small>
          <strong className="expense">
            <AnimatedMoney value={summary.expense} compact={compactNumbers} fit />
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
            <AnimatedMoney value={Math.abs(totalBalance)} compact={compactNumbers} fit />
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
              {/*
                LA TARJETA ENTERA, NO LA MITAD.
                Antes esta fila solo enseñaba la deuda en pesos. Una tarjeta
                dominicana arrastra DOS deudas que el banco liquida por
                separado —pesos y dólares—, así que quien debía US$ 39.80 veía
                un resumen que se callaba esa parte.
                Y decía solo lo que DEBES. Nadie mira su tarjeta en esos
                términos: la app del banco dice «Disponible», y esa es la cifra
                con la que se decide si se puede comprar algo. Ahora van las
                dos, y cada divisa en su línea.
              */}
              {creditAccounts.map(account => {
                const cardCur = accountCurrency(account, currency)
                const owed = creditUsed(account.balance)
                const avail = account.limit != null ? Math.max(0, account.limit - owed) : null
                const secCur = account.secondaryCurrency
                const secOwed = secCur ? creditUsed(account.secondaryBalance ?? 0) : 0
                return (
                  <div key={account.id} className="mhome-balance-card">
                    <div className="mhome-balance-row">
                      <span className="mobile-balance-dot" style={{ background: account.color }} />
                      <span className="mhome-balance-acct-name">{account.name}</span>
                      <strong className={owed > 0 ? 'expense' : 'muted-amt'}>
                        {fmt(owed, cardCur)}
                      </strong>
                    </div>
                    {/* La línea en divisa extranjera solo aparece si la tarjeta
                        la tiene: una tarjeta sin dólares no debe enseñar
                        "US$ 0.00" y hacer dudar al usuario. */}
                    {secCur && (
                      <div className="mhome-balance-row sub">
                        <span className="mhome-balance-acct-name">{secCur}</span>
                        <strong className={secOwed > 0 ? 'expense' : 'muted-amt'}>
                          {fmt(secOwed, secCur)}
                        </strong>
                      </div>
                    )}
                    <div className="mhome-balance-avail">
                      <span>{t('cardAvailableLabel')}</span>
                      <b>{avail !== null ? fmt(avail, cardCur) : t('cardNoLimitShort')}</b>
                    </div>
                  </div>
                )
              })}
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

      {/* ANTES QUE NADA: dinero que el usuario creyó anotar y no se anotó. */}
      {topIncident && (
        <div className="minc-card">
          <span className="minc-ico"><Icon name="alert" size={16} /></span>
          <div className="minc-body">
            <strong>{t('incidentSaveFailedTitle')}</strong>
            <p>
              {t('incidentSaveFailedWhat')
                .replace('{amount}', fmt(topIncident.payload.amount, currency))
                .replace('{when}', new Date(topIncident.at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))}
            </p>
            <p className="minc-why">{topIncident.message}</p>
            <div className="minc-actions">
              <button onClick={() => retryIncident(topIncident.id)}>{t('incidentRetry')}</button>
              <button className="ghost" onClick={() => dismissIncident(topIncident.id)}>{t('incidentDiscard')}</button>
            </div>
          </div>
          {incidents.length > 1 && <span className="minc-more">+{incidents.length - 1}</span>}
        </div>
      )}

      {/* Primero lo que está ROTO, que es lo único que no puede esperar: un
          detector muerto deja de anotar tus gastos sin decírtelo, y sin copia
          una pérdida del teléfono se lleva el libro entero. Las celebraciones
          van después. */}
      {showDetection && detection && (
        <div className="mhome-alert warn mhome-alert-standalone">
          <span className="mhome-alert-ico"><Icon name="alert" size={16} /></span>
          <p>
            <strong>{t(detection.state === 'no-access' ? 'detectionNoAccessTitle' : 'detectionSilentTitle')}</strong>
            {detection.daysSilent !== null
              ? t('detectionSilentDays').replace('{n}', String(detection.daysSilent))
              : t('detectionSilentNever')}
          </p>
          {onOpenDetection && (
            <button className="mhome-alert-action" onClick={onOpenDetection}>{t('detectionSilentAction')}</button>
          )}
          <button aria-label={t('dismissAlertLabel')} onClick={() => dismissAlert(detectionDismissId!)}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {nudge.show && (
        <div className="mhome-alert warn mhome-alert-standalone">
          <span className="mhome-alert-ico"><Icon name="shield" size={16} /></span>
          <p>
            <strong>
              {nudge.daysSince === null
                ? t('backupNeverTitle')
                : t('backupStaleTitle').replace('{n}', String(nudge.daysSince))}
            </strong>
            {t('backupNudgeText')}
          </p>
          {onOpenBackup && (
            <button className="mhome-alert-action" onClick={onOpenBackup}>{t('backupNudgeAction')}</button>
          )}
          <button aria-label={t('dismissAlertLabel')} onClick={dismissBackupNudge}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* El mes cerrado, por delante de los avisos de siempre: es noticia y
          solo dura unos días. */}
      {showClose && close && (
        <div className="mclose-card">
          <button className="mclose-dismiss" aria-label={t('dismiss')} onClick={() => dismissAlert(closeDismissId!)}>
            <Icon name="close" size={14} />
          </button>
          <span className="mclose-label">{t('monthCloseTitle').replace('{month}', monthLabel(close.monthKey, locale))}</span>
          <strong className="mclose-net">
            +<AnimatedMoney value={close.net} compact={compactNumbers} fit />
          </strong>
          <small>
            {t('monthCloseLeftover')}
            {' · '}
            {close.greenRun > 1
              ? t('monthCloseRun').replace('{n}', String(close.greenRun))
              : close.prevNet !== null && close.net > close.prevNet
                ? t('monthCloseBetter')
                : t('monthCloseSame')}
          </small>
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
              {/* Los centavos dependen de la preferencia del usuario, no de
                  esta pantalla. Estaban forzados a cero aqui, asi que "Tu
                  semana" mostraba RD$ 1,900 mientras el resto de la app
                  mostraba RD$ 1,900.00. */}
              <strong>{fmt(digest.expense, currency, { decimals: moneyDecimals })}</strong>
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
          <EmptyArt kind="movements" />
          <strong>{t('noMovementsTitle')}</strong>
          <p>{t('noMovementsMonth')}</p>
          <button onClick={onAdd}>{t('addMovement')}</button>
        </div>
      )}
    </div>
  )
}

