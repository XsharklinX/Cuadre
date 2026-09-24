import { describe, expect, it } from 'vitest'
import { ITBIS_TRANSFER_PCT, computeFees, findBankProfile, totalFees } from './bankFees'

const banco = findBankProfile('banreservas')!
const base = { profile: banco, typedCurrency: 'DOP' as const, accountCurrency: 'DOP' as const }

describe('Ley 288-04 (0.15%) en gastos cotidianos', () => {
  /*
   * EL FALLO: una compra normal en pesos con tarjeta de debito no generaba
   * NINGUN cargo, mientras el banco si retenia el 0.15%. El libro quedaba con
   * mas dinero del que habia de verdad.
   */
  it('una compra en pesos con debito SI paga el 0.15%', () => {
    const fees = computeFees(10_000, { ...base, payerType: 'debit' })
    expect(fees).toHaveLength(1)
    expect(fees[0].kind).toBe('itbis-transfer')
    expect(fees[0].amount).toBeCloseTo(10_000 * ITBIS_TRANSFER_PCT / 100, 2)  // 15.00
  })

  /** Efectivo no toca el sistema bancario: no hay nada que gravar. */
  it('en efectivo no se cobra nada', () => {
    expect(computeFees(10_000, { ...base, payerType: 'cash' })).toEqual([])
  })

  /*
   * Una compra con tarjeta de CREDITO no debita tu cuenta. El impuesto llega
   * cuando pagas la tarjeta desde el banco, y ahi se cobra como transferencia.
   * Cobrarlo dos veces seria inventarle un gasto al usuario.
   */
  it('con tarjeta de credito NO se cobra al comprar', () => {
    expect(computeFees(10_000, { ...base, payerType: 'credit' })).toEqual([])
  })

  /** Pagar la tarjeta SI es una transferencia, y ahi si aplica. */
  it('al pagar la tarjeta desde el banco si aplica', () => {
    const fees = computeFees(10_000, { ...base, isTransfer: true })
    expect(fees.map(f => f.kind)).toContain('itbis-transfer')
  })

  /*
   * ENTRE CUENTAS PROPIAS, NADA. Es el mismo dinero cambiando de bolsillo;
   * cobrarle impuesto de gasto inflaria lo gastado del mes.
   */
  it('entre cuentas propias no se cobra nada', () => {
    expect(computeFees(50_000, { ...base, payerType: 'debit', ownTransfer: true })).toEqual([])
    expect(computeFees(50_000, { ...base, isTransfer: true, ownTransfer: true })).toEqual([])
  })

  it('se puede apagar sin pelear con la app', () => {
    expect(computeFees(10_000, { ...base, payerType: 'debit', lawTaxDisabled: true })).toEqual([])
  })
})

describe('el impuesto convive con los otros cargos', () => {
  it('compra en dolares con debito: recargo de divisa Y 0.15%', () => {
    const fees = computeFees(10_000, {
      ...base, typedCurrency: 'USD', accountCurrency: 'DOP', payerType: 'debit',
    })
    const kinds = fees.map(f => f.kind)
    expect(kinds).toContain('fx-surcharge')
    expect(kinds).toContain('itbis-transfer')
    // 3% + 0.15% sobre 10.000
    expect(totalFees(fees)).toBeCloseTo(315, 2)
  })

  it('un avance de efectivo suma su comision y el impuesto', () => {
    const fees = computeFees(5_000, { ...base, payerType: 'debit', isCashAdvance: true })
    expect(fees.map(f => f.kind).sort()).toEqual(['cash-advance', 'itbis-transfer'])
  })

  /** Sin banco conocido no se inventa ningun cargo. */
  it('sin perfil de banco no se cobra nada', () => {
    expect(computeFees(10_000, { ...base, profile: null, payerType: 'debit' })).toEqual([])
  })
})
