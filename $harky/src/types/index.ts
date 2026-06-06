// ── Enums / literals ──────────────────────────────────────
export type AccountType  = 'debit' | 'savings' | 'credit' | 'cash'
export type TxType       = 'income' | 'expense' | 'transfer'
export type CurrencyCode = 'DOP' | 'USD' | 'EUR' | 'MXN' | 'GBP' | 'COP' | 'ARS' | 'BRL' | 'CAD'
export type ThemeName    = 'dark' | 'light'
export type DensityName  = 'compact' | 'regular' | 'comfy'
export type OverdraftPolicy = 'block' | 'warn' | 'allow'
export type RecurrenceFrequency = 'weekly' | 'monthly'
export type IconName =
  // categorías existentes
  | 'home' | 'cart' | 'food' | 'car' | 'bolt' | 'play' | 'heart'
  | 'bag'  | 'book' | 'wallet' | 'laptop' | 'trend'
  // nuevas categorías
  | 'music' | 'coffee' | 'phone' | 'gym' | 'building' | 'bus'
  | 'gamepad' | 'gift' | 'scissors' | 'baby' | 'paw' | 'pill'
  | 'plane' | 'briefcase' | 'shirt' | 'pizza' | 'star' | 'fuel'
  | 'flame' | 'soda'
  // nav
  | 'grid' | 'list' | 'cards' | 'chart' | 'target'
  // acciones comunes
  | 'plus' | 'arrowUp' | 'arrowDn' | 'shark' | 'search'
  | 'bell' | 'close' | 'calendar' | 'dots'
  | 'edit' | 'trash' | 'download' | 'print'
  // extras
  | 'settings' | 'logout' | 'repeat' | 'tag' | 'camera'
  | 'check' | 'alert' | 'refresh' | 'dollar' | 'piggy'
  | 'sliders' | 'upload' | 'fileJson' | 'eye' | 'eyeOff' | 'info'
  | 'lock' | 'user' | 'palette'
  // 20 iconos nuevos
  | 'tree' | 'sun' | 'bike' | 'train' | 'tv' | 'monitor'
  | 'headphones' | 'clock' | 'key' | 'tool' | 'brush'
  | 'graduation' | 'stethoscope' | 'salad' | 'wine'
  | 'crown' | 'trophy' | 'shield' | 'map' | 'package'

// ── Entidades financieras ─────────────────────────────────
export interface Account {
  id:      string
  name:    string
  short:   string
  type:    AccountType
  color:   string
  balance: number
  last4:   string | null
  limit?:  number
  overdraftPolicy?: OverdraftPolicy
}

export interface Category {
  id:     string
  name:   string
  type:   'expense' | 'income'
  color:  string
  budget: number
  weeklyBudget?: number
  annualBudget?: number
  icon:   IconName
}

export interface Transaction {
  id:           string
  type:         TxType
  amount:       number
  date:         string              // YYYY-MM-DD
  note:         string
  categoryId?:  string              // income / expense
  accountId?:   string              // income / expense
  fromAccount?: string              // transfer
  toAccount?:   string              // transfer
  recurring?:   RecurrenceFrequency | null
  recurringStart?: string
  recurringEnd?: string
  recurringNext?: string
  tags?:        string[]            // ej. ['trabajo', 'viaje']
}

export interface Goal {
  id:        string
  name:      string
  target:    number
  saved:     number
  color:     string
  icon:      IconName
  deadline?: string          // YYYY-MM-DD
}

export interface GoalContribution {
  id: string
  goalId: string
  amount: number
  fromAccountId: string
  date: string
  note?: string
}

export interface Currency {
  code:     CurrencyCode
  symbol:   string
  rate:     number           // relative to DOP
  decimals: number
}

// ── Helpers ───────────────────────────────────────────────
export interface Totals {
  income:  number
  expense: number
  net:     number
}

export interface CategoryTotal {
  category: Category
  amount:   number
}

export interface MonthSeries {
  key:     string
  label:   string
  income:  number
  expense: number
  net:     number
}

export interface WeekBucket {
  label: string
  value: number
}

export interface FmtOptions {
  decimals?: number
}

// ── Props compartidas de vistas ───────────────────────────
export type ViewId =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'stats'
  | 'budgets'
  | 'goals'
  | 'annual'
  | 'calendar'
  | 'reports'

export interface ViewProps {
  txns:        Transaction[]
  mkey:        string
  onAdd:       () => void
  goto:        (view: ViewId) => void
  onEditTx:    (tx: Transaction) => void
  onDeleteTx?: (id: string) => void   // undo-aware delete desde App
  createRequest?: {
    target: 'account' | 'category' | 'goal'
    nonce: number
  }
}
