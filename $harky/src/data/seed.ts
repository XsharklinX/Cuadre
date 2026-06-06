import type { Account, Category, Goal, Transaction, Currency, CurrencyCode } from '@/types'

// ── Fecha base de los datos demo ──────────────────────────
export const TODAY = new Date()

// ── Monedas ───────────────────────────────────────────────
export const CURRENCIES: Record<CurrencyCode, Currency> = {
  DOP: { code: 'DOP', symbol: 'RD$', rate: 1,            decimals: 2 },
  USD: { code: 'USD', symbol: 'US$', rate: 1 / 58.5,     decimals: 2 },
  EUR: { code: 'EUR', symbol: '€',   rate: 0.92 / 58.5,  decimals: 2 },
  MXN: { code: 'MXN', symbol: 'MX$', rate: 17.1 / 58.5,  decimals: 2 },
  GBP: { code: 'GBP', symbol: '£',   rate: 0.79 / 58.5,  decimals: 2 },
  COP: { code: 'COP', symbol: 'COP', rate: 3950 / 58.5,  decimals: 0 },
  ARS: { code: 'ARS', symbol: 'AR$', rate: 900 / 58.5,   decimals: 0 },
  BRL: { code: 'BRL', symbol: 'R$',  rate: 5.0 / 58.5,   decimals: 2 },
  CAD: { code: 'CAD', symbol: 'CA$', rate: 1.36 / 58.5,  decimals: 2 },
}

// ── Seeds ─────────────────────────────────────────────────

// Demo accounts (only used in makeDemo)
const ACCOUNTS_DEMO: Account[] = [
  { id: 'acc_popular', name: 'Main Bank',    short: 'Debit',   type: 'debit',   color: '#3b82f6', balance: 84250.75,   last4: '4821' },
  { id: 'acc_bhd',     name: 'Savings Bank', short: 'Savings', type: 'savings', color: '#22c55e', balance: 152800.00,  last4: '1093' },
  { id: 'acc_visa',    name: 'Visa Platinum', short: 'Credit', type: 'credit',  color: '#a78bfa', balance: -23410.40, last4: '7745', limit: 120000 },
  { id: 'acc_cash',    name: 'Cash',          short: 'Cash',   type: 'cash',    color: '#f59e0b', balance: 6500.00,   last4: null },
]

// Fresh start: only one Cash account
const ACCOUNTS_EMPTY: Account[] = [
  { id: 'acc_cash', name: 'Cash', short: 'Cash', type: 'cash', color: '#f59e0b', balance: 0, last4: null },
]

const CATEGORIES_SEED: Category[] = [
  { id: 'cat_renta',   name: 'Housing',       type: 'expense', color: '#6366f1', budget: 0, icon: 'home'   },
  { id: 'cat_super',   name: 'Groceries',     type: 'expense', color: '#2dd4bf', budget: 0, icon: 'cart'   },
  { id: 'cat_rest',    name: 'Restaurants',   type: 'expense', color: '#f59e0b', budget: 0, icon: 'food'   },
  { id: 'cat_trans',   name: 'Transport',     type: 'expense', color: '#38bdf8', budget: 0, icon: 'car'    },
  { id: 'cat_serv',    name: 'Utilities',     type: 'expense', color: '#c084fc', budget: 0, icon: 'bolt'   },
  { id: 'cat_ocio',    name: 'Entertainment', type: 'expense', color: '#f472b6', budget: 0, icon: 'play'   },
  { id: 'cat_salud',   name: 'Health',        type: 'expense', color: '#fb7185', budget: 0, icon: 'heart'  },
  { id: 'cat_compras', name: 'Shopping',      type: 'expense', color: '#facc15', budget: 0, icon: 'bag'    },
  { id: 'cat_edu',     name: 'Education',     type: 'expense', color: '#818cf8', budget: 0, icon: 'book'   },
  { id: 'cat_salario', name: 'Salary',        type: 'income',  color: '#22c55e', budget: 0, icon: 'wallet' },
  { id: 'cat_free',    name: 'Freelance',     type: 'income',  color: '#34d399', budget: 0, icon: 'laptop' },
  { id: 'cat_inv',     name: 'Investments',   type: 'income',  color: '#10b981', budget: 0, icon: 'trend'  },
]

const GOALS_SEED: Goal[] = [
  { id: 'goal_viaje',  name: 'Trip to the Beach',    target: 80000,  saved: 46500,  color: '#38bdf8', deadline: '2026-12-01', icon: 'play'   },
  { id: 'goal_emerg',  name: 'Emergency fund',       target: 200000, saved: 132000, color: '#22c55e', deadline: '2027-06-01', icon: 'heart'  },
  { id: 'goal_laptop', name: 'New MacBook',          target: 110000, saved: 28000,  color: '#a78bfa', deadline: '2026-09-01', icon: 'laptop' },
]

