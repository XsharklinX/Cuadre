import { beforeEach, describe, expect, it } from 'vitest'
import { sanitizeFinanceData, useFinance } from '@/store/finance'
import type { Account, Category, Transaction } from '@/types'

/**
 * EL BUG QUE EL USUARIO DESCRIBIO COMO "se bugea todo el sistema de credito".
 *
 * Dos fallos distintos, los dos capaces de hacer aparecer o desaparecer
 * dinero. Estas pruebas existen para que no vuelvan: las dos fallaban antes
 * del arreglo.
 */

const CATS: Category[] = [
  { id: 'cat_super', name: 'Supermercado', type: 'expense', color: '#fff', budget: 0, icon: 'cart' },
  { id: 'cat_salario', name: 'Salario', type: 'income', color: '#fff', budget: 0, icon: 'wallet' },
]

const CARD: Account = {
  id: 'acc_card', name: 'Visa', short: 'Visa', type: 'credit', color: '#fff',
  balance: 0, openingBalance: 0, last4: '7109', limit: 12_000, currency: 'DOP',
  secondaryCurrency: 'USD', secondaryBalance: 0, secondaryOpeningBalance: 0,
}

function clean(accounts: Account[] = [CARD], transactions: Transaction[] = []) {
  useFinance.setState({
    accounts, transactions, categories: CATS,
    goals: [], goalContributions: [], currency: 'DOP',
  })
}

describe('el saneador no borra movimientos del usuario', () => {
  beforeEach(() => clean())

  /**
   * ANTES: el filtro exigia `categoryId` valido y tiraba lo que no lo tuviera.
   * El ajuste de «Conciliar saldo» nacia sin categoria, asi que al recargar la
   * app DESAPARECIA y el saldo volvia a descuadrar solo.
   */
  it('a un movimiento sin categoria le pone una, no lo tira', () => {
    const data = sanitizeFinanceData({
      accounts: [CARD], categories: CATS, goals: [], goalContributions: [], currency: 'DOP',
      transactions: [{
        id: 't1', type: 'expense', amount: 500, date: '2026-09-20',
        note: 'Ajuste de conciliacion', accountId: CARD.id,
      }],
    })
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].categoryId).toBe('cat_super')
  })

  it('a un ingreso sin categoria le pone una de ingreso', () => {
    const data = sanitizeFinanceData({
      accounts: [CARD], categories: CATS, goals: [], goalContributions: [], currency: 'DOP',
      transactions: [{
        id: 't1', type: 'income', amount: 500, date: '2026-09-20',
        note: 'Ajuste', accountId: CARD.id,
      }],
    })
    expect(data.transactions[0].categoryId).toBe('cat_salario')
  })

  /** Sin cuenta no hay saldo al que aplicarlo: ahi si no hay nada que salvar. */
  it('sigue descartando lo que no tiene cuenta', () => {
    const data = sanitizeFinanceData({
      accounts: [CARD], categories: CATS, goals: [], goalContributions: [], currency: 'DOP',
      transactions: [{ id: 't1', type: 'expense', amount: 500, date: '2026-09-20', note: 'x' }],
    })
    expect(data.transactions).toHaveLength(0)
  })

  it('el ajuste de conciliacion sobrevive a una recarga', () => {
    const diff = useFinance.getState().reconcileAccount(CARD.id, -3_000)
    expect(diff).toBeCloseTo(-3_000, 2)

    const s = useFinance.getState()
    expect(s.transactions[0].categoryId).toBe('cat_super')

    const reloaded = sanitizeFinanceData({
      accounts: s.accounts, categories: s.categories, transactions: s.transactions,
      goals: [], goalContributions: [], currency: 'DOP',
    })
    expect(reloaded.transactions).toHaveLength(1)
    expect(reloaded.accounts[0].balance).toBeCloseTo(-3_000, 2)
  })
})

describe('editar el saldo a mano mantiene la invariante en los DOS libros', () => {
  beforeEach(() => clean())

  /**
   * ANTES: editar la deuda en dolares dejaba `secondaryBalance` en -39.80 y la
   * apertura secundaria en 0. Al recalcular, apertura + movimientos daba 0 y la
   * deuda en dolares desaparecia sin aviso.
   */
  it('el libro en divisa secundaria no pierde la deuda al recalcular', () => {
    useFinance.getState().updateAccount(CARD.id, { secondaryBalance: -39.80 })
    const card = useFinance.getState().accounts[0]
    expect(card.secondaryBalance).toBeCloseTo(-39.80, 2)
    expect(card.secondaryOpeningBalance).toBeCloseTo(-39.80, 2)

    const reloaded = sanitizeFinanceData({
      accounts: useFinance.getState().accounts, categories: CATS,
      transactions: [], goals: [], goalContributions: [], currency: 'DOP',
    })
    expect(reloaded.accounts[0].secondaryBalance).toBeCloseTo(-39.80, 2)
  })

  it('el libro principal tampoco', () => {
    useFinance.getState().updateAccount(CARD.id, { balance: -9_781.45 })
    const card = useFinance.getState().accounts[0]
    expect(card.openingBalance).toBeCloseTo(-9_781.45, 2)
  })
})

describe('descripcion larga de un movimiento', () => {
  const base = {
    accounts: [CARD], categories: CATS, goals: [], goalContributions: [], currency: 'DOP' as const,
  }
  const mov = (over: Record<string, unknown> = {}) => ({
    id: 't1', type: 'expense', amount: 500, date: '2026-10-03',
    note: 'Cena', accountId: CARD.id, categoryId: 'cat_super', ...over,
  })

  it('sobrevive a una recarga', () => {
    const data = sanitizeFinanceData({ ...base, transactions: [mov({ description: 'Con Ana, incluia propina' })] })
    expect(data.transactions[0].description).toBe('Con Ana, incluia propina')
  })

  it('se recorta sola y no se guarda vacia', () => {
    const data = sanitizeFinanceData({ ...base, transactions: [mov({ description: '   ' })] })
    expect(data.transactions[0].description).toBeUndefined()
  })

  /*
   * El libro entero vive en localStorage, que tiene un limite duro. Un solo
   * campo sin tope puede llenarlo y dejar la app sin poder guardar NADA mas.
   */
  it('un muro de texto se trunca, pero el movimiento se queda', () => {
    const data = sanitizeFinanceData({ ...base, transactions: [mov({ description: 'x'.repeat(50_000) })] })
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].description!.length).toBe(2000)
  })

  /** Una descripcion corrupta NUNCA se lleva por delante el dinero. */
  it('una descripcion que no es texto se descarta sin tirar el movimiento', () => {
    const data = sanitizeFinanceData({ ...base, transactions: [mov({ description: { malo: true } })] })
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].description).toBeUndefined()
    expect(data.transactions[0].amount).toBe(500)
  })
})
