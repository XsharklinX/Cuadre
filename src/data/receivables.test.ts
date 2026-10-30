import { describe, expect, it } from 'vitest'
import {
  GENERATE_AHEAD_DAYS, GENERATE_BACK_DAYS,
  applyPayment, averageDelay, pendingCharges, receivablesSummary, revokePayment, sortForList,
} from './receivables'
import { chargeState, type Charge, type Client } from './clients'

const HOY = '2026-10-18'
const HOY_MS = Date.UTC(2026, 9, 18, 12)
const DIA = 86_400_000

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: 'c1', name: 'Juan', concept: 'Netflix', amount: 250,
    cycle: 'monthly', dueDay: 5, accountId: 'a1', categoryId: 'cat_stream',
    active: true, createdAt: Date.UTC(2024, 0, 1), ...over,
  }
}

let n = 0
function cobro(over: Partial<Charge> = {}): Charge {
  n += 1
  return {
    id: `ch${n}`, clientId: 'c1', dueDate: '2026-10-05', amount: 250,
    paid: 0, txIds: [], paidAt: 0, ...over,
  }
}

describe('pendingCharges', () => {
  it('genera los cobros del periodo para un cliente activo', () => {
    const nuevos = pendingCharges([cliente()], [], HOY)
    expect(nuevos.length).toBeGreaterThan(0)
    expect(nuevos.every(c => c.clientId === 'c1')).toBe(true)
    expect(nuevos.every(c => c.paid === 0 && c.txIds.length === 0)).toBe(true)
  })

  it('ES IDEMPOTENTE: llamarlo dos veces no duplica nada', () => {
    // Esto se llama cada vez que se abre la pantalla. Si no fuera idempotente,
    // abrir «Por cobrar» diez veces le inventaría diez deudas al cliente.
    const primera = pendingCharges([cliente()], [], HOY)
    const yaCreados: Charge[] = primera.map((c, i) => ({ ...c, id: `g${i}` }))
    expect(pendingCharges([cliente()], yaCreados, HOY)).toEqual([])
  })

  it('un cliente inactivo no genera cobros nuevos', () => {
    expect(pendingCharges([cliente({ active: false })], [], HOY)).toEqual([])
  })

  it('no inventa deudas anteriores a que el cliente existiera', () => {
    // Registrar hoy a alguien no puede abrirle noventa días de atrasos.
    const reciente = cliente({ createdAt: HOY_MS })
    const nuevos = pendingCharges([reciente], [], HOY)
    expect(nuevos.every(c => c.dueDate >= HOY)).toBe(true)
  })

  it('recupera los cobros que se pasaron mientras no abrías la app', () => {
    const viejo = cliente({ createdAt: Date.UTC(2026, 6, 1) })
    const nuevos = pendingCharges([viejo], [], HOY)
    const pasados = nuevos.filter(c => c.dueDate < HOY)
    expect(pasados.length).toBeGreaterThanOrEqual(2)
  })

  it('no mira más allá de la ventana, ni hacia atrás ni hacia delante', () => {
    const nuevos = pendingCharges([cliente()], [], HOY)
    const limiteAtras = Date.parse(`${HOY}T00:00:00`) - GENERATE_BACK_DAYS * DIA
    const limiteDelante = Date.parse(`${HOY}T00:00:00`) + GENERATE_AHEAD_DAYS * DIA
    for (const c of nuevos) {
      const ms = Date.parse(`${c.dueDate}T00:00:00`)
      expect(ms).toBeGreaterThanOrEqual(limiteAtras)
      expect(ms).toBeLessThanOrEqual(limiteDelante)
    }
  })

  it('dos clientes el mismo día no se pisan', () => {
    const a = cliente({ id: 'c1', dueDay: 5 })
    const b = cliente({ id: 'c2', dueDay: 5 })
    const nuevos = pendingCharges([a, b], [], HOY)
    const deA = nuevos.filter(c => c.clientId === 'c1')
    const deB = nuevos.filter(c => c.clientId === 'c2')
    expect(deA.length).toBeGreaterThan(0)
    expect(deB.length).toBe(deA.length)
  })

  it('respeta un cobro que el usuario tocó a mano', () => {
    // La plantilla dice qué ESPERAR; no reescribe lo que ya pasó.
    const aMano = cobro({ dueDate: '2026-10-05', amount: 500, paid: 500, paidAt: HOY_MS })
    const nuevos = pendingCharges([cliente()], [aMano], HOY)
    expect(nuevos.some(c => c.dueDate === '2026-10-05')).toBe(false)
  })

  it('una fecha de hoy corrupta no genera nada', () => {
    expect(pendingCharges([cliente()], [], 'hoy')).toEqual([])
  })

  it('el monto sale de la plantilla del cliente', () => {
    const nuevos = pendingCharges([cliente({ amount: 1_500 })], [], HOY)
    expect(nuevos.every(c => c.amount === 1_500)).toBe(true)
  })

  it('LAS ESTRELLAS bajan el cobro y el descuento queda guardado en él', () => {
    const nuevos = pendingCharges([cliente({ amount: 350 })], [], HOY, () => 10)
    expect(nuevos.length).toBeGreaterThan(0)
    expect(nuevos.every(c => c.amount === 315 && c.discountPct === 10)).toBe(true)
  })

  it('sin descuento, el cobro no lleva la marca', () => {
    const nuevos = pendingCharges([cliente()], [], HOY, () => 0)
    expect(nuevos.every(c => c.discountPct === undefined)).toBe(true)
  })

  it('un cliente borrado con su historial no genera cobros', () => {
    expect(pendingCharges([cliente({ deletedAt: 1 })], [], HOY)).toEqual([])
  })
})

