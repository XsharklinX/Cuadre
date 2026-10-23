import { describe, expect, it } from 'vitest'
import { chargeRows, clientStatement, receiptFor } from './clientStatement'
import type { Charge, Client } from './clients'

const HOY = '2026-10-18'
const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: 'cli1', name: 'Juan Pérez', concept: 'Netflix', amount: 250, cycle: 'monthly',
    dueDay: 5, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0, ...over,
  }
}

let n = 0
function cobro(over: Partial<Charge> = {}): Charge {
  n += 1
  return { id: `ch${n}`, clientId: 'cli1', dueDate: '2026-10-05', amount: 250, paid: 0, txIds: [], paidAt: 0, ...over }
}

describe('receiptFor · no se emite un papel que la app no puede sostener', () => {
  it('un cobro pagado con su movimiento da comprobante', () => {
    const r = receiptFor(cobro({ paid: 250, txIds: ['t1'], paidAt: ms(2026, 10, 7) }), cliente())
    expect(r).toMatchObject({ clientName: 'Juan Pérez', paid: 250, expected: 250, outstanding: 0 })
  })

  it('SIN movimiento detrás, no hay comprobante', () => {
    /*
     * Es la regla de toda la app: el `txId` es la prueba de que el dinero
     * existe. Un papel con membrete que diga «recibido» sin esa prueba es
     * justo el documento que no se puede emitir a la ligera.
     */
    expect(receiptFor(cobro({ paid: 250, txIds: [], paidAt: 1 }), cliente())).toBeNull()
  })

  it('sin nada pagado tampoco', () => {
    expect(receiptFor(cobro(), cliente())).toBeNull()
  })

  it('un cobro dado por perdido no genera comprobante', () => {
    expect(receiptFor(cobro({ waived: true, paid: 100, txIds: ['t1'] }), cliente())).toBeNull()
  })

  it('UN PAGO PARCIAL dice lo que llegó y lo que falta', () => {
    // El papel tiene que poder decir «me diste 200 de 250»: redondearlo a
    // «pagado» es lo que provoca la discusión que el comprobante evita.
    const r = receiptFor(cobro({ amount: 250, paid: 200, txIds: ['t1'], paidAt: 1 }), cliente())!
    expect(r.paid).toBe(200)
    expect(r.expected).toBe(250)
    expect(r.outstanding).toBe(50)
  })

  it('la nota del cobro manda sobre el concepto del cliente', () => {
    // «Este mes le hice además el logo» describe mejor ESE cobro que su
    // concepto de siempre.
    const r = receiptFor(cobro({ paid: 250, txIds: ['t1'], note: 'Logo + Netflix' }), cliente())!
    expect(r.concept).toBe('Logo + Netflix')
  })
})

