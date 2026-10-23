import { describe, expect, it } from 'vitest'
import { currentTotalBalance, projectCashflow, safeToSpend, type CashflowProjection } from './cashflowProjection'
import type { Charge, Client } from './clients'
import type { Account, Goal, Transaction } from '@/types'

const account = (over: Partial<Account> = {}): Account => ({
  id: 'acc_1', name: 'Efectivo', short: 'Cash', type: 'cash',
  color: '#fff', balance: 1000, last4: null, ...over,
})

const recurringExpense = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_sub', type: 'expense', amount: 200, date: '2026-07-01',
  note: 'Netflix', accountId: 'acc_1', categoryId: 'cat_ocio',
  recurring: 'monthly', recurringNext: '2026-07-15', ...over,
})

describe('currentTotalBalance', () => {
  it('suma cuentas y respeta includeInTotal=false', () => {
    const accounts = [
      account(),
      account({ id: 'acc_2', balance: 500 }),
      account({ id: 'acc_3', balance: 9999, includeInTotal: false }),
    ]
    expect(currentTotalBalance(accounts)).toBe(1500)
  })
})

describe('projectCashflow', () => {
  it('proyecta cargos recurrentes futuros y el saldo resultante', () => {
    const projection = projectCashflow(
      [recurringExpense()], [account()], [], '2026-07-31', '2026-07-07',
    )
    expect(projection.startBalance).toBe(1000)
    expect(projection.days).toHaveLength(1)
    expect(projection.days[0].date).toBe('2026-07-15')
    expect(projection.days[0].net).toBe(-200)
    expect(projection.days[0].balance).toBe(800)
    expect(projection.endBalance).toBe(800)
  })

  it('genera múltiples ocurrencias semanales dentro del horizonte', () => {
    const weekly = recurringExpense({ recurring: 'weekly', recurringNext: '2026-07-10', amount: 100 })
    const projection = projectCashflow([weekly], [account()], [], '2026-07-31', '2026-07-07')
    // 10, 17, 24, 31 de julio
    expect(projection.days).toHaveLength(4)
    expect(projection.endBalance).toBe(600)
  })

  it('ignora ocurrencias saltadas, pasadas y posteriores a recurringEnd', () => {
    const tx = recurringExpense({
      recurring: 'weekly', recurringNext: '2026-07-10',
      skippedDates: ['2026-07-17'], recurringEnd: '2026-07-24',
    })
    const projection = projectCashflow([tx], [account()], [], '2026-07-31', '2026-07-07')
    expect(projection.days.map(d => d.date)).toEqual(['2026-07-10', '2026-07-24'])
  })

  it('incluye ingresos recurrentes y aportes automáticos a metas', () => {
    const salary = recurringExpense({
      id: 'tx_salary', type: 'income', amount: 5000, note: 'Salario', recurringNext: '2026-07-30',
    })
    const goal: Goal = {
      id: 'goal_1', name: 'Viaje', target: 10000, saved: 0, color: '#fff', icon: 'target',
      autoContribute: { amount: 300, frequency: 'monthly', fromAccountId: 'acc_1', nextDate: '2026-07-20' },
    }
    const projection = projectCashflow([salary], [account()], [goal], '2026-07-31', '2026-07-07')
    expect(projection.days.map(d => d.date)).toEqual(['2026-07-20', '2026-07-30'])
    expect(projection.endBalance).toBe(1000 - 300 + 5000)
    expect(projection.days[0].events[0].kind).toBe('goal')
  })

  it('detecta el punto más bajo de la proyección', () => {
    const rent = recurringExpense({ id: 'tx_rent', amount: 900, note: 'Renta', recurringNext: '2026-07-10' })
    const salary = recurringExpense({
      id: 'tx_salary', type: 'income', amount: 5000, note: 'Salario', recurringNext: '2026-07-28',
    })
    const projection = projectCashflow([rent, salary], [account()], [], '2026-07-31', '2026-07-07')
    expect(projection.minBalance).toBe(100)
    expect(projection.minDate).toBe('2026-07-10')
    expect(projection.endBalance).toBe(5100)
  })

  it('excluye transferencias recurrentes (no cambian el total)', () => {
    const transfer: Transaction = {
      id: 'tx_tr', type: 'transfer', amount: 500, date: '2026-07-01', note: 'Ahorro',
      fromAccount: 'acc_1', toAccount: 'acc_2', recurring: 'monthly', recurringNext: '2026-07-15',
    }
    const projection = projectCashflow([transfer], [account()], [], '2026-07-31', '2026-07-07')
    expect(projection.days).toHaveLength(0)
    expect(projection.endBalance).toBe(1000)
  })
})

