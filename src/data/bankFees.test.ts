import { describe, expect, it } from 'vitest'
import {
  BANK_PROFILES, ITBIS_TRANSFER_PCT, applyRule, computeFees,
  findBankProfile, guessBankProfile, ruleFor, totalFees,
} from './bankFees'
import { sanitizeFinanceData } from '@/store/finance'
import type { Account, Transaction } from '@/types'

describe('catálogo de bancos', () => {
  it('cubre los bancos que el parser de avisos ya reconoce', () => {
    for (const id of ['banreservas', 'popular', 'bhd', 'scotiabank']) {
      expect(findBankProfile(id), id).not.toBeNull()
    }
  })

  it('todos aplican el 0.15% de la Ley 288-04', () => {
    // Es un impuesto nacional, no la tarifa de un banco: si alguno no lo
    // lleva, es un error de captura del perfil.
    for (const profile of BANK_PROFILES) {
      expect(ruleFor(profile, 'itbis-transfer')?.pct, profile.name).toBe(ITBIS_TRANSFER_PCT)
    }
  })

  it('ninguna tasa es absurda', () => {
    for (const profile of BANK_PROFILES) {
      for (const rule of profile.rules) {
        expect(rule.pct, `${profile.name}/${rule.kind}`).toBeGreaterThan(0)
        expect(rule.pct, `${profile.name}/${rule.kind}`).toBeLessThanOrEqual(10)
      }
    }
  })
})

describe('identificar el banco por el nombre de la cuenta', () => {
  it('reconoce el banco', () => {
    expect(guessBankProfile('Visa Banreservas')?.id).toBe('banreservas')
    expect(guessBankProfile('Popular Gold')?.id).toBe('popular')
  })

  it('ignora mayúsculas y acentos del hint', () => {
    expect(guessBankProfile('BANRESERVAS clásica')?.id).toBe('banreservas')
    expect(guessBankProfile('Tarjeta Promérica')?.id).toBe('promerica')
  })

  it('el hint más largo gana', () => {
    // "banco caribe" tiene que ganarle a "caribe", y "bhd leon" a "bhd".
    expect(guessBankProfile('Banco Caribe Visa')?.id).toBe('banco-caribe')
    expect(guessBankProfile('BHD Leon Mastercard')?.id).toBe('bhd')
  })

  it('no adivina cuando no hay coincidencia clara', () => {
    // Sugerir el banco equivocado haría que el usuario acepte cargos ajenos.
    expect(guessBankProfile('Mi tarjeta')).toBeNull()
    expect(guessBankProfile('')).toBeNull()
  })
})

describe('aplicar una regla', () => {
  it('calcula el porcentaje', () => {
    expect(applyRule({ kind: 'fx-surcharge', pct: 3 }, 1_000)).toBe(30)
  })

  it('el 0.15% sobre montos pequeños no se pierde en el redondeo', () => {
    // El caso que motivó todo esto: "aunque sean 4 pesos".
    expect(applyRule({ kind: 'itbis-transfer', pct: 0.15 }, 4)).toBe(0.01)
  })

  it('respeta el piso', () => {
    expect(applyRule({ kind: 'cash-advance', pct: 5, min: 150 }, 1_000)).toBe(150)
  })

  it('un cargo nunca supera al monto que lo genera', () => {
    // Un piso de RD$150 sobre un avance de RD$100 no es algo que el banco
    // cobre así; toparlo es más honesto que mostrar un número imposible.
    expect(applyRule({ kind: 'cash-advance', pct: 5, min: 150 }, 100)).toBe(100)
  })

  it('un monto de cero o negativo no genera cargo', () => {
    expect(applyRule({ kind: 'fx-surcharge', pct: 3 }, 0)).toBe(0)
    expect(applyRule({ kind: 'fx-surcharge', pct: 3 }, -50)).toBe(0)
  })

  it('redondea a centavos', () => {
    const fee = applyRule({ kind: 'fx-surcharge', pct: 3 }, 333.33)
    expect(fee).toBe(Math.round(fee * 100) / 100)
  })
})

