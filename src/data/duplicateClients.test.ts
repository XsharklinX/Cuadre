import { describe, expect, it } from 'vitest'
import {
  findDuplicates, mergePlan, nameAlreadyUsed, normalizeName, normalizePhone, suggestSurvivor,
} from './duplicateClients'
import type { Charge, Client } from './clients'

let n = 0
function cliente(over: Partial<Client> = {}): Client {
  n += 1
  return {
    id: `cli${n}`, name: 'Juan Pérez', concept: '', amount: 250, cycle: 'monthly',
    dueDay: 5, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 1_000, ...over,
  }
}

function cobro(over: Partial<Charge> = {}): Charge {
  return { id: `ch${Math.random()}`, clientId: 'cli1', dueDate: '2026-10-05', amount: 250, paid: 0, txIds: [], paidAt: 0, ...over }
}

describe('normalizeName', () => {
  it('ignora tildes, mayúsculas y espacios de más', () => {
    expect(normalizeName('Juan Pérez')).toBe('juan perez')
    expect(normalizeName('  JUAN   PEREZ ')).toBe('juan perez')
    expect(normalizeName('juan perez')).toBe('juan perez')
  })

  it('no junta nombres de verdad distintos', () => {
    expect(normalizeName('Juan Pérez')).not.toBe(normalizeName('Juana Pérez'))
  })
})

describe('normalizePhone', () => {
  it('casa el mismo número escrito de tres formas', () => {
    // El prefijo del país se escribe o no según el día.
    const esperado = normalizePhone('8095551234')
    expect(normalizePhone('809-555-1234')).toBe(esperado)
    expect(normalizePhone('+1 809 555 1234')).toBe(esperado)
    expect(normalizePhone('(809) 555-1234')).toBe(esperado)
  })

  it('un número demasiado corto no cuenta como señal', () => {
    // Si no, dos clientes con «123» apuntado serían la misma persona.
    expect(normalizePhone('123')).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone('')).toBe('')
  })
})

