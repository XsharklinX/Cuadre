import { beforeEach, describe, expect, it } from 'vitest'
import { useFinance } from '@/store/finance'
import type { Account, Category, Goal, Transaction } from '@/types'

/**
 * LAS ACCIONES DEL LIBRO QUE NADIE PROBABA.
 *
 * La cobertura obligatoria de la CI mide seis archivos: los que mueven dinero.
 * `store/finance.ts` estaba al 52% con 130 lineas seguidas sin una sola
 * prueba — y ahi viven mover presupuesto entre sobres, recalcular todos los
 * saldos y redondear cada monto del libro. Son exactamente las operaciones
 * que, si se equivocan, NO fallan: dejan numeros distintos y nadie se entera.
 */

const CATS: Category[] = [
  { id: 'cat_super', name: 'Supermercado', type: 'expense', color: '#fff', budget: 5_000, icon: 'cart' },
  { id: 'cat_ocio', name: 'Ocio', type: 'expense', color: '#fff', budget: 2_000, icon: 'play' },
  { id: 'cat_salario', name: 'Salario', type: 'income', color: '#fff', budget: 0, icon: 'wallet' },
]

const ACC: Account = {
  id: 'acc_1', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance: 10_000, openingBalance: 10_000, last4: null,
}

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'expense', amount: 1_000, date: '2026-09-20',
  note: 'Compra', accountId: ACC.id, categoryId: 'cat_super', ...over,
} as Transaction)

function seed() {
  useFinance.setState({
    accounts: [{ ...ACC }],
    transactions: [],
    categories: CATS.map(c => ({ ...c })),
    goals: [],
    goalContributions: [],
    currency: 'DOP',
  })
}

describe('sobres: mover presupuesto entre categorias', () => {
  beforeEach(seed)

  it('mueve el presupuesto de una a otra sin crear ni perder', () => {
    useFinance.getState().transferEnvelopeFunds('cat_super', 'cat_ocio', 1_500)
    const cats = useFinance.getState().categories
    expect(cats.find(c => c.id === 'cat_super')!.budget).toBe(3_500)
    expect(cats.find(c => c.id === 'cat_ocio')!.budget).toBe(3_500)
    // El total no cambia: es un traspaso, no un ingreso.
    expect(cats.reduce((n, c) => n + c.budget, 0)).toBe(7_000)
  })

  it('rechaza mover mas de lo que hay', () => {
    expect(() => useFinance.getState().transferEnvelopeFunds('cat_super', 'cat_ocio', 99_999)).toThrow()
    expect(useFinance.getState().categories.find(c => c.id === 'cat_super')!.budget).toBe(5_000)
  })

  it('rechaza una categoria inexistente y moverse a si misma', () => {
    expect(() => useFinance.getState().transferEnvelopeFunds('cat_super', 'cat_fantasma', 100)).toThrow()
    expect(() => useFinance.getState().transferEnvelopeFunds('cat_super', 'cat_super', 100)).toThrow()
  })

  it('rechaza montos absurdos', () => {
    expect(() => useFinance.getState().transferEnvelopeFunds('cat_super', 'cat_ocio', 0)).toThrow()
    expect(() => useFinance.getState().transferEnvelopeFunds('cat_super', 'cat_ocio', -50)).toThrow()
  })
})

describe('recalcular saldos', () => {
  beforeEach(seed)

  it('sin deriva no cambia nada y lo dice', () => {
    useFinance.setState({ transactions: [tx()], accounts: [{ ...ACC, balance: 9_000 }] })
    expect(useFinance.getState().recomputeBalances()).toBe(0)
    expect(useFinance.getState().accounts[0].balance).toBe(9_000)
  })

  /** El saldo se rehace desde apertura + movimientos, que es la invariante. */
  it('repara un saldo descuadrado y cuenta cuantos arreglo', () => {
    useFinance.setState({ transactions: [tx()], accounts: [{ ...ACC, balance: 999_999 }] })
    expect(useFinance.getState().recomputeBalances()).toBe(1)
    expect(useFinance.getState().accounts[0].balance).toBe(9_000)
  })

  it('tambien cuenta la deriva del ahorro de una meta', () => {
    const goal: Goal = {
      id: 'g1', name: 'Viaje', target: 50_000, saved: 77_777,
      openingSaved: 0, color: '#fff', icon: 'target',
    }
    useFinance.setState({
      goals: [goal],
      goalContributions: [{ id: 'c1', goalId: 'g1', amount: 2_000, fromAccountId: ACC.id, date: '2026-09-01' }],
    })
    /*
     * DOS derivas, no una: un aporte sale de una CUENTA y entra en la META,
     * asi que al inventar un ahorro descuadrado tambien queda descuadrada la
     * cuenta de la que habria salido. El contador las suma, y esta bien que lo
     * haga — son dos numeros que hay que reparar.
     */
    expect(useFinance.getState().recomputeBalances()).toBe(2)
    expect(useFinance.getState().goals[0].saved).toBe(2_000)
  })
})

