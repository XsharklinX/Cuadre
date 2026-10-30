import { describe, expect, it } from 'vitest'
import {
  CYCLE_ORDER, amortizedShare, coveredMonths, cycleMonths, perMonth, perYear, prepaySaving, prepaySavingPct,
  type Billing, type BillingCycle,
} from './billing'

describe('perMonth', () => {
  it('EL CASO QUE OBLIGA A QUE ESTO EXISTA: una suscripción anual', () => {
    // RD$ 6,000 al año son 500 al mes. Tratarlo como mensual daría un mes de
    // −6,000 y once de ganancia pura: la ganancia mensual sería mentira doce
    // veces al año.
    expect(perMonth({ amount: 6_000, cycle: 'annual' })).toBe(500)
  })

  it('lo mensual se queda igual', () => {
    expect(perMonth({ amount: 600, cycle: 'monthly' })).toBe(600)
  })

  it('trimestral, semestral y bimestral', () => {
    expect(perMonth({ amount: 1_800, cycle: 'quarterly' })).toBe(600)
    expect(perMonth({ amount: 3_600, cycle: 'semiannual' })).toBe(600)
    expect(perMonth({ amount: 1_200, cycle: 'bimonthly' })).toBe(600)
  })

  it('semanal y quincenal usan el mes medio, no cuatro semanas', () => {
    // Un mes tiene 4.348 semanas de media, no 4: con 4 se perdería casi un mes
    // de coste al año.
    expect(perMonth({ amount: 100, cycle: 'weekly' })).toBeCloseTo(434.82, 1)
    expect(perMonth({ amount: 100, cycle: 'biweekly' })).toBeCloseTo(217.41, 1)
  })

  it('un pago único no es un coste recurrente', () => {
    // Repartirlo entre infinitos meses no significa nada; se ve en la vista de
    // caja, donde sí está.
    expect(perMonth({ amount: 5_000, cycle: 'once' })).toBe(0)
  })

  it('cada N meses, para lo que no encaja en la lista', () => {
    expect(perMonth({ amount: 400, cycle: 'custom', customMonths: 4 })).toBe(100)
  })

  it('un ciclo personalizado sin N no inventa nada', () => {
    expect(perMonth({ amount: 400, cycle: 'custom' })).toBe(0)
    expect(perMonth({ amount: 400, cycle: 'custom', customMonths: 0 })).toBe(0)
  })

  it('un monto que no es número da cero, no NaN', () => {
    expect(perMonth({ amount: Number.NaN, cycle: 'annual' })).toBe(0)
    expect(perMonth({ amount: Number.POSITIVE_INFINITY, cycle: 'annual' })).toBe(0)
  })

  it('un monto negativo se respeta: hay ajustes que restan', () => {
    expect(perMonth({ amount: -1_200, cycle: 'annual' })).toBe(-100)
  })
})

describe('perYear', () => {
  it('lo mensual por doce', () => {
    expect(perYear({ amount: 600, cycle: 'monthly' })).toBe(7_200)
  })
  it('lo anual se queda en su monto', () => {
    expect(perYear({ amount: 6_000, cycle: 'annual' })).toBe(6_000)
  })
})

describe('prepaySaving', () => {
  it('dice lo que te ahorras pagando el año de golpe', () => {
    // 600 al mes serían 7,200. Pagando 6,000 el año te ahorras 1,200.
    expect(prepaySaving({ amount: 6_000, cycle: 'annual' }, 600)).toBe(1_200)
  })

  it('si no sale más barato, no hay ahorro que presumir', () => {
    expect(prepaySaving({ amount: 7_200, cycle: 'annual' }, 600)).toBe(0)
    expect(prepaySaving({ amount: 8_400, cycle: 'annual' }, 600)).toBe(-1_200)
  })

  it('sin precio mensual con el que comparar, no se inventa', () => {
    expect(prepaySaving({ amount: 6_000, cycle: 'annual' }, 0)).toBe(0)
  })

  it('un pago único no se compara: no tiene equivalente mensual', () => {
    expect(prepaySaving({ amount: 6_000, cycle: 'once' }, 600)).toBe(0)
  })
})

describe('coveredMonths', () => {
  it('un pago anual de marzo cubre marzo y los once siguientes', () => {
    const r = coveredMonths('2026-03-15', 'annual')
    expect(r).toHaveLength(12)
    expect(r[0]).toBe('2026-03')
    expect(r[11]).toBe('2027-02')
  })

  it('cruza el cambio de año sin saltarse meses', () => {
    const r = coveredMonths('2026-11-01', 'quarterly')
    expect(r).toEqual(['2026-11', '2026-12', '2027-01'])
  })

  it('lo mensual cubre su mes y nada más', () => {
    expect(coveredMonths('2026-10-05', 'monthly')).toEqual(['2026-10'])
  })

  it('lo semanal cubre su mes: repartirlo entre fracciones de mes no ayuda', () => {
    expect(coveredMonths('2026-10-05', 'weekly')).toEqual(['2026-10'])
  })

  it('un pago único cubre su mes', () => {
    expect(coveredMonths('2026-10-05', 'once')).toEqual(['2026-10'])
  })

  it('una fecha corrupta no revienta', () => {
    expect(coveredMonths('ayer', 'annual')).toEqual([])
    expect(coveredMonths('', 'annual')).toEqual([])
  })
})

