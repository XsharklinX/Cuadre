import { CURRENCIES } from './seed'
import type { Account, Category, Transaction } from '@/types'

/**
 * Fábrica de datos de prueba a lo bestia — solo desde el modo desarrollador.
 *
 * Existe para responder una pregunta que los datos de demostración (cuatro
 * cuentas, un año de movimientos) no pueden responder: ¿la app aguanta a
 * alguien que lleva tres años registrando todo? El historial virtualiza, pero
 * Analítica recorre el libro entero varias veces por render, y eso no se nota
 * hasta que hay miles de movimientos.
 *
 * Determinista a propósito: la misma semilla da el mismo libro, así que si
 * algo se rompe con 5.000 movimientos se puede volver a romper igual.
 */

function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface StressOptions {
  accounts: number
  transactions: number
  /** Meses hacia atrás que abarca el libro generado. */
  months: number
  seed?: number
}

export interface StressData {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}

const COLORS = ['#3b82f6', '#22c55e', '#a78bfa', '#f59e0b', '#ff6b8a', '#2dd4bf', '#f472b6', '#818cf8']
const TYPES: Account['type'][] = ['debit', 'savings', 'credit']

/**
 * @param options.accounts Incluye SIEMPRE una cuenta de efectivo, porque el
 *   libro exige que exista exactamente una y el saneador la reintroduciría.
 */
export function makeStressData(options: StressOptions): StressData {
  const { accounts: accountCount, transactions: txCount, months, seed = 424242 } = options
  const rnd = makeRng(seed)
  const pick = <T>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]

  const accounts: Account[] = [{
    id: 'acc_cash', name: 'Efectivo', short: 'Efectivo', type: 'cash',
    color: '#f59e0b', balance: 5_000, openingBalance: 5_000, last4: null,
  }]

  for (let i = 1; i < Math.max(1, accountCount); i++) {
    const type = TYPES[i % TYPES.length]
    const credit = type === 'credit'
    accounts.push({
      id: `acc_s${i}`,
      name: `${credit ? 'Tarjeta' : 'Cuenta'} ${i}`,
      short: credit ? 'Crédito' : 'Cuenta',
      type,
      color: COLORS[i % COLORS.length],
      balance: credit ? -Math.round(rnd() * 40_000) : Math.round(rnd() * 200_000),
      openingBalance: 0,
      last4: String(1000 + i).slice(-4),
      ...(credit ? { limit: 50_000 + i * 1_000 } : {}),
      // Una de cada cinco tarjetas arrastra deuda en dólares: es el caso que
      // más cálculo cuesta (dos libros + conversión) y el que hay que medir.
      ...(credit && i % 5 === 0
        ? { secondaryCurrency: 'USD' as const, secondaryBalance: -Math.round(rnd() * 800), secondaryOpeningBalance: 0 }
        : {}),
    })
  }

  const categories: Category[] = ['Vivienda', 'Supermercado', 'Restaurantes', 'Transporte', 'Servicios', 'Salud', 'Compras', 'Salario']
    .map((name, i) => ({
      id: `cat_s${i}`,
      name,
      type: name === 'Salario' ? 'income' : 'expense',
      color: COLORS[i % COLORS.length],
      budget: i < 3 ? 20_000 : 0,
      icon: 'wallet' as const,
    }))

  const expenseCats = categories.filter(c => c.type === 'expense')
  const incomeCats = categories.filter(c => c.type === 'income')
  const now = new Date()
  const transactions: Transaction[] = []

  for (let i = 0; i < txCount; i++) {
    const back = Math.floor(rnd() * months)
    const day = 1 + Math.floor(rnd() * 28)
    const d = new Date(now.getFullYear(), now.getMonth() - back, day)
    const income = rnd() < 0.12
    const account = pick(accounts)
    const category = income ? pick(incomeCats) : pick(expenseCats)
    transactions.push({
      id: `tx_s${i}`,
      type: income ? 'income' : 'expense',
      amount: income ? 20_000 + Math.round(rnd() * 40_000) : 100 + Math.round(rnd() * 9_000),
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      note: income ? 'Ingreso de prueba' : `Gasto de prueba ${i}`,
      categoryId: category.id,
      accountId: account.id,
    })
  }

  transactions.sort((a, b) => (a.date < b.date ? 1 : -1))
  return { accounts, categories, transactions }
}

/**
 * SABOTAJES — romper el libro a propósito para ver si las defensas reaccionan.
 *
 * Cada una reproduce un fallo REAL que ya ocurrió: un saldo que no cuadra con
 * sus movimientos (lo que "Recalcular" debe encontrar) y un trío FX corrupto
 * (lo que el saneador debe tirar entero en vez de mostrar un monto inventado).
 */
export type SabotageKind = 'drift' | 'fx'

export function sabotageAccounts(accounts: Account[], amount = 1_234.56): Account[] {
  // Se mueve el SALDO sin tocar los movimientos: eso es exactamente "derivar".
  return accounts.map((a, i) => (i === 0 ? { ...a, balance: a.balance + amount } : a))
}

export function sabotageFx(transactions: Transaction[]): Transaction[] {
  const target = transactions.find(t => t.type !== 'transfer')
  if (!target) return transactions
  return transactions.map(t => (t.id === target.id
    ? { ...t, originalAmount: 100, originalCurrency: 'USD' as keyof typeof CURRENCIES, fxRate: 0 }
    : t))
}
