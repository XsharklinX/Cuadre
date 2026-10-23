import { describe, expect, it } from 'vitest'
import {
  addPayment, capricesSummary, isSettled, matchAmount, progress,
  recovered, remaining, removePayment, sortCaprices, type Caprice,
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
