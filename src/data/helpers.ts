import { CURRENCIES } from './seed'
import { devDate } from './devClock'
import { convertCurrency } from './currencies'
import type {
  Transaction, Category, Account, GoalContribution,
  Totals, CategoryTotal, MonthSeries, WeekBucket,
  CurrencyCode, FmtOptions,
} from '@/types'

// ── Formato de moneda ─────────────────────────────────────
/**
 * MODO PRIVADO — el interruptor, en el unico sitio por el que pasa el dinero.
 *
 * La primera version lo puso en `useFmt`, el hook. Parecia razonable y estaba
 * mal: CATORCE archivos llaman a `fmt()` directamente —Movimientos entre
 * ellos— y `AnimatedMoney` tambien. En todos esos, los montos seguian a la
 * vista con el modo privado encendido. Tapar "casi todo" no tapa nada: basta
 * una pantalla para que quien mira por encima del hombro vea el sueldo.
 *
 * Va aqui, en `fmt`, que es el embudo real. No es un estado de React a
 * proposito: `fmt` es una funcion pura que se llama desde sitios sin hooks
 * (exportaciones, widgets, notificaciones), y una bandera de modulo llega a
 * todos. El store la mantiene al dia (ver `store/settings.ts`).
 */
let privacyMasked = false

/** La mascara. Ancho fijo y sin signo: un "−" delator seguiria contando. */
export const MONEY_MASK = '••••'

/** La cambia el store de ajustes; nadie mas deberia llamarla. */
export function setPrivacyMasked(on: boolean): void {
  privacyMasked = on
}

export function isPrivacyMasked(): boolean {
  return privacyMasked
}

export function fmt(n: number, currency: CurrencyCode, opts: FmtOptions = {}): string {
  if (privacyMasked && !opts.neverMask) return MONEY_MASK
  const c    = CURRENCIES[currency]
  const sign = n < 0 ? '-' : ''
  const abs  = Math.abs(n)
  const dec  = opts.decimals ?? c.decimals
  const s    = abs.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return `${sign}${c.symbol} ${s}`
}

/** Alias de {@link fmt}: el usuario pidió eliminar la abreviación "k"/"M" en toda la app. */
export function fmtCompact(n: number, currency: CurrencyCode): string {
  return fmt(n, currency)
}

// ── Fechas ────────────────────────────────────────────────
export function dateLocale(lang: string): string {
  return lang === 'en' ? 'en-US' : 'es-DO'
}

export function monthKey(dateStr: string): string { return dateStr.slice(0, 7) }

/**
 * "Hoy" segun la app, en fecha local.
 *
 * El valor por defecto pasa por `devDate()`, no por `new Date()`: con el modo
 * desarrollador se puede mover el reloj de la app unos dias para probar
 * cortes de tarjeta, recurrentes y cierres de mes sin esperarlos (ver
 * `data/devClock.ts`). Sin desfase —el caso de todo el mundo— devuelve
 * exactamente lo mismo que antes.
 *
 * Quien pasa una fecha explicita manda: el viaje en el tiempo solo afecta al
 * "ahora" implicito.
 */
export function localToday(now = devDate()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function currentMonthKey(now = new Date()): string {
  return localToday(now).slice(0, 7)
}

export function prevMonthKey(key: string): string {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(key: string, locale = 'es-DO'): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
}

export function shortMonth(key: string, locale = 'es-DO'): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString(locale, { month: 'short' })
}

// ── Cálculos ──────────────────────────────────────────────
export function txForMonth(txns: Transaction[], key: string): Transaction[] {
  return txns.filter(t => monthKey(t.date) === key)
}

export function totals(txns: Transaction[]): Totals {
  let income = 0, expense = 0
  txns.forEach(t => {
    if (t.type === 'income')  income  += t.amount
    if (t.type === 'expense') expense += t.amount
  })
  return { income, expense, net: income - expense }
}

/**
 * Partes categoría/monto de una transacción: sus `splits` si los tiene,
 * o una sola parte con su categoría y monto completos.
 */