describe('amortizedShare', () => {
  it('reparte el pago anual entre sus doce meses', () => {
    expect(amortizedShare(6_000, 'annual')).toBe(500)
  })

  it('lo que cubre un mes o menos no se reparte', () => {
    expect(amortizedShare(600, 'monthly')).toBe(600)
    expect(amortizedShare(150, 'weekly')).toBe(150)
    expect(amortizedShare(5_000, 'once')).toBe(5_000)
  })

  it('las partes suman el total, sin perder centavos por redondeo', () => {
    const total = 6_000
    const parte = amortizedShare(total, 'annual')
    expect(parte * 12).toBe(total)
  })
})

describe('cycleMonths', () => {
  it('todos los ciclos de la lista tienen respuesta', () => {
    // Si alguien añade un ciclo y olvida su caso, esto lo caza: un `undefined`
    // se propagaría hasta dar NaN en una ganancia.
    for (const cycle of CYCLE_ORDER) {
      const r = cycleMonths(cycle, 3)
      expect(r === null || Number.isFinite(r), `ciclo sin resolver: ${cycle}`).toBe(true)
    }
  })

  it('un ciclo desconocido no devuelve basura', () => {
    expect(cycleMonths('inventado' as BillingCycle)).toBeUndefined()
  })
})

describe('el orden en que se ofrecen', () => {
  it('lo mensual primero, que es lo más común', () => {
    expect(CYCLE_ORDER[0]).toBe('monthly')
  })

  it('no falta ni se repite ningún ciclo', () => {
    const esperados: BillingCycle[] = [
      'weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly',
      'semiannual', 'annual', 'once', 'none', 'custom',
    ]
    expect([...CYCLE_ORDER].sort()).toEqual([...esperados].sort())
  })
})

describe('un cobro de cliente también puede ser anual', () => {
  it('quien cobra el año por adelantado rinde su parte cada mes', () => {
    // Generalidad: no todo el mundo cobra al mes. Un cliente que paga 3,000 al
    // año aporta 250 al mes, y el margen tiene que usar eso.
    const cliente: Billing = { amount: 3_000, cycle: 'annual' }
    expect(perMonth(cliente)).toBe(250)
  })
})

describe('prepaySavingPct · como lo anuncian los servicios', () => {
  it('EL CASO REAL: Crunchyroll a 7.99 al mes o 79.99 al año', () => {
    // 79.99/12 = 6.67 al mes. Frente a 7.99, eso es un 16.6% de ahorro, que es
    // justo el numero que el servicio pone en su pagina.
    const pct = prepaySavingPct({ amount: 79.99, cycle: 'annual' }, 7.99)
    expect(pct).toBeCloseTo(16.6, 0)
  })

  it('el clasico 2 meses gratis es un 16.7%', () => {
    // Pagar 10 meses y recibir 12.
    expect(prepaySavingPct({ amount: 1_000, cycle: 'annual' }, 100)).toBeCloseTo(16.7, 0)
  })

  it('si el anual NO sale mas barato, el ahorro es cero o negativo', () => {
    // Hay servicios asi, y conviene saberlo antes de pagar un año por delante.
    expect(prepaySavingPct({ amount: 1_200, cycle: 'annual' }, 100)).toBe(0)
    expect(prepaySavingPct({ amount: 1_440, cycle: 'annual' }, 100)).toBeLessThan(0)
  })

  it('sin precio mensual con el que comparar, no se inventa', () => {
    expect(prepaySavingPct({ amount: 1_000, cycle: 'annual' }, 0)).toBe(0)
  })

  it('un pago unico no tiene equivalente mensual que comparar', () => {
    expect(prepaySavingPct({ amount: 1_000, cycle: 'once' }, 100)).toBe(0)
  })

  it('el monto y el porcentaje cuentan la misma historia', () => {
    const plan = { amount: 1_000, cycle: 'annual' as const }
    const monto = prepaySaving(plan, 100)
    const pct = prepaySavingPct(plan, 100)
    // 200 de ahorro sobre 1,200 que costaria al mes = 16.7%.
    expect(monto).toBe(200)
    expect(pct).toBeCloseTo((200 / 1_200) * 100, 0)
  })
})

describe('prepaySaving · pagando al mes no se adelanta nada', () => {
  it('un ciclo MENSUAL no tiene ahorro por adelantado', () => {
    /*
     * Es la mitad del «ahorras US$3,420.12» que salía en la pantalla de un
     * Netflix de 14.99 al mes. Pagando mes a mes no hay nada que adelantar,
     * así que la cifra no existía.
     */
    expect(prepaySaving({ amount: 14.99, cycle: 'monthly' }, 300)).toBe(0)
  })

  it('ni semanal ni quincenal', () => {
    expect(prepaySaving({ amount: 100, cycle: 'weekly' }, 500)).toBe(0)
    expect(prepaySaving({ amount: 200, cycle: 'biweekly' }, 500)).toBe(0)
  })

  it('el ahorro ANUAL sigue saliendo', () => {
    // 100 al mes son 1,200 al año; pagando 1,000 por adelantado, 200 menos.
    expect(prepaySaving({ amount: 1_000, cycle: 'annual' }, 100)).toBe(200)
  })

  it('y el trimestral también', () => {
    // 100 al mes son 1,200 al año; 270 cada trimestre son 1,080.
    expect(prepaySaving({ amount: 270, cycle: 'quarterly' }, 100)).toBe(120)
  })
})
