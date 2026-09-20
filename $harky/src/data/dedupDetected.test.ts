import { describe, expect, it } from 'vitest'
import { looksAlreadyRecorded } from './bankIngest'
import type { Transaction } from '@/types'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'expense', amount: 2_840, date: '2026-09-20',
  note: 'Super', accountId: 'c1', categoryId: 'k1', ...over,
})

const candidate = (over: Partial<Parameters<typeof looksAlreadyRecorded>[1]> = {}) => ({
  amount: 2_840, accountId: 'c1', date: '2026-09-20', type: 'expense' as const, ...over,
})

/**
 * El caso real: pagas en el supermercado, lo registras a mano, y segundos
 * después llega el aviso del banco por la misma compra. Sin esto el gasto
 * queda dos veces y el saldo miente.
 */
describe('detectar que ya lo tecleaste', () => {
  it('lo reconoce por monto, cuenta y día', () => {
    expect(looksAlreadyRecorded([tx()], candidate())?.id).toBe('t1')
  })

  it('NO exige que la nota coincida', () => {
    // El aviso dice "SUPERMERCADO NACIONAL" y el usuario escribió "Super".
    // Exigir que coincidan es lo que hacía inútil al detector que ya existía.
    expect(looksAlreadyRecorded([tx({ note: 'Super' })], candidate())).not.toBeNull()
  })

  it('distingue cuentas distintas', () => {
    // La misma compra dividida en dos tarjetas son dos gastos reales.
    expect(looksAlreadyRecorded([tx({ accountId: 'otra' })], candidate())).toBeNull()
  })

  it('distingue montos distintos', () => {
    expect(looksAlreadyRecorded([tx({ amount: 2_841 })], candidate())).toBeNull()
  })

  it('distingue días distintos', () => {
    expect(looksAlreadyRecorded([tx({ date: '2026-09-19' })], candidate())).toBeNull()
  })

  it('distingue ingreso de gasto', () => {
    expect(looksAlreadyRecorded([tx({ type: 'income' })], candidate())).toBeNull()
  })

  it('compara centavos, no enteros', () => {
    expect(looksAlreadyRecorded([tx({ amount: 2_840.5 })], candidate({ amount: 2_840.5 }))).not.toBeNull()
    expect(looksAlreadyRecorded([tx({ amount: 2_840.5 })], candidate({ amount: 2_840.51 }))).toBeNull()
  })

  /**
   * Un movimiento que YA vino de un aviso no cuenta como "lo tecleaste tú".
   * Si contara, dos avisos legítimos del mismo monto se bloquearían entre sí
   * y el segundo gasto nunca entraría.
   */
  it('ignora movimientos creados por otro aviso', () => {
    const fromNotification = tx({ detectedFrom: 'notification' })
    expect(looksAlreadyRecorded([fromNotification], candidate())).toBeNull()
  })

  it('con el libro vacío no hay sospecha', () => {
    expect(looksAlreadyRecorded([], candidate())).toBeNull()
  })

  it('devuelve el movimiento, no solo true', () => {
    // Quien llama necesita el id para poder mostrar cuál es el posible
    // repetido: "puede que ya registraras esto" sin decir cuál no sirve.
    const found = looksAlreadyRecorded([tx({ id: 'abc' })], candidate())
    expect(found?.id).toBe('abc')
    expect(found?.note).toBe('Super')
  })
})
