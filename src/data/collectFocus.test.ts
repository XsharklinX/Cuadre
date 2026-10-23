import { describe, expect, it } from 'vitest'
import { clientHistory, collectFocus, groupCharges, marginPct } from './collectFocus'
import type { Charge, Client } from './clients'

const HOY = '2026-10-18'
/** Mediodía LOCAL: con UTC, el mes se desplaza en América. */
const ms = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()

function cliente(id: string, name: string): Client {
  return {
    id, name, concept: 'Netflix', amount: 250, cycle: 'monthly', dueDay: 5,
    accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0,
  }
}

let n = 0
function cobro(over: Partial<Charge> = {}): Charge {
  n += 1
  return { id: `ch${n}`, clientId: 'cli1', dueDate: HOY, amount: 250, paid: 0, txIds: [], paidAt: 0, ...over }
}

const CLIENTES = [cliente('cli1', 'Carlos'), cliente('cli2', 'Ana'), cliente('cli3', 'Juan')]

describe('collectFocus · el orden de urgencia', () => {
  it('LO ATRASADO MANDA sobre todo lo demás', () => {
    const f = collectFocus([
      cobro({ clientId: 'cli1', dueDate: '2026-10-09', amount: 1_500 }),
      cobro({ clientId: 'cli2', dueDate: '2026-10-15', amount: 1_340 }),
      cobro({ clientId: 'cli3', dueDate: HOY, amount: 250 }),
    ], CLIENTES, HOY)
    expect(f.kind).toBe('late')
    expect(f.amount).toBe(2_840)
    expect(f.people).toBe(2)
    // El peor primero, para poder decir «Carlos lleva 9 días».
    expect(f.names).toEqual(['Carlos', 'Ana'])
    expect(f.worstDays).toBe(9)
  })

  it('sin atrasados, manda lo que vence hoy', () => {
    const f = collectFocus([
      cobro({ clientId: 'cli1', dueDate: HOY, amount: 250 }),
      cobro({ clientId: 'cli2', dueDate: '2026-10-25', amount: 900 }),
    ], CLIENTES, HOY)
    expect(f.kind).toBe('today')
    expect(f.amount).toBe(250)
    expect(f.worstDays).toBe(0)
  })

  it('SIN NADA URGENTE enseña lo cobrado, no un cero rojo', () => {
    // Una pantalla en calma enseñando «0 atrasado» convierte la calma en una
    // alarma apagada.
    const f = collectFocus([
      cobro({ amount: 250, paid: 250, paidAt: ms(2026, 10, 5) }),
      cobro({ amount: 1_000, paid: 1_000, paidAt: ms(2026, 10, 12) }),
      cobro({ dueDate: '2026-11-30', amount: 900 }),
    ], CLIENTES, HOY)
    expect(f.kind).toBe('calm')
    expect(f.amount).toBe(1_250)
    expect(f.people).toBe(0)
  })

  it('un cobro parcial y vencido cuenta como atrasado por lo que falta', () => {
    const f = collectFocus([
      cobro({ clientId: 'cli1', dueDate: '2026-10-05', amount: 250, paid: 100 }),
    ], CLIENTES, HOY)
    expect(f.kind).toBe('late')
    expect(f.amount).toBe(150)
  })

  it('lo dado por perdido no es un atraso', () => {
    const f = collectFocus([
      cobro({ dueDate: '2026-01-01', amount: 9_999, waived: true }),
    ], CLIENTES, HOY)
    expect(f.kind).toBe('calm')
  })

  it('dos cobros del MISMO cliente son una persona', () => {
    const f = collectFocus([
      cobro({ clientId: 'cli1', dueDate: '2026-10-05', amount: 250 }),
      cobro({ clientId: 'cli1', dueDate: '2026-09-05', amount: 250 }),
    ], CLIENTES, HOY)
    expect(f.people).toBe(1)
    expect(f.names).toEqual(['Carlos'])
  })

  it('no nombra a más de dos: tres nombres ya no se leen', () => {
    const f = collectFocus([
      cobro({ clientId: 'cli1', dueDate: '2026-10-01' }),
      cobro({ clientId: 'cli2', dueDate: '2026-10-02' }),
      cobro({ clientId: 'cli3', dueDate: '2026-10-03' }),
    ], CLIENTES, HOY)
    expect(f.names).toHaveLength(2)
    expect(f.people).toBe(3)
  })

  it('sin cobros ninguno, calma y cero', () => {
    const f = collectFocus([], CLIENTES, HOY)
    expect(f).toMatchObject({ kind: 'calm', amount: 0, people: 0, names: [] })
  })

  it('un cliente borrado no aporta un nombre vacío', () => {
    const f = collectFocus([cobro({ clientId: 'fantasma', dueDate: '2026-10-01' })], CLIENTES, HOY)
    expect(f.names).toEqual([])
    expect(f.kind).toBe('late')
  })
})