describe('clientStatement · el año de un cliente', () => {
  const suyos = [
    cobro({ dueDate: '2026-01-05', amount: 200, paid: 200, txIds: ['t1'], paidAt: ms(2026, 1, 5) }),
    cobro({ dueDate: '2026-02-05', amount: 200, paid: 200, txIds: ['t2'], paidAt: ms(2026, 2, 15) }),
    cobro({ dueDate: '2026-03-05', amount: 250, paid: 250, txIds: ['t3'], paidAt: ms(2026, 3, 5) }),
    cobro({ dueDate: '2026-10-05', amount: 250 }),
  ]

  it('da los doce meses aunque falten', () => {
    expect(clientStatement(cliente(), suyos, 2026, HOY).rows).toHaveLength(12)
  })

  it('suma lo facturado y lo pagado del año', () => {
    const e = clientStatement(cliente(), suyos, 2026, HOY)
    expect(e.totalBilled).toBe(900)
    expect(e.totalPaid).toBe(650)
    expect(e.stillOwed).toBe(250)
  })

  it('LO FACTURADO va por vencimiento y LO PAGADO por fecha de pago', () => {
    /*
     * Un cobro de febrero pagado el 15 pertenece a febrero en las dos
     * columnas; pero si se hubiera pagado en marzo, iría a febrero en una y a
     * marzo en la otra. Mezclarlo escondería justo el retraso que un estado
     * de cuenta existe para enseñar.
     */
    const tarde = [cobro({ dueDate: '2026-02-05', amount: 200, paid: 200, txIds: ['t1'], paidAt: ms(2026, 4, 20) })]
    const e = clientStatement(cliente(), tarde, 2026, HOY)
    expect(e.rows[1]).toEqual({ mkey: '2026-02', billed: 200, paid: 0 })
    expect(e.rows[3]).toEqual({ mkey: '2026-04', billed: 0, paid: 200 })
  })

  it('cuenta cuántos cerró de cuántos se le hicieron', () => {
    const e = clientStatement(cliente(), suyos, 2026, HOY)
    expect(e.paidCount).toBe(3)
    expect(e.chargeCount).toBe(4)
  })

  it('su atraso medio del año', () => {
    // Enero y marzo a tiempo, febrero diez días tarde: 10/3 = 3,3.
    expect(clientStatement(cliente(), suyos, 2026, HOY).avgDelay).toBe(3.3)
  })

  it('sin cobros cerrados no hay atraso medio, y no es cero', () => {
    // Un cero diría «paga puntual», y lo cierto es que no se sabe.
    expect(clientStatement(cliente(), [cobro()], 2026, HOY).avgDelay).toBeNull()
  })

  it('lo dado por perdido queda fuera del estado de cuenta', () => {
    const e = clientStatement(cliente(), [cobro({ amount: 9_999, waived: true })], 2026, HOY)
    expect(e.totalBilled).toBe(0)
    expect(e.stillOwed).toBe(0)
  })

  it('otro año no se cuela', () => {
    const e = clientStatement(cliente(), [cobro({ dueDate: '2025-06-05', amount: 7_000 })], 2026, HOY)
    expect(e.totalBilled).toBe(0)
  })

  it('los cobros de OTRO cliente no entran', () => {
    const e = clientStatement(cliente(), [cobro({ clientId: 'otro', amount: 9_999 })], 2026, HOY)
    expect(e.totalBilled).toBe(0)
  })
})

describe('chargeRows · la lista para exportar', () => {
  const etiqueta = (s: string) => s

  it('una fila por cobro, con su cliente y su estado', () => {
    const filas = chargeRows(
      [cobro({ dueDate: '2026-10-05', amount: 250, paid: 250, txIds: ['t1'], paidAt: ms(2026, 10, 6) })],
      [cliente()], HOY, etiqueta as never,
    )
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      client: 'Juan Pérez', concept: 'Netflix', dueDate: '2026-10-05',
      state: 'paid', amount: 250, paid: 250, outstanding: 0, paidOn: '2026-10-06',
    })
  })

  it('van en orden de vencimiento', () => {
    const filas = chargeRows([
      cobro({ dueDate: '2026-12-05' }),
      cobro({ dueDate: '2026-01-05' }),
    ], [cliente()], HOY, etiqueta as never)
    expect(filas.map(f => f.dueDate)).toEqual(['2026-01-05', '2026-12-05'])
  })

  it('un cobro sin cliente no se exporta: no hay nombre que poner', () => {
    expect(chargeRows([cobro({ clientId: 'fantasma' })], [cliente()], HOY, etiqueta as never)).toEqual([])
  })

  it('lleva los días de atraso y la nota', () => {
    const filas = chargeRows(
      [cobro({ dueDate: '2026-10-08', note: 'Le fié al viernes' })],
      [cliente()], HOY, etiqueta as never,
    )
    expect(filas[0].daysLate).toBe(10)
    expect(filas[0].note).toBe('Le fié al viernes')
  })

  it('sin fecha de pago, la columna va vacía y no en 1970', () => {
    expect(chargeRows([cobro()], [cliente()], HOY, etiqueta as never)[0].paidOn).toBe('')
  })
})