describe('receivablesSummary', () => {
  it('separa atrasado de lo que vence esta semana', () => {
    const r = receivablesSummary([
      cobro({ dueDate: '2026-10-09', amount: 1_500 }),
      cobro({ dueDate: '2026-10-20', amount: 250 }),
      cobro({ dueDate: '2026-11-30', amount: 800 }),
    ], HOY)
    expect(r.lateAmount).toBe(1_500)
    expect(r.lateCount).toBe(1)
    expect(r.weekAmount).toBe(250)
    expect(r.weekCount).toBe(1)
    expect(r.outstandingTotal).toBe(2_550)
  })

  it('cuenta lo cobrado por la fecha en que LLEGÓ, no por la de vencimiento', () => {
    // Un cobro de septiembre que entró en octubre es dinero de octubre.
    const r = receivablesSummary([
      cobro({ dueDate: '2026-09-05', amount: 250, paid: 250, paidAt: HOY_MS }),
    ], HOY)
    expect(r.collectedThisMonth).toBe(250)
    expect(r.lateAmount).toBe(0)
  })

  it('lo cobrado en otro mes no cuenta en este', () => {
    const r = receivablesSummary([
      cobro({ amount: 250, paid: 250, paidAt: Date.UTC(2026, 7, 10) }),
    ], HOY)
    expect(r.collectedThisMonth).toBe(0)
  })

  it('un cobro parcial y vencido cuenta como atrasado por lo que falta', () => {
    const r = receivablesSummary([
      cobro({ dueDate: '2026-10-05', amount: 250, paid: 100, paidAt: 0 }),
    ], HOY)
    expect(r.lateAmount).toBe(150)
    expect(r.lateCount).toBe(1)
  })

  it('lo dado por perdido no cuenta en ningún lado', () => {
    const r = receivablesSummary([
      cobro({ dueDate: '2026-01-01', amount: 9_999, waived: true }),
    ], HOY)
    expect(r.lateAmount).toBe(0)
    expect(r.outstandingTotal).toBe(0)
  })

  it('sin cobros, todo a cero', () => {
    const r = receivablesSummary([], HOY)
    expect(r).toEqual({
      lateAmount: 0, lateCount: 0, weekAmount: 0, weekCount: 0,
      collectedThisMonth: 0, outstandingTotal: 0,
    })
  })
})

describe('sortForList', () => {
  it('los atrasados primero, y el que lleva más esperando arriba', () => {
    const lista = [
      cobro({ id: 'proximo', dueDate: '2026-10-25' }),
      cobro({ id: 'viejo', dueDate: '2026-09-05' }),
      cobro({ id: 'reciente', dueDate: '2026-10-15' }),
    ]
    expect(sortForList(lista, HOY).map(c => c.id)).toEqual(['viejo', 'reciente', 'proximo'])
  })

  it('lo pagado y lo perdonado al final: ya no hay nada que hacer', () => {
    const lista = [
      cobro({ id: 'pagado', dueDate: '2026-09-01', paid: 250, paidAt: 1 }),
      cobro({ id: 'atrasado', dueDate: '2026-10-10' }),
      cobro({ id: 'perdonado', dueDate: '2026-08-01', waived: true }),
    ]
    const r = sortForList(lista, HOY).map(c => c.id)
    expect(r[0]).toBe('atrasado')
    expect(r[r.length - 1]).toBe('perdonado')
  })

  it('no modifica la lista original', () => {
    const lista = [cobro({ dueDate: '2026-10-25' }), cobro({ dueDate: '2026-09-05' })]
    const copia = [...lista]
    sortForList(lista, HOY)
    expect(lista).toEqual(copia)
  })
})

