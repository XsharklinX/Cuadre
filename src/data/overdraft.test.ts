import { describe, expect, it } from 'vitest'
import { checkOverdraft } from './overdraft'
import type { Account } from '@/types'

const cash = (over: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance: 500, openingBalance: 500, last4: null, ...over,
})

const card = (): Account => ({
  id: 'c1', name: 'Visa', short: 'Visa', type: 'credit', color: '#fff',
  balance: -2_000, openingBalance: 0, last4: '7109', limit: 30_000,
})

describe('gastar mas de lo que hay', () => {
  it('lo que cabe no molesta a nadie', () => {
    expect(checkOverdraft(cash(), 200, 'warn').verdict).toBe('ok')
  })

  /** Gastar lo ultimo que queda es valido: cero no es pasarse. */
  it('dejar la cuenta exactamente en cero esta permitido', () => {
    const r = checkOverdraft(cash(), 500, 'block')
    expect(r.verdict).toBe('ok')
    expect(r.resultingBalance).toBe(0)
  })

  it('avisa y deja seguir', () => {
    const r = checkOverdraft(cash(), 800, 'warn')
    expect(r.verdict).toBe('warn')
    expect(r.resultingBalance).toBe(-300)
  })

  it('bloquea', () => {
    expect(checkOverdraft(cash(), 800, 'block').verdict).toBe('block')
  })

  it('permitir no dice nada', () => {
    expect(checkOverdraft(cash(), 800, 'allow').verdict).toBe('ok')
  })

  /** La politica de la cuenta manda sobre la general. */
  it('una cuenta puede llevar la contraria al ajuste global', () => {
    expect(checkOverdraft(cash({ overdraftPolicy: 'allow' }), 800, 'block').verdict).toBe('ok')
    expect(checkOverdraft(cash({ overdraftPolicy: 'block' }), 800, 'allow').verdict).toBe('block')
  })

  /*
   * Una TARJETA en negativo no es un descuido: es para lo que sirve. Avisar de
   * que se pone en rojo al comprar seria avisar de que el sol sale por el
   * este. Su tope es el cupo, y de eso se ocupa el libro.
   */
  it('nunca avisa por una tarjeta de credito', () => {
    expect(checkOverdraft(card(), 5_000, 'block').verdict).toBe('ok')
  })

  it('sin cuenta o sin monto no opina', () => {
    expect(checkOverdraft(undefined, 100, 'block').verdict).toBe('ok')
    expect(checkOverdraft(cash(), 0, 'block').verdict).toBe('ok')
    expect(checkOverdraft(cash(), NaN, 'block').verdict).toBe('ok')
  })
})
