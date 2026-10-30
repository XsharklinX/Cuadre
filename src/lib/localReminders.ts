import { isReminderKindOn, type ReminderKind } from '@/data/reminderKinds'
import { tt } from '@/i18n'
import { isTauri } from '@/hooks/useTauri'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { firstRecurrenceDate } from '@/hooks/useRecurring'
import { amountForCategory, currentMonthKey, dateLocale, fmtCompact, localToday, txForMonth } from '@/data/helpers'
import { currentRate, fxAlertTriggered } from '@/data/fxAlerts'
import { readFxHistory } from '@/data/exchangeRates'
import { changeOver, seriesFor } from '@/data/fxHistory'
import { chargesToRemind } from '@/data/chargeReminders'
import { daysLate, outstanding } from '@/data/clients'
import { useBusiness } from '@/store/business'
import { getCurrencyMeta } from '@/data/currencies'
import { duePayments, isLongCycle, upcomingPayments } from '@/data/autopay'
import { detectSpendingAnomalies } from '@/data/financeIntelligence'
import { useNotificationHistory, type NotificationHistoryEntry } from '@/store/notificationHistory'
import type { NotificationTargetType } from '@/hooks/useNotificationTarget'
import type { CurrencyCode } from '@/types'
import { buildNudges } from '@/data/nudges'
import { projectCashflow } from '@/data/cashflowProjection'
import { isOwed, useDebt } from '@/store/debt'
import { useWishes } from '@/store/wishes'

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Snapshot JSON con todo lo que el worker nativo (WorkManager) necesita para
 * decidir qué notificaciones mostrar sin tener acceso a localStorage/Zustand.
 * Los montos y fechas vienen pre-formateados para no portar fmtCompact()
 * ni el formato de fechas localizado a Kotlin.
 */
function lacksFunds(account: { type: string; balance: number; limit?: number }, amount: number): boolean {
  if (account.type === 'credit') return account.balance - amount < -(account.limit ?? Infinity)
  return account.balance < amount
}

