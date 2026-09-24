import { beforeEach, describe, expect, it } from 'vitest'
import { useFinance } from '@/store/finance'
import { convertCurrency } from '@/data/currencies'
import type { Account, Category, Goal, Transaction } from '@/types'

/**
 * CAMBIAR LA DIVISA BASE DEL LIBRO.
 *
 * Es la operacion mas peligrosa de `store/finance.ts` —reexpresa TODOS los
 * montos del usuario de una sola vez— y no tenia ni una prueba.
 *
 * Lo que puede salir mal no es que falle: es que convierta desde la divisa
 * EQUIVOCADA. Una cuenta con divisa propia (una tarjeta en dolares) no se
 * convierte desde la base vieja sino desde la suya, y equivocarse ahi no da
 * error — da un saldo plausible y falso, que ademas se compone cada vez que se
 * vuelve a cambiar de moneda.
 */

const DOP_ACC: Account = {
  id: 'acc_dop', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance: 10_000, openingBalance: 10_000, last4: null,
}

/** Cuenta con divisa PROPIA: la que rompe si se convierte desde la base. */
const USD_ACC: Account = {
  id: 'acc_usd', name: 'Ahorro USD', short: 'USD', type: 'savings', color: '#fff',
  balance: 500, openingBalance: 500, last4: null, currency: 'USD',
}

const CAT: Category = {
  id: 'cat_super', name: 'Supermercado', type: 'expense', color: '#fff',
  budget: 6_000, weeklyBudget: 1_500, icon: 'cart',
}

const GOAL: Goal = {
  id: 'g1', name: 'Viaje', target: 100_000, saved: 25_000,
  openingSaved: 25_000, color: '#fff', icon: 'target',
}

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'expense', amount: 1_000, date: '2026-09-20',
  note: 'Compra', accountId: DOP_ACC.id, categoryId: CAT.id, ...over,
} as Transaction)

function seed() {
  useFinance.setState({
    accounts: [{ ...DOP_ACC }, { ...USD_ACC }],
    transactions: [tx(), tx({ id: 't2', amount: 40, accountId: USD_ACC.id })],
    categories: [{ ...CAT }],
    goals: [{ ...GOAL }],
    goalContributions: [{ id: 'c1', goalId: 'g1', amount: 5_000, fromAccountId: DOP_ACC.id, date: '2026-09-01' }],
    currency: 'DOP',
  })
}

describe('cambiar la divisa base', () => {
  beforeEach(seed)

  it('elegir la misma divisa no toca ningun monto', () => {
    useFinance.getState().setCurrency('DOP')
    const s = useFinance.getState()
    expect(s.accounts[0].balance).toBe(10_000)
    expect(s.categories[0].budget).toBe(6_000)
    expect(s.goals[0].target).toBe(100_000)
  })

  it('convierte saldo, apertura, presupuestos y metas', () => {
    useFinance.getState().setCurrency('USD')
    const s = useFinance.getState()
    expect(s.currency).toBe('USD')

    const esperado = convertCurrency(10_000, 'DOP', 'USD')
    expect(s.accounts.find(a => a.id === 'acc_dop')!.balance).toBeCloseTo(esperado, 2)
    expect(s.categories[0].budget).toBeCloseTo(convertCurrency(6_000, 'DOP', 'USD'), 2)
    expect(s.categories[0].weeklyBudget).toBeCloseTo(convertCurrency(1_500, 'DOP', 'USD'), 2)
    expect(s.goals[0].target).toBeCloseTo(convertCurrency(100_000, 'DOP', 'USD'), 2)
  })

  /*
   * EL CASO QUE IMPORTA. La cuenta en dolares ya estaba en dolares: al pasar la
   * base a USD sus 500 se quedan en 500. Convertirla desde la base vieja la
   * habria dividido por la tasa y el usuario habria perdido su ahorro sin que
   * nada fallara.
   */
  it('una cuenta con divisa propia se convierte desde la SUYA, no desde la base', () => {
    useFinance.getState().setCurrency('USD')
    const usd = useFinance.getState().accounts.find(a => a.id === 'acc_usd')!
    expect(usd.balance).toBeCloseTo(500, 2)
    // Y deja de llevar divisa propia: ahora todo el libro habla en USD.
    expect(usd.currency).toBeUndefined()
  })

  it('los movimientos siguen la divisa de SU cuenta', () => {
    useFinance.getState().setCurrency('USD')
    const s = useFinance.getState()
    const enDop = s.transactions.find(t => t.id === 't1')!
    const enUsd = s.transactions.find(t => t.id === 't2')!
    expect(enDop.amount).toBeCloseTo(convertCurrency(1_000, 'DOP', 'USD'), 2)
    expect(enUsd.amount).toBeCloseTo(40, 2)   // ya estaba en dolares
  })

  it('los aportes a metas tambien siguen la divisa de su cuenta', () => {
    useFinance.getState().setCurrency('USD')
    expect(useFinance.getState().goalContributions[0].amount)
      .toBeCloseTo(convertCurrency(5_000, 'DOP', 'USD'), 2)
  })

  /** Una compra dividida entre categorias: cada parte va con el total. */
  it('convierte las partes de un movimiento dividido', () => {
    useFinance.setState({
      transactions: [tx({
        amount: 1_000,
        splits: [
          { categoryId: CAT.id, amount: 600 },
          { categoryId: CAT.id, amount: 400 },
        ],
      })],
    })
    useFinance.getState().setCurrency('USD')
    const partes = useFinance.getState().transactions[0].splits!
    expect(partes[0].amount).toBeCloseTo(convertCurrency(600, 'DOP', 'USD'), 2)
    expect(partes[1].amount).toBeCloseTo(convertCurrency(400, 'DOP', 'USD'), 2)
  })

  /** En una transferencia, cada punta habla la divisa de SU cuenta. */
  it('convierte las dos puntas de una transferencia', () => {
    useFinance.setState({
      transactions: [tx({
        id: 'tr', type: 'transfer', amount: 2_000, toAmount: 35,
        fromAccount: DOP_ACC.id, toAccount: USD_ACC.id,
        accountId: undefined, categoryId: undefined,
      })],
    })
    useFinance.getState().setCurrency('USD')
    const t = useFinance.getState().transactions[0]
    expect(t.amount).toBeCloseTo(convertCurrency(2_000, 'DOP', 'USD'), 2)
    expect(t.toAmount).toBeCloseTo(35, 2)
  })

  /*
   * IDA Y VUELTA. Cambiar a dolares y volver a pesos tiene que devolver
   * aproximadamente lo mismo. Si el error se compusiera —convertir desde la
   * divisa equivocada— cada viaje alejaria mas la cifra de la realidad.
   */
  it('ir y volver no desintegra el libro', () => {
    const antes = useFinance.getState().accounts.find(a => a.id === 'acc_dop')!.balance
    useFinance.getState().setCurrency('USD')
    useFinance.getState().setCurrency('DOP')
    const despues = useFinance.getState().accounts.find(a => a.id === 'acc_dop')!.balance
    // Tolerancia de un peso: la conversion redondea a centavos en cada salto.
    expect(Math.abs(despues - antes)).toBeLessThan(1)
  })
})
