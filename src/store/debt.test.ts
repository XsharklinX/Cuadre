import { describe, expect, it } from 'vitest'
import {
  DEBT_PAYMENT_CATEGORY, debtProgress, freedomDate, monthlyPaymentPlan,
  payoffTargetId, simulatePayoff, useDebt, type Debt,
} from './debt'
import { useFinance } from './finance'
import { useSettings } from './settings'

const debt = (over: Partial<Debt> = {}): Debt => ({
  id: 'd1', name: 'Tarjeta', balance: 10000, rate: 24, minPayment: 500, color: '#fff', ...over,
})

describe('debtProgress', () => {
  it('es 0 cuando el saldo iguala al original', () => {
    expect(debtProgress(debt({ balance: 10000, originalBalance: 10000 }))).toBe(0)
  })
  it('refleja la fracción pagada', () => {
    expect(debtProgress(debt({ balance: 4000, originalBalance: 10000 }))).toBeCloseTo(0.6)
  })
  it('sin original arranca en 0 (original = saldo actual)', () => {
    expect(debtProgress(debt({ balance: 4000, originalBalance: undefined }))).toBe(0)
  })
})

describe('payoffTargetId', () => {
  const small = debt({ id: 'small', balance: 2000, rate: 15 })
  const big = debt({ id: 'big', balance: 50000, rate: 30 })

  it('impulso ataca el menor saldo', () => {
    expect(payoffTargetId([small, big], 'snowball')).toBe('small')
  })
  it('menos intereses ataca la mayor tasa', () => {
    expect(payoffTargetId([small, big], 'avalanche')).toBe('big')
  })
  it('ignora deudas ya saldadas', () => {
    expect(payoffTargetId([debt({ id: 'paid', balance: 0 }), big], 'snowball')).toBe('big')
  })
})

describe('monthlyPaymentPlan', () => {
  it('todas pagan el mínimo y solo la objetivo recibe el extra', () => {
    const a = debt({ id: 'a', balance: 2000, rate: 10, minPayment: 200 })
    const b = debt({ id: 'b', balance: 8000, rate: 25, minPayment: 400 })
    const plan = monthlyPaymentPlan([a, b], 1000, 'avalanche')
    const byId = Object.fromEntries(plan.map(p => [p.id, p]))
    expect(byId.a.amount).toBe(200)              // solo mínimo
    expect(byId.b.amount).toBe(1400)             // mínimo + extra (mayor tasa)
    expect(byId.b.isTarget).toBe(true)
  })
})

describe('freedomDate', () => {
  it('suma los meses a la fecha base', () => {
    expect(freedomDate(15, new Date(2026, 6, 10))).toBe('2027-10-01')
  })
  it('devuelve null si no termina (0 o >50 años)', () => {
    expect(freedomDate(0)).toBeNull()
    expect(freedomDate(600)).toBeNull()
  })
})

describe('simulatePayoff + registrar pago (integración de progreso)', () => {
  it('el extra reduce los meses de pago', () => {
    const d = [debt({ balance: 20000, rate: 30, minPayment: 500 })]
    const withExtra = simulatePayoff(d, 2000, 'avalanche').months
    const without = simulatePayoff(d, 0, 'avalanche').months
    expect(withExtra).toBeLessThan(without)
  })
})

// ─────────────────────────────────────────────────────────────
// PAGAR UNA DEUDA MUEVE DINERO DE VERDAD
//
// Antes, `registerPayment` bajaba el saldo de la deuda y no tocaba ninguna
// cuenta: pagabas RD$ 5.000 y tu efectivo seguia intacto. Dinero que salia de
// un lado sin entrar en el otro — el mismo fallo que tenian las tarjetas.
// ─────────────────────────────────────────────────────────────

