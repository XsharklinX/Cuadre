import { describe, expect, it } from 'vitest'
import { MIN_AMOUNT, balanceIfAvailable, rescueCandidates } from './cardRescue'
import { creditUsed, creditUtilization } from './creditCard'
import type { Account } from '@/types'

const card = (over: Partial<Account> = {}): Account => ({
  id: 'c1', name: 'Banreservas Credito', short: 'BR', type: 'credit', color: '#fff',
  balance: 0, openingBalance: 0, last4: '7109', limit: 12_000, currency: 'DOP', ...over,
})

const cash = (): Account => ({
  id: 'x1', name: 'Efectivo', short: 'Ef', type: 'cash', color: '#fff',
  balance: 3_298, openingBalance: 3_298, last4: null,
})

describe('rescate de tarjetas mal capturadas', () => {
  /** EL CASO REAL: "Pasivos RD$ 0.00" con una tarjeta que debia casi diez mil. */
  it('detecta el disponible escrito donde va la deuda', () => {
    const [c] = rescueCandidates([card({ balance: 2_218.55 })])
    expect(c.amount).toBeCloseTo(2_218.55, 2)
    expect(c.impliedDebt).toBeCloseTo(9_781.45, 2)
  })

  it('el saldo corregido deja la tarjeta con su deuda y su utilizacion', () => {
    const [c] = rescueCandidates([card({ balance: 2_218.55 })])
    const fixed = balanceIfAvailable(c)
    expect(fixed).toBeCloseTo(-9_781.45, 2)
    expect(creditUsed(fixed)).toBeCloseTo(9_781.45, 2)
    expect(creditUtilization(card({ balance: fixed }), 'DOP')).toBeCloseTo(0.8151, 3)
  })

  it('no toca lo que ya esta bien', () => {
    expect(rescueCandidates([card({ balance: -9_781.45 })])).toEqual([])
    expect(rescueCandidates([card({ balance: 0 })])).toEqual([])
  })

  it('ignora lo que no es tarjeta de credito', () => {
    expect(rescueCandidates([cash()])).toEqual([])
  })

  /** Sin limite, "disponible" no significa nada: no hay de que deducir. */
  it('ignora tarjetas sin limite configurado', () => {
    expect(rescueCandidates([card({ balance: 2_218.55, limit: undefined })])).toEqual([])
    expect(rescueCandidates([card({ balance: 2_218.55, limit: 0 })])).toEqual([])
  })

  it('no molesta por calderilla', () => {
    expect(rescueCandidates([card({ balance: MIN_AMOUNT })])).toEqual([])
    expect(rescueCandidates([card({ balance: 12.5 })])).toEqual([])
  })

  /**
   * Un saldo mayor que el cupo no puede ser el disponible. Es otra cosa —un
   * limite mal puesto, un saldo a favor de verdad— y tocarlo seria inventar.
   */
  it('no toca un saldo que supera el limite', () => {
    expect(rescueCandidates([card({ balance: 15_000 })])).toEqual([])
  })

  it('encuentra varias a la vez', () => {
    const r = rescueCandidates([
      card({ id: 'a', balance: 2_218.55 }),
      card({ id: 'b', balance: 500, limit: 5_000 }),
      card({ id: 'c', balance: -300 }),
      cash(),
    ])
    expect(r.map(x => x.accountId)).toEqual(['a', 'b'])
  })

  it('con el disponible igual al limite, la deuda queda en cero y no en negativo', () => {
    const [c] = rescueCandidates([card({ balance: 12_000 })])
    expect(c.impliedDebt).toBe(0)
    expect(balanceIfAvailable(c)).toBe(0)
  })
})