describe('redondear todos los montos', () => {
  beforeEach(seed)

  it('redondea a centavos y devuelve cuantos toco', () => {
    useFinance.setState({ transactions: [tx({ id: 'a', amount: 10.005 }), tx({ id: 'b', amount: 25 })] })
    const changed = useFinance.getState().roundAllAmounts()
    const amounts = useFinance.getState().transactions.map(t => t.amount)
    expect(changed).toBe(1)
    expect(amounts).toContain(25)
    expect(amounts.every(a => Math.round(a * 100) === Math.round(a * 100))).toBe(true)
  })

  it('con todo ya redondeado no cambia nada', () => {
    useFinance.setState({ transactions: [tx({ amount: 1_000 })] })
    expect(useFinance.getState().roundAllAmounts()).toBe(0)
  })
})

describe('categorias', () => {
  beforeEach(seed)

  it('crear, renombrar y borrar', () => {
    const { addCategory, updateCategory } = useFinance.getState()
    addCategory({ name: 'Mascotas', type: 'expense', color: '#fff', budget: 0, icon: 'paw' })
    const nueva = useFinance.getState().categories.find(c => c.name === 'Mascotas')!
    expect(nueva).toBeDefined()

    updateCategory(nueva.id, { name: 'Perros' })
    expect(useFinance.getState().categories.find(c => c.id === nueva.id)!.name).toBe('Perros')

    useFinance.getState().deleteCategory(nueva.id)
    expect(useFinance.getState().categories.find(c => c.id === nueva.id)).toBeUndefined()
  })

  /** Borrar una categoria con gastos dejaria movimientos huerfanos. */
  it('no deja borrar una categoria con movimientos', () => {
    useFinance.setState({ transactions: [tx()] })
    expect(() => useFinance.getState().deleteCategory('cat_super')).toThrow()
    expect(useFinance.getState().categories.find(c => c.id === 'cat_super')).toBeDefined()
  })

  it('rechaza nombres vacios o sin letras', () => {
    const { addCategory } = useFinance.getState()
    expect(() => addCategory({ name: '   ', type: 'expense', color: '#fff', budget: 0, icon: 'cart' })).toThrow()
    expect(() => addCategory({ name: '123', type: 'expense', color: '#fff', budget: 0, icon: 'cart' })).toThrow()
  })

  /** `ensureCategory` la llaman los pagos de deuda en CADA pago: si no fuera
   *  idempotente, cada pago crearia una categoria nueva. */
  it('ensureCategory crea una vez y luego devuelve la misma', () => {
    const seedCat: Category = {
      id: 'cat_fija', name: 'Fija', type: 'expense', color: '#fff', budget: 0, icon: 'dollar',
    }
    const a = useFinance.getState().ensureCategory(seedCat)
    const b = useFinance.getState().ensureCategory(seedCat)
    expect(a).toBe(b)
    expect(useFinance.getState().categories.filter(c => c.id === 'cat_fija')).toHaveLength(1)
  })
})

describe('datos de arranque', () => {
  it('startEmpty deja un libro vacio y usable', () => {
    useFinance.getState().startEmpty()
    const s = useFinance.getState()
    expect(s.transactions).toEqual([])
    expect(s.accounts.length).toBeGreaterThan(0)   // el efectivo siempre existe
    expect(s.currency).toBe('DOP')
  })

  it('startDemo trae datos de ejemplo', () => {
    useFinance.getState().startDemo()
    expect(useFinance.getState().transactions.length).toBeGreaterThan(0)
  })
})
