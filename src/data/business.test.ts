import { describe, expect, it } from 'vitest'
import {
  accountOccupancy, businessMonth, businessRunRate, businessYear, clientRanking, priceSpread, runRateSeries,
  serviceCostPerMonth, serviceMargin, setAsideAmount,
  type Business, type Service,
} from './business'
import type { Client } from './clients'
import type { Transaction } from '@/types'

const NEGOCIO: Business = {
  id: 'b1', name: 'Streaming', color: '#35d0a2', icon: 'play',
  incomeCategoryIds: ['cat_stream'],
  expenseCategoryIds: ['cat_subs'],
  createdAt: 0,
}

let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'income', amount: 250, date: '2026-10-05',
    note: 'Pago', categoryId: 'cat_stream', accountId: 'a1', ...over,
  } as Transaction
}

function cliente(over: Partial<Client> = {}): Client {
  return {
    id: `c${Math.random()}`, name: 'X', concept: 'Netflix', amount: 250,
    cycle: 'monthly', dueDay: 5, accountId: 'a1', categoryId: 'cat_stream',
    active: true, createdAt: 0, ...over,
  }
}

describe('businessMonth', () => {
  it('cobrado menos costes es la ganancia', () => {
    const r = businessMonth(NEGOCIO, [
      tx({ amount: 250 }), tx({ amount: 250 }), tx({ amount: 250 }), tx({ amount: 250 }),
      tx({ type: 'expense', amount: 600, categoryId: 'cat_subs' }),
    ], '2026-10')
    expect(r.collected).toBe(1_000)
    expect(r.costs).toBe(600)
    expect(r.profit).toBe(400)
    expect(r.incomeCount).toBe(4)
  })

  it('una ganancia negativa se dice tal cual', () => {
    const r = businessMonth(NEGOCIO, [
      tx({ amount: 250 }),
      tx({ type: 'expense', amount: 600, categoryId: 'cat_subs' }),
    ], '2026-10')
    expect(r.profit).toBe(-350)
  })

  it('no cuenta categorías ajenas al negocio', () => {
    const r = businessMonth(NEGOCIO, [
      tx({ amount: 42_000, categoryId: 'cat_salario' }),
      tx({ type: 'expense', amount: 2_450, categoryId: 'cat_super' }),
      tx({ amount: 250 }),
    ], '2026-10')
    expect(r.collected).toBe(250)
    expect(r.costs).toBe(0)
  })

  it('no cuenta otros meses', () => {
    const r = businessMonth(NEGOCIO, [tx({ date: '2026-09-05' }), tx({ date: '2026-10-05' })], '2026-10')
    expect(r.collected).toBe(250)
  })

  it('las transferencias no son ni cobro ni coste', () => {
    const r = businessMonth(NEGOCIO, [
      tx({ type: 'transfer', amount: 9_999, categoryId: undefined, fromAccount: 'a1', toAccount: 'a2' }),
    ], '2026-10')
    expect(r.collected).toBe(0)
    expect(r.costs).toBe(0)
  })

  it('un negocio sin categorías no cobra nada', () => {
    const vacio = { ...NEGOCIO, incomeCategoryIds: [], expenseCategoryIds: [] }
    expect(businessMonth(vacio, [tx()], '2026-10').collected).toBe(0)
  })
})

