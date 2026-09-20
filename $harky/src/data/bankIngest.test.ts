import { describe, expect, it } from 'vitest'
import { DEDUP_WINDOW_MS, isDuplicateMovement, movementDedupKey, resolveDetectedAccount } from './bankIngest'
import type { Account } from '@/types'

const acct = (over: Partial<Account>): Account => ({
  id: 'a', name: 'Cuenta', short: 'C', type: 'debit', color: '#fff', balance: 0, last4: null, ...over,
})

describe('movementDedupKey / isDuplicateMovement', () => {
  it('mismo consumo reenviado a 2 bandejas (misma firma, minutos aparte) → duplicado', () => {
    const key = movementDedupKey('expense', 100, '4500', 'com.google.android.gm')
    const processed = [{ key, postTime: 1_000_000 }]
    // segundo correo 40s después
    expect(isDuplicateMovement(processed, key, 1_040_000)).toBe(true)
  })

  it('dos recargas iguales pero separadas en el tiempo → NO duplicado', () => {
    const key = movementDedupKey('expense', 100, '4500', 'gm')
    const processed = [{ key, postTime: 1_000_000 }]
    expect(isDuplicateMovement(processed, key, 1_000_000 + DEDUP_WINDOW_MS + 1)).toBe(false)
  })

  it('mismo monto en tarjetas distintas → firmas distintas, no se fusionan', () => {
    expect(movementDedupKey('expense', 100, '4500', 'gm'))
      .not.toBe(movementDedupKey('expense', 100, '7788', 'gm'))
  })

  it('el monto se redondea para tolerar centavos de OCR', () => {
    expect(movementDedupKey('expense', 100.0, '4500', 'gm'))
      .toBe(movementDedupKey('expense', 100.4, '4500', 'gm'))
  })
})

describe('resolveDetectedAccount', () => {
  const accounts = [
    acct({ id: 'bre', name: 'Banreservas', last4: '4500' }),
    acct({ id: 'bhd', name: 'BHD', last4: '9087' }),
    acct({ id: 'cash', name: 'Efectivo', type: 'cash', last4: null }),
  ]

  it('resuelve por los últimos 4 dígitos', () => {
    expect(resolveDetectedAccount(accounts, {}, '4500', 'gm')?.id).toBe('bre')
  })

  it('si dos cuentas comparten los 4 dígitos, no adivina (undefined)', () => {
    const dup = [acct({ id: 'x', last4: '4500' }), acct({ id: 'y', last4: '4500' })]
    expect(resolveDetectedAccount(dup, {}, '4500', 'gm')).toBeUndefined()
  })

  it('sin tarjeta, usa el mapeo por app bancaria', () => {
    expect(resolveDetectedAccount(accounts, { 'com.bhd': 'bhd' }, undefined, 'com.bhd')?.id).toBe('bhd')
  })

  it('la tarjeta manda sobre el mapeo por app', () => {
    expect(resolveDetectedAccount(accounts, { gm: 'bhd' }, '4500', 'gm')?.id).toBe('bre')
  })

  it('sin tarjeta ni mapeo → undefined (mejor preguntar)', () => {
    expect(resolveDetectedAccount(accounts, {}, undefined, 'gm')).toBeUndefined()
  })
})
