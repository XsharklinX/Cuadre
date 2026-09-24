import { beforeEach, describe, expect, it } from 'vitest'
import { useFinance } from '@/store/finance'
import type { Account, Category, Goal } from '@/types'

/**
 * METAS DE AHORRO Y CUENTAS EN OTRA DIVISA.
 *
 * Lo que queda sin cubrir de `store/finance.ts` son las ramas de las metas y
 * las de editar una cuenta cuando cambia su divisa. Las dos mueven dinero:
 * el ahorro de una meta sale de una cuenta real, y cambiarle la divisa a una
 * cuenta reexpresa su saldo, su apertura, su limite y TODOS sus movimientos.
 */

const ACC: Account = {
  id: 'acc_1', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance: 50_000, openingBalance: 50_000, last4: null,
}

const CAT: Category = {
  id: 'cat_super', name: 'Supermercado', type: 'expense', color: '#fff', budget: 0, icon: 'cart',
}

const GOAL: Omit<Goal, 'id'> = {
  name: 'Viaje', target: 100_000, saved: 0, color: '#fff', icon: 'target',
}

function seed() {
  useFinance.setState({
    accounts: [{ ...ACC }],
    transactions: [],
    categories: [{ ...CAT }],
    goals: [],
    goalContributions: [],
    currency: 'DOP',
  })
}

describe('metas de ahorro', () => {
  beforeEach(seed)

  it('crear una meta fija su ahorro de apertura', () => {
    useFinance.getState().addGoal({ ...GOAL, saved: 3_000 })
    const g = useFinance.getState().goals[0]
    expect(g.saved).toBe(3_000)
    expect(g.openingSaved).toBe(3_000)
  })

  /*
   * Editar el ahorro A MANO ajusta la apertura para sostener la invariante
   * `ahorro = apertura + aportes`. Sin eso, el siguiente recalculo devolveria
   * el ahorro a su valor viejo y el usuario veria "desaparecer" lo que puso.
   */
  it('editar el ahorro a mano mueve la apertura, no rompe la invariante', () => {
    useFinance.getState().addGoal({ ...GOAL, saved: 0 })
    const id = useFinance.getState().goals[0].id
    useFinance.getState().contribute(id, 2_000, ACC.id, 'Aporte')

    useFinance.getState().updateGoal(id, { saved: 9_000 })
    const g = useFinance.getState().goals[0]
    expect(g.saved).toBe(9_000)
    expect(g.openingSaved).toBe(7_000)          // 9.000 − 2.000 aportados
    expect(useFinance.getState().recomputeBalances()).toBe(0)   // ya cuadra
  })

  it('renombrar no toca las cifras', () => {
    useFinance.getState().addGoal({ ...GOAL, saved: 500 })
    const id = useFinance.getState().goals[0].id
    useFinance.getState().updateGoal(id, { name: 'Playa' })
    const g = useFinance.getState().goals[0]
    expect(g.name).toBe('Playa')
    expect(g.saved).toBe(500)
    expect(g.openingSaved).toBe(500)
  })

  /** Aportar SACA el dinero de la cuenta: no aparece de la nada. */
  it('un aporte descuenta de la cuenta', () => {
    useFinance.getState().addGoal({ ...GOAL })
    const id = useFinance.getState().goals[0].id
    useFinance.getState().contribute(id, 4_000, ACC.id, 'Aporte')

    expect(useFinance.getState().goals[0].saved).toBe(4_000)
    expect(useFinance.getState().accounts[0].balance).toBe(46_000)
  })

  it('no deja aportar mas de lo que hay en la cuenta', () => {
    useFinance.getState().addGoal({ ...GOAL })
    const id = useFinance.getState().goals[0].id
    expect(() => useFinance.getState().contribute(id, 999_999, ACC.id, 'Aporte')).toThrow()
    expect(useFinance.getState().goals[0].saved).toBe(0)
    expect(useFinance.getState().accounts[0].balance).toBe(50_000)
  })

  /*
   * Borrar una meta se lleva sus aportes, pero NO devuelve el dinero a la
   * cuenta: ese dinero se gasto o se movio de verdad en su momento. Reponerlo
   * inventaria saldo que el usuario no tiene.
   */
  it('borrar una meta se lleva sus aportes sin devolver el dinero', () => {
    useFinance.getState().addGoal({ ...GOAL })
    const id = useFinance.getState().goals[0].id
    useFinance.getState().contribute(id, 3_000, ACC.id, 'Aporte')
    const saldoTrasAportar = useFinance.getState().accounts[0].balance

    useFinance.getState().deleteGoal(id)
    expect(useFinance.getState().goals).toHaveLength(0)
    expect(useFinance.getState().goalContributions).toHaveLength(0)
    expect(useFinance.getState().accounts[0].balance).toBe(saldoTrasAportar)
  })
})