describe('businessYear', () => {
  const movimientos = [
    tx({ date: '2026-08-05', amount: 1_000 }),
    tx({ date: '2026-08-01', type: 'expense', amount: 600, categoryId: 'cat_subs' }),
    tx({ date: '2026-09-05', amount: 1_000 }),
    tx({ date: '2026-09-01', type: 'expense', amount: 600, categoryId: 'cat_subs' }),
    tx({ date: '2026-10-05', amount: 1_250 }),
    tx({ date: '2026-10-01', type: 'expense', amount: 600, categoryId: 'cat_subs' }),
  ]

  it('suma el año entero', () => {
    const r = businessYear(NEGOCIO, movimientos, 2026)
    expect(r.collected).toBe(3_250)
    expect(r.costs).toBe(1_800)
    expect(r.profit).toBe(1_450)
  })

  it('la media se divide entre los meses ACTIVOS, no entre doce', () => {
    // Dividir por 12 llevando tres meses daría una media falsamente mala.
    const r = businessYear(NEGOCIO, movimientos, 2026)
    expect(r.activeMonths).toBe(3)
    expect(r.monthlyAvg).toBe(483.33)
  })

  it('un mes en el que solo pagaste el servicio también cuenta como activo', () => {
    const r = businessYear(NEGOCIO, [tx({ date: '2026-03-01', type: 'expense', amount: 600, categoryId: 'cat_subs' })], 2026)
    expect(r.activeMonths).toBe(1)
    expect(r.profit).toBe(-600)
  })

  it('sin actividad, media cero y no una división por cero', () => {
    const r = businessYear(NEGOCIO, [], 2026)
    expect(r.activeMonths).toBe(0)
    expect(r.monthlyAvg).toBe(0)
    expect(Number.isFinite(r.monthlyAvg)).toBe(true)
  })

  it('da los doce meses para poder dibujarlos', () => {
    const r = businessYear(NEGOCIO, movimientos, 2026)
    expect(r.byMonth).toHaveLength(12)
    expect(r.byMonth[0].mkey).toBe('2026-01')
    expect(r.byMonth[9].profit).toBe(650)
  })

  it('no cuenta otro año', () => {
    expect(businessYear(NEGOCIO, [tx({ date: '2025-10-05' })], 2026).collected).toBe(0)
  })
})