describe('safeToSpend', () => {
  const ev = (date: string, note: string, amount: number, kind: 'income' | 'expense' | 'goal' = amount > 0 ? 'income' : 'expense') =>
    ({ date, note, amount, kind, sourceId: note })
  const projection: CashflowProjection = {
    startBalance: 10000,
    endBalance: 56900,
    minBalance: 7700,
    minDate: '2026-07-03',
    days: [
      { date: '2026-07-02', events: [ev('2026-07-02', 'Netflix', -300)], net: -300, balance: 9700 },
      { date: '2026-07-03', events: [ev('2026-07-03', 'Renta', -2000)], net: -2000, balance: 7700 },
      { date: '2026-07-06', events: [ev('2026-07-06', 'Nómina', 50000)], net: 50000, balance: 57700 },
      { date: '2026-07-10', events: [ev('2026-07-10', 'Gimnasio', -800)], net: -800, balance: 56900 },
    ],
    series: [
      { date: '2026-07-02', balance: 9700 }, { date: '2026-07-03', balance: 7700 },
      { date: '2026-07-06', balance: 57700 }, { date: '2026-07-10', balance: 56900 },
    ],
  }

  it('resta lo comprometido ANTES del próximo ingreso, no lo posterior', () => {
    const s = safeToSpend(projection, 0)
    expect(s.nextIncome?.note).toBe('Nómina')
    expect(s.committed).toBe(2300)          // Netflix + Renta, no el gimnasio (post-ingreso)
    expect(s.amount).toBe(7700)             // 10000 − 2300
    expect(s.bills.map(b => b.note)).toEqual(['Netflix', 'Renta'])
  })

  it('el colchón se aparta del gastable', () => {
    expect(safeToSpend(projection, 3000).amount).toBe(4700)
  })

  it('marca dipsNegative si el saldo caería bajo cero antes del ingreso', () => {
    const broke = { ...projection, series: [{ date: '2026-07-03', balance: -500 }, { date: '2026-07-06', balance: 100 }] }
    expect(safeToSpend(broke, 0).dipsNegative).toBe(true)
  })

  it('sin ingreso futuro, compromete todas las salidas del horizonte', () => {
    const noIncome = {
      ...projection,
      days: projection.days.filter(d => d.events.every(e => e.amount < 0)),
      series: projection.series,
    }
    const s = safeToSpend(noIncome, 0)
    expect(s.nextIncome).toBeNull()
    expect(s.committed).toBe(3100)          // Netflix + Renta + Gimnasio
  })
})

/**
 * LO QUE TE DEBEN, EN LA PROYECCIÓN.
 *
 * Para quien cobra a clientes, «¿me alcanza hasta fin de mes?» depende de
 * ellos. Sin esto la pantalla decía que no llegas mientras te debían el doble
 * de lo que te faltaba.
 */
