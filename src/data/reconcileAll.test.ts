import { describe, expect, it } from 'vitest'
import { pendingFixes, reconcilePlan } from './reconcileAll'
import { adjustmentsInMonth, driftCauses } from './driftCauses'
import type { Account, Transaction } from '@/types'

function cuenta(over: Partial<Account> = {}): Account {
  return {
    id: 'a1', name: 'Popular', short: 'Pop', type: 'debit', color: '#3b82f6',
    balance: 12_480, openingBalance: 12_480, last4: null, ...over,
  } as Account
}

describe('reconcilePlan', () => {
  it('sin nada escrito, nada baila y nada está revisado', () => {
    const p = reconcilePlan([cuenta()], {}, 'DOP')
    expect(p.toFix).toBe(0)
    expect(p.reviewed).toBe(0)
    expect(p.entries[0].diff).toBeNull()
  })

  it('calcula la diferencia de lo escrito', () => {
    const p = reconcilePlan([cuenta()], { a1: 12_100 }, 'DOP')
    expect(p.entries[0].diff).toBe(-380)
    expect(p.entries[0].needsFix).toBe(true)
    expect(p.toFix).toBe(1)
    expect(p.reviewed).toBe(1)
  })

  it('una cuenta que cuadra se marca revisada pero no necesita ajuste', () => {
    const p = reconcilePlan([cuenta()], { a1: 12_480 }, 'DOP')
    expect(p.toFix).toBe(0)
    expect(p.reviewed).toBe(1)
    expect(p.entries[0].needsFix).toBe(false)
  })

  it('un céntimo de redondeo no es un descuadre', () => {
    expect(reconcilePlan([cuenta()], { a1: 12_480.004 }, 'DOP').toFix).toBe(0)
  })

  it('suma el descuadre de varias cuentas', () => {
    const p = reconcilePlan(
      [cuenta(), cuenta({ id: 'a2', name: 'Efectivo', balance: 3_200 })],
      { a1: 12_100, a2: 3_000 },
      'DOP',
    )
    expect(p.toFix).toBe(2)
    expect(p.totalDiff).toBe(-580)
  })

  it('un descuadre que se compensa con otro da total cero, pero dos por arreglar', () => {
    const p = reconcilePlan(
      [cuenta(), cuenta({ id: 'a2', balance: 3_200 })],
      { a1: 12_880, a2: 2_800 },
      'DOP',
    )
    expect(p.totalDiff).toBe(0)
    expect(p.toFix).toBe(2)
  })

  describe('divisas', () => {
    it('una cuenta en dólares NO se suma al total en pesos', () => {
      // Sumarla daría una cifra que no significa nada.
      const p = reconcilePlan(
        [cuenta(), cuenta({ id: 'usd', name: 'Ahorro USD', currency: 'USD', balance: 500 })],
        { a1: 12_100, usd: 480 },
        'DOP',
      )
      expect(p.totalDiff).toBe(-380)
      expect(p.toFix).toBe(2)
      expect(p.otherCurrencies).toBe(1)
    })

    it('si la de otra divisa cuadra, no se cuenta como excluida', () => {
      const p = reconcilePlan(
        [cuenta({ id: 'usd', currency: 'USD', balance: 500 })],
        { usd: 500 },
        'DOP',
      )
      expect(p.otherCurrencies).toBe(0)
    })
  })

  it('ignora lo que no es un número', () => {
    const p = reconcilePlan([cuenta()], { a1: Number.NaN }, 'DOP')
    expect(p.entries[0].diff).toBeNull()
    expect(p.reviewed).toBe(0)
  })
})

