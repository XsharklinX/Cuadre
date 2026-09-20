import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { makeDemo, makeEmpty, newId, CURRENCIES } from '@/data/seed'
import { learnCategoryRule } from '@/data/bankCsv'
import { convertCurrency } from '@/data/currencies'
import { creditUsedInPrimary } from '@/data/creditCard'
import { canHaveNetwork } from '@/data/cardNetwork'
import { accountMovementsTotal, accountSecondaryMovementsTotal, localToday } from '@/data/helpers'
import { validateEnvelopeTransfer } from '@/data/envelopes'
import { createRecoverySnapshot } from '@/data/recovery'
import { tt } from '@/i18n'
import { useSettings } from '@/store/settings'
import type { Account, Category, Transaction, Goal, GoalContribution, CurrencyCode, OverdraftPolicy } from '@/types'

type FinanceData = Pick<FinanceState, 'accounts' | 'transactions' | 'categories' | 'goals' | 'goalContributions' | 'currency'>
const ICONS = new Set([
  'home','cart','food','car','bolt','play','heart','bag','book','wallet','laptop','trend',
  'music','coffee','phone','gym','building','bus','gamepad','gift','scissors','baby','paw',
  'pill','plane','briefcase','shirt','pizza','star','fuel','flame','soda',
  'grid','list','cards','chart','target','plus','arrowUp','arrowDn','shark','search',
  'bell','close','calendar','dots','edit','trash','download','print','settings','logout',
  'repeat','tag','camera','check','alert','refresh','dollar','piggy','sliders','upload',
  'fileJson','eye','eyeOff','info','lock','user','palette',
  'tree','sun','bike','train','tv','monitor','headphones','clock','key','tool',
  'brush','graduation','stethoscope','salad','wine','crown','trophy','shield','map','package',
  'banknote','coins','handCoins','landmark','receipt',
])

// Migración: nombres de categorías semilla originalmente en inglés → español
// Solo se aplica si el nombre actual coincide con alguno de los nombres ingleses conocidos
const CAT_MIGRATE: Record<string, { es: string; oldEn: string[] }> = {
  'cat_renta':   { es: 'Vivienda',        oldEn: ['Housing', 'Rent', 'Vivienda'] },
  'cat_super':   { es: 'Supermercado',    oldEn: ['Groceries', 'Supermarket', 'Supermercado'] },
  'cat_rest':    { es: 'Restaurantes',    oldEn: ['Restaurants', 'Dining', 'Restaurantes'] },
  'cat_trans':   { es: 'Transporte',      oldEn: ['Transport', 'Transportation', 'Transporte'] },
  'cat_serv':    { es: 'Servicios',       oldEn: ['Services', 'Bills', 'Utilities', 'Servicios'] },
  'cat_ocio':    { es: 'Entretenimiento', oldEn: ['Entertainment', 'Leisure', 'Entretenimiento'] },
  'cat_salud':   { es: 'Salud',           oldEn: ['Health', 'Healthcare', 'Salud'] },
  'cat_compras': { es: 'Compras',         oldEn: ['Shopping', 'Purchases', 'Compras'] },
  'cat_edu':     { es: 'Educación',       oldEn: ['Education', 'Educación', 'Educacion'] },
  'cat_salario': { es: 'Salario',         oldEn: ['Salary', 'Payroll', 'Salario'] },
  'cat_free':    { es: 'Freelance',       oldEn: ['Freelance'] },
  'cat_inv':     { es: 'Inversiones',     oldEn: ['Investments', 'Inversions', 'Inversiones'] },
}
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