describe('projectCashflow · cobros a clientes', () => {
  const cliente = (over: Partial<Client> = {}): Client => ({
    id: 'cli1', name: 'Juan', concept: 'Netflix', amount: 250, cycle: 'monthly',
    dueDay: 15, accountId: 'acc_1', categoryId: 'cat_cobros',
    active: true, createdAt: 0, ...over,
  })

  const cobro = (over: Partial<Charge> = {}): Charge => ({
    id: 'ch1', clientId: 'cli1', dueDate: '2026-07-15', amount: 250,
    paid: 0, txIds: [], paidAt: 0, ...over,
  })

  const proyecta = (charges: Charge[], clients: Client[] = [cliente()]) =>
    projectCashflow([], [account()], [], '2026-07-31', '2026-07-07', undefined, { charges, clients })

  it('un cobro futuro entra como evento propio, no como ingreso', () => {
    const p = proyecta([cobro()])
    expect(p.days).toHaveLength(1)
    expect(p.days[0].date).toBe('2026-07-15')
    expect(p.days[0].events[0].kind).toBe('charge')
    expect(p.days[0].events[0].note).toBe('Juan')
    expect(p.endBalance).toBe(1250)
  })

  it('SE DESPLAZA por el retraso medio de ESE cliente', () => {
    // Si lleva meses pagando tarde, ponerle el dinero el día 15 es inventarse
    // una puntualidad que no tiene, y la proyección mentiría a favor.
    const historial = [
      cobro({ id: 'viejo1', dueDate: '2026-05-15', amount: 250, paid: 250, paidAt: Date.parse('2026-05-25T12:00:00') }),
      cobro({ id: 'viejo2', dueDate: '2026-06-15', amount: 250, paid: 250, paidAt: Date.parse('2026-06-25T12:00:00') }),
      cobro({ id: 'ch1', dueDate: '2026-07-15' }),
    ]
    const p = proyecta(historial)
    const evento = p.days.flatMap(d => d.events).find(e => e.sourceId === 'ch1')
    expect(evento).toBeDefined()
    expect(evento!.date).toBe('2026-07-25')
  })

  it('LO YA ATRASADO no se proyecta: no tiene fecha', () => {
    // Puede llegar mañana o nunca; ponerle un día sería elegir uno al azar.
    expect(proyecta([cobro({ dueDate: '2026-06-01' })]).days).toEqual([])
  })

  it('lo cobrado y lo perdonado no vuelven a entrar', () => {
    expect(proyecta([cobro({ paid: 250, paidAt: 1 })]).days).toEqual([])
    expect(proyecta([cobro({ waived: true })]).days).toEqual([])
  })

  it('un cobro a medias entra solo por lo que falta', () => {
    const p = proyecta([cobro({ amount: 250, paid: 100 })])
    expect(p.days[0].events[0].amount).toBe(150)
  })

  it('lo que cae más allá del horizonte se queda fuera', () => {
    expect(proyecta([cobro({ dueDate: '2026-09-15' })]).days).toEqual([])
  })

  it('sin cobros no cambia nada de lo que ya hacía', () => {
    const conVacio = projectCashflow([recurringExpense()], [account()], [], '2026-07-31', '2026-07-07', undefined, { charges: [], clients: [] })
    const sinNada = projectCashflow([recurringExpense()], [account()], [], '2026-07-31', '2026-07-07')
    expect(conVacio).toEqual(sinNada)
  })
})

describe('safeToSpend · lo gastable no depende de que te paguen', () => {
  it('un cobro NO es tu próximo ingreso', () => {
    /*
     * Es la cifra que el usuario lee antes de gastar. Si la frontera la pone
     * un cobro, la app diría «gasta tranquilo, el jueves te pagan» — una
     * promesa de otra persona.
     */
    const cliente: Client = {
      id: 'cli1', name: 'Juan', concept: 'Tarea', amount: 3_000, cycle: 'monthly',
      dueDay: 10, accountId: 'acc_1', categoryId: 'cat_cobros', active: true, createdAt: 0,
    }
    const charge: Charge = {
      id: 'ch1', clientId: 'cli1', dueDate: '2026-07-10', amount: 3_000,
      paid: 0, txIds: [], paidAt: 0,
    }
    const p = projectCashflow(
      [recurringExpense({ recurringNext: '2026-07-20' })], [account()], [],
      '2026-07-31', '2026-07-07', undefined, { charges: [charge], clients: [cliente] },
    )
    const safe = safeToSpend(p)

    // El cobro se ve en la proyección…
    expect(p.days.flatMap(d => d.events).some(e => e.kind === 'charge')).toBe(true)
    // …pero no marca la frontera, así que el recibo del 20 sigue contando.
    expect(safe.nextIncome).toBeNull()
    expect(safe.committed).toBe(200)
    expect(safe.amount).toBe(800)
  })
})