describe('registrar un pago', () => {
  const ACCOUNT_ID = 'acc_efectivo'

  function setup(over: Partial<Debt> = {}) {
    useFinance.setState({
      accounts: [{
        id: ACCOUNT_ID, name: 'Efectivo', short: 'Ef', type: 'cash',
        color: '#fff', balance: 20_000, openingBalance: 20_000, last4: null,
      }],
      transactions: [], categories: [], goals: [], goalContributions: [], currency: 'DOP',
    })
    useDebt.setState({
      debts: [debt({ balance: 30_000, originalBalance: 30_000, ...over })],
      extraPayment: 0,
    })
  }

  it('descuenta el pago de la cuenta elegida', () => {
    setup()
    useDebt.getState().registerPayment('d1', 5_000, ACCOUNT_ID)

    expect(useDebt.getState().debts[0].balance).toBe(25_000)
    expect(useFinance.getState().accounts[0].balance).toBe(15_000)
  })

  it('deja el movimiento anotado en el libro', () => {
    setup()
    useDebt.getState().registerPayment('d1', 5_000, ACCOUNT_ID)

    const [tx] = useFinance.getState().transactions
    expect(tx.type).toBe('expense')
    expect(tx.amount).toBe(5_000)
    expect(tx.accountId).toBe(ACCOUNT_ID)
    expect(tx.categoryId).toBe(DEBT_PAYMENT_CATEGORY.id)
    expect(tx.note).toContain('Tarjeta')
  })

  it('crea la categoria de pagos de deuda la primera vez, y solo una vez', () => {
    setup()
    useDebt.getState().registerPayment('d1', 1_000, ACCOUNT_ID)
    useDebt.getState().registerPayment('d1', 1_000, ACCOUNT_ID)
    const cats = useFinance.getState().categories.filter(c => c.id === DEBT_PAYMENT_CATEGORY.id)
    expect(cats).toHaveLength(1)
  })

  it('guarda el pago en el historial con su movimiento', () => {
    setup()
    const txId = useDebt.getState().registerPayment('d1', 5_000, ACCOUNT_ID)
    const [payment] = useDebt.getState().debts[0].payments!
    expect(payment.amount).toBe(5_000)
    expect(payment.accountId).toBe(ACCOUNT_ID)
    expect(payment.txId).toBe(txId)
  })

  /** Cobrar lo que TE deben entra a la cuenta, no sale de ella. */
  it('un cobro de lo que te deben suma a tu cuenta', () => {
    setup({ direction: 'lent' })
    useDebt.getState().registerPayment('d1', 5_000, ACCOUNT_ID)

    expect(useFinance.getState().accounts[0].balance).toBe(25_000)
    expect(useFinance.getState().transactions[0].type).toBe('income')
    expect(useDebt.getState().debts[0].balance).toBe(25_000)
  })

  it('sin cuenta no se registra nada', () => {
    setup()
    expect(useDebt.getState().registerPayment('d1', 5_000, '')).toBeNull()
    expect(useDebt.getState().debts[0].balance).toBe(30_000)
    expect(useFinance.getState().transactions).toHaveLength(0)
  })

  it('con una cuenta que no existe no se registra nada', () => {
    setup()
    expect(useDebt.getState().registerPayment('d1', 5_000, 'acc_fantasma')).toBeNull()
    expect(useDebt.getState().debts[0].balance).toBe(30_000)
  })

  /*
   * EL ORDEN IMPORTA. `addTx` puede rechazar el gasto (saldo insuficiente con
   * la politica de sobregiro en «bloquear»). Si la deuda bajara primero, un
   * pago rechazado la dejaria cobrada y la cuenta intacta.
   */
  it('si el movimiento se rechaza, la deuda no baja', () => {
    setup()
    useSettings.setState({ overdraftPolicy: 'block' })
    const result = useDebt.getState().registerPayment('d1', 999_999, ACCOUNT_ID)
    useSettings.setState({ overdraftPolicy: 'warn' })

    expect(result).toBeNull()
    expect(useDebt.getState().debts[0].balance).toBe(30_000)
    expect(useFinance.getState().accounts[0].balance).toBe(20_000)
  })

  it('deshacer repone la deuda y borra el movimiento', () => {
    setup()
    useDebt.getState().registerPayment('d1', 5_000, ACCOUNT_ID)
    const paymentId = useDebt.getState().debts[0].payments![0].id

    useDebt.getState().undoPayment('d1', paymentId)

    expect(useDebt.getState().debts[0].balance).toBe(30_000)
    expect(useDebt.getState().debts[0].payments).toHaveLength(0)
    expect(useFinance.getState().transactions).toHaveLength(0)
    expect(useFinance.getState().accounts[0].balance).toBe(20_000)
  })
})

describe('lo que te deben no entra al simulador', () => {
  const owed = debt({ id: 'owed', balance: 10_000, rate: 24, minPayment: 500 })
  const lent = debt({ id: 'lent', balance: 50_000, rate: 0, minPayment: 0, direction: 'lent' })

  it('el plan del mes no te manda a pagarle a quien te debe', () => {
    const plan = monthlyPaymentPlan([owed, lent], 0, 'snowball')
    expect(plan.map(p => p.id)).toEqual(['owed'])
  })

  it('la deuda objetivo nunca es un prestamo que hiciste', () => {
    expect(payoffTargetId([lent, owed], 'snowball')).toBe('owed')
  })

  it('un saldo que te deben no alarga tu salida de deudas', () => {
    const solo = simulatePayoff([owed], 0, 'avalanche').months
    const conPrestamo = simulatePayoff([owed, lent], 0, 'avalanche').months
    expect(conPrestamo).toBe(solo)
  })
})