export function sanitizeFinanceData(value: unknown): FinanceData {
  const data = (value && typeof value === 'object' ? value : {}) as Partial<FinanceData>
  const CURRENCY_CODES = ['DOP','USD','EUR','MXN','GBP','COP','ARS','BRL','CAD']
  const accounts = (Array.isArray(data.accounts) ? data.accounts : []).filter(account =>
    text(account.id) && text(account.name) && text(account.short) && text(account.color)
    && ['debit', 'savings', 'credit', 'cash'].includes(account.type) && amount(account.balance))
    .map(account => account.currency && !CURRENCY_CODES.includes(account.currency)
      ? { ...account, currency: undefined }
      : account)
    .map((account): Account => {
      // Campos de tarjeta de crédito: solo válidos en cuentas de crédito, y
      // cada uno dentro de su rango real. Un `statementDay: 45` o un `apr`
      // negativo no se "corrigen" a un valor plausible — se borran, porque un
      // dato financiero inventado es peor que un dato ausente.
      if (account.type !== 'credit') {
        const { secondaryCurrency, secondaryBalance, secondaryOpeningBalance,
          statementDay, paymentDay, apr, minPaymentPct, minPaymentFloor, ...rest } = account
        const hadCreditFields = secondaryCurrency !== undefined || statementDay !== undefined
          || paymentDay !== undefined || apr !== undefined || minPaymentPct !== undefined
          || secondaryBalance !== undefined || secondaryOpeningBalance !== undefined
          || minPaymentFloor !== undefined
        return hadCreditFields ? rest : account
      }
      const next: Account = { ...account }
      // El segundo saldo va con su divisa o no va: un monto sin divisa no se
      // puede ni mostrar ni convertir.
      const secondaryOk = !!next.secondaryCurrency
        && CURRENCY_CODES.includes(next.secondaryCurrency)
        && next.secondaryCurrency !== (next.currency ?? data.currency ?? 'DOP')
      if (!secondaryOk) {
        next.secondaryCurrency = undefined
        next.secondaryBalance = undefined
        next.secondaryOpeningBalance = undefined
      } else if (!amount(next.secondaryBalance)) {
        next.secondaryBalance = 0
      }
      const day = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 31
      if (!day(next.statementDay)) next.statementDay = undefined
      if (!day(next.paymentDay)) next.paymentDay = undefined
      // Tasa: por encima de 200% anual es casi seguro un dato mal tecleado.
      if (!amount(next.apr) || next.apr! <= 0 || next.apr! > 200) next.apr = undefined
      if (!amount(next.minPaymentPct) || next.minPaymentPct! <= 0 || next.minPaymentPct! > 100) next.minPaymentPct = undefined
      if (!amount(next.minPaymentFloor) || next.minPaymentFloor! < 0) next.minPaymentFloor = undefined
      // Cupo propio de la linea extranjera: solo tiene sentido si esa linea
      // existe. Sin divisa secundaria, un limite secundario no mide nada.
      if (!next.secondaryCurrency || !amount(next.secondaryLimit) || next.secondaryLimit! <= 0) {
        next.secondaryLimit = undefined
      }
      return next
    })
    .map((account): Account => {
      // Red de tarjeta: solo en cuentas con plastico, y solo una de las
      // conocidas. Un efectivo con "visa" es un dato que no significa nada.
      const NETWORKS = ['visa', 'mastercard', 'amex', 'discover', 'other']
      if (account.network && (!canHaveNetwork(account.type) || !NETWORKS.includes(account.network))) {
        return { ...account, network: undefined }
      }
      return account
    })
    .map((account, index, list): Account => {
      // EFECTIVO UNICO: el efectivo es uno solo — no tienes "dos efectivos",
      // tienes el dinero que cargas encima.
      //
      // Si un backup antiguo trae varios, el primero se queda como efectivo y
      // el resto se DEGRADA a ahorro. Nunca se descartan ni se fusionan: lo
      // primero borraria dinero del libro y lo segundo lo moveria en
      // silencio. Un efectivo guardado aparte es, literalmente, ahorro.
      if (account.type !== 'cash') return account
      const first = list.findIndex(a => a.type === 'cash')
      return first === index ? account : { ...account, type: 'savings' }
    })
  const accountIds = new Set(accounts.map(account => account.id))
  const categories = (Array.isArray(data.categories) ? data.categories : []).filter(category =>
    text(category.id) && text(category.name) && /\p{L}/u.test(category.name) && text(category.color)
    && ['expense', 'income'].includes(category.type) && amount(category.budget))
    .map(category => {
      const migration = CAT_MIGRATE[category.id]
      const migratedName = migration && migration.oldEn.includes(category.name)
        ? migration.es
        : category.name
      return {
        ...category,
        icon: ICONS.has(category.icon) ? category.icon : 'wallet' as const,
        name: migratedName,
      }
    })
  const categoryIds = new Set(categories.map(category => category.id))
  const goals = (Array.isArray(data.goals) ? data.goals : []).filter(goal =>
    text(goal.id) && text(goal.name) && text(goal.color) && amount(goal.target) && goal.target > 0 && amount(goal.saved))
  const goalIds = new Set(goals.map(goal => goal.id))
  const transactions = (Array.isArray(data.transactions) ? data.transactions : []).filter(tx => {
    if (!text(tx.id) || !['income', 'expense', 'transfer'].includes(tx.type) || !amount(tx.amount) || tx.amount <= 0 || !date(tx.date) || !text(tx.note)) return false
    if (tx.type === 'transfer') return !!tx.fromAccount && !!tx.toAccount && accountIds.has(tx.fromAccount) && accountIds.has(tx.toAccount) && tx.fromAccount !== tx.toAccount
    return !!tx.accountId && !!tx.categoryId && accountIds.has(tx.accountId) && categoryIds.has(tx.categoryId)
  }).map(tx => {
    // toAmount: solo válido en transferencias, como número positivo.
    if (tx.toAmount !== undefined && (tx.type !== 'transfer' || !amount(tx.toAmount) || tx.toAmount <= 0)) {
      tx = { ...tx, toAmount: undefined }
    }
    // Trío FX: o están los tres campos válidos, o se van los tres. Un backup
    // manipulado con `fxRate: 0`/NaN corrompería el monto mostrado al usuario.
    const fxOk = tx.originalAmount !== undefined && amount(tx.originalAmount) && tx.originalAmount > 0
      && CURRENCY_CODES.includes(tx.originalCurrency ?? '')
      && tx.fxRate !== undefined && amount(tx.fxRate) && tx.fxRate > 0
    if (!fxOk && (tx.originalAmount !== undefined || tx.originalCurrency !== undefined || tx.fxRate !== undefined)) {
      tx = { ...tx, originalAmount: undefined, originalCurrency: undefined, fxRate: undefined }
    }
    // El marcador de segundo libro solo vale sobre una TARJETA que de verdad
    // tenga divisa secundaria. Un backup con el marcador sobre una cuenta de
    // debito enviaria el gasto a un saldo que no existe y el dinero
    // desapareceria del libro.
    if (tx.onSecondaryBalance) {
      const target = accounts.find(a => a.id === tx.accountId)
      const valid = tx.type !== 'transfer' && target?.type === 'credit' && !!target.secondaryCurrency
      if (!valid) tx = { ...tx, onSecondaryBalance: undefined }
    }
    // Cargos bancarios: cada linea con tipo conocido y monto positivo, y el
    // total NUNCA puede superar al monto del movimiento (que ya los incluye).
    // Un desglose que suma mas que el total mentiria sobre la compra.
    if (tx.fees !== undefined) {
      const kinds = ['itbis-transfer', 'fx-surcharge', 'cash-advance']
      const clean = Array.isArray(tx.fees)
        ? tx.fees.filter(f => f && kinds.includes(f.kind) && amount(f.amount) && f.amount > 0 && amount(f.pct))
        : []
      const sum = clean.reduce((t, f) => t + f.amount, 0)
      tx = { ...tx, fees: clean.length > 0 && sum <= tx.amount + 0.01 ? clean : undefined }
    }
    // Splits: solo válidos si cada parte apunta a una categoría existente con
    // monto positivo y la suma coincide con el total (tolerancia de centavos).
    if (!Array.isArray(tx.splits) || tx.splits.length < 2) {
      return tx.splits === undefined ? tx : { ...tx, splits: undefined }
    }
    const valid = tx.splits.every(split =>
      split && text(split.categoryId) && categoryIds.has(split.categoryId) && amount(split.amount) && split.amount > 0)
    const sum = valid ? tx.splits.reduce((total, split) => total + split.amount, 0) : NaN
    return valid && Math.abs(sum - tx.amount) < 0.01 ? tx : { ...tx, splits: undefined }
  })
  const goalContributions = (Array.isArray(data.goalContributions) ? data.goalContributions : []).filter(contribution =>
    text(contribution.id) && text(contribution.goalId) && text(contribution.fromAccountId)
    && goalIds.has(contribution.goalId) && accountIds.has(contribution.fromAccountId)
    && amount(contribution.amount) && contribution.amount > 0 && date(contribution.date))
  // Back-derivar el saldo de apertura de cuentas antiguas (sin tocar el saldo
  // mostrado): opening = saldo actual − movimientos. Una vez fijado, persiste y
  // permite auditar/recalcular más adelante.
  const accountsWithOpening = accounts.map(account =>
    amount(account.openingBalance)
      ? account
      : { ...account, openingBalance: account.balance - accountMovementsTotal(account.id, transactions, goalContributions) })
  return {
    accounts: accountsWithOpening, categories, goals, transactions, goalContributions,
    currency: ['DOP','USD','EUR','MXN','GBP','COP','ARS','BRL','CAD'].includes(data.currency ?? '') ? data.currency! : 'DOP',
  }
}

