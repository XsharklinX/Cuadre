import { isTauri } from '@/hooks/useTauri'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { firstRecurrenceDate } from '@/hooks/useRecurring'
import { accountCurrency, amountForCategory, availableBalanceInBase, currentMonthKey, dateLocale, fmt, fmtCompact, localToday, rollingNetWorthSeries, totals, transactionsForTotals, txForMonth, visibleAccounts } from '@/data/helpers'
import { CURRENCIES } from '@/data/seed'
import { convertCurrency, getCurrencyMeta } from '@/data/currencies'
import { getRatesFetchedAt } from '@/data/exchangeRates'
import type { CurrencyCode } from '@/types'

// Divisas que muestra el widget conversor, en orden de prioridad. Se toman las
// primeras 3 distintas de la moneda base del usuario y se convierte 1 unidad de
// cada una a su moneda, con la misma tasa en vivo que usa la app.
const CONVERTER_SOURCES: CurrencyCode[] = ['USD', 'EUR', 'DOP', 'COP', 'MXN', 'GBP']

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Snapshot JSON con lo que el widget de pantalla de inicio necesita mostrar
 * sin abrir la app: saldo total, la categoría más cercana a su límite de
 * presupuesto del mes y el próximo pago recurrente.
 */
function buildWidgetSnapshot(): string {
  const { accounts, transactions, categories, currency, goalContributions } = useFinance.getState()
  const { language, widgetAccountIds } = useSettings.getState()

  const mkey = currentMonthKey()
  const visTx = transactionsForTotals(transactions, accounts, currency)
  const monthTx = txForMonth(visTx, mkey)
  const locale = dateLocale(language)

  // Saldo del widget = dinero disponible (sin crédito), coherente con la app.
  const totalBalance = availableBalanceInBase(accounts, currency)

  // Variación del patrimonio contra el cierre del mes pasado. Es la única cifra
  // que acompaña al saldo en el widget 2×2, así que tiene que ser explicable:
  // patrimonio de hoy vs patrimonio al cerrar el mes anterior.
  const netWorthPoints = rollingNetWorthSeries(accounts, transactions, goalContributions, mkey, 2, locale, currency)
  const previousNetWorth = netWorthPoints[0]?.value ?? 0
  const currentNetWorth = netWorthPoints[1]?.value ?? totalBalance
  const deltaPct = previousNetWorth !== 0
    ? Math.round(((currentNetWorth - previousNetWorth) / Math.abs(previousNetWorth)) * 100)
    : 0
  // Sin mes anterior con datos, un "0%" seria mentira: mejor no mostrar nada.
  const hasDelta = previousNetWorth !== 0 && netWorthPoints.length === 2

  const widgetAccounts = (() => {
    if (widgetAccountIds && widgetAccountIds.length > 0) {
      return widgetAccountIds
        .map(id => accounts.find(a => a.id === id))
        .filter((a): a is typeof accounts[number] => !!a)
        .slice(0, 3)
    }
    return [...visibleAccounts(accounts)].sort((a, b) => b.balance - a.balance).slice(0, 3)
  })()
  const topAccounts = widgetAccounts.map(a => ({ name: a.short || a.name, balanceLabel: fmtCompact(a.balance, accountCurrency(a, currency)) }))

  const { income, expense } = totals(monthTx)
  const maxFlow = Math.max(income, expense, 1)
  const month = {
    incomeLabel:  fmtCompact(income, currency),
    expenseLabel: fmtCompact(expense, currency),
    incomePct:    Math.round(income / maxFlow * 100),
    expensePct:   Math.round(expense / maxFlow * 100),
  }

  const budgetRows = categories
    .filter(c => c.type === 'expense' && c.budget > 0)
    .map(cat => {
      const spent = monthTx
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + amountForCategory(tx, cat.id), 0)
      const pct = Math.round(spent / cat.budget * 100)
      return {
        name: cat.name,
        pct,
        // El estado viaja resuelto para que Kotlin no repita los umbrales: si
        // el criterio cambia, cambia en un solo sitio.
        status: pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok',
        spentLabel: fmtCompact(spent, currency),
        budgetLabel: fmtCompact(cat.budget, currency),
      }
    })
    // Por urgencia: lo mas pasado de limite primero — es lo que hay que mirar.
    .sort((a, b) => b.pct - a.pct)

  const topBudget = budgetRows[0] ?? null
  const topBudgets = budgetRows.slice(0, 3)

  const todayStr = localToday()
  const nextPayment = transactions
    .filter(tx => tx.recurring)
    .map(tx => ({ tx, next: firstRecurrenceDate(tx) }))
    .filter(({ next }) => next >= todayStr)
    .sort((a, b) => a.next.localeCompare(b.next))
    .map(({ tx, next }) => ({
      note: tx.note,
      dateLabel: new Date(`${next}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
      amountLabel: fmtCompact(tx.amount, currency),
    }))[0] ?? null

  // Tasas para el widget conversor: 1 [otra divisa] = X [tu moneda], en vivo.
  // Solo el codigo (USD) y la cifra: la bandera dentro de una caja con borde y
  // el "1 " delante eran ruido, y el encabezado ya dice "1 unidad en DOP".
  const rates = CONVERTER_SOURCES
    .filter(code => code !== currency)
    .slice(0, 3)
    .map(from => ({
      flag: getCurrencyMeta(from).flag,
      code: from,
      label: `1 ${from}`,
      valueLabel: fmtCompact(convertCurrency(1, from, currency), currency),
    }))
  const fetchedAt = getRatesFetchedAt()
  const ratesUpdatedLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
    : ''

  return JSON.stringify({
    // Compacto para el 2x2 (donde una cifra larga se corta) y completo para el 4x2.
    totalBalanceLabel: fmtCompact(totalBalance, currency),
    totalBalanceFullLabel: fmt(totalBalance, currency),
    deltaPct: hasDelta ? deltaPct : null,
    deltaDirection: !hasDelta ? null : deltaPct > 0 ? 'up' : deltaPct < 0 ? 'down' : 'flat',
    currencySymbol: CURRENCIES[currency].symbol,
    accounts: topAccounts,
    month,
    topBudget,
    topBudgets,
    nextPayment,
    rates,
    ratesBase: currency,
    ratesBaseLabel: `${getCurrencyMeta(currency).flag} ${currency}`,
    ratesUpdatedLabel,
  })
}

/** Envía el snapshot actual al widget nativo. No-op fuera de Android+Tauri. */
export async function syncHomeWidgetSnapshot(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:home-widget|sync_snapshot', { snapshot: buildWidgetSnapshot() })
  } catch {
    // plugin no disponible — sin widget nativo
  }
}

export type WidgetKind = 'balance' | 'budgets' | 'converter' | 'quickadd'

export interface WidgetDiagnostics {
  /** El dispositivo permite el diálogo nativo de "añadir widget". */
  supported: boolean
  /** Cuántos widgets de cada tipo tiene el usuario realmente puestos en su pantalla. */
  installed: Record<WidgetKind, number>
  /** Fecha del último snapshot enviado al widget (null = nunca). */
  lastSyncedAt: Date | null
  /** Hay datos guardados para pintar; si es false los widgets salen vacíos. */
  hasSnapshot: boolean
}

/**
 * Estado real de los widgets según Android. Devuelve `null` fuera de
 * Android+Tauri o si el plugin no responde — así la UI puede distinguir
 * "no aplica" de "aplica pero no hay ninguno instalado".
 */
export async function getWidgetDiagnostics(): Promise<WidgetDiagnostics | null> {
  if (!isAndroidTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<{
      supported: boolean
      balance: number
      budgets: number
      converter: number
      quickadd: number
      lastSyncedAt: number
      hasSnapshot: boolean
    }>('plugin:home-widget|get_diagnostics')
    return {
      supported: raw.supported,
      installed: {
        balance: raw.balance,
        budgets: raw.budgets,
        converter: raw.converter,
        quickadd: raw.quickadd,
      },
      lastSyncedAt: raw.lastSyncedAt > 0 ? new Date(raw.lastSyncedAt) : null,
      hasSnapshot: raw.hasSnapshot,
    }
  } catch {
    return null
  }
}

/**
 * Reenvía el snapshot actual y fuerza el repintado de los widgets — el
 * "Actualizar ahora" de Ajustes, para cuando muestran datos viejos.
 */
export async function refreshHomeWidgets(): Promise<boolean> {
  if (!isAndroidTauri()) return false
  try {
    await syncHomeWidgetSnapshot()
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:home-widget|refresh_widgets')
    return true
  } catch {
    return false
  }
}

/**
 * Pide al sistema añadir un widget a la pantalla de inicio: 'balance' (saldo,
 * por defecto) o 'budgets' (presupuestos). Devuelve 'requested' si se mostró
 * el diálogo nativo, 'unsupported' si el dispositivo no lo permite, o
 * 'unavailable' fuera de Android+Tauri.
 */
export async function requestPinHomeWidget(widget: WidgetKind = 'balance'): Promise<'requested' | 'unsupported' | 'unavailable'> {
  if (!isAndroidTauri()) return 'unavailable'
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ supported: boolean; requested: boolean }>('plugin:home-widget|request_pin', { widget })
    return result.supported && result.requested ? 'requested' : 'unsupported'
  } catch {
    return 'unavailable'
  }
}