export function buildReminderSnapshot(): string {
  const { transactions, accounts, categories, currency, goals } = useFinance.getState()
  const {
    language, dismissedAlerts, silencedRecurring, fxAlertEnabled, fxAlertCurrency, fxAlertThreshold, fxAlertDirection,
    anomalyAlertsEnabled, anomalySensitivity, reminderKinds,
  } = useSettings.getState()

  /*
   * ARRIBA DEL TODO, antes de cualquier lista que lo use.
   *
   * Estaba declarado más abajo, después de los recurrentes, que ya lo
   * llamaban al construirse: con un solo movimiento recurrente, `on` se leía
   * antes de existir, saltaba un ReferenceError, el `catch` de
   * `syncReminderSnapshot` lo callaba y el teléfono se quedaba con el
   * snapshot viejo para siempre. Los avisos nativos dejaban de actualizarse
   * sin que nada lo dijera.
   */
  const on = (kind: ReminderKind) => isReminderKindOn(reminderKinds, kind)

  const mkey = currentMonthKey()
  const monthTx = txForMonth(transactions, mkey)
  const locale = dateLocale(language)
  const today = localToday()

  const categoriesSnapshot = categories
    .filter(c => c.type === 'expense' && c.budget > 0)
    .map(cat => {
      const spent = monthTx
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + amountForCategory(tx, cat.id), 0)
      const pct = Math.round(spent / cat.budget * 100)
      return {
        id: cat.id,
        name: cat.name,
        monthKey: mkey,
        pct,
        spentLabel: fmtCompact(spent, currency),
        budgetLabel: fmtCompact(cat.budget, currency),
      }
    })

  // Los silenciados se excluyen del snapshot y no solo del feed in-app: el
  // worker nativo notifica con la app cerrada, así que dejarlos aquí haría que
  // el aviso siguiera llegando al teléfono aunque en la campanita ya no esté.
  const silenced = new Set(silencedRecurring)

  const recurringSnapshot = transactions
    .filter(tx => tx.recurring && !silenced.has(tx.id))
    .map(tx => {
      const next = firstRecurrenceDate(tx)
      const account = accounts.find(a => a.id === tx.accountId)
      const lowFunds = tx.type === 'expense' && !!account && lacksFunds(account, tx.amount)
      return {
        id: tx.id,
        note: tx.note,
        nextDate: next,
        dateLabel: new Date(`${next}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        amountLabel: fmtCompact(tx.amount, currency),
        recurringEnd: tx.recurringEnd ?? null,
        lowFunds: on('lowfunds') ? lowFunds : false,
        accountName: account?.name ?? '',
      }
    })

  /*
   * P2 · P3 · LOS PAGOS DE SERVICIOS, en la misma lista que los recurrentes.
   *
   * El trabajador de Android ya sabe avisar de «hoy se cobra» y de «saldo
   * bajo» a partir de esa lista, así que no hace falta tocar Kotlin: basta con
   * mandarle estos pagos con la misma forma.
   *
   *  · HOY, los que preguntan (`ask`): «Hoy se cobra Netflix».
   *  · MAÑANA, solo si no alcanza o si es un pago de ciclo largo —el anual
   *    es el que pilla desprevenido—. Un aviso que llega siempre se acaba
   *    ignorando; uno que llega cuando hay un problema se lee.
   */
  const servicePaySnapshot = (() => {
    const { services } = useBusiness.getState()
    const fila = (p: ReturnType<typeof upcomingPayments>[number], lowFunds: boolean) => {
      const account = accounts.find(a => a.id === p.service.payAccountId)
      return {
        id: `svcpay:${p.key}`,
        note: p.service.name,
        nextDate: p.date,
        dateLabel: new Date(`${p.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
        amountLabel: fmtCompact(p.amount, p.service.currency ?? currency),
        recurringEnd: null,
        lowFunds: on('lowfunds') ? lowFunds : false,
        accountName: account?.name ?? '',
      }
    }
    const sinSaldo = (p: ReturnType<typeof upcomingPayments>[number]) => {
      const account = accounts.find(a => a.id === p.service.payAccountId)
      return !!account && lacksFunds(account, p.amount)
    }
    const hoy = duePayments(services, today, { modes: ['ask'] })
      .filter(p => p.date === today)
      .map(p => fila(p, sinSaldo(p)))
    const manana = upcomingPayments(services, today, 1)
      .filter(p => sinSaldo(p) || isLongCycle(p.service))
      .map(p => fila(p, sinSaldo(p)))
    return [...hoy, ...manana]
  })()

  const lastTransactionDate = transactions.reduce<string | null>(
    (latest, tx) => (latest === null || tx.date > latest ? tx.date : latest), null)

  // Metas con aporte automático: recordatorio el día en que toca aportar.
  const goalsSnapshot = goals
    .filter(g => g.autoContribute && !g.autoPaused && !g.achievedAt && g.saved < g.target)
    .map(g => ({
      id: g.id,
      name: g.name,
      nextDate: g.autoContribute!.nextDate,
      amountLabel: fmtCompact(g.autoContribute!.amount, currency),
    }))

  // Resumen semanal (últimos 7 días, para empujar los domingos por la tarde).
  const weekAgo = new Date(`${today}T00:00:00`)
  weekAgo.setDate(weekAgo.getDate() - 6)
  const weekStart = localToday(weekAgo)
  const weekTx = transactions.filter(tx => tx.date >= weekStart && tx.date <= today && tx.type !== 'transfer')
  let weekIncome = 0
  let weekExpense = 0
  const byCategory: Record<string, number> = {}
  for (const tx of weekTx) {
    if (tx.type === 'income') weekIncome += tx.amount
    else if (tx.type === 'expense') {
      weekExpense += tx.amount
      if (tx.categoryId) byCategory[tx.categoryId] = (byCategory[tx.categoryId] ?? 0) + tx.amount
    }
  }
  const topEntry = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0]
  const topCat = topEntry ? categories.find(c => c.id === topEntry[0]) : undefined
  /*
   * A10 · CONTRA LA SEMANA ANTERIOR. «Gastaste RD$8,240» solo no dice si fue
   * mucho. Se compara con los siete días de antes y el texto sale ya escrito
   * y traducido desde aquí: el worker nativo solo tiene que mostrarlo.
   */
  const prevStartD = new Date(`${weekStart}T00:00:00`)
  prevStartD.setDate(prevStartD.getDate() - 7)
  const prevEndD = new Date(`${weekStart}T00:00:00`)
  prevEndD.setDate(prevEndD.getDate() - 1)
  const prevStart = localToday(prevStartD), prevEnd = localToday(prevEndD)
  const prevWeekExpense = transactions
    .filter(tx => tx.type === 'expense' && tx.date >= prevStart && tx.date <= prevEnd)
    .reduce((sum, tx) => sum + tx.amount, 0)
  const weekChangePct = prevWeekExpense > 0 ? Math.round((weekExpense / prevWeekExpense - 1) * 100) : null
  const weeklyText = [
    tt('notifWeeklySpent', { amount: fmtCompact(weekExpense, currency) }),
    weekChangePct === null || weekChangePct === 0 ? '' : weekChangePct > 0
      ? tt('notifWeeklyMore', { pct: weekChangePct })
      : tt('notifWeeklyLess', { pct: Math.abs(weekChangePct) }),
    topCat ? tt('notifWeeklyTop', { name: topCat.name }) : '',
  ].filter(Boolean).join(' ')
  const weekly = weekTx.length > 0 ? {
    incomeLabel: fmtCompact(weekIncome, currency),
    expenseLabel: fmtCompact(weekExpense, currency),
    topCategory: topCat?.name ?? '',
    topCategoryLabel: topEntry ? fmtCompact(topEntry[1], currency) : '',
    text: weeklyText,
  } : null

  // Alerta de tasa de cambio: la condición se evalúa aquí (con las tasas ya
  // sincronizadas) para que el worker nativo solo tenga que mostrar el aviso,
  // sin reimplementar la lógica de comparación en Kotlin.
  const fxConfig = {
    enabled: fxAlertEnabled,
    currency: fxAlertCurrency as CurrencyCode,
    threshold: fxAlertThreshold,
    direction: fxAlertDirection,
  }
  /*
   * EL AVISO LLEVA LA CIFRA, NO EL UMBRAL.
   *
   * Antes el titulo era «El USD subio sobre tu limite» y el numero quedaba en
   * el cuerpo, que en una notificacion colapsada no se ve. Asi que el aviso
   * avisaba de que algo habia pasado sin decir QUE: para enterarte del valor
   * del dolar habia que abrir la app, que es justo lo que el aviso venia a
   * ahorrar.
   *
   * Ahora el titulo ES la cifra, y el cuerpo explica por que suena y cuanto se
   * movio desde la ultima vez — eso ultimo solo si hay historial suficiente,
   * porque inventarse un «subio» sin con que comparar seria peor que callarlo.
   */
  const fxRate = currentRate(fxAlertCurrency as CurrencyCode, currency)
  const fxPoints = seriesFor(readFxHistory(), fxAlertCurrency as CurrencyCode, 30)
  const fxChange = changeOver(fxPoints)
  const fx = fxAlertTriggered(fxConfig, currency) ? {
    currency: fxAlertCurrency,
    rate: fxRate,
    rateLabel: fmtCompact(fxRate, currency),
    thresholdLabel: fmtCompact(fxAlertThreshold, currency),
    direction: fxAlertDirection,
    currencyFlag: getCurrencyMeta(fxAlertCurrency as CurrencyCode).flag,
    // El movimiento, si hay con que compararlo.
    changeLabel: fxChange && fxChange.direction !== 'flat'
      ? fmtCompact(Math.abs(fxChange.delta), currency)
      : '',
    changeUp: fxChange ? fxChange.direction === 'up' : false,
  } : null

  // Gasto inusual: solo transacciones de hoy, para que el worker avise una
  // vez por movimiento (deduplicado por id) apenas se registra, no por todo
  // el histórico del mes en cada corrida.
  const anomaliesSnapshot = anomalyAlertsEnabled
    ? detectSpendingAnomalies(transactions, mkey, anomalySensitivity)
        .filter(a => a.tx.date === today)
        .map(a => ({
          txId: a.tx.id,
          note: a.tx.note,
          amountLabel: fmtCompact(a.tx.amount, currency),
          baselineLabel: fmtCompact(a.baseline, currency),
        }))
    : []


  /*
   * Los cobros que TOCA recordar hoy, con su nombre para el aviso.
   *
   * No son todos los pendientes: salia uno cada dia por cada cobro atrasado,
   * asi que un cliente con cuarenta dias de retraso generaba cuarenta avisos
   * identicos. Un aviso diario se aprende a descartar sin leerlo, y el dia
   * que llega uno que si importaba ya se descarto con los demas.
   *
   * Ahora van en escalera —el dia que vence, a los 3 y a los 7— y despues
   * silencio. Ver `chargeReminders.ts`.
   */
  const chargesSnapshot = (() => {
    const { charges, clients } = useBusiness.getState()
    const hoy = localToday()
    return chargesToRemind(charges, hoy)
      .map(c => {
        const cliente = clients.find(x => x.id === c.clientId)
        return {
          id: `charge:${c.id}:${hoy}`,
          name: cliente?.name ?? '',
          amountLabel: fmtCompact(outstanding(c), cliente?.currency ?? currency),
          daysLate: daysLate(c, hoy),
        }
      })
      .filter(c => !!c.name)
  })()

  // Avisos puntuales de la 2.7 (antojos, cuotas, flujo en rojo).
  const nudges = (() => {
    const horizon = new Date(`${today}T00:00:00`)
    horizon.setDate(horizon.getDate() + 35)
    const debts = useDebt.getState().debts
    const installments = debts
      .filter(d => isOwed(d) && d.balance > 0 && d.dueDay)
      .map(d => ({ id: d.id, name: d.name, amount: Math.min(d.minPayment || d.balance, d.balance), dueDay: d.dueDay }))
    const cashflow = projectCashflow(transactions, accounts, goals, localToday(horizon), today, currency, undefined, installments)
    return buildNudges({
      today,
      now: Date.now(),
      wishes: useWishes.getState().items,
      debts: debts.map(d => ({ id: d.id, name: d.name, balance: d.balance, minPayment: d.minPayment, dueDay: d.dueDay, owed: isOwed(d) })),
      cashflow,
      subs: (() => {
        try {
          const ids = JSON.parse(localStorage.getItem('cuadre-sub-remind') ?? '[]') as string[]
          return transactions
            .filter(tx => tx.recurring && ids.includes(tx.id) && !tx.recurringEnd)
            .map(tx => ({ id: tx.id, name: tx.note, amount: tx.amount, next: tx.recurringNext ?? tx.date }))
        } catch { return [] }
      })(),
      money: n => fmtCompact(n, currency),
      dayLabel: d => new Date(`${d}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric' }),
      t: {
        wishTitle: tt('nudgeWishTitle'), wishText: tt('nudgeWishText'),
        debtTitle: tt('nudgeDebtTitle'), debtText: tt('nudgeDebtText'),
        cashTitle: tt('nudgeCashTitle'), cashText: tt('nudgeCashText'),
        subTitle: tt('nudgeSubTitle'), subText: tt('nudgeSubText'),
      },
    })
  })()

  return JSON.stringify({
    nudges,
    dismissedAlerts,
    lastTransactionDate,
    // Los TEXTOS viajan ya traducidos al worker. Antes estaban escritos en
    // espanol dentro del Kotlin, asi que un usuario en ingles recibia sus
    // notificaciones en espanol. El worker solo sustituye los {placeholders}.
    strings: {
      budgetOverTitle:    tt('notifBudgetOverTitle'),
      budgetOverText:     tt('notifBudgetOverText'),
      budgetNearTitle:    tt('notifBudgetNearTitle'),
      budgetNearText:     tt('notifBudgetNearText'),
      recurringTodayTitle: tt('notifRecurringTodayTitle'),
      recurringSoonTitle: tt('notifRecurringSoonTitle'),
      recurringText:      tt('notifRecurringText'),
      lowFundsTitle:      tt('notifLowFundsTitle'),
      lowFundsText:       tt('notifLowFundsText'),
      goalTitle:          tt('notifGoalTitle'),
      goalText:           tt('notifGoalText'),
      weeklyTitle:        tt('notifWeeklyTitle'),
      fxTitle:            tt('notifFxTitle'),
      fxText:             tt('notifFxText'),
      fxTextChange:       tt('notifFxTextChange'),
      chargeTodayTitle:   tt('notifChargeTodayTitle'),
      chargeLateTitle:    tt('notifChargeLateTitle'),
      chargeText:         tt('notifChargeText'),
      fxUp:               tt('notifFxUp'),
      fxDown:             tt('notifFxDown'),
      anomalyTitle:       tt('notifAnomalyTitle'),
      anomalyText:        tt('notifAnomalyText'),
      today:              tt('notifToday'),
    },
    /*
     * LOS TIPOS APAGADOS VIAJAN VACIOS.
     *
     * El worker de Android dispara a partir de estas listas, asi que apagar un
     * tipo de aviso no necesita tocar Kotlin: basta con no mandarle los datos.
     * Lo que no existe en el snapshot no se puede notificar.
     */
    categories: on('budget') ? categoriesSnapshot : [],
    recurring:  on('recurring') ? [...recurringSnapshot, ...servicePaySnapshot] : [],
    goals:      on('goal') ? goalsSnapshot : [],
    weekly:     on('weekly') ? weekly : null,
    fx:         on('fx') ? fx : null,
    anomalies:  on('anomaly') ? anomaliesSnapshot : [],
    /*
     * COBRAR ES ACORDARSE DE PEDIRLO.
     *
     * El dia que a un cliente le toca pagar, un aviso. Van los de hoy y los
     * atrasados; nada mas, porque un aviso por cada cobro futuro seria ruido.
     * Reusa el interruptor de 'recurring': quien apago los recordatorios de
     * pagos no quiere que le recuerden los cobros tampoco.
     */
    charges: on('recurring') ? chargesSnapshot : [],
  })
}

/** Envía el snapshot actual al worker nativo. No-op fuera de Android+Tauri. */
export async function syncReminderSnapshot(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:local-reminders|sync_snapshot', { snapshot: buildReminderSnapshot() })
  } catch {
    // plugin no disponible — sin recordatorios nativos
  }
}

/** Pide permiso de notificaciones (una sola vez, si aún no se ha concedido). No-op fuera de Android+Tauri. */
export async function requestReminderPermission(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification')
    if (!(await isPermissionGranted())) await requestPermission()
  } catch {
    // no-op
  }
}

/** Programa el worker periódico (WorkManager) que revisa el snapshot. */
export async function scheduleLocalReminders(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:local-reminders|schedule_reminders')
  } catch {
    // no-op
  }
}

/** Cancela el worker periódico. */
export async function cancelLocalReminders(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:local-reminders|cancel_reminders')
  } catch {
    // no-op
  }
}

interface NativeHistoryRecord {
  id: unknown
  type: unknown
  title: unknown
  body: unknown
  createdAt: unknown
}

function isNotificationTargetType(v: unknown): v is NotificationTargetType {
  return typeof v === 'string' &&
    ['budget', 'recurring', 'lowfunds', 'goal', 'weekly', 'fx', 'anomaly', 'activity', 'charge', 'caprice', 'debt', 'cashflow', 'subscription'].includes(v)
}

/**
 * Trae los avisos nativos ya disparados por `ReminderWorker.kt`
 * (`notification_history.json`) y los mezcla en el store persistido de la
 * app — así la campanita puede mostrar avisos como el resumen semanal, que
 * antes se disparaban y desaparecían sin dejar rastro dentro de la app.
 * Idempotente: se puede llamar tantas veces como se quiera (al arrancar y al
 * volver a primer plano), el merge por id descarta lo que ya se conocía.
 */
export async function syncNotificationHistory(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<string>('read_notification_history')
    const parsed = JSON.parse(raw) as NativeHistoryRecord[]
    const entries: NotificationHistoryEntry[] = parsed
      .filter((r): r is NativeHistoryRecord & { id: string; title: string; body: string; createdAt: number } =>
        typeof r.id === 'string' && typeof r.title === 'string' &&
        typeof r.body === 'string' && typeof r.createdAt === 'number' && isNotificationTargetType(r.type))
      .map(r => ({ id: r.id, type: r.type as NotificationTargetType, title: r.title, body: r.body, createdAt: r.createdAt }))
    useNotificationHistory.getState().merge(entries)
  } catch {
    // plugin no disponible o historial vacío — no-op
  }
}

// ── Guia de bateria ─────────────────────────────────────────

/**
 * ¿Esta la app exenta de la optimizacion de bateria?
 *
 * `null` fuera de Android: no hay nada que comprobar y la pantalla no debe
 * ofrecerse. Un `false` seria mentir — en escritorio no existe el concepto.
 */
export async function isBatteryExempt(): Promise<boolean | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const res = await invoke<{ exempt: boolean }>('plugin:local-reminders|battery_status')
    return res.exempt
  } catch {
    // Build viejo sin el comando: se trata como "no se sabe".
    return null
  }
}

/** Abre la pantalla del sistema donde se concede la exencion. */
export async function openBatterySettings(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const res = await invoke<{ opened: boolean }>('plugin:local-reminders|open_battery_settings')
    return res.opened
  } catch {
    return false
  }
}
