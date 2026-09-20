import { describe, expect, it } from 'vitest'
import { buildTxEntry, readTxEntry, routeTx } from './txCurrency'
import { convertCurrency } from './currencies'
import { sanitizeFinanceData } from '@/store/finance'
import type { Account, Transaction } from '@/types'

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Visa', short: 'V', type: 'credit', color: '#fff',
  balance: 0, last4: '1', limit: 50_000, currency: 'DOP',
  secondaryCurrency: 'USD', secondaryBalance: 0, ...over,
})

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: 't1', type: 'expense', amount: 1_540, date: '2026-09-20',
  note: 'Amazon', accountId: 'c1', categoryId: 'k1', ...over,
})

const USD_TO_DOP = convertCurrency(1, 'USD', 'DOP')

describe('a qué libro va un movimiento', () => {
  it('sin elección explícita sigue a la cuenta', () => {
    const r = routeTx(card(), null, 'DOP')
    expect(r.typedCurrency).toBe('DOP')
    expect(r.toSecondary).toBe(false)
  })

  it('elegir la divisa secundaria manda al segundo libro', () => {
    const r = routeTx(card(), 'USD', 'DOP')
    expect(r.toSecondary).toBe(true)
    expect(r.targetCurrency).toBe('USD')
  })

  it('una divisa que no es la secundaria se convierte al libro principal', () => {
    const r = routeTx(card(), 'EUR', 'DOP')
    expect(r.toSecondary).toBe(false)
    expect(r.targetCurrency).toBe('DOP')
    expect(r.typedCurrency).toBe('EUR')
  })

  it('sin cuenta elegida cae a la divisa base', () => {
    expect(routeTx(null, null, 'DOP').typedCurrency).toBe('DOP')
  })
})

/**
 * EL BUG QUE ESTO ARREGLA. Al editar, el formulario derivaba la divisa solo de
 * la cuenta: quien registró "US$ 25" veía 1,540 pesos y no podía volver a
 * dólares. Peor aún, si cambiaba el monto, `originalAmount` y `fxRate` se
 * quedaban viejos y el desglose pasaba a mentir.
 */
describe('leer un movimiento existente para editarlo', () => {
  it('devuelve lo que el usuario TECLEÓ, no lo convertido', () => {
    const entry = readTxEntry(
      tx({ amount: 1_540, originalAmount: 25, originalCurrency: 'USD', fxRate: 61.6 }),
      card(), 'DOP',
    )
    expect(entry.amount).toBe(25)
    expect(entry.currency).toBe('USD')
  })

  it('un movimiento del segundo libro ya está en su divisa', () => {
    const entry = readTxEntry(tx({ amount: 25, onSecondaryBalance: true }), card(), 'DOP')
    expect(entry.amount).toBe(25)
    expect(entry.currency).toBe('USD')
  })

  it('un movimiento normal devuelve la divisa de su cuenta', () => {
    const entry = readTxEntry(tx({ amount: 2_000 }), card(), 'DOP')
    expect(entry.amount).toBe(2_000)
    expect(entry.currency).toBe('DOP')
  })

  it('ida y vuelta sin tocar nada conserva el monto del libro', () => {
    const original = tx({ amount: 1_540, originalAmount: 25, originalCurrency: 'USD', fxRate: 61.6 })
    const read = readTxEntry(original, card(), 'DOP')
    const rebuilt = buildTxEntry(read.amount, routeTx(card(), read.currency, 'DOP'))
    // Va al segundo libro (USD es la secundaria), así que el monto queda en USD.
    expect(rebuilt.onSecondaryBalance).toBe(true)
    expect(rebuilt.amount).toBe(25)
  })
})

describe('construir los campos a guardar', () => {
  it('en la divisa de la cuenta no guarda campos FX', () => {
    const e = buildTxEntry(2_000, routeTx(card(), null, 'DOP'))
    expect(e.amount).toBe(2_000)
    expect(e.fxRate).toBeUndefined()
    expect(e.onSecondaryBalance).toBeUndefined()
  })

  it('en otra divisa convierte y congela la tasa', () => {
    const e = buildTxEntry(25, routeTx(card({ secondaryCurrency: undefined }), 'USD', 'DOP'))
    expect(e.amount).toBeCloseTo(25 * USD_TO_DOP, 2)
    expect(e.originalAmount).toBe(25)
    expect(e.fxRate).toBeGreaterThan(0)
  })

  it('al segundo libro no convierte nada', () => {
    const e = buildTxEntry(25, routeTx(card(), 'USD', 'DOP'))
    expect(e.amount).toBe(25)
    expect(e.onSecondaryBalance).toBe(true)
    expect(e.fxRate).toBeUndefined()
  })

  /**
   * Devolver las claves con `undefined` es deliberado: al editar, `updateTx`
   * hace merge con el movimiento viejo. Si se omitieran, un movimiento que
   * dejó de ser en dólares conservaría su `fxRate` antiguo.
   */
  it('devuelve SIEMPRE las claves, en undefined cuando no aplican', () => {
    const e = buildTxEntry(2_000, routeTx(card(), null, 'DOP'))
    expect(Object.keys(e).sort()).toEqual(
      ['amount', 'fxRate', 'onSecondaryBalance', 'originalAmount', 'originalCurrency'].sort(),
    )
  })

  it('cambiar un movimiento de dólares a pesos borra su rastro FX', () => {
    // El caso que dejaba el desglose mintiendo.
    const antes = tx({ amount: 1_540, originalAmount: 25, originalCurrency: 'USD', fxRate: 61.6 })
    const campos = buildTxEntry(2_000, routeTx(card(), 'DOP', 'DOP'))
    const merged = { ...antes, ...campos }
    expect(merged.amount).toBe(2_000)
    expect(merged.originalCurrency).toBeUndefined()
    expect(merged.fxRate).toBeUndefined()
  })

  it('el saneado descarta el trío incoherente que el merge pudiera dejar', () => {
    const out = sanitizeFinanceData({
      accounts: [card()],
      transactions: [{ ...tx(), originalAmount: 25, originalCurrency: 'USD', fxRate: undefined }],
      categories: [{ id: 'k1', name: 'C', type: 'expense', color: '#fff', budget: 0, icon: 'cart' }],
      goals: [], goalContributions: [], currency: 'DOP',
    }).transactions[0]
    expect(out.originalAmount).toBeUndefined()
  })
})