describe('cargos de un movimiento', () => {
  const banreservas = findBankProfile('banreservas')

  it('el recargo por divisa solo aplica si de verdad cambió la moneda', () => {
    const misma = computeFees(1_000, { profile: banreservas, typedCurrency: 'DOP', accountCurrency: 'DOP' })
    expect(misma).toEqual([])

    const distinta = computeFees(1_000, { profile: banreservas, typedCurrency: 'USD', accountCurrency: 'DOP' })
    expect(distinta.map(l => l.kind)).toEqual(['fx-surcharge'])
  })

  it('el ITBIS solo aplica si el usuario marcó transferencia', () => {
    const sin = computeFees(1_000, { profile: banreservas, typedCurrency: 'DOP', accountCurrency: 'DOP' })
    expect(sin.some(l => l.kind === 'itbis-transfer')).toBe(false)

    const con = computeFees(1_000, { profile: banreservas, typedCurrency: 'DOP', accountCurrency: 'DOP', isTransfer: true })
    expect(con.some(l => l.kind === 'itbis-transfer')).toBe(true)
  })

  it('acumula varios cargos en un mismo movimiento', () => {
    const lines = computeFees(1_000, {
      profile: banreservas, typedCurrency: 'USD', accountCurrency: 'DOP',
      isTransfer: true, isCashAdvance: true,
    })
    expect(lines).toHaveLength(3)
    expect(totalFees(lines)).toBeCloseTo(30 + 1.5 + 150, 2)
  })

  it('sin banco conocido no se inventa ningún cargo', () => {
    expect(computeFees(1_000, { profile: null, typedCurrency: 'USD', accountCurrency: 'DOP' })).toEqual([])
  })

  it('cada línea conserva su tasa para poder mostrarla', () => {
    // Un total agregado es lo que hace que un cargo bancario se sienta
    // arbitrario: la tasa tiene que viajar con el monto.
    const [line] = computeFees(1_000, { profile: banreservas, typedCurrency: 'USD', accountCurrency: 'DOP' })
    expect(line.pct).toBe(3)
    expect(line.amount).toBe(30)
  })
})

describe('saneado de los cargos guardados', () => {
  const account: Account = {
    id: 'c1', name: 'Visa Banreservas', short: 'V', type: 'credit',
    color: '#fff', balance: 0, last4: '1', limit: 50_000,
  }
  const base: Transaction = {
    id: 't1', type: 'expense', amount: 1_030, date: '2026-09-19',
    note: 'Compra', accountId: 'c1', categoryId: 'k1',
  }
  const load = (fees: unknown) => sanitizeFinanceData({
    accounts: [account],
    transactions: [{ ...base, fees }],
    categories: [{ id: 'k1', name: 'Compras', type: 'expense', color: '#fff', budget: 0, icon: 'cart' }],
    goals: [], goalContributions: [], currency: 'DOP',
  }).transactions[0]

  it('conserva un desglose válido', () => {
    expect(load([{ kind: 'fx-surcharge', pct: 3, amount: 30 }])?.fees).toHaveLength(1)
  })

  it('descarta un desglose que suma más que el movimiento', () => {
    // El desglose va DENTRO del monto; si suma más, uno de los dos miente.
    expect(load([{ kind: 'fx-surcharge', pct: 3, amount: 5_000 }])?.fees).toBeUndefined()
  })

  it('descarta líneas con tipo desconocido', () => {
    expect(load([{ kind: 'inventado', pct: 3, amount: 30 }])?.fees).toBeUndefined()
  })

  it('descarta montos no positivos', () => {
    expect(load([{ kind: 'fx-surcharge', pct: 3, amount: 0 }])?.fees).toBeUndefined()
    expect(load([{ kind: 'fx-surcharge', pct: 3, amount: -30 }])?.fees).toBeUndefined()
  })

  it('nunca borra el movimiento por un desglose malo', () => {
    // El cargo es metadato: si está corrupto se va el desglose, no la compra.
    const out = load([{ kind: 'basura', pct: 0, amount: 1 }])
    expect(out.amount).toBe(1_030)
  })
})
