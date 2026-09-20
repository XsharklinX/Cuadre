import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { useT } from '@/i18n'

export interface Debt {
  id: string
  name: string
  balance: number
  rate: number      // annual interest %
  minPayment: number
  color: string
  /**
   * Saldo con el que empezó a rastrearse la deuda — fija el 0% del progreso.
   * Se pone al crear (= balance) y no cambia al pagar, así la barra «% pagado»
   * avanza de verdad. Opcional por compatibilidad: las deudas antiguas no lo
   * tienen y ahí el progreso arranca en 0 (original = saldo actual).
   */
  originalBalance?: number
}

export type PayoffMethod = 'snowball' | 'avalanche'

/** Fracción pagada de una deuda (0–1), a partir de su saldo original. */
export function debtProgress(debt: Debt): number {
  const original = debt.originalBalance ?? debt.balance
  if (original <= 0) return 0
  return Math.max(0, Math.min(1, 1 - debt.balance / original))
}

/**
 * A qué deuda va el pago extra este mes: la primera del orden del método
 * (menor saldo para «impulso», mayor tasa para «menos intereses»). Es la
 * «deuda objetivo» que se marca en el plan del mes.
 */
export function payoffTargetId(debts: Debt[], method: PayoffMethod): string | null {
  const active = debts.filter(d => d.balance > 0.01)
  if (active.length === 0) return null
  const sorted = method === 'snowball'
    ? [...active].sort((a, b) => a.balance - b.balance)
    : [...active].sort((a, b) => b.rate - a.rate)
  return sorted[0].id
}

export interface MonthlyPaymentLine { id: string; amount: number; isTarget: boolean }

/**
 * Lo que se paga a cada deuda ESTE mes: el mínimo de todas + el extra
 * concentrado en la deuda objetivo. Es el número accionable que faltaba —
 * lo que de verdad tienes que transferir.
 */
export function monthlyPaymentPlan(debts: Debt[], extra: number, method: PayoffMethod): MonthlyPaymentLine[] {
  const targetId = payoffTargetId(debts, method)
  return debts
    .filter(d => d.balance > 0.01)
    .map(d => {
      const isTarget = d.id === targetId
      return { id: d.id, amount: Math.min(d.balance, d.minPayment) + (isTarget ? extra : 0), isTarget }
    })
}

/** Fecha (YYYY-MM-01) en la que se liquida todo, a partir de los meses simulados. */
export function freedomDate(months: number, from = new Date()): string | null {
  if (months <= 0 || months >= 600) return null
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`
}

export interface PayoffResult {
  months: number
  totalInterest: number
  order: string[]
}

export function simulatePayoff(debts: Debt[], monthlyExtra: number, method: PayoffMethod): PayoffResult {
  if (debts.length === 0) return { months: 0, totalInterest: 0, order: [] }

  const balances = new Map<string, number>(debts.map(d => [d.id, Math.max(0, d.balance)]))
  let extra = monthlyExtra
  const order: string[] = []
  let months = 0
  let totalInterest = 0

  while ([...balances.values()].some(b => b > 0.01) && months < 600) {
    months++
    let freed = 0

    for (const debt of debts) {
      const bal = balances.get(debt.id)!
      if (bal <= 0.01) continue
      const interest = bal * (debt.rate / 100 / 12)
      totalInterest += interest
      balances.set(debt.id, bal + interest)
    }

    for (const debt of debts) {
      const bal = balances.get(debt.id)!
      if (bal <= 0.01) continue
      const newBal = Math.max(0, bal - Math.min(debt.minPayment, bal))
      balances.set(debt.id, newBal)
      if (newBal < 0.01 && !order.includes(debt.id)) {
        order.push(debt.id)
        freed += debt.minPayment
      }
    }

    const active = debts.filter(d => (balances.get(d.id)!) > 0.01)
    if (active.length > 0) {
      const sorted = method === 'snowball'
        ? [...active].sort((a, b) => balances.get(a.id)! - balances.get(b.id)!)
        : [...active].sort((a, b) => b.rate - a.rate)

      let rem = extra
      for (const d of sorted) {
        if (rem <= 0.01) break
        const bal = balances.get(d.id)!
        const payment = Math.min(rem, bal)
        const newBal = Math.max(0, bal - payment)
        balances.set(d.id, newBal)
        rem -= payment
        if (newBal < 0.01 && !order.includes(d.id)) {
          order.push(d.id)
          freed += d.minPayment
        }
      }
    }

    extra += freed
  }

  return { months, totalInterest, order }
}

// Compartido entre MobileDebt (calculadora completa) y MobileProfile (tarjeta
// resumen) — vive aquí, no en MobileDebt.tsx, para que importarlo desde
// Profile (que se monta eager) no arrastre el bundle de la calculadora
// completa (lazy-loaded) al chunk principal.
export function monthsLabel(m: number, t: ReturnType<typeof useT>): string {
  if (m <= 0) return '—'
  if (m >= 600) return t('over50Years')
  const y = Math.floor(m / 12), mo = m % 12
  if (y === 0) return `${mo} ${mo !== 1 ? t('monthsPlural') : t('monthsSingular')}`
  if (mo === 0) return `${y} ${y !== 1 ? t('yearsPlural') : t('yearsSingular')}`
  return t('yearsMonthsShort').replace('{y}', String(y)).replace('{mo}', String(mo))
}

interface DebtState {
  debts: Debt[]
  extraPayment: number
  addDebt: (d: Omit<Debt, 'id'>) => void
  updateDebt: (id: string, d: Partial<Omit<Debt, 'id'>>) => void
  deleteDebt: (id: string) => void
  /** Reinserta una deuda borrada tal cual (mismo id) — «Deshacer». */
  restoreDebt: (debt: Debt) => void
  /** Registra un pago: baja el saldo (sin tocar el original, para que el progreso suba). */
  registerPayment: (id: string, amount: number) => void
  setExtraPayment: (v: number) => void
}

export const useDebt = create<DebtState>()(
  persist(
    (set) => ({
      debts: [],
      extraPayment: 0,
      // originalBalance queda fijado al saldo de partida (salvo que ya venga),
      // para que el % pagado tenga una referencia estable.
      addDebt: d => set(s => ({ debts: [...s.debts, { ...d, id: crypto.randomUUID(), originalBalance: d.originalBalance ?? d.balance }] })),
      updateDebt: (id, d) => set(s => ({ debts: s.debts.map(debt => debt.id === id ? { ...debt, ...d } : debt) })),
      deleteDebt: id => set(s => ({ debts: s.debts.filter(d => d.id !== id) })),
      restoreDebt: debt => set(s => s.debts.some(d => d.id === debt.id) ? s : { debts: [...s.debts, debt] }),
      registerPayment: (id, amount) => set(s => ({
        debts: s.debts.map(debt => {
          if (debt.id !== id) return debt
          // Si nunca tuvo original, el saldo actual pasa a ser la referencia
          // ANTES de descontar el pago — así este primer pago ya cuenta como progreso.
          const original = debt.originalBalance ?? debt.balance
          return { ...debt, balance: Math.max(0, debt.balance - Math.max(0, amount)), originalBalance: original }
        }),
      })),
      setExtraPayment: extraPayment => set({ extraPayment }),
    }),
    { name: 'sharky-debts-v1', storage: createJSONStorage(() => localStorage) }
  )
)
