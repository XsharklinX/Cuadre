import { describe, expect, it } from 'vitest'
import {
  addPayment, capricesByCategory, capricesSummary, challengeDaysLeft, challengeDone,
  isSettled, matchAmount, monthsAtCurrentPace, pace, progress,
  recovered, recoveredInYear, remaining, removePayment, sortCaprices, type Caprice,
} from './caprices'

const AHORA = Date.UTC(2026, 9, 18, 12)

function bote(over: Partial<Caprice> = {}): Caprice {
  return {
    id: 'cap1', txId: 'tx_audifonos', amount: 3_200, note: 'Audífonos',
    createdAt: AHORA, payments: [], ...over,
  }
}

describe('recovered y remaining', () => {
  it('un bote nuevo no tiene nada recuperado', () => {
    const b = bote()
    expect(recovered(b)).toBe(0)
    expect(remaining(b)).toBe(3_200)
    expect(isSettled(b)).toBe(false)
  })

  it('suma los aportes', () => {
    let b = addPayment(bote(), 1_000, 'tx_1', AHORA)
    b = addPayment(b, 500, 'tx_2', AHORA)
    expect(recovered(b)).toBe(1_500)
    expect(remaining(b)).toBe(1_700)
  })

  it('saldado del todo queda a cero y se marca', () => {
    const b = addPayment(bote(), 3_200, 'tx_1', AHORA)
    expect(remaining(b)).toBe(0)
    expect(isSettled(b)).toBe(true)
  })

  it('aportar de más no deja pendiente negativo', () => {
    const b = addPayment(bote(), 5_000, 'tx_1', AHORA)
    expect(remaining(b)).toBe(0)
  })
})

describe('addPayment', () => {
  it('SIN movimiento no se recupera nada', () => {
    // Un aporte sin movimiento detrás haría que «recuperado» fuera una
    // opinión, y esto dejaría de ser una cuenta para ser un videojuego.
    const b = bote()
    expect(addPayment(b, 1_000, '', AHORA)).toBe(b)
  })

  it('un monto no positivo no hace nada', () => {
    const b = bote()
    expect(addPayment(b, 0, 'tx_1', AHORA)).toBe(b)
    expect(addPayment(b, -500, 'tx_1', AHORA)).toBe(b)
  })

  it('el MISMO movimiento no se puede asignar dos veces', () => {
    // Asignar un ingreso y volver a asignarlo saldaría el bote con dinero que
    // solo entró una vez.
    const b = addPayment(bote(), 1_000, 'tx_1', AHORA)
    const otra = addPayment(b, 1_000, 'tx_1', AHORA)
    expect(otra).toBe(b)
    expect(recovered(otra)).toBe(1_000)
  })

  it('guarda el movimiento que lo respalda', () => {
    const b = addPayment(bote(), 1_140, 'tx_ahorro', AHORA)
    expect(b.payments).toEqual([{ txId: 'tx_ahorro', amount: 1_140, at: AHORA }])
  })
})

describe('removePayment', () => {
  it('quita el aporte si se borró el movimiento', () => {
    const b = addPayment(bote(), 1_000, 'tx_1', AHORA)
    const r = removePayment(b, 'tx_1')
    expect(recovered(r)).toBe(0)
  })

  it('un movimiento que no estaba no cambia nada', () => {
    const b = addPayment(bote(), 1_000, 'tx_1', AHORA)
    expect(removePayment(b, 'tx_ajeno')).toBe(b)
  })

  it('deshacer puede reabrir un bote ya saldado', () => {
    const b = addPayment(bote(), 3_200, 'tx_1', AHORA)
    expect(isSettled(b)).toBe(true)
    expect(isSettled(removePayment(b, 'tx_1'))).toBe(false)
  })
})

describe('progress', () => {
  it('va de cero a uno', () => {
    expect(progress(bote())).toBe(0)
    expect(progress(addPayment(bote(), 1_600, 'tx_1', AHORA))).toBe(0.5)
    expect(progress(addPayment(bote(), 3_200, 'tx_1', AHORA))).toBe(1)
  })

  it('no se pasa de uno aunque aportes de más', () => {
    expect(progress(addPayment(bote(), 9_999, 'tx_1', AHORA))).toBe(1)
  })

  it('un bote de monto cero está completo, no dividido por cero', () => {
    expect(progress(bote({ amount: 0 }))).toBe(1)
  })
})

