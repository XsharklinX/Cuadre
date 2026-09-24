import { isReminderKindOn, type ReminderKind } from '@/data/reminderKinds'
import { tt } from '@/i18n'
import { isTauri } from '@/hooks/useTauri'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { firstRecurrenceDate } from '@/hooks/useRecurring'
import { amountForCategory, currentMonthKey, dateLocale, fmtCompact, localToday, txForMonth } from '@/data/helpers'
import { currentRate, fxAlertTriggered } from '@/data/fxAlerts'
import { getCurrencyMeta } from '@/data/currencies'
import { detectSpendingAnomalies } from '@/data/financeIntelligence'
import { useNotificationHistory, type NotificationHistoryEntry } from '@/store/notificationHistory'
import type { NotificationTargetType } from '@/hooks/useNotificationTarget'
import type { CurrencyCode } from '@/types'

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

function buildReminderSnapshot(): string {
  const { transactions, accounts, categories, currency, goals } = useFinance.getState()
  const {
    language, dismissedAlerts, silencedRecurring, fxAlertEnabled, fxAlertCurrency, fxAlertThreshold, fxAlertDirection,
    anomalyAlertsEnabled, anomalySensitivity, reminderKinds,
  } = useSettings.getState()

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

  const lastTransactionDate = transactions.reduce<string | null>(
    (latest, tx) => (latest === null || tx.date > latest ? tx.date : latest), null)

  // Metas con aporte automático: recordatorio el día en que toca aportar.
  const goalsSnapshot = goals
    .filter(g => g.autoContribute && g.saved < g.target)
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
  const weekly = weekTx.length > 0 ? {
    incomeLabel: fmtCompact(weekIncome, currency),
    expenseLabel: fmtCompact(weekExpense, currency),
    topCategory: topCat?.name ?? '',
    topCategoryLabel: topEntry ? fmtCompact(topEntry[1], currency) : '',
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
  const fx = fxAlertTriggered(fxConfig, currency) ? {
    currency: fxAlertCurrency,
    rateLabel: fmtCompact(currentRate(fxAlertCurrency as CurrencyCode, currency), currency),
    thresholdLabel: fmtCompact(fxAlertThreshold, currency),
    direction: fxAlertDirection,
    currencyFlag: getCurrencyMeta(fxAlertCurrency as CurrencyCode).flag,
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

  const on = (kind: ReminderKind) => isReminderKindOn(reminderKinds, kind)

  return JSON.stringify({
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
    recurring:  on('recurring') ? recurringSnapshot : [],
    goals:      on('goal') ? goalsSnapshot : [],
    weekly:     on('weekly') ? weekly : null,
    fx:         on('fx') ? fx : null,
    anomalies:  on('anomaly') ? anomaliesSnapshot : [],
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
    ['budget', 'recurring', 'lowfunds', 'goal', 'weekly', 'fx', 'anomaly', 'activity'].includes(v)
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