describe('serviceMargin', () => {
  const servicio: Service = { id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', capacity: 4, createdAt: 0 }

  it('el caso de revender: 4 perfiles a 250 sobre un coste de 600', () => {
    const clientes = Array.from({ length: 4 }, () => cliente({ serviceId: 's1', amount: 250 }))
    const r = serviceMargin(servicio, clientes)
    expect(r.revenue).toBe(1_000)
    expect(r.margin).toBe(400)
    expect(r.clientCount).toBe(4)
    expect(r.freeSlots).toBe(0)
  })

  it('dice cuántos clientes hacen falta para no perder dinero', () => {
    const clientes = Array.from({ length: 4 }, () => cliente({ serviceId: 's1', amount: 250 }))
    expect(serviceMargin(servicio, clientes).breakEven).toBe(3)
  })

  it('con pocos clientes el margen es negativo y se dice', () => {
    const r = serviceMargin(servicio, [cliente({ serviceId: 's1', amount: 250 })])
    expect(r.margin).toBe(-350)
  })

  it('un cliente inactivo no cuenta ni paga', () => {
    const r = serviceMargin(servicio, [
      cliente({ serviceId: 's1', amount: 250 }),
      cliente({ serviceId: 's1', amount: 250, active: false }),
    ])
    expect(r.clientCount).toBe(1)
    expect(r.revenue).toBe(250)
  })

  it('los clientes de otro servicio no cuentan', () => {
    const r = serviceMargin(servicio, [cliente({ serviceId: 'otro', amount: 9_999 })])
    expect(r.revenue).toBe(0)
  })

  it('sin clientes no se inventa un punto de equilibrio', () => {
    // Suponer un precio sería inventarse el dato más importante.
    const r = serviceMargin(servicio, [])
    expect(r.breakEven).toBeNull()
    expect(r.margin).toBe(-600)
  })

  it('sin tope de plazas no hay plazas libres que contar', () => {
    const sinTope: Service = { ...servicio, capacity: 0 }
    expect(serviceMargin(sinTope, []).freeSlots).toBeNull()
  })

  it('las plazas libres no bajan de cero aunque te pases', () => {
    const clientes = Array.from({ length: 6 }, () => cliente({ serviceId: 's1' }))
    expect(serviceMargin(servicio, clientes).freeSlots).toBe(0)
  })

  it('con precios distintos usa el precio medio', () => {
    const clientes = [cliente({ serviceId: 's1', amount: 300 }), cliente({ serviceId: 's1', amount: 200 })]
    // Medio 250 → 600/250 = 2.4 → 3
    expect(serviceMargin(servicio, clientes).breakEven).toBe(3)
  })
})

describe('clientRanking', () => {
  it('ordena por lo que aporta cada uno', () => {
    const a = cliente({ id: 'a' }), b = cliente({ id: 'b' }), c = cliente({ id: 'c' })
    const r = clientRanking([a, b, c], { a: 500, b: 1_500, c: 0 })
    expect(r.map(x => x.client.id)).toEqual(['b', 'a'])
  })

  it('quien no ha pagado nada no aparece', () => {
    expect(clientRanking([cliente({ id: 'z' })], {})).toEqual([])
  })
})

describe('priceSpread', () => {
  it('saca a la luz que cobras distinto por lo mismo', () => {
    const r = priceSpread([
      cliente({ concept: 'Netflix', amount: 250 }),
      cliente({ concept: 'netflix', amount: 200 }),
    ])
    expect(r).toHaveLength(1)
    expect(r[0].min).toBe(200)
    expect(r[0].max).toBe(250)
    expect(r[0].clients).toBe(2)
  })

  it('si todos pagan lo mismo no hay nada que decidir', () => {
    const r = priceSpread([
      cliente({ concept: 'Netflix', amount: 250 }),
      cliente({ concept: 'Netflix', amount: 250 }),
    ])
    expect(r).toEqual([])
  })

  it('un concepto con un solo cliente no se compara consigo mismo', () => {
    expect(priceSpread([cliente({ concept: 'Tareas', amount: 1_500 })])).toEqual([])
  })

  it('los inactivos no cuentan: su precio es historia', () => {
    const r = priceSpread([
      cliente({ concept: 'Netflix', amount: 250 }),
      cliente({ concept: 'Netflix', amount: 100, active: false }),
    ])
    expect(r).toEqual([])
  })

  it('la mayor desigualdad primero', () => {
    const r = priceSpread([
      cliente({ concept: 'Netflix', amount: 250 }), cliente({ concept: 'Netflix', amount: 240 }),
      cliente({ concept: 'Tareas', amount: 2_000 }), cliente({ concept: 'Tareas', amount: 1_000 }),
    ])
    expect(r[0].concept).toBe('Tareas')
  })

  it('un concepto vacío no agrupa a nadie', () => {
    expect(priceSpread([cliente({ concept: '  ' }), cliente({ concept: '' })])).toEqual([])
  })
})

describe('setAsideAmount', () => {
  it('aparta el porcentaje del cobro', () => {
    expect(setAsideAmount({ ...NEGOCIO, setAsidePct: 20 }, 1_000)).toBe(200)
  })

  it('sin porcentaje no aparta nada', () => {
    expect(setAsideAmount(NEGOCIO, 1_000)).toBe(0)
    expect(setAsideAmount({ ...NEGOCIO, setAsidePct: 0 }, 1_000)).toBe(0)
  })

  it('un porcentaje imposible se recorta en vez de apartar más de lo que entró', () => {
    expect(setAsideAmount({ ...NEGOCIO, setAsidePct: 500 }, 1_000)).toBe(1_000)
  })

  it('sin cobro no hay nada que apartar', () => {
    expect(setAsideAmount({ ...NEGOCIO, setAsidePct: 20 }, 0)).toBe(0)
  })
})

describe('serviceMargin · ciclos y divisas mezcladas', () => {
  it('UNA SUSCRIPCION ANUAL no arruina el mes en que se paga', () => {
    // 6,000 al ano son 500 al mes. Restar 6,000 daria un margen de -5,000 y
    // haria parecer que el servicio es un desastre.
    const anual: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 6_000, costCycle: 'annual',
      capacity: 4, createdAt: 0,
    }
    const clientes = Array.from({ length: 4 }, () => cliente({ serviceId: 's1', amount: 250 }))
    const r = serviceMargin(anual, clientes)
    expect(r.cost).toBe(500)
    expect(r.revenue).toBe(1_000)
    expect(r.margin).toBe(500)
  })

  it('un cliente que paga el ano por adelantado aporta su parte mensual', () => {
    const mensual: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
    }
    const r = serviceMargin(mensual, [cliente({ serviceId: 's1', amount: 3_000, cycle: 'annual' })])
    expect(r.revenue).toBe(250)
    expect(r.margin).toBe(-350)
  })

  it('un servicio en dolares contra clientes en pesos se compara en una sola divisa', () => {
    // Restar pesos de dolares daria un margen inventado.
    const enUsd: Service = {
      id: 's1', businessId: 'b1', name: 'Spotify', cost: 10, costCycle: 'monthly',
      currency: 'USD', createdAt: 0,
    }
    const clientes = Array.from({ length: 4 }, () => cliente({ serviceId: 's1', amount: 250 }))
    const r = serviceMargin(enUsd, clientes, 'DOP')
    // El coste deja de ser 10 y pasa a ser su equivalente en pesos.
    expect(r.cost).toBeGreaterThan(100)
    expect(r.revenue).toBe(1_000)
    expect(r.margin).toBe(Math.round((1_000 - r.cost) * 100) / 100)
  })

  it('un cliente en dolares se convierte a la divisa base', () => {
    const servicio: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
    }
    const r = serviceMargin(servicio, [cliente({ serviceId: 's1', amount: 10, currency: 'USD' })], 'DOP')
    expect(r.revenue).toBeGreaterThan(100)
  })

  it('sin divisa base no se convierte nada: compatibilidad', () => {
    const enUsd: Service = {
      id: 's1', businessId: 'b1', name: 'X', cost: 10, costCycle: 'monthly',
      currency: 'USD', createdAt: 0,
    }
    expect(serviceMargin(enUsd, []).cost).toBe(10)
  })

  it('el punto de equilibrio usa el coste YA normalizado', () => {
    const anual: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 6_000, costCycle: 'annual', createdAt: 0,
    }
    const clientes = Array.from({ length: 4 }, () => cliente({ serviceId: 's1', amount: 250 }))
    // 500 al mes / 250 = 2 clientes, no 6000/250 = 24.
    expect(serviceMargin(anual, clientes).breakEven).toBe(2)
  })
})