describe('cuentas: borrar, restaurar y conciliar', () => {
  beforeEach(seed)

  it('no deja borrar una cuenta con aportes a metas', () => {
    useFinance.getState().addGoal({ ...GOAL })
    const id = useFinance.getState().goals[0].id
    useFinance.getState().contribute(id, 1_000, ACC.id, 'Aporte')
    expect(() => useFinance.getState().deleteAccount(ACC.id)).toThrow()
  })

  it('restaurar reinserta la cuenta y no duplica si se repite', () => {
    useFinance.getState().deleteAccount(ACC.id)
    expect(useFinance.getState().accounts).toHaveLength(0)

    useFinance.getState().restoreAccount(ACC)
    useFinance.getState().restoreAccount(ACC)   // "Deshacer" dos veces
    expect(useFinance.getState().accounts).toHaveLength(1)
  })

  it('conciliar con el saldo ya correcto no crea ningun movimiento', () => {
    expect(useFinance.getState().reconcileAccount(ACC.id, 50_000)).toBe(0)
    expect(useFinance.getState().transactions).toHaveLength(0)
  })

  it('conciliar una cuenta que no existe no hace nada', () => {
    expect(useFinance.getState().reconcileAccount('acc_fantasma', 100)).toBe(0)
  })
})

describe('cambiar la divisa de UNA cuenta', () => {
  beforeEach(seed)

  /*
   * No basta con marcar la cuenta: su saldo, su apertura, su limite y sus
   * movimientos estan guardados en la divisa vieja. Sin reexpresarlos, el
   * numero se queda igual y la app lo reinterpreta en otra moneda en cada
   * calculo posterior.
   */
  it('reexpresa saldo, apertura y movimientos de esa cuenta', () => {
    useFinance.getState().addTx({
      type: 'expense', amount: 1_000, date: '2026-09-20',
      note: 'Compra', accountId: ACC.id, categoryId: CAT.id,
    })
    const antes = useFinance.getState().accounts[0].balance

    useFinance.getState().updateAccount(ACC.id, { currency: 'USD' })
    const cuenta = useFinance.getState().accounts[0]

    expect(cuenta.currency).toBe('USD')
    // En dolares la cifra tiene que ser MUCHO menor que en pesos.
    expect(cuenta.balance).toBeLessThan(antes / 10)
    expect(useFinance.getState().transactions[0].amount).toBeLessThan(1_000 / 10)
  })

  it('renombrar sin tocar la divisa no convierte nada', () => {
    useFinance.getState().updateAccount(ACC.id, { name: 'Bolsillo' })
    const cuenta = useFinance.getState().accounts[0]
    expect(cuenta.name).toBe('Bolsillo')
    expect(cuenta.balance).toBe(50_000)
  })
  /*
   * Una TRANSFERENCIA tiene dos puntas y solo una cambia de divisa. Cada lado
   * se convierte por separado: `amount` habla la divisa del origen y
   * `toAmount` la del destino. Tratarlas igual dejaria una de las dos con el
   * numero de la otra moneda.
   */
  it('convierte solo la punta de la transferencia que cambio de divisa', () => {
    const otra = { ...ACC, id: 'acc_2', name: 'Banco', balance: 0, openingBalance: 0 }
    useFinance.setState({ accounts: [{ ...ACC }, otra] })
    useFinance.getState().transfer({
      fromAccount: ACC.id, toAccount: 'acc_2', amount: 5_000,
      date: '2026-09-20', note: 'Traspaso',
    })

    useFinance.getState().updateAccount('acc_2', { currency: 'USD' })
    const t = useFinance.getState().transactions[0]
    // La punta de ORIGEN sigue en pesos; solo el destino paso a dolares.
    expect(t.amount).toBe(5_000)
    expect(t.toAmount!).toBeLessThan(5_000 / 10)
  })

  it('convierte los aportes a metas hechos desde esa cuenta', () => {
    useFinance.getState().addGoal({ ...GOAL })
    const id = useFinance.getState().goals[0].id
    useFinance.getState().contribute(id, 6_000, ACC.id, 'Aporte')

    useFinance.getState().updateAccount(ACC.id, { currency: 'USD' })
    expect(useFinance.getState().goalContributions[0].amount).toBeLessThan(6_000 / 10)
  })

  /** Los movimientos de OTRAS cuentas no se tocan. */
  it('no toca los movimientos de otra cuenta', () => {
    const otra = { ...ACC, id: 'acc_2', name: 'Banco' }
    useFinance.setState({ accounts: [{ ...ACC }, otra] })
    useFinance.getState().addTx({
      type: 'expense', amount: 800, date: '2026-09-20',
      note: 'Ajena', accountId: 'acc_2', categoryId: CAT.id,
    })

    useFinance.getState().updateAccount(ACC.id, { currency: 'USD' })
    expect(useFinance.getState().transactions[0].amount).toBe(800)
  })
})

describe('restaurar un respaldo', () => {
  beforeEach(seed)

  it('reemplaza el libro por el del respaldo', () => {
    useFinance.getState().restoreBackup({
      accounts: [{ ...ACC, id: 'acc_restaurada', name: 'Del respaldo', balance: 777 }],
      transactions: [],
      categories: [{ ...CAT }],
      goals: [],
      goalContributions: [],
      currency: 'DOP',
    })
    const s = useFinance.getState()
    expect(s.accounts).toHaveLength(1)
    expect(s.accounts[0].name).toBe('Del respaldo')
  })
})