export function categoryParts(tx: Transaction): { categoryId?: string; amount: number }[] {
  if (tx.splits && tx.splits.length > 0) return tx.splits
  return [{ categoryId: tx.categoryId, amount: tx.amount }]
}

/** Monto de una transacción atribuido a una categoría concreta (respeta splits). */
export function amountForCategory(tx: Transaction, categoryId: string): number {
  if (tx.splits && tx.splits.length > 0) {
    return tx.splits.reduce((sum, split) => split.categoryId === categoryId ? sum + split.amount : sum, 0)
  }
  return tx.categoryId === categoryId ? tx.amount : 0
}

export function byCategory(
  txns: Transaction[],
  type: 'income' | 'expense',
  categories: Category[],
): CategoryTotal[] {
  const map: Record<string, number> = {}
  txns.forEach(t => {
    if (t.type !== type) return
    categoryParts(t).forEach(part => {
      if (!part.categoryId) return
      map[part.categoryId] = (map[part.categoryId] ?? 0) + part.amount
    })
  })
  return Object.entries(map)
    .map(([id, amount]) => ({ category: categories.find(c => c.id === id)!, amount }))
    .filter(x => x.category)
    .sort((a, b) => b.amount - a.amount)
}

export function monthKeys(txns: Transaction[]): string[] {
  if (txns.length === 0) {
    return [currentMonthKey()]
  }

  const allKeys = txns.map(t => monthKey(t.date))
  allKeys.push(currentMonthKey())
  allKeys.sort()

  const minKey = allKeys[0]
  const maxKey = allKeys[allKeys.length - 1]

  const keys: string[] = []
  let [currY, currM] = minKey.split('-').map(Number)
  const [maxY, maxM] = maxKey.split('-').map(Number)

  while (currY < maxY || (currY === maxY && currM <= maxM)) {
    keys.push(`${currY}-${String(currM).padStart(2, '0')}`)
    currM++
    if (currM > 12) {
      currM = 1
      currY++
    }
  }
  return keys
}