describe('serviceCostPerMonth', () => {
  it('normaliza ciclo y divisa a la vez', () => {
    const s: Service = {
      id: 's1', businessId: 'b1', name: 'X', cost: 120, costCycle: 'annual',
      currency: 'USD', createdAt: 0,
    }
    // 120 USD al ano = 10 USD al mes, convertidos a pesos.
    expect(serviceCostPerMonth(s, 'DOP')).toBeGreaterThan(100)
    expect(serviceCostPerMonth(s)).toBe(10)
  })
})

describe('businessRunRate · la vista «al mes»', () => {
  const anual: Service = {
    id: 's1', businessId: 'b1', name: 'Netflix', cost: 6_000, costCycle: 'annual', createdAt: 0,
  }
  const mensual: Service = {
    id: 's2', businessId: 'b1', name: 'Disney', cost: 450, costCycle: 'monthly', createdAt: 0,
  }

  it('EL CASO QUE LA JUSTIFICA: el mes en que se paga el ano no es un desastre', () => {
    // De caja: cobras 1,000 y pagas 6,000 -> -5,000. Al mes: 1,000 - 500 = 500.
    const movs = [
      tx({ date: '2026-03-05', amount: 1_000 }),
      tx({ date: '2026-03-01', type: 'expense', amount: 6_000, categoryId: 'cat_subs' }),
    ]
    expect(businessMonth(NEGOCIO, movs, '2026-03').profit).toBe(-5_000)
    const r = businessRunRate(NEGOCIO, [anual], movs, '2026-03')
    expect(r.monthlyCost).toBe(500)
    expect(r.profit).toBe(500)
  })

  it('y los once meses siguientes tampoco son ganancia pura', () => {
    const movs = [tx({ date: '2026-04-05', amount: 1_000 })]
    expect(businessMonth(NEGOCIO, movs, '2026-04').profit).toBe(1_000)
    expect(businessRunRate(NEGOCIO, [anual], movs, '2026-04').profit).toBe(500)
  })

  it('suma el coste de todos sus servicios, cada uno en su ciclo', () => {
    const r = businessRunRate(NEGOCIO, [anual, mensual], [], '2026-03')
    expect(r.monthlyCost).toBe(950)
  })

  it('avisa de que las dos vistas difieren solo si hay algo no mensual', () => {
    expect(businessRunRate(NEGOCIO, [anual], [], '2026-03').hasNonMonthly).toBe(true)
    expect(businessRunRate(NEGOCIO, [mensual], [], '2026-03').hasNonMonthly).toBe(false)
    expect(businessRunRate(NEGOCIO, [], [], '2026-03').hasNonMonthly).toBe(false)
  })

  it('los servicios de OTRO negocio no cuentan', () => {
    const ajeno: Service = { ...mensual, id: 's9', businessId: 'otro', cost: 9_999 }
    expect(businessRunRate(NEGOCIO, [ajeno], [], '2026-03').monthlyCost).toBe(0)
  })

  it('sin servicios, la ganancia al mes es todo lo cobrado', () => {
    const movs = [tx({ date: '2026-03-05', amount: 1_000 })]
    expect(businessRunRate(NEGOCIO, [], movs, '2026-03').profit).toBe(1_000)
  })

  it('una perdida se dice tal cual', () => {
    expect(businessRunRate(NEGOCIO, [anual], [], '2026-03').profit).toBe(-500)
  })
})