describe('findDuplicates', () => {
  it('encuentra el mismo nombre escrito distinto', () => {
    const grupos = findDuplicates([
      cliente({ id: 'a', name: 'Carlos Méndez' }),
      cliente({ id: 'b', name: 'carlos mendez' }),
      cliente({ id: 'c', name: 'Ana Rosario' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].reason).toBe('name')
    expect(grupos[0].clients.map(c => c.id).sort()).toEqual(['a', 'b'])
  })

  it('el TELÉFONO es la señal fuerte: dos personas no comparten número', () => {
    const grupos = findDuplicates([
      cliente({ id: 'a', name: 'Carlos', phone: '809-555-1234' }),
      cliente({ id: 'b', name: 'Carlitos', phone: '+1 809 555 1234' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].reason).toBe('phone')
  })

  it('un cliente sale en UN grupo, no en dos', () => {
    // Verlo repetido en dos avisos haría pensar que hay cuatro fichas.
    const grupos = findDuplicates([
      cliente({ id: 'a', name: 'Carlos Méndez', phone: '8095551234' }),
      cliente({ id: 'b', name: 'carlos mendez', phone: '8095551234' }),
    ])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].reason).toBe('phone')
  })

  it('sin duplicados, nada que avisar', () => {
    expect(findDuplicates([cliente({ name: 'Ana' }), cliente({ name: 'Luis' })])).toEqual([])
  })

  it('un cliente sin nombre no agrupa con otro sin nombre', () => {
    expect(findDuplicates([cliente({ name: '  ' }), cliente({ name: '' })])).toEqual([])
  })

  it('los grupos grandes primero: parten más historial', () => {
    const grupos = findDuplicates([
      cliente({ id: 'a', name: 'Ana' }), cliente({ id: 'b', name: 'Ana' }),
      cliente({ id: 'c', name: 'Luis' }), cliente({ id: 'd', name: 'Luis' }), cliente({ id: 'e', name: 'Luis' }),
    ])
    expect(grupos[0].clients).toHaveLength(3)
  })
})

describe('nameAlreadyUsed · avisar antes de crear el duplicado', () => {
  const lista = [cliente({ id: 'a', name: 'Carlos Méndez' })]

  it('encuentra al que ya existe mientras escribes', () => {
    expect(nameAlreadyUsed('carlos mendez', lista)?.id).toBe('a')
  })

  it('con menos de tres letras no molesta', () => {
    // Escribiendo «Ca» medio mundo coincide, y un aviso en cada tecla es ruido.
    expect(nameAlreadyUsed('Ca', lista)).toBeNull()
  })

  it('editando a alguien, no se avisa de sí mismo', () => {
    expect(nameAlreadyUsed('Carlos Méndez', lista, 'a')).toBeNull()
  })

  it('un nombre nuevo no avisa', () => {
    expect(nameAlreadyUsed('Ana Rosario', lista)).toBeNull()
  })
})

describe('mergePlan · cómo queda antes de unir', () => {
  const a = cliente({
    id: 'a', name: 'Carlos Méndez', serviceId: 'svc_netflix', amount: 250,
    createdAt: Date.parse('2026-01-05'), phone: '809-555-1234',
  })
  const b = cliente({
    id: 'b', name: 'Carlos Mendez', serviceId: 'svc_crunchy', amount: 150,
    createdAt: Date.parse('2026-06-10'), notes: 'Paga por Banreservas',
  })
  const cobros = [
    cobro({ clientId: 'a', paid: 250, paidAt: 1 }),
    cobro({ clientId: 'b' }),
    cobro({ clientId: 'b' }),
  ]

  it('JUNTA LOS SERVICIOS de los dos', () => {
    const p = mergePlan(a, [b], cobros)
    expect(p.services.map(s => s.serviceId).sort()).toEqual(['svc_crunchy', 'svc_netflix'])
    expect(p.totalAmount).toBe(400)
    expect(p.result.serviceShares).toHaveLength(2)
  })

  it('es cliente tuyo desde la PRIMERA vez, no desde la segunda ficha', () => {
    expect(mergePlan(b, [a], cobros).result.createdAt).toBe(Date.parse('2026-01-05'))
  })

  it('rellena el teléfono que falta en vez de perderlo', () => {
    expect(mergePlan(b, [a], cobros).result.phone).toBe('809-555-1234')
  })

  it('las notas se suman, no se pisan', () => {
    const conNota = { ...a, notes: 'Vecino' }
    expect(mergePlan(conNota, [b], cobros).result.notes).toBe('Vecino · Paga por Banreservas')
  })

  it('dice cuántos cobros cambian de dueño', () => {
    expect(mergePlan(a, [b], cobros).movedCharges).toBe(2)
  })

  it('con UN SOLO servicio la ficha se queda sencilla', () => {
    // Convertir una ficha simple en una de reparto complicaría algo que no
    // lo necesita.
    const uno = cliente({ id: 'c', name: 'Carlos', serviceId: 'svc_netflix', amount: 250 })
    const otro = cliente({ id: 'd', name: 'Carlos', serviceId: 'svc_netflix', amount: 250 })
    const p = mergePlan(uno, [otro], [])
    expect(p.result.serviceShares).toBeUndefined()
    expect(p.result.serviceId).toBe('svc_netflix')
    expect(p.totalAmount).toBe(250)
  })

  it('si uno seguía activo, el resultado lo está', () => {
    // Unir no puede apagar a un cliente que te sigue pagando.
    const pausado = cliente({ id: 'e', active: false })
    const activo = cliente({ id: 'f', active: true })
    expect(mergePlan(pausado, [activo], []).result.active).toBe(true)
  })

  it('junta los historiales de precio en orden y con tope', () => {
    const x = cliente({ id: 'x', priceLog: [{ at: 300, amount: 200 }] })
    const y = cliente({ id: 'y', priceLog: [{ at: 100, amount: 150 }, { at: 200, amount: 180 }] })
    expect(mergePlan(x, [y], []).result.priceLog?.map(p => p.at)).toEqual([100, 200, 300])
  })

  it('el precio del SUPERVIVIENTE manda si el servicio se repite', () => {
    // Es el que el usuario está mirando cuando decide.
    const caro = cliente({ id: 'c', serviceId: 'svc1', amount: 300 })
    const barato = cliente({ id: 'd', serviceId: 'svc1', amount: 100 })
    expect(mergePlan(caro, [barato], []).totalAmount).toBe(300)
  })
})

describe('suggestSurvivor', () => {
  it('propone al que más cobros cerrados tiene', () => {
    const viejo = cliente({ id: 'viejo', createdAt: 500 })
    const nuevo = cliente({ id: 'nuevo', createdAt: 900 })
    const cobros = [
      cobro({ clientId: 'nuevo', paidAt: 1 }),
      cobro({ clientId: 'nuevo', paidAt: 2 }),
      cobro({ clientId: 'viejo', paidAt: 3 }),
    ]
    expect(suggestSurvivor([viejo, nuevo], cobros).id).toBe('nuevo')
  })

  it('a igualdad, el más antiguo', () => {
    const viejo = cliente({ id: 'viejo', createdAt: 500 })
    const nuevo = cliente({ id: 'nuevo', createdAt: 900 })
    expect(suggestSurvivor([nuevo, viejo], []).id).toBe('viejo')
  })
})
