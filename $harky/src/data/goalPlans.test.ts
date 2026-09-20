import { describe, expect, it } from 'vitest'
import { estimatedMonthlyRate, firstMonthDayDate, nextMonthDayDate, nextWeekdayDate, periodsUntil, projectArrival, rampPlan, requiredContribution } from './goalPlans'
import type { Goal, GoalContribution } from '@/types'

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1', name: 'Meta', target: 100000, saved: 40000, color: '#fff', icon: 'target', ...over,
})

describe('rampPlan (reto incremental)', () => {
  it('calcula el reto 50+25: 50, 75, 100… hasta cubrir la meta', () => {
    const plan = rampPlan(50, 25, 500)!
    expect(plan.first).toEqual([50, 75, 100])
    // 50+75+100+125+150 = 500 → 5 aportes exactos
    expect(plan.periods).toBe(5)
    expect(plan.total).toBe(500)
  })

  it('se pasa un poco de la meta cuando no cuadra exacto (nunca se queda corto)', () => {
    const plan = rampPlan(50, 25, 490)!
    expect(plan.periods).toBe(5)
    expect(plan.total).toBeGreaterThanOrEqual(490)
  })

  it('reto clásico de 52 semanas (100 + 100): total 137,800', () => {
    const plan = rampPlan(100, 100, 137_800)!
    expect(plan.periods).toBe(52)
    expect(plan.total).toBe(137_800)
  })

  it('incremento 0 se comporta como plan fijo', () => {
    const plan = rampPlan(200, 0, 1000)!
    expect(plan.first).toEqual([200, 200, 200])
    expect(plan.periods).toBe(5)
    expect(plan.total).toBe(1000)
  })

  it('sin meta (target 0) devuelve solo la secuencia inicial', () => {
    const plan = rampPlan(50, 25, 0)!
    expect(plan.first).toEqual([50, 75, 100])
    expect(plan.periods).toBe(3)
  })

  it('primer aporte inválido devuelve null', () => {
    expect(rampPlan(0, 25, 500)).toBeNull()
    expect(rampPlan(-10, 25, 500)).toBeNull()
  })

  it('serie que nunca llega se corta en el máximo (no cuelga)', () => {
    const plan = rampPlan(0.01, 0, 1_000_000_000)!
    expect(plan.periods).toBe(520)
  })
})

describe('nextWeekdayDate (día de cobro)', () => {
  // 2026-07-09 es jueves (día 4)
  it('salta al próximo día pedido dentro de la misma semana', () => {
    expect(nextWeekdayDate('2026-07-09', 6)).toBe('2026-07-11') // sábado
    expect(nextWeekdayDate('2026-07-09', 5)).toBe('2026-07-10') // viernes
  })

  it('si el día ya pasó esta semana, cae en la próxima', () => {
    expect(nextWeekdayDate('2026-07-09', 1)).toBe('2026-07-13') // lunes próximo
    expect(nextWeekdayDate('2026-07-09', 3)).toBe('2026-07-15') // miércoles próximo
  })

  it('nunca devuelve hoy: mismo día → una semana después', () => {
    expect(nextWeekdayDate('2026-07-09', 4)).toBe('2026-07-16')
  })

  it('cruza fin de mes y de año correctamente', () => {
    expect(nextWeekdayDate('2026-07-31', 1)).toBe('2026-08-03')
    expect(nextWeekdayDate('2026-12-31', 1)).toBe('2027-01-04')
  })
})

describe('nextMonthDayDate (pagos mensuales con día fijo)', () => {
  it('un pago: avanza al mismo día del mes siguiente', () => {
    expect(nextMonthDayDate('2026-07-05', [5])).toBe('2026-08-05')
    expect(nextMonthDayDate('2026-07-20', [20])).toBe('2026-08-20')
  })

  it('dos pagos: recorre los dos días dentro del mes y salta al siguiente', () => {
    expect(nextMonthDayDate('2026-07-05', [5, 20])).toBe('2026-07-20') // 5 → 20 mismo mes
    expect(nextMonthDayDate('2026-07-20', [5, 20])).toBe('2026-08-05') // 20 → 5 mes siguiente
  })

  it('día 31 se recorta al último real de meses cortos', () => {
    expect(nextMonthDayDate('2026-01-31', [31])).toBe('2026-02-28') // febrero
    expect(nextMonthDayDate('2026-03-31', [31])).toBe('2026-04-30') // abril
  })

  it('desordenado o duplicado no afecta el resultado', () => {
    expect(nextMonthDayDate('2026-07-05', [20, 5, 20])).toBe('2026-07-20')
  })

  it('cruza fin de año', () => {
    expect(nextMonthDayDate('2026-12-15', [15])).toBe('2027-01-15')
  })
})