export function monthlySeries(txns: Transaction[], year: number, locale = 'es-DO'): MonthSeries[] {
  return Array.from({ length: 12 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`
    const t   = totals(txForMonth(txns, key))
    return { key, label: shortMonth(key, locale), ...t }
  })
}

export function weeklySeries(txns: Transaction[]): WeekBucket[] {
  const buckets = [0, 0, 0, 0, 0]
  txns.forEach(t => {
    if (t.type !== 'expense') return
    const day = Number(t.date.slice(8, 10))
    buckets[Math.min(4, Math.floor((day - 1) / 7))] += t.amount
  })
  return buckets.map((value, i) => ({ label: `Sem ${i + 1}`, value }))
}

export interface AccountMonthBucket { key: string; label: string; inflow: number; outflow: number }

export function accountActivity(txns: Transaction[], accountId: string): Transaction[] {
  return txns.filter(t =>
    t.accountId === accountId || t.fromAccount === accountId || t.toAccount === accountId)
}

/** Cuentas que cuentan para los totales/balance agregados (excluye `includeInTotal === false`). */
export function visibleAccounts(accounts: Account[]): Account[] {
  return accounts.filter(a => a.includeInTotal !== false)
}

// ── Multi-moneda ──────────────────────────────────────────
/** Divisa efectiva de una cuenta: la propia o la base de la app. */
export function accountCurrency(account: Account, base: CurrencyCode): CurrencyCode {
  return account.currency ?? base
}

/** Saldo de una cuenta convertido a la divisa base de la app (tasas en vivo). */
export function accountBalanceInBase(account: Account, base: CurrencyCode): number {
  const cur = account.currency ?? base
  const primary = cur === base ? account.balance : convertCurrency(account.balance, cur, base)

  // El SEGUNDO libro de una tarjeta es parte de la posicion de esa cuenta: una
  // deuda de US$312 es deuda real. Sin esto no aparecia en el patrimonio neto,
  // ni en el total adeudado, ni en los totales por grupo — existia en la ficha
  // de la tarjeta y en ningun agregado.
  if (account.type !== 'credit' || !account.secondaryCurrency) return primary
  const secondary = account.secondaryBalance ?? 0
  if (secondary === 0) return primary
  return primary + (account.secondaryCurrency === base
    ? secondary
    : convertCurrency(secondary, account.secondaryCurrency, base))
}

/**
 * PATRIMONIO NETO: suma de TODOS los saldos (incluye la deuda de tarjeta como
 * negativo). Es lo correcto para un estado de patrimonio, no para "el dinero que
 * tienes disponible" — para eso está `availableBalanceInBase`.
 */
export function totalBalanceInBase(accounts: Account[], base: CurrencyCode): number {
  return visibleAccounts(accounts).reduce((sum, account) => sum + accountBalanceInBase(account, base), 0)
}

/**
 * DINERO DISPONIBLE: solo el de cuentas de dinero real (efectivo, débito,
 * ahorro). NO incluye tarjetas de crédito — el crédito es dinero que el banco te
 * presta, no tuyo, y mezclarlo en el "Balance total" confunde. La deuda de las
 * tarjetas se muestra aparte (ver `creditCardsOwedInBase`).
 */
export function availableBalanceInBase(accounts: Account[], base: CurrencyCode): number {
  return visibleAccounts(accounts)
    .filter(account => account.type !== 'credit')
    .reduce((sum, account) => sum + accountBalanceInBase(account, base), 0)
}

/** Total ADEUDADO en tarjetas de crédito (lo gastado y no pagado), en divisa base. */
export function creditCardsOwedInBase(accounts: Account[], base: CurrencyCode): number {
  return visibleAccounts(accounts)
    .filter(account => account.type === 'credit')
    .reduce((sum, account) => sum + Math.abs(Math.min(0, accountBalanceInBase(account, base))), 0)
}

export interface NetWorthBreakdown { assets: number; liabilities: number }

/**
 * Lo mínimo que hace falta de una deuda registrada a mano para contarla en el
 * patrimonio. Se declara aquí, y no se importa `Debt` de `store/debt`, para no
 * atar el módulo de cálculos a un store de Zustand.
 */
export interface ManualDebt {
  balance: number
  currency?: CurrencyCode
  direction?: 'owed' | 'lent'
}

/**
 * Desglosa el patrimonio en activos (saldos positivos) y pasivos (saldos
 * negativos — típicamente deuda de tarjeta de crédito), en vez de un solo
 * número combinado. Se separa por el SIGNO real de cada cuenta, no por su
 * `type`: una tarjeta de crédito sobrepagada (saldo positivo) cuenta como
 * activo, igual que en cualquier estado de patrimonio real.
 */
export function netWorthBreakdown(
  accounts: Account[],
  base: CurrencyCode,
  debts: ManualDebt[] = [],
): NetWorthBreakdown {
  const fromAccounts = visibleAccounts(accounts).reduce((acc, account) => {
    const value = accountBalanceInBase(account, base)
    return value >= 0 ? { ...acc, assets: acc.assets + value } : { ...acc, liabilities: acc.liabilities - value }
  }, { assets: 0, liabilities: 0 })

  /*
   * LAS DEUDAS REGISTRADAS A MANO TAMBIÉN SON PATRIMONIO.
   *
   * Hasta ahora esto solo miraba las cuentas: registrabas un préstamo de
   * vehículo de RD$ 200.000 en la pantalla de Deudas y tu patrimonio neto no
   * se movía ni un peso. La cifra decía «patrimonio» y era «saldo de mis
   * cuentas» — que es justo la diferencia entre las dos palabras.
   *
   * Y desde que se puede apuntar lo que TE DEBEN, eso es un activo: te lo van
   * a devolver, cuenta a tu favor.
   *
   * Las tarjetas de crédito NO se suman aquí: su deuda ya viaja en el saldo de
   * su cuenta. Las que salen en la pantalla de Deudas son derivadas de esas
   * mismas cuentas, no registros aparte, así que contarlas otra vez duplicaría
   * la deuda del usuario.
   */
  return debts.reduce((acc, debt) => {
    const amount = debt.currency && debt.currency !== base
      ? convertCurrency(debt.balance, debt.currency, base)
      : debt.balance
    if (amount <= 0) return acc
    return (debt.direction ?? 'owed') === 'owed'
      ? { ...acc, liabilities: acc.liabilities + amount }
      : { ...acc, assets: acc.assets + amount }
  }, fromAccounts)
}

/** Patrimonio neto: activos menos pasivos. */
export function netWorthValue(
  accounts: Account[],
  base: CurrencyCode,
  debts: ManualDebt[] = [],
): number {
  const { assets, liabilities } = netWorthBreakdown(accounts, base, debts)
  return assets - liabilities
}

/**
 * Convierte los montos de las transacciones de cuentas con divisa propia a la
 * divisa base (incluyendo splits, proporcionalmente). Solo para agregados y
 * estadísticas — no altera los datos guardados. No-op si ninguna cuenta tiene
 * divisa propia.
 */
export function convertTxAmountsToBase(
  transactions: Transaction[], accounts: Account[], base: CurrencyCode,
): Transaction[] {
  // Divisa del LIBRO PRINCIPAL de cada cuenta.
  const primary = new Map(accounts
    .filter(a => a.currency && a.currency !== base)
    .map(a => [a.id, a.currency!]))
  // Divisa del SEGUNDO libro de una tarjeta. Va aparte porque un movimiento
  // marcado `onSecondaryBalance` esta en ESTA divisa, no en la de la cuenta:
  // sin este mapa, un gasto de US$25 en una tarjeta en pesos se sumaba a los
  // presupuestos como 25 PESOS.
  const secondary = new Map(accounts
    .filter(a => a.type === 'credit' && a.secondaryCurrency && a.secondaryCurrency !== base)
    .map(a => [a.id, a.secondaryCurrency!]))

  if (primary.size === 0 && secondary.size === 0) return transactions

  return transactions.map(tx => {
    if (!tx.accountId) return tx
    const cur = tx.onSecondaryBalance ? secondary.get(tx.accountId) : primary.get(tx.accountId)
    if (!cur) return tx
    const rate = convertCurrency(1, cur, base)
    return {
      ...tx,
      amount: tx.amount * rate,
      splits: tx.splits?.map(split => ({ ...split, amount: split.amount * rate })),
      // Los cargos viajan DENTRO de `amount`, asi que se convierten con el
      // mismo factor: dejarlos en la divisa vieja haria que el desglose
      // dejara de cuadrar con el total.
      fees: tx.fees?.map(fee => ({ ...fee, amount: fee.amount * rate })),
    }
  })
}

/** Cuentas de ahorro reales. Cuentan como ahorro aunque esten excluidas del balance general. */
export function savingsAccounts(accounts: Account[]): Account[] {
  return accounts.filter(a => a.type === 'savings')
}

/** Balance positivo guardado en cuentas de ahorro. */
export function savingsBalance(accounts: Account[]): number {
  return savingsAccounts(accounts).reduce((sum, account) => sum + Math.max(0, account.balance), 0)
}

/**
 * Porcentaje de dinero guardado en cuentas de ahorro.
 * Denominador: cuentas visibles positivas + cuentas de ahorro ocultas positivas.
 */
export function accountSavingsRate(accounts: Account[]): number {
  const savings = savingsBalance(accounts)
  const visibleIds = new Set(visibleAccounts(accounts).map(account => account.id))
  const assetBase = accounts.reduce((sum, account) => {
    const countsForBase = visibleIds.has(account.id) || account.type === 'savings'
    return countsForBase ? sum + Math.max(0, account.balance) : sum
  }, 0)
  return assetBase > 0 ? savings / assetBase * 100 : 0
}

/**
 * Transacciones de ingreso/gasto excluyendo las de cuentas marcadas con
 * `includeInTotal: false`. Si se pasa `base`, además convierte los montos de
 * cuentas con divisa propia a la divisa base (solo para agregados).
 */
export function transactionsForTotals(
  transactions: Transaction[], accounts: Account[], base?: CurrencyCode,
): Transaction[] {
  const excluded = new Set(accounts.filter(a => a.includeInTotal === false).map(a => a.id))
  const filtered = excluded.size === 0
    ? transactions
    : transactions.filter(t => !t.accountId || !excluded.has(t.accountId))
  return base ? convertTxAmountsToBase(filtered, accounts, base) : filtered
}

/**
 * Sobrante (positivo) o exceso (negativo) del presupuesto mensual de una
 * categoría, a partir de las transacciones de gasto del mes anterior.
 * Devuelve 0 si la categoría no tiene rollover activado o no tiene presupuesto.
 */
export function categoryRollover(category: Category, prevMonthTx: Transaction[], globalEnabled = false): number {
  // El arrastre aplica si la categoría lo tiene activado O si el ajuste global
  // (Configuración) lo enciende para todos los presupuestos.
  if ((!category.rolloverEnabled && !globalEnabled) || category.budget <= 0) return 0
  const spent = prevMonthTx
    .filter(t => t.type === 'expense')
    .reduce((s, t) => s + amountForCategory(t, category.id), 0)
  return category.budget - spent
}

/**
 * Efecto neto de todos los movimientos sobre una cuenta (ingresos +, gastos −,
 * transferencias según dirección, aportes a metas −). El saldo real de la
 * cuenta es `openingBalance + accountMovementsTotal(...)`.
 */
export function accountMovementsTotal(
  accountId: string,
  txns: Transaction[],
  contributions: GoalContribution[] = [],
): number {
  let total = 0
  for (const t of txns) {
    // Los movimientos del SEGUNDO libro de una tarjeta no tocan el saldo
    // principal: viven en su propia divisa y se suman aparte
    // (`accountSecondaryMovementsTotal`). Sin este filtro, un gasto de US$25
    // restaria 25 PESOS del saldo en pesos.
    if (t.onSecondaryBalance) continue
    if (t.type === 'income' && t.accountId === accountId) total += t.amount
    else if (t.type === 'expense' && t.accountId === accountId) total -= t.amount
    else if (t.type === 'transfer') {
      // Un pago marcado `toSecondary` entra en el OTRO libro
      // (`accountSecondaryMovementsTotal`). Sin este filtro, pagar US$ 39.80
      // de la linea en dolares sumaba 39.80 al saldo en PESOS, y "recalcular"
      // daba por buena esa cifra.
      if (t.toAccount === accountId && !t.toSecondary) total += t.toAmount ?? t.amount
      if (t.fromAccount === accountId) total -= t.amount
    }
  }
  for (const c of contributions) {
    if (c.fromAccountId === accountId) total -= c.amount
  }
  return total
}

/**
 * Suma de los movimientos del SEGUNDO libro de una tarjeta, en la divisa
 * secundaria. Es el espejo exacto de `accountMovementsTotal` para el otro
 * saldo, y juntos mantienen la invariante por libro:
 *
 *   saldo        = apertura          + accountMovementsTotal
 *   saldo 2ยบ     = apertura 2ยบ       + accountSecondaryMovementsTotal
 *
 * SI entran las transferencias marcadas con `toSecondary`: son el pago de la
 * linea en divisa extranjera. Una tarjeta dominicana arrastra dos deudas que
 * se liquidan por separado, y sin esto la unica forma de bajar la deuda en
 * dolares era editar el saldo a mano.
 */
export function accountSecondaryMovementsTotal(accountId: string, txns: Transaction[]): number {
  let total = 0
  for (const t of txns) {
    if (t.type === 'transfer') {
      if (t.toSecondary && t.toAccount === accountId) total += t.toAmount ?? t.amount
      continue
    }
    if (!t.onSecondaryBalance || t.accountId !== accountId) continue
    if (t.type === 'income') total += t.amount
    else if (t.type === 'expense') total -= t.amount
  }
  return total
}

export interface NetWorthPoint { key: string; label: string; value: number }

/**
 * Patrimonio neto al cierre de cada mes del año, sumando el saldo de apertura
 * de cada cuenta visible más sus movimientos hasta el final de ese mes.
 */
export function netWorthSeries(
  accounts: Account[],
  txns: Transaction[],
  contributions: GoalContribution[],
  year: number,
  locale = 'es-DO',
  base?: CurrencyCode,
): NetWorthPoint[] {
  const visible = visibleAccounts(accounts)
  const openings = new Map(visible.map(a => [
    a.id,
    a.openingBalance ?? (a.balance - accountMovementsTotal(a.id, txns, contributions)),
  ]))
  return Array.from({ length: 12 }, (_, m) => {
    const key = `${year}-${String(m + 1).padStart(2, '0')}`
    const cutoff = `${key}-31`
    const txUpTo = txns.filter(t => t.date <= cutoff)
    const contribUpTo = contributions.filter(c => c.date <= cutoff)
    const value = visible.reduce((sum, a) => {
      const raw = (openings.get(a.id) ?? 0) + accountMovementsTotal(a.id, txUpTo, contribUpTo)
      return sum + (base && a.currency && a.currency !== base ? convertCurrency(raw, a.currency, base) : raw)
    }, 0)
    return { key, label: shortMonth(key, locale), value }
  })
}

/**
 * Patrimonio neto de los últimos `months` meses reales terminando en `endKey`
 * (no atado al año calendario, a diferencia de `netWorthSeries`) — para la
 * curva histórica de Análisis, que siempre mira "los últimos 12 meses" sin
 * importar en qué mes del año esté el usuario.
 */
export function rollingNetWorthSeries(
  accounts: Account[],
  txns: Transaction[],
  contributions: GoalContribution[],
  endKey: string,
  months: number,
  locale = 'es-DO',
  base?: CurrencyCode,
): NetWorthPoint[] {
  const visible = visibleAccounts(accounts)
  const openings = new Map(visible.map(a => [
    a.id,
    a.openingBalance ?? (a.balance - accountMovementsTotal(a.id, txns, contributions)),
  ]))
  const [endYear, endMonth] = endKey.split('-').map(Number)
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(endYear, endMonth - 1 - (months - 1 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const cutoff = `${key}-31`
    const txUpTo = txns.filter(t => t.date <= cutoff)
    const contribUpTo = contributions.filter(c => c.date <= cutoff)
    const value = visible.reduce((sum, a) => {
      const raw = (openings.get(a.id) ?? 0) + accountMovementsTotal(a.id, txUpTo, contribUpTo)
      return sum + (base && a.currency && a.currency !== base ? convertCurrency(raw, a.currency, base) : raw)
    }, 0)
    return { key, label: shortMonth(key, locale), value }
  })
}

export function monthlyAccountSeries(
  txns: Transaction[], accountId: string, mkey: string, locale = 'es-DO',
): AccountMonthBucket[] {
  const activity = accountActivity(txns, accountId)
  const [y, m] = mkey.split('-').map(Number)
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(y, m - 1 - (5 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    let inflow = 0, outflow = 0
    txForMonth(activity, key).forEach(t => {
      if (t.type === 'income' && t.accountId === accountId) inflow += t.amount
      else if (t.type === 'expense' && t.accountId === accountId) outflow += t.amount
      else if (t.type === 'transfer') {
        if (t.toAccount === accountId) inflow += t.toAmount ?? t.amount
        if (t.fromAccount === accountId) outflow += t.amount
      }
    })
    return { key, label: shortMonth(key, locale), inflow, outflow }
  })
}

// ── Lookup helpers ────────────────────────────────────────
export const getCategory = (id: string | undefined, cats: Category[]) =>
  cats.find(c => c.id === id)

export const getAccount = (id: string | undefined, accs: Account[]) =>
  accs.find(a => a.id === id)
