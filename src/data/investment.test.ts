import { describe, expect, it } from 'vitest'
import { alreadyPaid, businessInvestment, servicePayment } from './investment'
import type { Business, Service } from './business'
import type { Transaction } from '@/types'

const NEGOCIO: Business = {
  id: 'b1', name: 'Streaming', color: '#35d0a2', icon: 'play',
  incomeCategoryIds: ['cat_cobros'],
  expenseCategoryIds: ['cat_subs'],
  createdAt: 0,
}

let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'expense', amount: 600, date: '2026-10-01',
    note: 'Netflix', categoryId: 'cat_subs', accountId: 'a1', ...over,
  } as Transaction
}

describe('businessInvestment', () => {
  it('suma lo puesto y lo cobrado desde el principio', () => {
    const r = businessInvestment(NEGOCIO, [
      tx({ amount: 600, date: '2026-08-01' }),
      tx({ amount: 600, date: '2026-09-01' }),
      tx({ amount: 600, date: '2026-10-01' }),
      tx({ type: 'income', amount: 1_000, date: '2026-09-05', categoryId: 'cat_cobros' }),
      tx({ type: 'income', amount: 1_000, date: '2026-10-05', categoryId: 'cat_cobros' }),
    ], '2026-10', 400)
    expect(r.total).toBe(1_800)
    expect(r.thisMonth).toBe(600)
    expect(r.collected).toBe(2_000)
    expect(r.returned).toBe(200)
    expect(r.isProfitable).toBe(true)
  })

  it('CONTESTA LO QUE LA GANANCIA MENSUAL NO: si ya se pagó solo', () => {
    // Un negocio puede dejar 400 al mes y llevar dos años sin recuperar lo que
    // costó montarlo.
    const r = businessInvestment(NEGOCIO, [
      tx({ amount: 12_000, date: '2026-01-10' }),
      tx({ type: 'income', amount: 1_000, date: '2026-10-05', categoryId: 'cat_cobros' }),
    ], '2026-10', 400)
    expect(r.returned).toBe(-11_000)
    expect(r.isProfitable).toBe(false)
    expect(r.monthsToRecover).toBe(28)
  })

  it('con el negocio ya recuperado no hay plazo que dar', () => {
    const r = businessInvestment(NEGOCIO, [
      tx({ amount: 600 }),
      tx({ type: 'income', amount: 5_000, categoryId: 'cat_cobros' }),
    ], '2026-10', 400)
    expect(r.monthsToRecover).toBeNull()
  })

  it('con ganancia cero o negativa NO se inventa un plazo', () => {
    // «999 meses» es una forma rara de decir que hay un problema.
    const sinGanancia = businessInvestment(NEGOCIO, [tx({ amount: 5_000 })], '2026-10', 0)
    expect(sinGanancia.monthsToRecover).toBeNull()
    const enPerdida = businessInvestment(NEGOCIO, [tx({ amount: 5_000 })], '2026-10', -200)
    expect(enPerdida.monthsToRecover).toBeNull()
  })

  it('no cuenta categorías de otro negocio', () => {
    const r = businessInvestment(NEGOCIO, [
      tx({ amount: 9_999, categoryId: 'cat_super' }),
      tx({ type: 'income', amount: 9_999, categoryId: 'cat_salario' }),
    ], '2026-10', 100)
    expect(r.total).toBe(0)
    expect(r.collected).toBe(0)
  })

  it('las transferencias no son inversión', () => {
    const r = businessInvestment(NEGOCIO, [
      tx({ type: 'transfer', amount: 9_999, categoryId: undefined, fromAccount: 'a1', toAccount: 'a2' }),
    ], '2026-10', 100)
    expect(r.total).toBe(0)
  })

  it('un negocio sin nada queda a cero y no divide por cero', () => {
    const r = businessInvestment(NEGOCIO, [], '2026-10', 0)
    expect(r).toMatchObject({ total: 0, collected: 0, returned: 0, isProfitable: true, monthsToRecover: null })
  })
})

describe('servicePayment', () => {
  it('el pago cubre TODAS las cuentas compradas', () => {
    // Dos Netflix se pagan los dos.
    const dos: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 0, costCycle: 'monthly', createdAt: 0,
      accounts: [{ id: 'ac1', cost: 600 }, { id: 'ac2', cost: 600 }],
    }
    const p = servicePayment(dos, 'DOP')
    expect(p.amount).toBe(1_200)
    expect(p.accountCount).toBe(2)
  })

  it('un servicio sin cuentas cobra lo suyo', () => {
    const uno: Service = {
      id: 's1', businessId: 'b1', name: 'Disney', cost: 450, costCycle: 'monthly', createdAt: 0,
    }
    expect(servicePayment(uno, 'DOP').amount).toBe(450)
  })

  it('UNA SUSCRIPCIÓN ANUAL se paga entera y cuenta su parte al mes', () => {
    // Es la mitad del asunto: el pago es de 6,000 y el coste mensual es 500.
    const anual: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 6_000, costCycle: 'annual', createdAt: 0,
    }
    const p = servicePayment(anual, 'DOP')
    expect(p.amount).toBe(6_000)
    expect(p.perMonth).toBe(500)
  })

  it('lleva su divisa, para no mezclarla con la de la cuenta', () => {
    const enUsd: Service = {
      id: 's1', businessId: 'b1', name: 'Spotify', cost: 10, costCycle: 'monthly',
      currency: 'USD', createdAt: 0,
    }
    expect(servicePayment(enUsd, 'DOP').currency).toBe('USD')
  })
})

describe('alreadyPaid', () => {
  const pago = servicePayment({
    id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
  }, 'DOP')

  it('evita pagar dos veces lo mismo', () => {
    // Con una suscripción anual es fácil: no te acuerdas de si la pagaste.
    const ya = alreadyPaid(pago, ['cat_subs'], [tx({ amount: 600, date: '2026-10-01' })], '2026-10-01')
    expect(ya).not.toBeNull()
  })

  it('un pago anterior al plazo no cuenta', () => {
    const ya = alreadyPaid(pago, ['cat_subs'], [tx({ amount: 600, date: '2026-09-01' })], '2026-10-01')
    expect(ya).toBeNull()
  })

  it('un monto distinto no es el mismo pago', () => {
    const ya = alreadyPaid(pago, ['cat_subs'], [tx({ amount: 2_450, date: '2026-10-05' })], '2026-10-01')
    expect(ya).toBeNull()
  })

  it('tolera un peso de diferencia: el usuario pudo redondear', () => {
    const ya = alreadyPaid(pago, ['cat_subs'], [tx({ amount: 601, date: '2026-10-05' })], '2026-10-01')
    expect(ya).not.toBeNull()
  })

  it('un gasto de otra categoría no cuenta como este pago', () => {
    const ya = alreadyPaid(pago, ['cat_subs'], [tx({ amount: 600, categoryId: 'cat_super' })], '2026-10-01')
    expect(ya).toBeNull()
  })

  it('un ingreso del mismo monto tampoco', () => {
    const ya = alreadyPaid(pago, ['cat_subs'], [tx({ type: 'income', amount: 600 })], '2026-10-01')
    expect(ya).toBeNull()
  })
})