describe('firstMonthDayDate (primer cobro, nunca hoy)', () => {
  it('elige el primer día futuro del mes', () => {
    expect(firstMonthDayDate('2026-07-03', [5, 20])).toBe('2026-07-05')
    expect(firstMonthDayDate('2026-07-10', [5, 20])).toBe('2026-07-20')
  })

  it('si ya pasaron todos, salta al primero del mes siguiente', () => {
    expect(firstMonthDayDate('2026-07-25', [5, 20])).toBe('2026-08-05')
  })

  it('el mismo día elegido no cuenta como hoy: va al siguiente', () => {
    expect(firstMonthDayDate('2026-07-05', [5])).toBe('2026-08-05')
  })
})

describe('periodsUntil / requiredContribution (calculadora inversa)', () => {
  it('cuenta semanas y meses completos hasta la fecha', () => {
    expect(periodsUntil('2026-07-09', '2026-07-23', 'weekly')).toBe(2)
    expect(periodsUntil('2026-07-09', '2026-10-09', 'monthly')).toBe(3)
  })

  it('fecha pasada o igual → 0 períodos', () => {
    expect(periodsUntil('2026-07-09', '2026-07-09', 'weekly')).toBe(0)
    expect(periodsUntil('2026-07-09', '2026-07-01', 'weekly')).toBe(0)
  })

  it('reparte lo restante y redondea hacia arriba', () => {
    // Faltan 10,000 en 3 meses → 3,334/mes (no 3,333.33)
    const r = requiredContribution(10_000, 0, '2026-10-09', 'monthly', '2026-07-09')!
    expect(r.periods).toBe(3)
    expect(r.amount).toBe(3334)
    expect(r.amount * r.periods).toBeGreaterThanOrEqual(10_000)
  })

  it('descuenta lo ya ahorrado', () => {
    const r = requiredContribution(10_000, 4_000, '2026-10-09', 'monthly', '2026-07-09')!
    expect(r.amount).toBe(2000)
  })

  it('meta ya alcanzada o sin plazos → null', () => {
    expect(requiredContribution(5_000, 5_000, '2026-10-09', 'monthly', '2026-07-09')).toBeNull()
    expect(requiredContribution(5_000, 6_000, '2026-10-09', 'monthly', '2026-07-09')).toBeNull()
    expect(requiredContribution(5_000, 0, '2026-07-10', 'monthly', '2026-07-09')).toBeNull()
  })
})

describe('estimatedMonthlyRate / projectArrival (proyección a tu ritmo)', () => {
  const contrib = (goalId: string, amount: number, date: string): GoalContribution =>
    ({ id: date + amount, goalId, amount, fromAccountId: 'a', date })

  it('el aporte automático mensual manda como ritmo', () => {
    const g = goal({ autoContribute: { amount: 5000, frequency: 'monthly', fromAccountId: 'a', nextDate: '2026-08-01' } })
    expect(estimatedMonthlyRate(g, [], '2026-07-15')).toBe(5000)
  })

  it('dos pagos mensuales cuentan como 2× el monto al mes', () => {
    const g = goal({ autoContribute: { amount: 5000, frequency: 'monthly', fromAccountId: 'a', nextDate: '2026-08-05', monthDays: [5, 20] } })
    expect(estimatedMonthlyRate(g, [], '2026-07-15')).toBe(10000)
  })

  it('el aporte semanal se convierte a mensual (×52/12)', () => {
    const g = goal({ autoContribute: { amount: 1000, frequency: 'weekly', fromAccountId: 'a', nextDate: '2026-08-01' } })
    expect(Math.round(estimatedMonthlyRate(g, [], '2026-07-15'))).toBe(4333)
  })

  it('sin aporte automático, promedia los aportes recientes por mes', () => {
    const rows = [contrib('g1', 6000, '2026-05-01'), contrib('g1', 6000, '2026-06-01'), contrib('g1', 6000, '2026-07-01')]
    // 18,000 en ~2 meses de span → ~9,000/mes
    const rate = estimatedMonthlyRate(goal(), rows, '2026-07-15')
    expect(rate).toBeGreaterThan(6000)
  })

  it('sin señal de ritmo → 0 y proyección null', () => {
    expect(estimatedMonthlyRate(goal(), [], '2026-07-15')).toBe(0)
    expect(projectArrival(goal(), 0, '2026-07-15')).toBeNull()
  })

  it('proyecta la fecha de llegada a partir del ritmo', () => {
    // faltan 60,000 a 10,000/mes → 6 meses → enero 2027
    const arr = projectArrival(goal({ target: 100000, saved: 40000 }), 10000, '2026-07-15')!
    expect(arr.reached).toBe(false)
    expect(arr.months).toBe(6)
    expect(arr.dateISO).toBe('2027-01-01')
  })

  it('meta ya cumplida → reached', () => {
    expect(projectArrival(goal({ saved: 100000, target: 100000 }), 5000)!.reached).toBe(true)
  })
})