/**
 * Recalcula el saldo de cada cuenta desde su saldo de apertura inmutable más la
 * suma de todos sus movimientos. Devuelve las cuentas corregidas; es idempotente
 * cuando no hay deriva.
 */
export function recomputeAccountBalances(
  accounts: Account[], txns: Transaction[], contributions: GoalContribution[],
): Account[] {
  return accounts.map(account => {
    const opening = account.openingBalance ?? account.balance - accountMovementsTotal(account.id, txns, contributions)
    const balance = opening + accountMovementsTotal(account.id, txns, contributions)
    const next = { ...account, openingBalance: opening, balance }
    // El segundo libro se reconcilia con la MISMA invariante que el primero.
    // Si no se reconstruyera aqui, "Recalcular saldos" arreglaria un libro y
    // dejaria el otro derivando en silencio.
    if (account.type === 'credit' && account.secondaryCurrency) {
      const moves = accountSecondaryMovementsTotal(account.id, txns)
      const opening2 = account.secondaryOpeningBalance ?? (account.secondaryBalance ?? 0) - moves
      next.secondaryOpeningBalance = opening2
      next.secondaryBalance = opening2 + moves
    }
    return next
  })
}

/**
 * Igual que `recomputeAccountBalances` pero para `Goal.saved`: evita que el
 * ahorro guardado sea una segunda fuente de verdad frente a la suma real de
 * `GoalContribution` — se reconcilia contra `openingSaved + aportes`.
 */
export function recomputeGoalsSaved(goals: Goal[], contributions: GoalContribution[]): Goal[] {
  return goals.map(goal => {
    const total = contributions
      .filter(contribution => contribution.goalId === goal.id)
      .reduce((sum, contribution) => sum + contribution.amount, 0)
    const opening = goal.openingSaved ?? goal.saved - total
    return { ...goal, openingSaved: opening, saved: opening + total }
  })
}

/**
 * Redondea al entero más cercano TODOS los montos del libro (quita los
 * centavos). Pensado para deshacer los decimales que aparecen tras convertir de
 * moneda y volver (100 → 99.98 → 100), sin tener que editar cada movimiento.
 *
 * Redondea la fuente de verdad —apertura de cuentas/metas y cada
 * movimiento/aporte— y luego RECONSTRUYE saldos y ahorros con las mismas
 * funciones de reconciliación. Así el resultado es entero Y la invariante
 * `saldo = apertura + movimientos` se mantiene, en vez de redondear cada saldo
 * por separado (que la rompería). Los splits se re-cuadran para que sigan
 * sumando el monto redondeado del movimiento.
 */
export function roundFinanceAmounts(data: FinanceData): FinanceData {
  const r = (n: number) => Math.round(n)

  const transactions = data.transactions.map(tx => {
    const amount = r(tx.amount)
    let splits = tx.splits
    if (tx.splits && tx.splits.length >= 2) {
      const rounded = tx.splits.map(s => ({ ...s, amount: r(s.amount) }))
      // Cuadrar la diferencia de redondeo en la parte de mayor monto, para que
      // las partes sigan sumando exactamente el total redondeado.
      const diff = amount - rounded.reduce((sum, s) => sum + s.amount, 0)
      if (diff !== 0 && rounded.length > 0) {
        const idx = rounded.reduce((best, s, i, arr) => (s.amount > arr[best].amount ? i : best), 0)
        rounded[idx] = { ...rounded[idx], amount: rounded[idx].amount + diff }
      }
      splits = rounded
    }
    return {
      ...tx,
      amount,
      ...(tx.toAmount !== undefined ? { toAmount: r(tx.toAmount) } : {}),
      ...(splits ? { splits } : {}),
    }
  })

  const goalContributions = data.goalContributions.map(gc => ({ ...gc, amount: r(gc.amount) }))

  const accounts = recomputeAccountBalances(
    data.accounts.map(a => ({
      ...a,
      openingBalance: r(a.openingBalance ?? a.balance),
      ...(a.limit !== undefined ? { limit: r(a.limit) } : {}),
    })),
    transactions,
    goalContributions,
  )

  const goals = recomputeGoalsSaved(
    data.goals.map(g => ({ ...g, openingSaved: r(g.openingSaved ?? g.saved), target: r(g.target) })),
    goalContributions,
  )

  const categories = data.categories.map(c => ({
    ...c,
    budget: r(c.budget),
    ...(c.weeklyBudget !== undefined ? { weeklyBudget: r(c.weeklyBudget) } : {}),
    ...(c.annualBudget !== undefined ? { annualBudget: r(c.annualBudget) } : {}),
  }))

  return { accounts, transactions, categories, goals, goalContributions, currency: data.currency }
}

