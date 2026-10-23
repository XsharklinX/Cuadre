import { describe, expect, it } from 'vitest'
import {
  chargeState, clientPerMonth, clientPerMonthForService, clientServiceAmount, clientServices,
  clientTotalAmount, daysLate, dueDatesBetween, dueWithin, isOnService, lastPriceChange,
  nextDueDate, outstanding,
  type Charge, type Client,
} from './clients'

const HOY = '2026-10-18'

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: 'c1', name: 'Juan Pérez', concept: 'Netflix', amount: 250,
    cycle: 'monthly', dueDay: 5, accountId: 'a1', categoryId: 'cat_stream',
    active: true, createdAt: Date.UTC(2025, 0, 1), ...over,
  }
}

function cobro(over: Partial<Charge> = {}): Charge {
  return {
    id: 'ch1', clientId: 'c1', dueDate: '2026-10-05', amount: 250,
    paid: 0, txIds: [], paidAt: 0, ...over,
  }
}

describe('dueDatesBetween · mensual', () => {
  it('da una fecha por mes en el día que toca', () => {
    expect(dueDatesBetween(cliente(), '2026-10-01', '2026-12-31'))
      .toEqual(['2026-10-05', '2026-11-05', '2026-12-05'])
  })

  it('EL 31 DE FEBRERO NO EXISTE: se recorta al último día', () => {
    // Sin recortar, `new Date(2026, 1, 31)` se desborda a marzo y el cobro de
    // febrero saldría con fecha de marzo: un cliente que nunca se atrasa.
    const r = dueDatesBetween(cliente({ dueDay: 31 }), '2026-01-01', '2026-04-30')
    expect(r).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('en un febrero bisiesto el 31 se recorta al 29', () => {
    expect(dueDatesBetween(cliente({ dueDay: 31 }), '2024-02-01', '2024-02-29'))
      .toEqual(['2024-02-29'])
  })

  it('respeta los extremos del rango', () => {
    expect(dueDatesBetween(cliente(), '2026-10-06', '2026-11-04')).toEqual([])
    expect(dueDatesBetween(cliente(), '2026-10-05', '2026-10-05')).toEqual(['2026-10-05'])
  })

  it('cruza el cambio de año', () => {
    expect(dueDatesBetween(cliente(), '2026-12-01', '2027-01-31'))
      .toEqual(['2026-12-05', '2027-01-05'])
  })

  it('un día fuera de rango se mete en rango', () => {
    expect(dueDatesBetween(cliente({ dueDay: 0 }), '2026-10-01', '2026-10-31')).toEqual(['2026-10-01'])
    expect(dueDatesBetween(cliente({ dueDay: 99 }), '2026-10-01', '2026-10-31')).toEqual(['2026-10-31'])
  })
})

describe('dueDatesBetween · semanal', () => {
  it('da el mismo día de la semana cada siete días', () => {
    // 2026-10-19 es lunes.
    const r = dueDatesBetween(cliente({ cycle: 'weekly', dueDay: 1 }), '2026-10-18', '2026-11-10')
    expect(r).toEqual(['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
  })

  it('un día de semana fuera de rango se normaliza', () => {
    const r = dueDatesBetween(cliente({ cycle: 'weekly', dueDay: 8 }), '2026-10-18', '2026-10-25')
    // 8 % 7 = 1 (lunes)
    expect(r).toEqual(['2026-10-19'])
  })
})

describe('dueDatesBetween · quincenal', () => {
  it('cuenta de catorce en catorce desde el ancla', () => {
    const c = cliente({ cycle: 'biweekly', startDate: '2026-10-02' })
    expect(dueDatesBetween(c, '2026-10-01', '2026-11-15'))
      .toEqual(['2026-10-02', '2026-10-16', '2026-10-30', '2026-11-13'])
  })

  it('con un ancla muy vieja no se cuelga y cae en la quincena correcta', () => {
    const c = cliente({ cycle: 'biweekly', startDate: '2020-01-03' })
    const r = dueDatesBetween(c, '2026-10-01', '2026-10-31')
    expect(r.length).toBeGreaterThan(0)
    // Todas las fechas tienen que estar a múltiplos de 14 días del ancla.
    for (const f of r) {
      const dias = (Date.parse(`${f}T00:00:00`) - Date.parse('2020-01-03T00:00:00')) / 86_400_000
      expect(dias % 14).toBe(0)
    }
  })

  it('sin ancla no se adivina: generaría cobros que nadie reconoce', () => {
    expect(dueDatesBetween(cliente({ cycle: 'biweekly' }), '2026-10-01', '2026-12-31')).toEqual([])
  })
})

describe('dueDatesBetween · una sola vez', () => {
  it('devuelve su fecha si cae en el rango', () => {
    const c = cliente({ cycle: 'once', startDate: '2026-10-22' })
    expect(dueDatesBetween(c, '2026-10-01', '2026-10-31')).toEqual(['2026-10-22'])
    expect(dueDatesBetween(c, '2026-11-01', '2026-11-30')).toEqual([])
  })

  it('sin fecha no hay cobro', () => {
    expect(dueDatesBetween(cliente({ cycle: 'once' }), '2026-01-01', '2026-12-31')).toEqual([])
  })
})

describe('dueDatesBetween · entradas imposibles', () => {
  it('un rango invertido no devuelve nada', () => {
    expect(dueDatesBetween(cliente(), '2026-12-31', '2026-01-01')).toEqual([])
  })
  it('una fecha corrupta no revienta', () => {
    expect(dueDatesBetween(cliente(), 'ayer', '2026-12-31')).toEqual([])
    expect(dueDatesBetween(cliente(), '2026-01-01', 'mañana')).toEqual([])
  })
})

describe('nextDueDate', () => {
  it('el próximo pago desde hoy, hoy incluido', () => {
    expect(nextDueDate(cliente({ dueDay: 20 }), HOY)).toBe('2026-10-20')
    expect(nextDueDate(cliente({ dueDay: 18 }), HOY)).toBe('2026-10-18')
  })

  it('si el día de este mes ya pasó, va al mes siguiente', () => {
    expect(nextDueDate(cliente({ dueDay: 5 }), HOY)).toBe('2026-11-05')
  })

  it('un cobro único ya pasado no tiene próximo', () => {
    expect(nextDueDate(cliente({ cycle: 'once', startDate: '2026-01-01' }), HOY)).toBeNull()
  })
})

describe('outstanding y chargeState', () => {
  it('sin pagar nada, falta todo', () => {
    expect(outstanding(cobro())).toBe(250)
  })

  it('pagado del todo no deja nada pendiente', () => {
    expect(outstanding(cobro({ paid: 250 }))).toBe(0)
    expect(chargeState(cobro({ paid: 250, paidAt: 1 }), HOY)).toBe('paid')
  })

  it('pagar de más no da pendiente negativo', () => {
    expect(outstanding(cobro({ paid: 300 }))).toBe(0)
  })

  it('pagó de menos: parcial, y queda lo que falta', () => {
    const c = cobro({ paid: 100 })
    expect(outstanding(c)).toBe(150)
    expect(chargeState(c, HOY)).toBe('partial')
  })

  it('vencido y sin pagar es atrasado', () => {
    expect(chargeState(cobro({ dueDate: '2026-10-05' }), HOY)).toBe('late')
  })

  it('vence hoy tiene su propio estado', () => {
    expect(chargeState(cobro({ dueDate: HOY }), HOY)).toBe('today')
  })

  it('vence más adelante es próximo', () => {
    expect(chargeState(cobro({ dueDate: '2026-10-25' }), HOY)).toBe('upcoming')
  })

  it('dado por perdido no es ni atrasado ni cobrado', () => {
    expect(chargeState(cobro({ dueDate: '2026-01-01', waived: true }), HOY)).toBe('waived')
  })

  it('unos centavos de diferencia cuentan como pagado', () => {
    expect(chargeState(cobro({ paid: 249.999, paidAt: 1 }), HOY)).toBe('paid')
  })
})

describe('daysLate', () => {
  it('cuenta los días completos de atraso', () => {
    expect(daysLate(cobro({ dueDate: '2026-10-09' }), HOY)).toBe(9)
  })

  it('lo que no ha vencido no está atrasado', () => {
    expect(daysLate(cobro({ dueDate: '2026-10-25' }), HOY)).toBe(0)
    expect(daysLate(cobro({ dueDate: HOY }), HOY)).toBe(0)
  })

  it('una fecha corrupta da cero, no NaN', () => {
    expect(daysLate(cobro({ dueDate: 'xx' }), HOY)).toBe(0)
  })
})

describe('dueWithin', () => {
  it('cae dentro de los próximos siete días', () => {
    expect(dueWithin(cobro({ dueDate: '2026-10-20' }), HOY, 7)).toBe(true)
    expect(dueWithin(cobro({ dueDate: HOY }), HOY, 7)).toBe(true)
    expect(dueWithin(cobro({ dueDate: '2026-10-25' }), HOY, 7)).toBe(true)
  })

  it('más allá, o ya pasado, no', () => {
    expect(dueWithin(cobro({ dueDate: '2026-10-26' }), HOY, 7)).toBe(false)
    expect(dueWithin(cobro({ dueDate: '2026-10-01' }), HOY, 7)).toBe(false)
  })
})

describe('dueDatesBetween · ciclos de varios meses', () => {
  it('UN cliente anual tiene UN cobro al año, no doce', () => {
    // Generarle doce le inventaria once deudas que no tiene.
    const c = cliente({ cycle: 'annual', dueDay: 15, startDate: '2026-03-15' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31')).toEqual(['2026-03-15'])
  })

  it('el cobro anual vuelve al ano siguiente, el mismo mes', () => {
    const c = cliente({ cycle: 'annual', dueDay: 15, startDate: '2026-03-15' })
    expect(dueDatesBetween(c, '2026-01-01', '2028-12-31'))
      .toEqual(['2026-03-15', '2027-03-15', '2028-03-15'])
  })

  it('trimestral cae cada tres meses desde el ancla', () => {
    const c = cliente({ cycle: 'quarterly', dueDay: 10, startDate: '2026-02-10' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31'))
      .toEqual(['2026-02-10', '2026-05-10', '2026-08-10', '2026-11-10'])
  })

  it('semestral, dos veces al ano', () => {
    const c = cliente({ cycle: 'semiannual', dueDay: 1, startDate: '2026-01-01' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31')).toEqual(['2026-01-01', '2026-07-01'])
  })

  it('cada N meses, para lo que no encaja en la lista', () => {
    const c = cliente({ cycle: 'custom', customMonths: 4, dueDay: 20, startDate: '2026-01-20' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31'))
      .toEqual(['2026-01-20', '2026-05-20', '2026-09-20'])
  })

  it('sin ancla usa el mes en que se creo el cliente', () => {
    // Mediodia LOCAL, no UTC: `createdAt` es un instante y su mes se lee en la
    // zona del usuario, igual que `localToday()` en el resto de la app. Con
    // `Date.UTC(2026, 5, 1)` esto cae el 31 de mayo a las 20:00 en RD, y el
    // mes seria mayo — un desfase de un mes entero para media America.
    const c = cliente({ cycle: 'annual', dueDay: 8, createdAt: new Date(2026, 5, 1, 12).getTime() })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31')).toEqual(['2026-06-08'])
  })

  it('un ancla muy vieja no se cuelga ni desfasa la cuenta', () => {
    const c = cliente({ cycle: 'annual', dueDay: 15, startDate: '2005-03-15' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31')).toEqual(['2026-03-15'])
  })

  it('un ciclo personalizado sin N no genera nada', () => {
    const c = cliente({ cycle: 'custom', dueDay: 5, startDate: '2026-01-05' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31')).toEqual([])
  })

  it('tambien recorta el dia: un anual del 31 en febrero', () => {
    const c = cliente({ cycle: 'annual', dueDay: 31, startDate: '2026-02-28' })
    expect(dueDatesBetween(c, '2026-01-01', '2026-12-31')).toEqual(['2026-02-28'])
  })
})

describe('clientPerMonth', () => {
  it('normaliza al mes cualquiera que sea el ciclo', () => {
    expect(clientPerMonth(cliente({ amount: 250, cycle: 'monthly' }))).toBe(250)
    expect(clientPerMonth(cliente({ amount: 3_000, cycle: 'annual' }))).toBe(250)
    expect(clientPerMonth(cliente({ amount: 750, cycle: 'quarterly' }))).toBe(250)
  })

  it('un cobro unico no rinde al mes', () => {
    expect(clientPerMonth(cliente({ amount: 5_000, cycle: 'once' }))).toBe(0)
  })
})

/**
 * VARIOS SERVICIOS POR CLIENTE, Y EL PRECIO DE ANTES.
 *
 * Un cliente puede comprarte Netflix Y Disney. Antes había que inventarse un
 * segundo cliente con el mismo nombre, y su historial quedaba partido en dos
 * personas que no existen.
 */
describe('clientServices · las dos formas conviven', () => {
  const base: Client = {
    id: 'cli1', name: 'Juan', concept: '', amount: 250, cycle: 'monthly',
    dueDay: 5, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0,
  }

  it('con un solo serviceId, su amount entero es de ese servicio', () => {
    // Es como están todos los clientes de siempre; no se migra nada.
    expect(clientServices({ ...base, serviceId: 'svc1' }))
      .toEqual([{ serviceId: 'svc1', amount: 250 }])
  })

  it('con varios, manda el reparto y cada uno dice lo suyo', () => {
    const c = { ...base, serviceId: 'svc1', serviceShares: [
      { serviceId: 'svc1', amount: 250 }, { serviceId: 'svc2', amount: 150 },
    ] }
    expect(clientServices(c)).toHaveLength(2)
    expect(clientServiceAmount(c, 'svc2')).toBe(150)
  })

  it('sin servicio ninguno, lista vacía', () => {
    expect(clientServices(base)).toEqual([])
    expect(isOnService(base, 'svc1')).toBe(false)
  })

  it('un reparto a cero no cuenta como servicio', () => {
    // Si contara, el servicio tendría un cliente que no le paga nada y su
    // punto de equilibrio saldría mal.
    const c = { ...base, serviceShares: [{ serviceId: 'svc1', amount: 0 }], serviceId: 'svc2' }
    expect(clientServices(c)).toEqual([{ serviceId: 'svc2', amount: 250 }])
  })

  it('está en los DOS servicios, no en uno', () => {
    const c = { ...base, serviceShares: [
      { serviceId: 'svc1', amount: 250 }, { serviceId: 'svc2', amount: 150 },
    ] }
    expect(isOnService(c, 'svc1')).toBe(true)
    expect(isOnService(c, 'svc2')).toBe(true)
    expect(isOnService(c, 'svc3')).toBe(false)
  })
})

describe('clientTotalAmount · lo que se le cobra de verdad', () => {
  const base: Client = {
    id: 'cli1', name: 'Juan', concept: '', amount: 250, cycle: 'monthly',
    dueDay: 5, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0,
  }

  it('sin reparto, es su amount', () => {
    expect(clientTotalAmount(base)).toBe(250)
  })

  it('CON REPARTO, es la suma — no el amount', () => {
    // Cobrar por `amount` con varios servicios sería cobrarle de menos todos
    // los meses sin que nadie lo note.
    const c = { ...base, amount: 250, serviceShares: [
      { serviceId: 'svc1', amount: 250 }, { serviceId: 'svc2', amount: 150 },
    ] }
    expect(clientTotalAmount(c)).toBe(400)
  })
})

describe('clientPerMonthForService', () => {
  const anual: Client = {
    id: 'cli1', name: 'Juan', concept: '', amount: 0, cycle: 'annual',
    dueDay: 5, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0,
    serviceShares: [{ serviceId: 'svc1', amount: 3_000 }, { serviceId: 'svc2', amount: 1_200 }],
  }

  it('normaliza al mes SOLO la parte de ese servicio', () => {
    // Sin esto, quien te compra dos servicios sumaría su pago entero a los
    // dos y cada servicio parecería el doble de bueno.
    expect(clientPerMonthForService(anual, 'svc1')).toBe(250)
    expect(clientPerMonthForService(anual, 'svc2')).toBe(100)
  })

  it('un servicio que no consume rinde cero', () => {
    expect(clientPerMonthForService(anual, 'svc9')).toBe(0)
  })
})

describe('lastPriceChange · el precio de antes', () => {
  const base: Client = {
    id: 'cli1', name: 'Juan', concept: '', amount: 250, cycle: 'monthly',
    dueDay: 5, accountId: 'a1', categoryId: 'c1', active: true, createdAt: 0,
  }

  it('sin historial no hay nada que decir', () => {
    expect(lastPriceChange(base)).toBeNull()
  })

  it('da el último precio DISTINTO del actual', () => {
    const c = { ...base, amount: 250, priceLog: [
      { at: 1_000, amount: 150 }, { at: 2_000, amount: 200 },
    ] }
    expect(lastPriceChange(c)).toEqual({ at: 2_000, amount: 200 })
  })

  it('ignora las entradas iguales al precio de ahora', () => {
    // Volver al precio de antes no es un cambio que enseñar: decir «antes le
    // cobrabas 250» cuando le cobras 250 no informa de nada.
    const c = { ...base, amount: 250, priceLog: [
      { at: 1_000, amount: 200 }, { at: 2_000, amount: 250 },
    ] }
    expect(lastPriceChange(c)).toEqual({ at: 1_000, amount: 200 })
  })

  it('si todo el historial es el precio de ahora, no hay cambio', () => {
    const c = { ...base, amount: 250, priceLog: [{ at: 1_000, amount: 250 }] }
    expect(lastPriceChange(c)).toBeNull()
  })
})
