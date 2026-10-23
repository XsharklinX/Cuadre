import { beforeEach, describe, expect, it } from 'vitest'
import { ADJUST_CATEGORY, sanitizeFinanceData, useFinance } from '@/store/finance'
import { adjustmentsOnly, reportable, totals, transactionsForTotals } from '@/data/helpers'
import type { Account, Category, Transaction } from '@/types'

/**
 * EL AJUSTE DE CUADRE NO ES UN INGRESO.
 *
 * Esto cierra el fallo que hacía que cuadrar se sintiera como hacer trampa:
 * conciliabas +3,000 para que el saldo coincidiera con el banco, y la app lo
 * anotaba en la primera categoría de ingreso que encontraba —normalmente
 * «Salario»—. Resultado: el saldo cuadraba y tus ingresos del mes salían
 * inflados en 3,000 pesos que nadie te pagó, con los informes y el presupuesto
 * detrás.
 *
 * Lo que se vigila aquí es la pareja de condiciones que tiene que cumplirse a
 * la vez, porque cada una sola sería un fallo:
 *   · el ajuste CUENTA para el saldo (si no, la igualdad se rompe)
 *   · el ajuste NO CUENTA para ingresos, gastos ni informes
 */

const CUENTA: Account = {
  id: 'acc1', name: 'Popular', short: 'Pop', type: 'debit', color: '#3b82f6',
  balance: 10_000, openingBalance: 10_000, last4: null,
}

const CAT_SUELDO: Category = {
  id: 'cat_salario', name: 'Salario', type: 'income', color: '#35d0a2', budget: 0, icon: 'wallet',
}
const CAT_COMIDA: Category = {
  id: 'cat_super', name: 'Supermercado', type: 'expense', color: '#ff6b8a', budget: 0, icon: 'cart',
}

function sembrar() {
  useFinance.setState({
    accounts: [{ ...CUENTA }],
    categories: [{ ...CAT_SUELDO }, { ...CAT_COMIDA }],
    transactions: [],
    goals: [],
    goalContributions: [],
    currency: 'DOP',
  })
}

describe('conciliar una cuenta', () => {
  beforeEach(sembrar)

  it('crea el ajuste en su propia categoría, no en Salario', () => {
    useFinance.getState().reconcileAccount('acc1', 13_000)
    const ajuste = useFinance.getState().transactions[0]
    expect(ajuste.categoryId).toBe(ADJUST_CATEGORY.income.id)
    expect(ajuste.categoryId).not.toBe(CAT_SUELDO.id)
  })

  it('la categoría nace marcada fuera de informes', () => {
    useFinance.getState().reconcileAccount('acc1', 13_000)
    const cat = useFinance.getState().categories.find(c => c.id === ADJUST_CATEGORY.income.id)!
    expect(cat.excludeFromReports).toBe(true)
  })

  it('usa la categoría de gasto cuando el ajuste resta', () => {
    useFinance.getState().reconcileAccount('acc1', 7_000)
    const ajuste = useFinance.getState().transactions[0]
    expect(ajuste.type).toBe('expense')
    expect(ajuste.categoryId).toBe(ADJUST_CATEGORY.expense.id)
  })

  it('EL SALDO SÍ cuenta el ajuste: para eso existe', () => {
    useFinance.getState().reconcileAccount('acc1', 13_000)
    expect(useFinance.getState().accounts[0].balance).toBe(13_000)
  })

  it('cuadrar dos veces no duplica la categoría', () => {
    useFinance.getState().reconcileAccount('acc1', 13_000)
    useFinance.getState().reconcileAccount('acc1', 15_000)
    const cats = useFinance.getState().categories.filter(c => c.id === ADJUST_CATEGORY.income.id)
    expect(cats).toHaveLength(1)
  })

  it('no hace nada si ya cuadraba', () => {
    const diff = useFinance.getState().reconcileAccount('acc1', 10_000)
    expect(diff).toBe(0)
    expect(useFinance.getState().transactions).toHaveLength(0)
  })

  it('el ajuste sobrevive a recargar la app', () => {
    // El saneador borró estos ajustes una vez, y el descuadre volvía al abrir.
    useFinance.getState().reconcileAccount('acc1', 13_000)
    const { accounts, categories, transactions, goals, goalContributions, currency } = useFinance.getState()
    const limpio = sanitizeFinanceData({ accounts, categories, transactions, goals, goalContributions, currency })
    expect(limpio.transactions).toHaveLength(1)
    expect(limpio.transactions[0].categoryId).toBe(ADJUST_CATEGORY.income.id)
    // Y la marca de la categoría también sobrevive, o al recargar volvería a
    // contarse como un ingreso.
    expect(limpio.categories.find(c => c.id === ADJUST_CATEGORY.income.id)?.excludeFromReports).toBe(true)
  })
})

describe('reportable', () => {
  const ajuste = { id: 'a', type: 'income', amount: 3_000, date: '2026-10-18', note: 'Ajuste', categoryId: 'cat_ajuste_in', accountId: 'acc1' } as Transaction
  const sueldo = { id: 'b', type: 'income', amount: 42_000, date: '2026-10-01', note: 'Sueldo', categoryId: 'cat_salario', accountId: 'acc1' } as Transaction
  const compra = { id: 'c', type: 'expense', amount: 2_450, date: '2026-10-12', note: 'Súper', categoryId: 'cat_super', accountId: 'acc1' } as Transaction
  const cats: Category[] = [CAT_SUELDO, CAT_COMIDA, { ...ADJUST_CATEGORY.income }]

  it('quita los ajustes y deja todo lo demás', () => {
    expect(reportable([ajuste, sueldo, compra], cats).map(t => t.id)).toEqual(['b', 'c'])
  })

  it('sin categorías excluidas no filtra nada y devuelve la MISMA lista', () => {
    const sinExcluir = [CAT_SUELDO, CAT_COMIDA]
    const lista = [ajuste, sueldo]
    expect(reportable(lista, sinExcluir)).toBe(lista)
  })

  it('una transferencia nunca se filtra: no tiene categoría', () => {
    const tr = { id: 'd', type: 'transfer', amount: 500, date: '2026-10-05', note: 'Paso', fromAccount: 'acc1', toAccount: 'acc2' } as Transaction
    expect(reportable([tr], cats).map(t => t.id)).toEqual(['d'])
  })

  it('los totales del mes ya no incluyen el ajuste', () => {
    const conAjuste = totals([ajuste, sueldo, compra])
    const sinAjuste = totals(reportable([ajuste, sueldo, compra], cats))
    expect(conAjuste.income).toBe(45_000)
    expect(sinAjuste.income).toBe(42_000)
    expect(sinAjuste.expense).toBe(2_450)
  })

  it('el embudo de totales lo aplica cuando se le pasan las categorías', () => {
    const cuentas = [CUENTA]
    const conCats = transactionsForTotals([ajuste, sueldo], cuentas, undefined, cats)
    const sinCats = transactionsForTotals([ajuste, sueldo], cuentas)
    expect(conCats.map(t => t.id)).toEqual(['b'])
    // Sin categorías se comporta como siempre: compatibilidad hacia atrás.
    expect(sinCats.map(t => t.id)).toEqual(['a', 'b'])
  })

  it('adjustmentsOnly devuelve justo lo contrario, para poder contarlos', () => {
    expect(adjustmentsOnly([ajuste, sueldo, compra], cats).map(t => t.id)).toEqual(['a'])
    expect(adjustmentsOnly([sueldo], [CAT_SUELDO])).toEqual([])
  })
})