// ── Helpers de balance (inmutables) ──────────────────────
function applyBalance(accounts: Account[], tx: Transaction, sign: 1 | -1): Account[] {
  if (tx.type === 'transfer') {
    return accounts.map(a => {
      if (a.id === tx.fromAccount) return { ...a, balance: a.balance - sign * tx.amount }
      if (a.id === tx.toAccount)   return { ...a, balance: a.balance + sign * (tx.toAmount ?? tx.amount) }
      return a
    })
  }
  return accounts.map(a => {
    if (a.id !== tx.accountId) return a
    // Segundo libro de una tarjeta: el monto ya esta en la divisa secundaria,
    // no se convierte, y el saldo principal no se toca.
    if (tx.onSecondaryBalance) {
      const current = a.secondaryBalance ?? 0
      if (tx.type === 'income')  return { ...a, secondaryBalance: current + sign * tx.amount }
      if (tx.type === 'expense') return { ...a, secondaryBalance: current - sign * tx.amount }
      return a
    }
    if (tx.type === 'income')  return { ...a, balance: a.balance + sign * tx.amount }
    if (tx.type === 'expense') return { ...a, balance: a.balance - sign * tx.amount }
    return a
  })
}

function sortTxns(txns: Transaction[]): Transaction[] {
  return [...txns].sort((a, b) => (a.date < b.date ? 1 : -1))
}

function assertTransactionShape(tx: Transaction, accounts: Account[], categories: Category[]): void {
  if (!['income', 'expense', 'transfer'].includes(tx.type)) throw new Error(tt('errInvalidTransaction'))
  if (!Number.isFinite(tx.amount) || tx.amount <= 0) throw new Error(tt('errAmountPositive'))
  if (!date(tx.date) || !text(tx.note)) throw new Error(tt('fillAllError'))

  const accountIds = new Set(accounts.map(account => account.id))
  const categoryIds = new Set(categories.map(category => category.id))

  if (tx.type === 'transfer') {
    if (!tx.fromAccount || !tx.toAccount || tx.fromAccount === tx.toAccount) throw new Error(tt('errSameAccount'))
    if (!accountIds.has(tx.fromAccount)) throw new Error(tt('errAccountNotExist'))
    if (!accountIds.has(tx.toAccount)) throw new Error(tt('errDestAccountNotExist'))
    return
  }

  if (!tx.accountId || !accountIds.has(tx.accountId)) throw new Error(tt('errAccountNotExist'))
  if (tx.categoryId && categoryIds.size > 0 && !categoryIds.has(tx.categoryId)) throw new Error(tt('categoryError'))
}