describe('runRateSeries · la grafica', () => {
  const anual: Service = {
    id: 's1', businessId: 'b1', name: 'Netflix', cost: 6_000, costCycle: 'annual', createdAt: 0,
  }

  it('da los doce meses', () => {
    expect(runRateSeries(NEGOCIO, [anual], [], 2026)).toHaveLength(12)
  })

  it('un mes sin NADA cobrado queda en cero, no en menos el coste', () => {
    // Un negocio que todavia no habia empezado no estaba perdiendo dinero.
    const serie = runRateSeries(NEGOCIO, [anual], [tx({ date: '2026-06-05', amount: 1_000 })], 2026)
    expect(serie[0].profit).toBe(0)
    expect(serie[5].profit).toBe(500)
  })

  it('el pago anual NO deja un crater en su mes', () => {
    // Es el motivo entero de que la grafica use esta vista.
    const movs = [
      tx({ date: '2026-03-01', type: 'expense', amount: 6_000, categoryId: 'cat_subs' }),
      tx({ date: '2026-03-05', amount: 1_000 }),
      tx({ date: '2026-04-05', amount: 1_000 }),
    ]
    const serie = runRateSeries(NEGOCIO, [anual], movs, 2026)
    expect(serie[2].profit).toBe(500)
    expect(serie[3].profit).toBe(500)
  })
})