describe('pendingFixes', () => {
  it('devuelve solo las cuentas que de verdad cambian', () => {
    const p = reconcilePlan(
      [cuenta(), cuenta({ id: 'a2', balance: 3_200 }), cuenta({ id: 'a3', balance: 100 })],
      { a1: 12_100, a2: 3_200 },
      'DOP',
    )
    // a2 cuadra (no hay nada que ajustar) y a3 no se revisó.
    expect(pendingFixes(p)).toEqual([{ accountId: 'a1', balance: 12_100 }])
  })

  it('con todo cuadrado no hay nada que aplicar', () => {
    expect(pendingFixes(reconcilePlan([cuenta()], { a1: 12_480 }, 'DOP'))).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────

let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'expense', amount: 380, date: '2026-10-12',
    note: 'Uber', categoryId: 'c1', accountId: 'a1', ...over,
  } as Transaction
}

const HOY = '2026-10-18'

describe('driftCauses', () => {
  it('sin diferencia no hay nada que explicar', () => {
    expect(driftCauses({ diff: 0, accountTx: [tx()], today: HOY })).toEqual([])
  })

  it('caza el duplicado: uno detectado y uno a mano, mismo día y monto', () => {
    const aMano = tx({ amount: 380, date: '2026-10-12' })
    const detectado = tx({ amount: 380, date: '2026-10-12', detectedFrom: 'notification' })
    const causas = driftCauses({ diff: -380, accountTx: [aMano, detectado], today: HOY })
    expect(causas[0].kind).toBe('duplicate')
    expect(causas[0].txIds).toHaveLength(2)
    expect(causas[0].txIds).toContain(detectado.id)
  })

  it('dos compras iguales el mismo día, las dos a mano, NO son un duplicado', () => {
    // Dos cafés el mismo día pasa de verdad; acusar de duplicado sería peor
    // que callarse.
    const a = tx({ amount: 380 })
    const b = tx({ amount: 380 })
    const causas = driftCauses({ diff: -380, accountTx: [a, b], today: HOY })
    expect(causas.map(c => c.kind)).not.toContain('duplicate')
  })

  it('un duplicado de otro monto no explica ESTA diferencia', () => {
    const a = tx({ amount: 900 })
    const b = tx({ amount: 900, detectedFrom: 'notification' })
    const causas = driftCauses({ diff: -380, accountTx: [a, b], today: HOY })
    expect(causas.map(c => c.kind)).not.toContain('duplicate')
  })

  it('caza los cargos del banco cuando cuadran con la diferencia', () => {
    const conCargo = tx({
      amount: 1_000,
      fees: [{ kind: 'itbis-transfer', pct: 0.0015, amount: 1.5 }],
    })
    const causas = driftCauses({ diff: -1.5, accountTx: [conCargo], today: HOY })
    expect(causas[0].kind).toBe('fees')
    expect(causas[0].txIds).toEqual([conCargo.id])
  })

  it('caza el movimiento detectado con el monto mal', () => {
    const detectado = tx({ amount: 540, detectedFrom: 'notification' })
    const causas = driftCauses({ diff: -540, accountTx: [detectado], today: HOY })
    expect(causas[0].kind).toBe('detected-wrong')
  })

  it('cuando falta dinero y no hay pista, lo dice sin señalar a nadie', () => {
    const causas = driftCauses({ diff: -97.33, accountTx: [tx({ amount: 25 })], today: HOY })
    expect(causas[0].kind).toBe('unlogged-cash')
    expect(causas[0].txIds).toEqual([])
  })

  it('cuando SOBRA dinero y no hay pista, se calla', () => {
    // «Gastaste efectivo sin anotar» no explica que haya más de lo esperado, y
    // una app que siempre tiene una teoría enseña a desconfiar de ellas.
    expect(driftCauses({ diff: 500, accountTx: [tx({ amount: 25 })], today: HOY })).toEqual([])
  })

  it('no mira más allá de la ventana: una pista vieja no es accionable', () => {
    const viejo = tx({ amount: 380, date: '2026-01-05' })
    const viejoDetectado = tx({ amount: 380, date: '2026-01-05', detectedFrom: 'notification' })
    const causas = driftCauses({ diff: -380, accountTx: [viejo, viejoDetectado], today: HOY })
    expect(causas.map(c => c.kind)).not.toContain('duplicate')
  })

  it('las fechas futuras no cuentan como pista', () => {
    const futuro = tx({ amount: 380, date: '2026-12-01' })
    const futuroDet = tx({ amount: 380, date: '2026-12-01', detectedFrom: 'notification' })
    expect(driftCauses({ diff: -380, accountTx: [futuro, futuroDet], today: HOY }).map(c => c.kind))
      .not.toContain('duplicate')
  })

  it('una fecha corrupta no revienta el diagnóstico', () => {
    expect(() => driftCauses({ diff: -380, accountTx: [tx({ date: 'ayer' })], today: HOY })).not.toThrow()
  })

  it('las transferencias no se acusan de duplicado', () => {
    const t1 = tx({ type: 'transfer', amount: 380, fromAccount: 'a1', toAccount: 'a2', categoryId: undefined })
    const t2 = tx({ type: 'transfer', amount: 380, fromAccount: 'a1', toAccount: 'a2', categoryId: undefined, detectedFrom: 'notification' })
    expect(driftCauses({ diff: -380, accountTx: [t1, t2], today: HOY }).map(c => c.kind))
      .not.toContain('duplicate')
  })
})

describe('adjustmentsInMonth', () => {
  it('cuenta los cuadres del mes y lo que suman', () => {
    const ajustes = [
      tx({ type: 'expense', amount: 380, date: '2026-10-03' }),
      tx({ type: 'expense', amount: 1_000, date: '2026-10-15' }),
      tx({ type: 'income', amount: 140, date: '2026-10-20' }),
      tx({ type: 'expense', amount: 500, date: '2026-09-11' }),
    ]
    const r = adjustmentsInMonth(ajustes, '2026-10')
    expect(r.count).toBe(3)
    expect(r.net).toBe(-1_240)
  })

  it('un mes sin cuadres no dice nada', () => {
    expect(adjustmentsInMonth([], '2026-10')).toEqual({ count: 0, net: 0 })
  })
})
