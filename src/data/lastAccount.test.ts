import { describe, expect, it } from 'vitest'
import { suggestAccount } from './lastAccount'
import type { Account, Transaction } from '@/types'

/**
 * SUGERIR LA CUENTA PARA NO VOLVER A PREGUNTARLA.
 *
 * El formulario arrancaba siempre en «Seleccionar…», así que cada gasto
 * costaba un toque de más que casi nunca cambiaba de respuesta.
 *
 * Lo que se vigila aquí es sobre todo lo que NO debe pasar: sugerir una cuenta
 * borrada, sugerir la del gasto para un ingreso, o sugerir la equivocada
 * porque el libro no venía ordenado por fecha.
 */

const cuenta = (id: string, name = id): Account => ({
  id, name, short: name.slice(0, 2), type: 'debit', color: '#fff',
  balance: 1_000, openingBalance: 1_000, last4: null,
})

const mov = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't', type: 'expense', amount: 100, date: '2026-09-01',
  note: 'Compra', accountId: 'acc_a', categoryId: 'cat_1', ...over,
} as Transaction)

const CUENTAS = [cuenta('acc_a', 'Tarjeta'), cuenta('acc_b', 'Banco')]

describe('sugerir cuenta', () => {
  it('propone la del ultimo gasto', () => {
    const libro = [mov({ accountId: 'acc_a', date: '2026-09-01' })]
    expect(suggestAccount(libro, CUENTAS, 'expense')).toBe('acc_a')
  })

  /*
   * Por FECHA, no por posicion en el array. Un import de CSV puede dejar
   * movimientos viejos arriba del libro, y entonces coger el primero sugeriria
   * la cuenta de un gasto de hace meses.
   */
  it('coge el mas reciente por fecha, no el primero del array', () => {
    const libro = [
      mov({ id: 'viejo', accountId: 'acc_a', date: '2026-01-15' }),
      mov({ id: 'nuevo', accountId: 'acc_b', date: '2026-09-20' }),
    ]
    expect(suggestAccount(libro, CUENTAS, 'expense')).toBe('acc_b')
  })

  /*
   * Un gasto sale de la tarjeta y un sueldo entra al banco: no son el mismo
   * bolsillo. Sugerir la del gasto para un ingreso seria peor que no sugerir.
   */
  it('mira solo los movimientos del mismo tipo', () => {
    const libro = [
      mov({ type: 'expense', accountId: 'acc_a', date: '2026-09-20' }),
      mov({ type: 'income', accountId: 'acc_b', date: '2026-09-10' }),
    ]
    expect(suggestAccount(libro, CUENTAS, 'expense')).toBe('acc_a')
    expect(suggestAccount(libro, CUENTAS, 'income')).toBe('acc_b')
  })

  /*
   * Si la cuenta se borro, sugerirla dejaria el formulario apuntando a algo que
   * no existe y el guardado fallaria sin que el usuario entienda por que.
   */
  it('nunca sugiere una cuenta borrada', () => {
    const libro = [mov({ accountId: 'acc_borrada', date: '2026-09-20' })]
    expect(suggestAccount(libro, CUENTAS, 'expense')).toBeNull()
  })

  it('con la cuenta borrada, cae al ultimo movimiento que si existe', () => {
    const libro = [
      mov({ id: 'x', accountId: 'acc_borrada', date: '2026-09-20' }),
      mov({ id: 'y', accountId: 'acc_a', date: '2026-09-18' }),
    ]
    expect(suggestAccount(libro, CUENTAS, 'expense')).toBe('acc_a')
  })

  /* Recien instalada: con una sola cuenta no hay nada que elegir. */
  it('sin historial y con una sola cuenta, propone esa', () => {
    expect(suggestAccount([], [cuenta('acc_unica')], 'expense')).toBe('acc_unica')
  })

  it('sin historial y con varias cuentas, no adivina', () => {
    expect(suggestAccount([], CUENTAS, 'expense')).toBeNull()
  })

  it('sin cuentas no devuelve nada', () => {
    expect(suggestAccount([mov()], [], 'expense')).toBeNull()
  })

  /* Una transferencia usa dos cuentas y no cabe en esta pregunta. */
  it('ignora las transferencias', () => {
    const libro = [mov({ type: 'transfer', accountId: undefined, date: '2026-09-25' })]
    expect(suggestAccount(libro, CUENTAS, 'expense')).toBeNull()
  })
})