describe('varias cuentas por servicio', () => {
  const dosCuentas: Service = {
    id: 's1', businessId: 'b1', name: 'Netflix', cost: 0, costCycle: 'monthly', createdAt: 0,
    accounts: [
      { id: 'ac1', label: 'La vieja', cost: 600, capacity: 4 },
      { id: 'ac2', label: 'La nueva', cost: 600, capacity: 4 },
    ],
  }

  it('EL CASO REAL: dos Netflix cuestan dos Netflix', () => {
    expect(serviceCostPerMonth(dosCuentas)).toBe(1_200)
  })

  it('las plazas se suman', () => {
    const clientes = Array.from({ length: 5 }, () => cliente({ serviceId: 's1', amount: 250 }))
    const m = serviceMargin(dosCuentas, clientes)
    expect(m.freeSlots).toBe(3)
    expect(m.accountCount).toBe(2)
    expect(m.needsAnotherAccount).toBe(false)
  })

  it('avisa cuando ya no cabe nadie y hay que comprar otra', () => {
    const clientes = Array.from({ length: 8 }, () => cliente({ serviceId: 's1', amount: 250 }))
    const m = serviceMargin(dosCuentas, clientes)
    expect(m.freeSlots).toBe(0)
    expect(m.needsAnotherAccount).toBe(true)
  })

  it('una cuenta dada de baja no cuesta ni cuenta', () => {
    const conBaja: Service = {
      ...dosCuentas,
      accounts: [
        { id: 'ac1', cost: 600, capacity: 4 },
        { id: 'ac2', cost: 600, capacity: 4, closedAt: 123 },
      ],
    }
    const m = serviceMargin(conBaja, [])
    expect(m.cost).toBe(600)
    expect(m.accountCount).toBe(1)
  })

  it('si una cuenta no tiene tope, el conjunto no tiene tope', () => {
    // Decir «0 libres» con una plaza ilimitada dentro seria mentir.
    const mixto: Service = {
      ...dosCuentas,
      accounts: [{ id: 'ac1', cost: 600, capacity: 4 }, { id: 'ac2', cost: 600 }],
    }
    expect(serviceMargin(mixto, []).freeSlots).toBeNull()
  })

  it('UN SERVICIO SIN CUENTAS sigue significando lo mismo que antes', () => {
    // Es lo que permite no migrar nada de lo que el usuario ya tiene.
    const viejo: Service = {
      id: 's9', businessId: 'b1', name: 'Disney', cost: 450, costCycle: 'monthly', capacity: 4, createdAt: 0,
    }
    expect(serviceCostPerMonth(viejo)).toBe(450)
    expect(serviceMargin(viejo, []).accountCount).toBe(1)
    expect(serviceMargin(viejo, []).freeSlots).toBe(4)
  })
})

describe('accountOccupancy', () => {
  const dos: Service = {
    id: 's1', businessId: 'b1', name: 'Netflix', cost: 0, costCycle: 'monthly', createdAt: 0,
    accounts: [
      { id: 'ac1', cost: 600, capacity: 4 },
      { id: 'ac2', cost: 600, capacity: 4 },
    ],
  }

  it('dice cual esta llena y cual tiene sitio', () => {
    const clientes = [
      ...Array.from({ length: 4 }, () => cliente({ serviceId: 's1', serviceAccountId: 'ac1' })),
      cliente({ serviceId: 's1', serviceAccountId: 'ac2' }),
    ]
    const r = accountOccupancy(dos, clientes)
    expect(r[0]).toMatchObject({ used: 4, free: 0, full: true })
    expect(r[1]).toMatchObject({ used: 1, free: 3, full: false })
  })

  it('un cliente inactivo no ocupa plaza', () => {
    const clientes = [cliente({ serviceId: 's1', serviceAccountId: 'ac1', active: false })]
    expect(accountOccupancy(dos, clientes)[0].used).toBe(0)
  })

  it('S2 · UN CLIENTE SIN CUENTA OCUPA SITIO, no queda fuera de todas', () => {
    // Era el fallo: los clientes de antes de que hubiera cuentas no tenían
    // ninguna, y la cuenta 1 salía vacía con cuatro personas dentro.
    const clientes = [cliente({ serviceId: 's1' })]
    const r = accountOccupancy(dos, clientes)
    expect(r[0].used).toBe(1)
    expect(r[1].used).toBe(0)
  })

  it('los que no tienen cuenta llenan la primera y siguen en la siguiente', () => {
    const clientes = Array.from({ length: 6 }, (_, i) => cliente({ serviceId: 's1', createdAt: i }))
    const r = accountOccupancy(dos, clientes)
    expect(r.map(a => a.used)).toEqual([4, 2])
  })

  it('respeta a quien ya tiene cuenta y coloca al resto alrededor', () => {
    const clientes = [
      ...Array.from({ length: 3 }, () => cliente({ serviceId: 's1', serviceAccountId: 'ac1' })),
      cliente({ serviceId: 's1', createdAt: 5 }),
      cliente({ serviceId: 's1', createdAt: 6 }),
    ]
    expect(accountOccupancy(dos, clientes).map(a => a.used)).toEqual([4, 1])
  })

  it('con todas llenas, el que sobra va a la última: nunca desaparece', () => {
    const clientes = Array.from({ length: 9 }, (_, i) => cliente({ serviceId: 's1', createdAt: i }))
    expect(accountOccupancy(dos, clientes).map(a => a.used)).toEqual([4, 5])
  })

  it('un cliente cuya cuenta se cerró se vuelve a colocar', () => {
    const clientes = [cliente({ serviceId: 's1', serviceAccountId: 'cerrada' })]
    expect(accountOccupancy(dos, clientes)[0].used).toBe(1)
  })
})

