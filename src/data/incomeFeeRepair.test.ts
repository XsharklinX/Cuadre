import { describe, expect, it } from 'vitest'
import { findInflatedIncome, repairInflatedIncome, totalInflated } from './incomeFeeRepair'
import type { FeeLine } from './bankFees'
import type { Transaction } from '@/types'

/**
 * DESHACER UN IMPUESTO QUE NUNCA DEBIÓ COBRARSE.
 *
 * El caso real: un sueldo de RD$ 10,000 en una cuenta de Banreservas. La app
 * calculaba el 0,15 % de la Ley 288-04 y lo SUMABA al ingreso, así que el libro
 * anotaba RD$ 10,015. Quince pesos inventados, en cada ingreso.
 *
 * La reparación no estima nada: el desglose quedó guardado al lado del
 * movimiento, así que el monto verdadero sale de una resta exacta.
 */

const impuesto = (amount: number): FeeLine => ({ kind: 'itbis-transfer', pct: 0.15, amount })

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'income', amount: 10_015, date: '2026-09-20',
  note: 'Sueldo', accountId: 'acc_bank', categoryId: 'cat_salario',
  fees: [impuesto(15)],
  ...over,
} as Transaction)

describe('encontrar los ingresos inflados', () => {
  it('reconoce un ingreso con cargos y calcula lo que sobra', () => {
    const [fix] = findInflatedIncome([tx()])
    expect(fix.stored).toBe(10_015)
    expect(fix.real).toBe(10_000)
    expect(fix.inflated).toBe(15)
  })

  /* Un gasto con cargos es CORRECTO: ahi el banco si retiene. No se toca. */
  it('no toca los gastos', () => {
    expect(findInflatedIncome([tx({ type: 'expense' })])).toEqual([])
  })

  it('no toca un ingreso sin cargos', () => {
    expect(findInflatedIncome([tx({ amount: 10_000, fees: undefined })])).toEqual([])
  })

  it('ignora una lista de cargos vacia o de importe cero', () => {
    expect(findInflatedIncome([tx({ fees: [] })])).toEqual([])
    expect(findInflatedIncome([tx({ fees: [impuesto(0)] })])).toEqual([])
  })

  it('suma varios cargos del mismo ingreso', () => {
    const varios = tx({ amount: 10_045, fees: [impuesto(15), { kind: 'fx-surcharge', pct: 3, amount: 30 }] })
    const [fix] = findInflatedIncome([varios])
    expect(fix.inflated).toBe(45)
    expect(fix.real).toBe(10_000)
  })

  it('suma el dinero inventado de todo el libro', () => {
    const fixes = findInflatedIncome([
      tx({ id: 'a' }),
      tx({ id: 'b', amount: 20_030, fees: [impuesto(30)] }),
      tx({ id: 'c', type: 'expense' }),
    ])
    expect(fixes).toHaveLength(2)
    expect(totalInflated(fixes)).toBe(45)
  })
})

describe('reparar', () => {
  it('devuelve el monto real y quita los cargos', () => {
    const [reparado] = repairInflatedIncome([tx()])
    expect(reparado.amount).toBe(10_000)
    // La lista se va con el monto: dejarla seria dejar la prueba de un cargo
    // que la app ya no cobra, y la ficha lo seguiria mostrando.
    expect(reparado.fees).toBeUndefined()
  })

  it('deja intacto todo lo demas del movimiento', () => {
    const original = tx()
    const [reparado] = repairInflatedIncome([original])
    expect(reparado.id).toBe(original.id)
    expect(reparado.note).toBe(original.note)
    expect(reparado.date).toBe(original.date)
    expect(reparado.accountId).toBe(original.accountId)
    expect(reparado.categoryId).toBe(original.categoryId)
  })

  it('no toca los gastos ni los ingresos sanos', () => {
    const gasto = tx({ id: 'g', type: 'expense' })
    const sano = tx({ id: 's', amount: 500, fees: undefined })
    const [a, b] = repairInflatedIncome([gasto, sano])
    expect(a).toBe(gasto)
    expect(b).toBe(sano)
  })

  /*
   * Reparar dos veces no puede restar dos veces. Tras la primera pasada el
   * ingreso ya no lleva cargos, asi que la segunda no lo reconoce como dañado.
   */
  it('reparar de nuevo no vuelve a restar', () => {
    const una = repairInflatedIncome([tx()])
    const dos = repairInflatedIncome(una)
    expect(dos[0].amount).toBe(10_000)
    expect(findInflatedIncome(dos)).toEqual([])
  })

  it('con centavos redondea a dos decimales', () => {
    const [r] = repairInflatedIncome([tx({ amount: 3_333.34, fees: [impuesto(5.0001)] })])
    expect(r.amount).toBeCloseTo(3_328.34, 2)
    expect(Number.isInteger(r.amount * 100)).toBe(true)
  })
})