describe('capricesSummary', () => {
  it('cuenta solo lo que queda por recuperar de los botes ABIERTOS', () => {
    const r = capricesSummary([
      bote({ id: 'a', amount: 3_200, payments: [{ txId: 't1', amount: 1_140, at: AHORA }] }),
      bote({ id: 'b', amount: 890 }),
    ])
    expect(r.outstanding).toBe(2_950)
    expect(r.recovered).toBe(1_140)
    expect(r.openCount).toBe(2)
    expect(r.total).toBe(4_090)
  })

  it('un bote saldado deja de contar', () => {
    const r = capricesSummary([bote({ amount: 500, payments: [{ txId: 't1', amount: 500, at: AHORA }] })])
    expect(r.outstanding).toBe(0)
    expect(r.openCount).toBe(0)
  })

  it('un bote cerrado a mano deja de contar: cerrarlo no es un fracaso', () => {
    const r = capricesSummary([bote({ amount: 3_200, closed: true })])
    expect(r.openCount).toBe(0)
    expect(r.outstanding).toBe(0)
  })

  it('sin botes, todo a cero', () => {
    expect(capricesSummary([])).toEqual({ outstanding: 0, recovered: 0, openCount: 0, total: 0 })
  })
})

describe('matchAmount', () => {
  it('igualar es el mismo monto', () => {
    expect(matchAmount(3_200)).toBe(3_200)
  })

  it('la mitad, para cuando el doble es irreal', () => {
    expect(matchAmount(3_200, 50)).toBe(1_600)
  })

  it('un porcentaje imposible se recorta', () => {
    expect(matchAmount(1_000, 500)).toBe(1_000)
    expect(matchAmount(1_000, -20)).toBe(0)
  })

  it('sin monto no hay nada que igualar', () => {
    expect(matchAmount(0)).toBe(0)
    expect(matchAmount(-100)).toBe(0)
  })
})

describe('sortCaprices', () => {
  it('lo que más falta primero, y lo cerrado al final', () => {
    const lista = [
      bote({ id: 'poco', amount: 500 }),
      bote({ id: 'cerrado', amount: 9_999, closed: true }),
      bote({ id: 'mucho', amount: 3_200 }),
    ]
    expect(sortCaprices(lista).map(c => c.id)).toEqual(['mucho', 'poco', 'cerrado'])
  })

  it('no modifica la lista original', () => {
    const lista = [bote({ id: 'a', amount: 100 }), bote({ id: 'b', amount: 900 })]
    const copia = [...lista]
    sortCaprices(lista)
    expect(lista).toEqual(copia)
  })
})

/**
 * EL RITMO Y LOS RETOS.
 *
 * «Te faltan 2,400» no dice qué hacer. «Si abonas 600 al mes lo cierras en
 * cuatro» sí, y es lo que convierte una barra de progreso en algo accionable.
 */
describe('pace · cuánto abonar al mes', () => {
  const base = (over: Partial<Caprice> = {}): Caprice => ({
    id: 'c1', txId: 't1', amount: 3_000, note: 'Audífonos',
    createdAt: Date.parse('2026-10-01T12:00:00'), payments: [], ...over,
  })

  it('reparte lo que falta entre los meses que quedan', () => {
    const c = base({ amount: 2_400, targetDate: '2027-02-18' })
    expect(pace(c, '2026-10-18')).toEqual({ perMonth: 600, months: 4 })
  })

  it('descuenta lo ya abonado', () => {
    const c = base({
      amount: 3_000, targetDate: '2027-02-18',
      payments: [{ txId: 't2', amount: 600, at: 1 }],
    })
    expect(pace(c, '2026-10-18')).toEqual({ perMonth: 600, months: 4 })
  })

  it('SIN FECHA no hay ritmo que calcular', () => {
    expect(pace(base(), '2026-10-18')).toBeNull()
  })

  it('con el bote saldado tampoco', () => {
    const c = base({ amount: 1_000, targetDate: '2027-02-18', payments: [{ txId: 't2', amount: 1_000, at: 1 }] })
    expect(pace(c, '2026-10-18')).toBeNull()
  })

  it('con la fecha ya pasada, la app no regaña', () => {
    // Un plazo vencido no es una meta: es una deuda consigo mismo, y no es
    // trabajo de la app recordarla con un número.
    expect(pace(base({ targetDate: '2026-01-01' }), '2026-10-18')).toBeNull()
  })

  it('nunca propone menos de un mes', () => {
    // Con diez días por delante, «0,3 meses» no se lee.
    const r = pace(base({ amount: 900, targetDate: '2026-10-28' }), '2026-10-18')
    expect(r!.months).toBe(1)
    expect(r!.perMonth).toBe(900)
  })

  it('un capricho cerrado no tiene ritmo', () => {
    expect(pace(base({ targetDate: '2027-02-18', closed: true }), '2026-10-18')).toBeNull()
  })

  it('una fecha ilegible no revienta', () => {
    expect(pace(base({ targetDate: 'mañana' }), '2026-10-18')).toBeNull()
  })
})