/**
 * GUARDIA DEL ATAJO: el reparto en una pasada da lo mismo que doce.
 *
 * `businessYear` y `runRateSeries` llamaban a `businessMonth` doce veces, cada
 * una recorriendo el libro entero. Ahora reparten el año en una sola pasada.
 * Es una optimización, así que lo único que importa es que el resultado no
 * cambie — y eso no lo dice ningún test de los de arriba, que miran un año
 * concreto con cuatro movimientos.
 */
describe('un año en una pasada == doce meses sueltos', () => {
  const libro: Transaction[] = [
    tx({ date: '2026-01-15', amount: 100 }),
    tx({ date: '2026-01-20', amount: 50 }),
    tx({ date: '2026-02-28', type: 'expense', amount: 600, categoryId: 'cat_subs' }),
    tx({ date: '2026-06-01', amount: 999.99 }),
    tx({ date: '2026-12-31', amount: 1 }),
    // Ruido que no debe contar: otro año, una transferencia, otra categoría.
    tx({ date: '2025-06-01', amount: 7_000 }),
    tx({ date: '2027-01-01', amount: 7_000 }),
    tx({ date: '2026-06-02', type: 'transfer', amount: 7_000 }),
    tx({ date: '2026-06-03', amount: 7_000, categoryId: 'cat_otra' }),
    tx({ date: '2026-06-04', type: 'expense', amount: 7_000, categoryId: 'cat_otra' }),
  ]

  it('mes a mes coincide con businessMonth', () => {
    const año = businessYear(NEGOCIO, libro, 2026)
    expect(año.byMonth).toHaveLength(12)
    for (const { mkey, profit } of año.byMonth) {
      expect(profit, mkey).toBe(businessMonth(NEGOCIO, libro, mkey).profit)
    }
  })

  it('los totales del año cuadran con la suma de los doce', () => {
    const año = businessYear(NEGOCIO, libro, 2026)
    const meses = año.byMonth.map(m => businessMonth(NEGOCIO, libro, m.mkey))
    expect(año.collected).toBe(1_150.99)
    expect(año.costs).toBe(600)
    expect(año.incomeCount).toBe(meses.reduce((s, m) => s + m.incomeCount, 0))
    expect(año.activeMonths).toBe(meses.filter(m => m.collected > 0 || m.costs > 0).length)
  })

  it('los meses salen en orden, de enero a diciembre', () => {
    // La gráfica los pinta en el orden en que llegan: desordenados, un mes
    // malo aparecería donde no es.
    const claves = businessYear(NEGOCIO, libro, 2026).byMonth.map(m => m.mkey)
    expect(claves).toEqual([...claves].sort())
    expect(claves[0]).toBe('2026-01')
    expect(claves[11]).toBe('2026-12')
  })

  it('la serie de la gráfica también coincide mes a mes', () => {
    const svc: Service = {
      id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', createdAt: 0,
    }
    const serie = runRateSeries(NEGOCIO, [svc], libro, 2026)
    expect(serie).toHaveLength(12)
    for (const { mkey, profit } of serie) {
      const { collected } = businessMonth(NEGOCIO, libro, mkey)
      expect(profit, mkey).toBe(collected > 0 ? Math.round((collected - 600) * 100) / 100 : 0)
    }
  })

  it('un libro vacío da doce ceros, no una lista corta', () => {
    expect(businessYear(NEGOCIO, [], 2026).byMonth).toHaveLength(12)
    expect(runRateSeries(NEGOCIO, [], [], 2026)).toHaveLength(12)
  })
})
