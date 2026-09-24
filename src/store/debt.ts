import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { localToday } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { tt, type useT } from '@/i18n'
import type { Category, CurrencyCode } from '@/types'

/**
 * De qué lado estás.
 *
 * `lent` es dinero que TÚ prestaste y te deben. No es una deuda tuya: suma
 * como activo, no como pasivo, y «pagar» significa que te cobraron. Existe
 * porque en la práctica es la mitad de los préstamos que la gente lleva
 * apuntados en el teléfono, y hasta ahora no había dónde meterlos.
 */
export type DebtDirection = 'owed' | 'lent'

/**
 * Qué clase de deuda es. No cambia ningún cálculo: cambia cómo se lee la
 * pantalla. «Le debo a Juan 5.000» y «Préstamo de vehículo Banreservas» son
 * cosas distintas y merecen verse distintas.
 */
export type DebtKind = 'loan' | 'card' | 'store' | 'personal'

/** Un pago concreto, con su rastro en el libro. */
export interface DebtPayment {
  id: string
  date: string
  amount: number
  /** Cuenta de la que salió (o a la que entró, si te pagaron a ti). */
  accountId?: string
  /** El movimiento que lo respalda en el libro de finanzas. */
  txId?: string
}

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

  /** `owed` (por defecto) si la debes tú; `lent` si te la deben. */
  direction?: DebtDirection
  kind?: DebtKind
  /** A quién: el banco, la tienda, o el nombre de la persona. */
  counterparty?: string
  /** Día del mes en que vence la cuota (1–31). */
  dueDay?: number
  /** Fecha de la última cuota, `YYYY-MM-DD`. */
  endDate?: string
  /** Divisa propia; si falta, la divisa base de la app. */
  currency?: CurrencyCode
  /** Historial. Las deudas viejas no lo tienen y ahí sale vacío. */
  payments?: DebtPayment[]
}

/** Lo que debes tú. Lo que te deben NO es una deuda y no entra al simulador. */
export function isOwed(debt: Debt): boolean {
  return (debt.direction ?? 'owed') === 'owed'
}

/** Fecha del último pago registrado, para saber si la cuota del mes ya se pagó. */
export function lastPaymentDate(debt: Debt): string | undefined {
  const dates = (debt.payments ?? []).map(p => p.date).sort()
  return dates[dates.length - 1]
}

/**
 * LAS CATEGORÍAS DE LOS PAGOS DE DEUDA.
 *
 * Ids fijos para que un pago hecho hoy y otro dentro de un año caigan en la
 * misma fila del informe, y para que `ensureCategory` no cree duplicados.
 */