// ── Notas por categoría ───────────────────────────────────
const NOTES: Record<string, string[]> = {
  cat_renta:   ['Rent'],
  cat_super:   ['Supermarket', 'Grocery store', 'Wholesale club', 'Weekly shopping'],
  cat_rest:    ['Lunch out', 'Coffee shop', 'Dinner with friends', 'Fast food', 'Food delivery'],
  cat_trans:   ['Gas', 'Uber', 'Toll', 'Parking', 'Car maintenance'],
  cat_serv:    ['Electric bill', 'Water bill', 'Internet', 'Phone plan', 'Netflix'],
  cat_ocio:    ['Movie theater', 'Spotify', 'Concert', 'Bar night', 'Bowling'],
  cat_salud:   ['Pharmacy', 'Doctor visit', 'Gym membership', 'Lab tests'],
  cat_compras: ['Clothing', 'Amazon order', 'Sneakers', 'Birthday gift', 'Hardware store'],
  cat_edu:     ['Online course', 'Textbooks', 'Language class'],
  cat_salario: ['Paycheck'],
  cat_free:    ['Web design project', 'Logo client', 'Consulting'],
  cat_inv:     ['Dividends', 'Savings interest'],
}

const EXPENSE_PLAN = [
  { cat: 'cat_renta',   count: 1, avg: 28000, spread: 0.00 },
  { cat: 'cat_super',   count: 5, avg: 3600,  spread: 0.35 },
  { cat: 'cat_rest',    count: 7, avg: 1300,  spread: 0.50 },
  { cat: 'cat_trans',   count: 6, avg: 1000,  spread: 0.40 },
  { cat: 'cat_serv',    count: 5, avg: 1700,  spread: 0.20 },
  { cat: 'cat_ocio',    count: 4, avg: 1100,  spread: 0.50 },
  { cat: 'cat_salud',   count: 2, avg: 1500,  spread: 0.40 },
  { cat: 'cat_compras', count: 3, avg: 2300,  spread: 0.60 },
  { cat: 'cat_edu',     count: 1, avg: 5000,  spread: 0.20 },
]

// ── PRNG determinista (mulberry32) ───────────────────────
function makeRng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = makeRng(20260530)
const rand  = (min: number, max: number) => min + (max - min) * rng()
const pick  = (arr: string[]) => arr[Math.floor(rng() * arr.length)]
const jitter = (base: number, pct: number) => Math.round(base * (1 + (rng() - 0.5) * 2 * pct))

export function newId(): string {
  return 'tx_' + Date.now().toString(36) + '_' + Math.floor(rng() * 1e6).toString(36)
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function expenseAccount(): string {
  const r = rng()
  if (r < 0.50) return 'acc_popular'
  if (r < 0.72) return 'acc_visa'
  if (r < 0.88) return 'acc_cash'
  return 'acc_bhd'
}

function genTransactions(): Transaction[] {
  const txns: Transaction[] = []
  for (let back = 11; back >= 0; back--) {
    const d0   = new Date(TODAY.getFullYear(), TODAY.getMonth() - back, 1)
    const year = d0.getFullYear(), month = d0.getMonth()
    const isCur = back === 0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const maxDay = isCur ? TODAY.getDate() : daysInMonth

    // Paycheck
    for (const day of [15, daysInMonth]) {
      if (day <= maxDay)
        txns.push({ id: newId(), type: 'income', categoryId: 'cat_salario',
          accountId: 'acc_popular', amount: 42500, date: iso(year, month, day), note: 'Paycheck' })
    }
    // Freelance
    if (rng() < 0.6) {
      const day = Math.min(Math.floor(rand(5, 25)), maxDay)
      if (day >= 1)
        txns.push({ id: newId(), type: 'income', categoryId: 'cat_free',
          accountId: 'acc_bhd', amount: jitter(22000, 0.4), date: iso(year, month, day), note: pick(NOTES.cat_free) })
    }
    // Investments
    if (month % 3 === 0)
      txns.push({ id: newId(), type: 'income', categoryId: 'cat_inv',
        accountId: 'acc_bhd', amount: jitter(4800, 0.3), date: iso(year, month, Math.min(28, maxDay)), note: pick(NOTES.cat_inv) })

    // Expenses
    for (const p of EXPENSE_PLAN) {
      for (let i = 0; i < p.count; i++) {
        const day = p.cat === 'cat_renta' ? 1 : Math.floor(rand(1, daysInMonth + 1))
        if (day > maxDay) continue
        const amt = p.spread === 0 ? p.avg : Math.max(80, jitter(p.avg, p.spread))
        txns.push({ id: newId(), type: 'expense', categoryId: p.cat,
          accountId: p.cat === 'cat_renta' ? 'acc_popular' : expenseAccount(),
          amount: amt, date: iso(year, month, day), note: pick(NOTES[p.cat]) })
      }
    }
  }
  return txns.sort((a, b) => (a.date < b.date ? 1 : -1))
}

// ── Factories ─────────────────────────────────────────────
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

export function makeDemo() {
  return {
    accounts:     clone(ACCOUNTS_DEMO),
    categories:   clone(CATEGORIES_SEED),
    goals:        clone(GOALS_SEED),
    transactions: genTransactions(),
  }
}

export function makeEmpty() {
  return {
    accounts:     clone(ACCOUNTS_EMPTY),
    categories:   clone(CATEGORIES_SEED),
    goals:        [] as Goal[],
    transactions: [] as Transaction[],
  }
}