describe('monthsAtCurrentPace · al ritmo que llevas', () => {
  const DIA = 86_400_000
  const AHORA = Date.parse('2026-10-22T12:00:00')

  it('proyecta con lo que has abonado de media', () => {
    const c: Caprice = {
      id: 'c1', txId: 't1', amount: 3_000, note: 'x',
      createdAt: AHORA - 60 * DIA,
      payments: [{ txId: 'p1', amount: 500, at: 1 }, { txId: 'p2', amount: 500, at: 2 }],
    }
    // 1,000 en dos meses = 500/mes; faltan 2,000 → 4 meses.
    expect(monthsAtCurrentPace(c, AHORA)).toBe(4)
  })

  it('SIN APORTES no hay ritmo del que partir', () => {
    // Suponer uno sería inventarse justo el dato que se pregunta.
    const c: Caprice = { id: 'c1', txId: 't1', amount: 3_000, note: 'x', createdAt: AHORA - 60 * DIA, payments: [] }
    expect(monthsAtCurrentPace(c, AHORA)).toBeNull()
  })

  it('saldado no proyecta nada', () => {
    const c: Caprice = {
      id: 'c1', txId: 't1', amount: 1_000, note: 'x', createdAt: AHORA - 30 * DIA,
      payments: [{ txId: 'p1', amount: 1_000, at: 1 }],
    }
    expect(monthsAtCurrentPace(c, AHORA)).toBeNull()
  })
})

describe('los retos', () => {
  const AHORA = Date.parse('2026-10-22T12:00:00')
  const conReto = (endsAt: number): Caprice => ({
    id: 'c1', txId: 't1', amount: 3_000, note: 'x', createdAt: 0, payments: [],
    challenge: { what: 'comida a domicilio', amount: 1_200, endsAt },
  })

  it('termina cuando llega su día', () => {
    expect(challengeDone(conReto(AHORA - 1), AHORA)).toBe(true)
    expect(challengeDone(conReto(AHORA + 86_400_000), AHORA)).toBe(false)
  })

  it('sin reto, nada que terminar', () => {
    const c: Caprice = { id: 'c1', txId: 't1', amount: 1, note: 'x', createdAt: 0, payments: [] }
    expect(challengeDone(c, AHORA)).toBe(false)
    expect(challengeDaysLeft(c, AHORA)).toBe(0)
  })

  it('cuenta los días que faltan, sin bajar de cero', () => {
    expect(challengeDaysLeft(conReto(AHORA + 3 * 86_400_000), AHORA)).toBe(3)
    expect(challengeDaysLeft(conReto(AHORA - 9 * 86_400_000), AHORA)).toBe(0)
  })
})

describe('el año y las categorías', () => {
  it('lo recuperado va por fecha del APORTE, no del capricho', () => {
    // Un capricho de diciembre que se termina de pagar en marzo recuperó ese
    // dinero en marzo.
    const c: Caprice = {
      id: 'c1', txId: 't1', amount: 3_000, note: 'x',
      createdAt: Date.parse('2025-12-01T12:00:00'),
      payments: [
        { txId: 'p1', amount: 500, at: Date.parse('2025-12-20T12:00:00') },
        { txId: 'p2', amount: 900, at: Date.parse('2026-03-10T12:00:00') },
      ],
    }
    expect(recoveredInYear([c], 2026)).toBe(900)
    expect(recoveredInYear([c], 2025)).toBe(500)
  })

  it('agrupa por la categoría del gasto que lo abrió', () => {
    const caprichos: Caprice[] = [
      { id: 'a', txId: 't1', amount: 3_500, note: 'x', createdAt: 0, payments: [] },
      { id: 'b', txId: 't2', amount: 1_200, note: 'y', createdAt: 0, payments: [] },
      { id: 'c', txId: 't3', amount: 800, note: 'z', createdAt: 0, payments: [] },
    ]
    const cat = (txId: string) => ({ t1: 'tec', t2: 'comida', t3: 'comida' } as Record<string, string>)[txId]
    expect(capricesByCategory(caprichos, cat)).toEqual([
      { categoryId: 'tec', amount: 3_500, count: 1 },
      { categoryId: 'comida', amount: 2_000, count: 2 },
    ])
  })

  it('un capricho cuyo gasto perdió la categoría no inventa un grupo', () => {
    const caprichos: Caprice[] = [{ id: 'a', txId: 't1', amount: 500, note: 'x', createdAt: 0, payments: [] }]
    expect(capricesByCategory(caprichos, () => undefined)).toEqual([])
  })
})