export const DEBT_PAYMENT_CATEGORY: Category = {
  id: 'cat_pago_deuda', name: 'Pago de deuda', type: 'expense',
  color: '#ff6b8a', budget: 0, icon: 'dollar',
}
export const DEBT_COLLECT_CATEGORY: Category = {
  id: 'cat_cobro_prestamo', name: 'Cobro de préstamo', type: 'income',
  color: '#35d0a2', budget: 0, icon: 'dollar',
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
  // Lo que te deben a TI no se "paga": meterlo aqui haria que el plan del mes
  // te mandara a pagarle a quien te debe.
  const active = debts.filter(d => isOwed(d) && d.balance > 0.01)
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
    .filter(d => isOwed(d) && d.balance > 0.01)
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

export function simulatePayoff(all: Debt[], monthlyExtra: number, method: PayoffMethod): PayoffResult {
  // El simulador solo conoce PASIVOS. Un prestamo que hiciste no se liquida
  // pagando: se cobra, y no acelera tu salida de deudas.
  const debts = all.filter(isOwed)
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
  /**
   * Registra un pago DE VERDAD: baja el saldo de la deuda **y saca el dinero
   * de una cuenta**, dejando el movimiento en el libro.
   *
   * Antes esto solo bajaba el número de la deuda. Pagabas RD$ 5.000 de tu
   * préstamo y tu efectivo seguía intacto: dinero que desaparecía de un lado
   * sin aparecer en el otro. Es el mismo fallo que tenían las tarjetas —un
   * saldo sin un movimiento detrás— y se arregla igual, obligando a que haya
   * un movimiento.
   *
   * Devuelve el id del movimiento creado, o `null` si no se pudo registrar.
   */
  registerPayment: (id: string, amount: number, accountId: string, date?: string) => string | null
  /** Deshace un pago: repone el saldo y borra su movimiento del libro. */
  undoPayment: (debtId: string, paymentId: string) => void
  setExtraPayment: (v: number) => void
}

export const useDebt = create<DebtState>()(
  persist(
    (set, get) => ({
      debts: [],
      extraPayment: 0,
      // originalBalance queda fijado al saldo de partida (salvo que ya venga),
      // para que el % pagado tenga una referencia estable.
      addDebt: d => set(s => ({ debts: [...s.debts, { ...d, id: crypto.randomUUID(), originalBalance: d.originalBalance ?? d.balance }] })),
      updateDebt: (id, d) => set(s => ({ debts: s.debts.map(debt => debt.id === id ? { ...debt, ...d } : debt) })),
      deleteDebt: id => set(s => ({ debts: s.debts.filter(d => d.id !== id) })),
      restoreDebt: debt => set(s => s.debts.some(d => d.id === debt.id) ? s : { debts: [...s.debts, debt] }),
      registerPayment: (id, amount, accountId, date) => {
        const debt = get().debts.find(d => d.id === id)
        if (!debt || amount <= 0 || !accountId) return null

        const finance = useFinance.getState()
        if (!finance.accounts.some(a => a.id === accountId)) return null

        const owed = isOwed(debt)
        // Pagar una deuda SALE de tu cuenta; cobrar un préstamo ENTRA.
        const seed = owed ? DEBT_PAYMENT_CATEGORY : DEBT_COLLECT_CATEGORY
        const categoryId = finance.ensureCategory(seed)
        const when = date ?? localToday()
        const note = (owed ? tt('debtPaymentNote') : tt('debtCollectNote')).replace('{name}', debt.name)

        /*
         * El movimiento va PRIMERO y con guardia.
         *
         * `addTx` valida y puede lanzar —saldo insuficiente con la política de
         * sobregiro en «bloquear», cuenta inexistente, monto inválido—. Si
         * bajáramos la deuda antes, un pago rechazado dejaría la deuda cobrada
         * y la cuenta intacta: exactamente el descuadre que este cambio venía
         * a eliminar.
         */
        let txId: string | undefined
        try {
          finance.addTx({
            type: owed ? 'expense' : 'income',
            amount, date: when, note, categoryId, accountId,
          })
          txId = useFinance.getState().transactions.find(
            t => t.date === when && t.amount === amount && t.note === note && t.accountId === accountId,
          )?.id
        } catch {
          return null
        }

        const payment: DebtPayment = { id: crypto.randomUUID(), date: when, amount, accountId, txId }
        set(st => ({
          debts: st.debts.map(d => {
            if (d.id !== id) return d
            // Si nunca tuvo original, el saldo actual pasa a ser la referencia
            // ANTES de descontar el pago — así este primer pago ya cuenta como progreso.
            const original = d.originalBalance ?? d.balance
            return {
              ...d,
              balance: Math.max(0, d.balance - amount),
              originalBalance: original,
              payments: [...(d.payments ?? []), payment],
            }
          }),
        }))
        return txId ?? null
      },

      /*
       * Deshacer tiene que deshacer las DOS cosas. Reponer solo el saldo de la
       * deuda dejaría el gasto en el libro, y el usuario acabaría con una
       * deuda que vuelve a deber y un dinero que sigue gastado.
       */
      undoPayment: (debtId, paymentId) => {
        const debt = get().debts.find(d => d.id === debtId)
        const payment = debt?.payments?.find(p => p.id === paymentId)
        if (!debt || !payment) return
        if (payment.txId) {
          try { useFinance.getState().deleteTx(payment.txId) } catch { /* ya no estaba */ }
        }
        set(st => ({
          debts: st.debts.map(d => d.id !== debtId ? d : {
            ...d,
            balance: d.balance + payment.amount,
            payments: (d.payments ?? []).filter(p => p.id !== paymentId),
          }),
        }))
      },
      setExtraPayment: extraPayment => set({ extraPayment }),
    }),
    { name: 'sharky-debts-v1', storage: createJSONStorage(() => localStorage) }
  )
)