describe('applyPayment', () => {
  it('registra el pago con el movimiento que lo respalda', () => {
    const r = applyPayment(cobro(), 250, 'tx_1', HOY_MS)
    expect(r.paid).toBe(250)
    expect(r.txIds).toEqual(['tx_1'])
    expect(r.paidAt).toBe(HOY_MS)
    expect(chargeState(r, HOY)).toBe('paid')
  })

  it('un pago parcial no lo cierra', () => {
    const r = applyPayment(cobro(), 100, 'tx_1', HOY_MS)
    expect(r.paid).toBe(100)
    expect(r.paidAt).toBe(0)
    expect(chargeState(r, HOY)).toBe('partial')
  })

  it('dos pagos parciales lo cierran', () => {
    let r = applyPayment(cobro(), 100, 'tx_1', HOY_MS)
    r = applyPayment(r, 150, 'tx_2', HOY_MS + DIA)
    expect(r.paid).toBe(250)
    expect(r.txIds).toEqual(['tx_1', 'tx_2'])
    expect(chargeState(r, HOY)).toBe('paid')
  })

  it('SIN movimiento no se puede marcar pagado', () => {
    // Si se pudiera, «cobrado» sería una opinión y las dos mitades dejarían
    // de cuadrar.
    const c = cobro()
    expect(applyPayment(c, 250, '', HOY_MS)).toBe(c)
  })

  it('un monto no positivo no hace nada', () => {
    const c = cobro()
    expect(applyPayment(c, 0, 'tx_1', HOY_MS)).toBe(c)
    expect(applyPayment(c, -50, 'tx_1', HOY_MS)).toBe(c)
  })
})

describe('revokePayment', () => {
  it('deshace un pago y quita su movimiento', () => {
    const pagado = applyPayment(cobro(), 250, 'tx_1', HOY_MS)
    const r = revokePayment(pagado, 'tx_1', 250)
    expect(r.paid).toBe(0)
    expect(r.txIds).toEqual([])
    expect(r.paidAt).toBe(0)
  })

  it('deshacer uno de dos deja el cobro parcial', () => {
    let c = applyPayment(cobro(), 100, 'tx_1', HOY_MS)
    c = applyPayment(c, 150, 'tx_2', HOY_MS)
    const r = revokePayment(c, 'tx_2', 150)
    expect(r.paid).toBe(100)
    expect(r.paidAt).toBe(0)
  })

  it('un movimiento que no estaba no cambia nada', () => {
    const c = applyPayment(cobro(), 250, 'tx_1', HOY_MS)
    expect(revokePayment(c, 'tx_ajeno', 250)).toBe(c)
  })
})

describe('averageDelay', () => {
  it('la media de días que tarda en pagar', () => {
    const cobros = [
      cobro({ dueDate: '2026-08-05', paid: 250, paidAt: Date.parse('2026-08-11T00:00:00') }),
      cobro({ dueDate: '2026-09-05', paid: 250, paidAt: Date.parse('2026-09-09T00:00:00') }),
    ]
    expect(averageDelay(cobros)).toBe(5)
  })

  it('pagar antes de tiempo no da media negativa', () => {
    const cobros = [cobro({ dueDate: '2026-08-05', paid: 250, paidAt: Date.parse('2026-08-01T00:00:00') })]
    expect(averageDelay(cobros)).toBe(0)
  })

  it('sin cobros cerrados no hay media que dar', () => {
    expect(averageDelay([])).toBeNull()
    expect(averageDelay([cobro()])).toBeNull()
  })

  it('lo perdonado no cuenta para la puntualidad', () => {
    expect(averageDelay([cobro({ paid: 250, paidAt: 1, waived: true })])).toBeNull()
  })
})

describe('averageDelay · pagar a tu hora no es llegar tarde', () => {
  const vencido = (dueDate: string, paidAt: number): Charge => ({
    id: `c${paidAt}`, clientId: 'cli1', dueDate, amount: 250,
    paid: 250, txIds: ['t1'], paidAt,
  })
  const alMediodia = (d: string) => Date.parse(`${d}T12:00:00`)

  it('pagar el MISMO día, a cualquier hora, es cero días', () => {
    // Redondeando daba 0,5 → 1, y la ficha decía «paga 1 día tarde» a un
    // cliente puntual. Como `paidAt` es la hora en que se marcó el cobro, le
    // pasaba a casi todos.
    expect(averageDelay([vencido('2026-07-15', alMediodia('2026-07-15'))])).toBe(0)
    expect(averageDelay([vencido('2026-07-15', Date.parse('2026-07-15T23:59:00'))])).toBe(0)
  })

  it('el primer día de atraso empieza al día siguiente', () => {
    expect(averageDelay([vencido('2026-07-15', alMediodia('2026-07-16'))])).toBe(1)
    expect(averageDelay([vencido('2026-07-15', alMediodia('2026-07-25'))])).toBe(10)
  })

  it('pagar antes de la fecha no da un atraso negativo', () => {
    expect(averageDelay([vencido('2026-07-15', alMediodia('2026-07-10'))])).toBe(0)
  })

  it('es la media de los suyos, con un decimal', () => {
    expect(averageDelay([
      vencido('2026-07-15', alMediodia('2026-07-16')),
      vencido('2026-06-15', alMediodia('2026-06-18')),
    ])).toBe(2)
  })

  it('sin cobros pagados no hay media que dar, y no es cero', () => {
    // Un cero diría «paga puntual», y lo cierto es que no se sabe.
    expect(averageDelay([])).toBeNull()
  })
})