describe('groupCharges', () => {
  it('reparte en atrasados, esta semana, más adelante y hecho', () => {
    const g = groupCharges([
      cobro({ id: 'atrasado', dueDate: '2026-10-09' }),
      cobro({ id: 'semana', dueDate: '2026-10-20' }),
      cobro({ id: 'lejos', dueDate: '2026-12-05' }),
      cobro({ id: 'pagado', dueDate: '2026-09-05', paid: 250, paidAt: 1 }),
      cobro({ id: 'perdonado', dueDate: '2026-08-05', waived: true }),
    ], HOY)
    expect(g.late.map(c => c.id)).toEqual(['atrasado'])
    expect(g.week.map(c => c.id)).toEqual(['semana'])
    expect(g.later.map(c => c.id)).toEqual(['lejos'])
    // Lo cobrado y lo perdonado NO son tareas: se van al histórico.
    expect(g.done.map(c => c.id).sort()).toEqual(['pagado', 'perdonado'])
  })

  it('los atrasados por antigüedad: el que lleva más esperando, primero', () => {
    const g = groupCharges([
      cobro({ id: 'reciente', dueDate: '2026-10-15' }),
      cobro({ id: 'viejo', dueDate: '2026-08-01' }),
    ], HOY)
    expect(g.late.map(c => c.id)).toEqual(['viejo', 'reciente'])
  })

  it('el histórico con lo más reciente arriba', () => {
    const g = groupCharges([
      cobro({ id: 'ago', dueDate: '2026-08-05', paid: 250, paidAt: 1 }),
      cobro({ id: 'sep', dueDate: '2026-09-05', paid: 250, paidAt: 1 }),
    ], HOY)
    expect(g.done.map(c => c.id)).toEqual(['sep', 'ago'])
  })

  it('lo que vence hoy va con la semana, no con los atrasados', () => {
    const g = groupCharges([cobro({ id: 'hoy', dueDate: HOY })], HOY)
    expect(g.week.map(c => c.id)).toEqual(['hoy'])
    expect(g.late).toEqual([])
  })

  it('sin cobros, los cuatro grupos existen y están vacíos', () => {
    // Quien lo use itera los cuatro; un `undefined` reventaría la pantalla.
    const g = groupCharges([], HOY)
    expect(Object.keys(g).sort()).toEqual(['done', 'late', 'later', 'week'])
    for (const k of ['late', 'week', 'later', 'done'] as const) expect(g[k]).toEqual([])
  })
})

describe('clientHistory', () => {
  const suyos = [
    cobro({ clientId: 'cli1', amount: 250, paid: 250, paidAt: ms(2026, 7, 5) }),
    cobro({ clientId: 'cli1', amount: 250, paid: 250, paidAt: ms(2026, 8, 5) }),
    cobro({ clientId: 'cli1', amount: 250, paid: 250, paidAt: ms(2026, 9, 5) }),
    cobro({ clientId: 'cli1', dueDate: '2026-10-05', amount: 250 }),
    cobro({ clientId: 'cli2', amount: 9_999, paid: 9_999, paidAt: ms(2026, 9, 5) }),
  ]

  it('suma lo que te ha pagado, solo lo suyo', () => {
    const h = clientHistory('cli1', suyos, HOY)
    expect(h.totalPaid).toBe(750)
    expect(h.paidCount).toBe(3)
  })

  it('dice lo que debe ahora mismo', () => {
    expect(clientHistory('cli1', suyos, HOY).owes).toBe(250)
  })

  it('LA RACHA SE CUENTA DESDE EL MES PASADO, no desde este', () => {
    // Hoy es el 18 y paga el 5… pero si fuera el día 2, este mes todavía no
    // habría pagado y no seria un fallo suyo. Contarlo desde este mes le
    // rompería la racha a todo el mundo durante la primera quincena.
    expect(clientHistory('cli1', suyos, HOY).streak).toBe(3)
  })

  it('un mes saltado corta la racha ahí', () => {
    const conHueco = [
      cobro({ clientId: 'cli1', paid: 250, paidAt: ms(2026, 7, 5) }),
      cobro({ clientId: 'cli1', paid: 250, paidAt: ms(2026, 9, 5) }),
    ]
    expect(clientHistory('cli1', conHueco, HOY).streak).toBe(1)
  })

  it('da los doce meses para poder dibujarlos', () => {
    const h = clientHistory('cli1', suyos, HOY)
    expect(h.byMonth).toHaveLength(12)
    expect(h.byMonth[6].amount).toBe(250)
    expect(h.byMonth[0].amount).toBe(0)
  })

  it('un cliente sin historial queda a cero sin reventar', () => {
    const h = clientHistory('nadie', suyos, HOY)
    expect(h).toMatchObject({ totalPaid: 0, paidCount: 0, streak: 0, owes: 0 })
    expect(h.byMonth).toHaveLength(12)
  })
})

describe('marginPct', () => {
  it('dice si el negocio es bueno, no solo cuánto deja', () => {
    expect(marginPct(6_250, 3_850)).toBe(62)
  })

  it('una pérdida da margen negativo', () => {
    expect(marginPct(1_000, -350)).toBe(-35)
  })

  it('sin cobros no hay margen que calcular, no un cero', () => {
    // Un 0% con cero cobrado sugeriría que el negocio no deja nada, y lo que
    // pasa es que todavía no ha pasado nada.
    expect(marginPct(0, -600)).toBeNull()
  })
})