function normalizeTransaction(tx: Transaction): Transaction {
  if (tx.type === 'transfer') {
    const { id, type, amount, date, note, fromAccount, toAccount, toAmount, tags } = tx
    return {
      id, type, amount, date, note, fromAccount, toAccount,
      ...(toAmount !== undefined && Number.isFinite(toAmount) && toAmount > 0 ? { toAmount } : {}),
      ...(tags?.length ? { tags } : {}),
    }
  }

  const {
    id, type, amount, date, note, categoryId, accountId, splits,
    recurring, recurringStart, recurringEnd, recurringNext, skippedDates, serviceId, generatedFrom, tags,
    detectedFrom, originalAmount, originalCurrency, fxRate, onSecondaryBalance, fees,
  } = tx
  // Los 3 campos FX viajan JUNTOS o no viajan: un `originalAmount` sin su
  // `fxRate` no se puede auditar ni volver a explicar, así que se descarta el
  // trío entero antes que guardar una conversión a medias.
  const hasFx = originalAmount !== undefined && Number.isFinite(originalAmount) && originalAmount > 0
    && !!originalCurrency && fxRate !== undefined && Number.isFinite(fxRate) && fxRate > 0
  return {
    id, type, amount, date, note, categoryId, accountId,
    ...(type === 'expense' && splits && splits.length >= 2 ? { splits } : {}),
    ...(recurring ? { recurring, recurringStart, recurringEnd, recurringNext, skippedDates } : {}),
    ...(recurring && serviceId ? { serviceId } : {}),
    ...(!recurring && generatedFrom ? { generatedFrom } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(detectedFrom ? { detectedFrom } : {}),
    ...(hasFx ? { originalAmount, originalCurrency, fxRate } : {}),
    ...(onSecondaryBalance ? { onSecondaryBalance: true } : {}),
    ...(fees?.length ? { fees } : {}),
  }
}

/**
 * Transferencias entre cuentas de distinta divisa: fija `toAmount` (lo que
 * recibe el destino en SU divisa) con la tasa del momento, para que el saldo
 * de ambas cuentas quede correcto y no derive si las tasas cambian después.
 */
function withCrossCurrencyAmount(tx: Transaction, accounts: Account[], base: CurrencyCode): Transaction {
  if (tx.type !== 'transfer' || tx.toAmount !== undefined) return tx
  const from = accounts.find(a => a.id === tx.fromAccount)
  const to = accounts.find(a => a.id === tx.toAccount)
  const fromCur = from?.currency ?? base
  const toCur = to?.currency ?? base
  if (fromCur === toCur) return tx
  return { ...tx, toAmount: convertCurrency(tx.amount, fromCur, toCur) }
}

export function assertAvailableBalance(accounts: Account[], accountId: string, amount: number, base: CurrencyCode = 'DOP'): void {
  const account = accounts.find(a => a.id === accountId)
  if (!account) throw new Error(tt('errAccountNotExist'))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error(tt('errAmountPositive'))
  if (account.type === 'credit') {
    // El límite lo consumen las DOS deudas de la tarjeta. Medirlo solo contra
    // el saldo local dejaría pasar un gasto en una tarjeta que ya está al tope
    // por su deuda en dólares.
    if (account.limit !== undefined
      && creditUsedInPrimary(account, base) + amount > account.limit)
      throw new Error(tt('errCreditLimitExceeded', { name: account.name }))
    return
  }
  if (account.balance < amount) throw new Error(tt('errInsufficientBalance', { name: account.name }))
}

export function canDeleteAccount(accountId: string, txns: Transaction[]): boolean {
  return !txns.some(tx => tx.accountId === accountId || tx.fromAccount === accountId || tx.toAccount === accountId)
}

export function canDeleteCategory(categoryId: string, txns: Transaction[]): boolean {
  return !txns.some(tx => tx.categoryId === categoryId)
}

function assertManualExpenseBalance(accounts: Account[], tx: Transaction, policy = useSettings.getState().overdraftPolicy, base: CurrencyCode = 'DOP'): void {
  if (tx.type !== 'expense' || !tx.accountId) return
  const accountPolicy = accounts.find(account => account.id === tx.accountId)?.overdraftPolicy ?? policy
  if (accountPolicy !== 'block') return
  assertAvailableBalance(accounts, tx.accountId, tx.amount, base)
}

export function applyImportedBalances(accounts: Account[], txs: Transaction[], policy: OverdraftPolicy): Account[] {
  return txs.reduce((next, tx) => {
    assertManualExpenseBalance(next, tx, policy)
    return applyBalance(next, tx, 1)
  }, accounts)
}

export function restoreFinanceDataWithSnapshot(
  current: FinanceState,
  data: Pick<FinanceState, 'accounts' | 'transactions' | 'categories' | 'goals' | 'goalContributions' | 'currency'>,
): FinanceData {
  createRecoverySnapshot(current, 'pre-restore')
  const sanitized = sanitizeFinanceData(data)
  // Chequeo de salud tras restaurar: si el backup traía un saldo o ahorro
  // desviado (de un bug previo, una edición manual del JSON, etc.), se
  // reconcilia contra apertura/aportes en vez de propagar el número dañado.
  return {
    ...sanitized,
    accounts: recomputeAccountBalances(sanitized.accounts, sanitized.transactions, sanitized.goalContributions),
    goals: recomputeGoalsSaved(sanitized.goals, sanitized.goalContributions),
  }
}

// ── Tipos del store ───────────────────────────────────────
export interface FinanceState {
  accounts:     Account[]
  transactions: Transaction[]
  categories:   Category[]
  goals:        Goal[]
  goalContributions: GoalContribution[]
  currency:     CurrencyCode

  // Transacciones
  addTx:    (tx: Omit<Transaction, 'id'> & { id?: string }) => void
  importTxs: (txs: Array<Omit<Transaction, 'id'> & { id?: string }>) => void
  updateTx: (id: string, fields: Partial<Omit<Transaction, 'id'>>) => void
  deleteTx: (id: string) => void
  transfer: (p: { fromAccount: string; toAccount: string; amount: number; date: string; note?: string }) => void

  // Cuentas
  addAccount:    (account: Omit<Account, 'id'>) => void
  updateAccount: (id: string, fields: Partial<Omit<Account, 'id'>>) => void
  deleteAccount: (id: string) => void
  /** Reinserta una cuenta borrada tal cual (mismo id) — para el «Deshacer». */
  restoreAccount: (account: Account) => void
  // Concilia el saldo real (ej. el del banco) contra el calculado: si difieren,
  // crea un movimiento de ajuste visible en el libro (nunca sobreescribe el
  // saldo en silencio). Devuelve la diferencia aplicada (0 = ya cuadraba).
  reconcileAccount: (id: string, balance: number) => number

  // Metas
  addGoal:     (g: Omit<Goal, 'id'>) => void
  updateGoal:  (id: string, fields: Partial<Goal>) => void
  deleteGoal:  (id: string) => void
  /** Reinserta una meta borrada junto con sus aportes (mismos ids) — «Deshacer». */
  restoreGoal: (goal: Goal, contributions: GoalContribution[]) => void
  contribute:  (goalId: string, amount: number, fromAccountId: string, note?: string, date?: string) => void

  // Categorías
  addCategory:    (c: Omit<Category, 'id'>) => void
  updateCategory: (id: string, fields: Partial<Category>) => void
  deleteCategory: (id: string) => void
  transferEnvelopeFunds: (fromCategoryId: string, toCategoryId: string, amount: number) => void

  // Config
  setCurrency: (code: CurrencyCode) => void

  // Integridad: recalcula los saldos desde apertura + movimientos.
  // Devuelve cuántas cuentas estaban derivadas (se corrigieron).
  recomputeBalances: () => number

  // Redondea al entero más cercano todos los montos (quita centavos). Crea un
  // punto de recuperación antes, porque es destructivo. Devuelve cuántos
  // movimientos cambiaron de valor.
  roundAllAmounts: () => number

  // Datos
  startDemo:  () => void
  startEmpty: () => void
  restoreBackup: (data: Pick<FinanceState, 'accounts' | 'transactions' | 'categories' | 'goals' | 'goalContributions' | 'currency'>) => void
}

// ── Store ─────────────────────────────────────────────────
export const useFinance = create<FinanceState>()(
  persist(
    (set, get) => ({
      ...makeDemo(),
      goalContributions: [],
      currency: 'DOP',

      // ── Transacciones ──────────────────────────────────
      addTx: (tx) => set(s => {
        const full: Transaction = withCrossCurrencyAmount(
          normalizeTransaction({ id: newId(), ...tx } as Transaction), s.accounts, s.currency)
        assertTransactionShape(full, s.accounts, s.categories)
        if (full.type === 'transfer') assertAvailableBalance(s.accounts, full.fromAccount!, full.amount, s.currency)
        assertManualExpenseBalance(s.accounts, full, undefined, s.currency)
        if (full.type !== 'transfer' && full.categoryId) learnCategoryRule(full.note, full.categoryId)
        return {
          transactions: sortTxns([full, ...s.transactions]),
          accounts:     applyBalance(s.accounts, full, 1),
        }
      }),

      importTxs: (txs) => set(s => {
        const full = txs.map(tx => normalizeTransaction({ id: newId(), ...tx } as Transaction))
        full.forEach(tx => assertTransactionShape(tx, s.accounts, s.categories))
        const accounts = applyImportedBalances(s.accounts, full, useSettings.getState().overdraftPolicy)
        return {
          transactions: sortTxns([...full, ...s.transactions]),
          accounts,
        }
      }),

      updateTx: (id, fields) => set(s => {
        const idx = s.transactions.findIndex(t => t.id === id)
        if (idx < 0) return s
        const old  = s.transactions[idx]
        if (old.type === 'transfer' && fields.type && fields.type !== 'transfer') throw new Error(tt('errEditTransferAsMovement'))
        if (old.type !== 'transfer' && fields.type === 'transfer') throw new Error(tt('errUseTransferFlow'))
        let next = normalizeTransaction({ ...old, ...fields } as Transaction)
        // Si cambió el monto o alguna cuenta de una transferencia, el toAmount
        // guardado quedó obsoleto: se recalcula con la tasa actual.
        if (next.type === 'transfer' && fields.toAmount === undefined
          && (fields.amount !== undefined || fields.fromAccount !== undefined || fields.toAccount !== undefined)) {
          next = withCrossCurrencyAmount({ ...next, toAmount: undefined }, s.accounts, s.currency)
        }
        assertTransactionShape(next, s.accounts, s.categories)
        const reverted = applyBalance(s.accounts, old, -1)
        if (next.type === 'transfer') assertAvailableBalance(reverted, next.fromAccount!, next.amount, s.currency)
        assertManualExpenseBalance(reverted, next, undefined, s.currency)
        if (next.type !== 'transfer' && next.categoryId && next.categoryId !== old.categoryId) {
          learnCategoryRule(next.note, next.categoryId)
        }
        const accs = applyBalance(reverted, next, 1)
        const txns = [...s.transactions]
        txns[idx]  = next
        return { transactions: sortTxns(txns), accounts: accs }
      }),

      deleteTx: (id) => set(s => {
        const tx = s.transactions.find(t => t.id === id)
        if (!tx) return s
        return {
          transactions: s.transactions.filter(t => t.id !== id),
          accounts:     applyBalance(s.accounts, tx, -1),
        }
      }),

      transfer: ({ fromAccount, toAccount, amount, date, note }) => set(s => {
        if (fromAccount === toAccount) throw new Error(tt('errSameAccount'))
        assertAvailableBalance(s.accounts, fromAccount, amount, s.currency)
        if (!s.accounts.some(a => a.id === toAccount)) throw new Error(tt('errDestAccountNotExist'))
        const tx: Transaction = withCrossCurrencyAmount({
          id: newId(), type: 'transfer',
          amount, fromAccount, toAccount,
          date, note: note ?? 'Transferencia',
        }, s.accounts, s.currency)
        return {
          transactions: sortTxns([tx, ...s.transactions]),
          accounts:     applyBalance(s.accounts, tx, 1),
        }
      }),

      // Cuentas
      addAccount: (account) => set(s => {
        // EFECTIVO UNICO, tambien al crear. El saneado ya degradaba un segundo
        // efectivo a ahorro al recargar, pero eso llegaba tarde: el usuario
        // veia su cuenta cambiar de tipo sola. Aqui se rechaza de entrada.
        if (account.type === 'cash' && s.accounts.some(a => a.type === 'cash')) {
          throw new Error(tt('errCashAlreadyExists'))
        }
        return {
          // Cuenta nueva sin movimientos: el saldo de apertura es el saldo inicial.
          accounts: [...s.accounts, { id: newId('acc_'), ...account, openingBalance: account.openingBalance ?? account.balance }],
        }
      }),

      updateAccount: (id, fields) => set(s => {
        const account = s.accounts.find(a => a.id === id)
        if (!account) return s

        // Detecta si esta edición REALMENTE cambia la divisa efectiva de la
        // cuenta (no solo si la clave "currency" viene en el objeto — el
        // editor siempre la incluye, cambie o no). Comparamos el valor
        // resultante contra el actual.
        const oldCur = account.currency ?? s.currency
        const newCur = ('currency' in fields ? fields.currency : account.currency) ?? s.currency
        const currencyChanged = 'currency' in fields && newCur !== oldCur

        if (!currencyChanged) {
          return {
            accounts: s.accounts.map(a => {
              if (a.id !== id) return a
              const next = { ...a, ...fields }
              // Editar el saldo a mano es una corrección del saldo actual: ajustamos
              // el saldo de apertura para preservar la invariante opening + movimientos.
              if (fields.balance !== undefined && fields.openingBalance === undefined) {
                next.openingBalance = fields.balance - accountMovementsTotal(id, s.transactions, s.goalContributions)
              }
              return next
            }),
          }
        }

        // La divisa de la cuenta cambió: su saldo, apertura, límite y los
        // montos de SUS transacciones/aportes están guardados en la divisa
        // vieja — hay que re-expresarlos en la nueva. Sin esto, el número se
        // queda igual pero la app lo reinterpreta en otra moneda en cada
        // cálculo posterior (mismo bug que tenía el cambio de divisa global).
        const decimals = CURRENCIES[newCur].decimals
        const factor = 10 ** decimals
        const conv = (n: number) => Math.round(convertCurrency(n, oldCur, newCur) * factor) / factor

        return {
          accounts: s.accounts.map(a => {
            if (a.id !== id) return a
            const next = { ...a, ...fields, balance: conv(fields.balance ?? a.balance) }
            if (a.openingBalance !== undefined) next.openingBalance = conv(fields.openingBalance ?? a.openingBalance)
            if (a.limit !== undefined) next.limit = conv(fields.limit ?? a.limit)
            return next
          }),
          transactions: s.transactions.map(t => {
            if (t.type === 'transfer') {
              // amount = en la divisa de fromAccount; toAmount = en la de
              // toAccount (implícito == amount si nunca difirieron entre sí).
              if (t.fromAccount === id) return { ...t, amount: conv(t.amount), toAmount: t.toAmount ?? t.amount }
              if (t.toAccount === id) return { ...t, toAmount: conv(t.toAmount ?? t.amount) }
              return t
            }
            if (t.accountId !== id) return t
            return {
              ...t,
              amount: conv(t.amount),
              ...(t.splits ? { splits: t.splits.map(sp => ({ ...sp, amount: conv(sp.amount) })) } : {}),
            }
          }),
          goalContributions: s.goalContributions.map(gc =>
            gc.fromAccountId === id ? { ...gc, amount: conv(gc.amount) } : gc),
        }
      }),

      deleteAccount: (id) => set(s => {
        if (!canDeleteAccount(id, s.transactions)) throw new Error(tt('errDeleteAccountWithTxns'))
        if (s.goalContributions.some(contribution => contribution.fromAccountId === id)) throw new Error(tt('errDeleteAccountWithContribs'))
        return { accounts: s.accounts.filter(account => account.id !== id) }
      }),

      // Solo se puede borrar una cuenta sin movimientos ni aportes (ver
      // deleteAccount), así que restaurarla es reinsertar el objeto tal cual:
      // no hay saldos que recalcular. Se ignora si ya existe otra con ese id,
      // por si el usuario tocó «Deshacer» dos veces.
      restoreAccount: (account) => set(s =>
        s.accounts.some(a => a.id === account.id) ? s : { accounts: [...s.accounts, account] }),

      reconcileAccount: (id, balance) => {
        const s = get()
        const account = s.accounts.find(a => a.id === id)
        if (!account) return 0
        const diff = Math.round((balance - account.balance) * 100) / 100
        if (Math.abs(diff) < 0.005) return 0
        const tx = normalizeTransaction({
          id: newId(), type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff),
          accountId: id, date: localToday(), note: tt('reconciliationAdjustmentNote'),
        } as Transaction)
        set({
          transactions: sortTxns([tx, ...s.transactions]),
          accounts: applyBalance(s.accounts, tx, 1),
        })
        return diff
      },

      // ── Metas ──────────────────────────────────────────
      addGoal: (g) => set(s => ({
        // Meta nueva sin aportes: el ahorro inicial es el ahorro de apertura.
        goals: [...s.goals, { id: newId('goal_'), ...g, saved: g.saved ?? 0, openingSaved: g.openingSaved ?? g.saved ?? 0 }],
      })),

      updateGoal: (id, fields) => set(s => ({
        goals: s.goals.map(g => {
          if (g.id !== id) return g
          const next = { ...g, ...fields }
          // Editar el ahorro a mano es una corrección del ahorro actual: ajustamos
          // el ahorro de apertura para preservar la invariante opening + aportes.
          if (fields.saved !== undefined && fields.openingSaved === undefined) {
            const contributed = s.goalContributions
              .filter(contribution => contribution.goalId === id)
              .reduce((sum, contribution) => sum + contribution.amount, 0)
            next.openingSaved = fields.saved - contributed
          }
          return next
        }),
      })),

      deleteGoal: (id) => set(s => ({
        goals: s.goals.filter(g => g.id !== id),
        goalContributions: s.goalContributions.filter(contribution => contribution.goalId !== id),
      })),

      // Borrar una meta se lleva también sus aportes (arriba), así que restaurar
      // reinserta ambos. Los aportes no se re-suman a ningún saldo: al aportar
      // ya se descontó de la cuenta y borrar la meta no lo devolvió, así que el
      // dinero sigue igual — solo se recompone el historial de la meta.
      restoreGoal: (goal, contributions) => set(s => {
        if (s.goals.some(g => g.id === goal.id)) return s
        return {
          goals: [...s.goals, goal],
          goalContributions: [...s.goalContributions, ...contributions],
        }
      }),

      contribute: (goalId, amount, fromAccountId, note, date) => set(s => {
        assertAvailableBalance(s.accounts, fromAccountId, amount, s.currency)
        if (!s.goals.some(g => g.id === goalId)) throw new Error(tt('errGoalNotExist'))
        const contribution: GoalContribution = {
          id: newId('contrib_'),
          goalId,
          amount,
          fromAccountId,
          date: date ?? localToday(),
          note: note?.trim() || undefined,
        }
        return {
          goals:    s.goals.map(g => g.id === goalId ? { ...g, saved: g.saved + amount } : g),
          accounts: s.accounts.map(a => a.id === fromAccountId ? { ...a, balance: a.balance - amount } : a),
          goalContributions: [contribution, ...s.goalContributions],
        }
      }),

      // ── Categorías ─────────────────────────────────────
      addCategory: (c) => set(s => {
        if (!text(c.name) || !/\p{L}/u.test(c.name)) throw new Error('Escribe un nombre válido para la categoría.')
        return { categories: [...s.categories, { id: newId('cat_'), ...c, name: c.name.trim() }] }
      }),

      updateCategory: (id, fields) => set(s => {
        if (fields.name !== undefined && (!text(fields.name) || !/\p{L}/u.test(fields.name))) throw new Error('Escribe un nombre válido para la categoría.')
        return { categories: s.categories.map(c => c.id === id ? { ...c, ...fields, ...(fields.name ? { name: fields.name.trim() } : {}) } : c) }
      }),

      deleteCategory: (id) => set(s => {
        if (!canDeleteCategory(id, s.transactions)) throw new Error(tt('errDeleteCategoryWithTxns'))
        return { categories: s.categories.filter(c => c.id !== id) }
      }),

      // Mueve dinero asignado de un sobre a otro (envelope budgeting): resta
      // del origen y suma al destino en una sola actualización atómica, sin
      // tocar transacciones ni saldos de cuenta reales.
      transferEnvelopeFunds: (fromCategoryId, toCategoryId, amount) => set(s => {
        const from = s.categories.find(c => c.id === fromCategoryId)
        const to = s.categories.find(c => c.id === toCategoryId)
        const error = validateEnvelopeTransfer(from, to, amount)
        if (error === 'notFound') throw new Error(tt('errEnvelopeNotFound'))
        if (error === 'sameCategory') throw new Error(tt('errEnvelopeSameCategory'))
        if (error === 'invalidAmount') throw new Error(tt('errEnvelopeInvalidAmount'))
        if (error === 'insufficientFunds') throw new Error(tt('errEnvelopeInsufficientFunds'))
        return {
          categories: s.categories.map(c => {
            if (c.id === fromCategoryId) return { ...c, budget: c.budget - amount }
            if (c.id === toCategoryId) return { ...c, budget: c.budget + amount }
            return c
          }),
        }
      }),

      // ── Config ─────────────────────────────────────────
      // Cambia la moneda activa y re-expresa todos los montos en la nueva
      // moneda. CLAVE: cada monto se convierte desde SU divisa real —
      // `account.currency` para cuentas con divisa propia (y sus movimientos /
      // aportes), o la base anterior para el resto — NO desde la base anterior
      // a ciegas. Al convertir una cuenta con divisa propia se limpia esa
      // divisa (todo queda expresado en la nueva base). Esto evita que una
      // cuenta en, p.ej., COP se multiplique por la tasa DOP→COP y, peor aún,
      // que ese error se componga cada vez que se cambia de moneda.
      setCurrency: (currency) => set(s => {
        if (currency === s.currency) return { currency }

        const oldBase = s.currency
        const decimals = CURRENCIES[currency].decimals
        const factor = 10 ** decimals
        const conv = (n: number, from: CurrencyCode) =>
          Math.round(convertCurrency(n, from, currency) * factor) / factor

        // Divisa real de cada cuenta ANTES de normalizar (la propia o la base vieja).
        const accountCur = new Map<string, CurrencyCode>(
          s.accounts.map(a => [a.id, a.currency ?? oldBase]))
        const curOf = (id?: string): CurrencyCode => (id && accountCur.get(id)) || oldBase

        return {
          currency,
          accounts: s.accounts.map(a => {
            const from = a.currency ?? oldBase
            const { currency: _own, ...rest } = a
            return {
              ...rest,
              balance: conv(a.balance, from),
              ...(a.openingBalance !== undefined ? { openingBalance: conv(a.openingBalance, from) } : {}),
              ...(a.limit !== undefined ? { limit: conv(a.limit, from) } : {}),
            }
          }),
          transactions: s.transactions.map(t => {
            if (t.type === 'transfer') {
              return {
                ...t,
                amount: conv(t.amount, curOf(t.fromAccount)),
                ...(t.toAmount !== undefined ? { toAmount: conv(t.toAmount, curOf(t.toAccount)) } : {}),
              }
            }
            const from = curOf(t.accountId)
            return {
              ...t,
              amount: conv(t.amount, from),
              ...(t.splits ? { splits: t.splits.map(sp => ({ ...sp, amount: conv(sp.amount, from) })) } : {}),
            }
          }),
          categories: s.categories.map(c => ({
            ...c,
            budget: conv(c.budget, oldBase),
            ...(c.weeklyBudget !== undefined ? { weeklyBudget: conv(c.weeklyBudget, oldBase) } : {}),
            ...(c.annualBudget !== undefined ? { annualBudget: conv(c.annualBudget, oldBase) } : {}),
          })),
          goals: s.goals.map(g => ({ ...g, target: conv(g.target, oldBase), saved: conv(g.saved, oldBase) })),
          goalContributions: s.goalContributions.map(gc => ({ ...gc, amount: conv(gc.amount, curOf(gc.fromAccountId)) })),
        }
      }),

      // ── Integridad de saldos ───────────────────────────
      recomputeBalances: () => {
        const { accounts, transactions, goals, goalContributions } = get()
        const recomputedAccounts = recomputeAccountBalances(accounts, transactions, goalContributions)
        const recomputedGoals = recomputeGoalsSaved(goals, goalContributions)
        // Cuenta la deriva de AMBOS libros: una tarjeta cuyo saldo en dolares
        // derivo pero el de pesos no, tambien esta rota.
        const driftedAccounts = recomputedAccounts.reduce((n, account, i) => {
          const primary = Math.abs(account.balance - accounts[i].balance) > 0.005
          const secondary = Math.abs((account.secondaryBalance ?? 0) - (accounts[i].secondaryBalance ?? 0)) > 0.005
          return primary || secondary ? n + 1 : n
        }, 0)
        const driftedGoals = recomputedGoals.reduce((n, goal, i) =>
          Math.abs(goal.saved - goals[i].saved) > 0.005 ? n + 1 : n, 0)
        set({ accounts: recomputedAccounts, goals: recomputedGoals })
        return driftedAccounts + driftedGoals
      },

      roundAllAmounts: () => {
        const state = get()
        const data: FinanceData = {
          accounts: state.accounts, transactions: state.transactions, categories: state.categories,
          goals: state.goals, goalContributions: state.goalContributions, currency: state.currency,
        }
        // Reversible: un punto de recuperación antes de tocar nada.
        createRecoverySnapshot(state, 'pre-round')
        const rounded = roundFinanceAmounts(data)
        const changed = rounded.transactions.reduce((n, tx, i) =>
          tx.amount !== state.transactions[i].amount ? n + 1 : n, 0)
        set(rounded)
        return changed
      },

      // ── Datos demo / vacío ─────────────────────────────
      startDemo:  () => set({ ...makeDemo(), goalContributions: [], currency: 'DOP' }),
      startEmpty: () => set({ ...makeEmpty(), goalContributions: [], currency: 'DOP' }),
      restoreBackup: (data) => set(s => restoreFinanceDataWithSnapshot(s, data)),
    }),
    {
      name:    'sharky-finance-v2',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({ ...current, ...sanitizeFinanceData(persisted) }),
    },
  ),
)
