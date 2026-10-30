import { beforeEach, describe, expect, it } from 'vitest'
import { useFinance, recomputeGoalsSaved } from '@/store/finance'
import { accountMovementsTotal, contributionDelta } from '@/data/helpers'
import { goalSeries, goalStatus, isGoalDone, planAmount, quickAmounts, resumeAutoNextDate } from '@/data/goalPlans'
import { createBackup, parseBackup } from '@/data/backup'
import { isLowEndDevice } from '@/lib/sheetMotion'
import type { Account, Goal, GoalContribution } from '@/types'

/**
 * METAS 2.5: estado honesto, aporte rápido, sacar dinero, pausar y lograda.
 *
 * Lo que más importa aquí es el dinero: sacar de una meta es un aporte al
 * revés y tiene que cuadrar con la invariante de siempre,
 * `saldo = apertura + movimientos`, igual que la meta `saved = apertura + aportes`.
 */

const ACC: Account = {
  id: 'acc_1', name: 'Ahorros', short: 'Ah', type: 'savings', color: '#fff',
  balance: 50_000, openingBalance: 50_000, last4: null,
}

function seed(goals: Goal[] = [], contributions: GoalContribution[] = []) {
  useFinance.setState({
    accounts: [{ ...ACC }], transactions: [], categories: [], goals, goalContributions: contributions, currency: 'DOP',
  })
}

const goal = (over: Partial<Goal> = {}): Goal => ({
  id: 'g1', name: 'Viaje', target: 100_000, saved: 0, openingSaved: 0, color: '#fff', icon: 'plane', ...over,
})

describe('sacar dinero de una meta', () => {
  beforeEach(() => seed([goal()]))

  it('baja la meta, sube la cuenta y deja un retiro en el historial', () => {
    const s = useFinance.getState()
    s.contribute('g1', 10_000, 'acc_1')
    s.withdrawFromGoal('g1', 4_000, 'acc_1')
    const st = useFinance.getState()
    expect(st.goals[0].saved).toBe(6_000)
    expect(st.accounts[0].balance).toBe(44_000)
    const w = st.goalContributions.find(c => c.withdraw)
    expect(w).toMatchObject({ amount: 4_000, withdraw: true, fromAccountId: 'acc_1' })
  })

  it('cuadra con apertura + movimientos (cuenta y meta)', () => {
    const s = useFinance.getState()
    s.contribute('g1', 10_000, 'acc_1')
    s.withdrawFromGoal('g1', 2_500, 'acc_1')
    const st = useFinance.getState()
    const acc = st.accounts[0]
    expect(acc.openingBalance! + accountMovementsTotal(acc.id, st.transactions, st.goalContributions)).toBe(acc.balance)
    expect(recomputeGoalsSaved(st.goals, st.goalContributions)[0].saved).toBe(st.goals[0].saved)
  })

  it('no deja sacar más de lo ahorrado', () => {
    const s = useFinance.getState()
    s.contribute('g1', 1_000, 'acc_1')
    expect(() => s.withdrawFromGoal('g1', 1_500, 'acc_1')).toThrow()
    expect(useFinance.getState().goals[0].saved).toBe(1_000)
  })

  it('el retiro sobrevive a una copia de seguridad', () => {
    const s = useFinance.getState()
    s.contribute('g1', 3_000, 'acc_1')
    s.withdrawFromGoal('g1', 1_000, 'acc_1')
    const st = useFinance.getState()
    const data = parseBackup(JSON.stringify(createBackup(st)))
    expect(data.goalContributions.some(c => c.withdraw)).toBe(true)
  })

  it('contributionDelta: positivo al aportar, negativo al sacar', () => {
    expect(contributionDelta({ amount: 5, withdraw: undefined })).toBe(5)
    expect(contributionDelta({ amount: 5, withdraw: true })).toBe(-5)
  })
})

describe('pausar y reanudar el aporte automático', () => {
  it('al reanudar no cobra de golpe lo que estuvo en pausa', () => {
    const today = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const old = new Date(today); old.setMonth(old.getMonth() - 3)
    seed([goal({ autoContribute: { amount: 1_000, frequency: 'monthly', fromAccountId: 'acc_1', nextDate: iso(old), monthDays: [old.getDate() > 28 ? 28 : old.getDate()] } })])
    const s = useFinance.getState()
    s.setGoalAutoPaused('g1', true)
    expect(useFinance.getState().goals[0].autoPaused).toBe(true)
    s.setGoalAutoPaused('g1', false)
    const g = useFinance.getState().goals[0]
    expect(g.autoPaused).toBeUndefined()
    expect(g.autoContribute!.nextDate >= iso(today)).toBe(true)
  })

  it('resumeAutoNextDate semanal avanza de 7 en 7', () => {
    const next = resumeAutoNextDate({ amount: 1, frequency: 'weekly', fromAccountId: 'a', nextDate: '2026-01-01' }, '2026-01-20')
    expect(next).toBe('2026-01-22')
  })
})

describe('lograda y orden', () => {
  beforeEach(() => seed([goal(), goal({ id: 'g2', name: 'Carro' }), goal({ id: 'g3', name: 'Casa' })]))

  it('marcar como lograda la saca de las activas y se puede reabrir', () => {
    const s = useFinance.getState()
    s.setGoalAchieved('g2', true)
    expect(isGoalDone(useFinance.getState().goals[1])).toBe(true)
    s.setGoalAchieved('g2', false)
    expect(isGoalDone(useFinance.getState().goals[1])).toBe(false)
  })

  it('reordenar pone la principal primero', () => {
    useFinance.getState().reorderGoals(['g3', 'g1', 'g2'])
    expect(useFinance.getState().goals.map(g => g.id)).toEqual(['g3', 'g1', 'g2'])
  })
})

describe('el estado que dice la verdad', () => {
  const c = (date: string, amount: number): GoalContribution => ({ id: date, goalId: 'g1', amount, fromAccountId: 'acc_1', date })

  it('en camino si va al ritmo', () => {
    // 100,000 en 100 días desde el 1 de enero: al día 50 tocaría llevar 50,000.
    const g = goal({ saved: 50_000, deadline: '2026-04-11' })
    expect(goalStatus(g, [c('2026-01-01', 50_000)], '2026-02-20').kind).toBe('onTrack')
  })

  it('adelantada con los días de ventaja', () => {
    const g = goal({ saved: 70_000, deadline: '2026-04-11' })
    const s = goalStatus(g, [c('2026-01-01', 70_000)], '2026-02-20')
    expect(s.kind).toBe('ahead')
    if (s.kind === 'ahead') expect(s.days).toBe(20)
  })

  it('atrasada con lo que falta para volver al plan', () => {
    const g = goal({ saved: 40_000, deadline: '2026-04-11' })
    const s = goalStatus(g, [c('2026-01-01', 40_000)], '2026-02-20')
    expect(s.kind).toBe('behind')
    if (s.kind === 'behind') expect(s.amount).toBe(10_000)
  })

  it('pasada la fecha', () => {
    expect(goalStatus(goal({ saved: 1, deadline: '2026-01-01' }), [], '2026-02-01').kind).toBe('overdue')
  })

  it('sin fecha y sin ritmo no inventa nada', () => {
    expect(goalStatus(goal({ saved: 1 }), [], '2026-02-01').kind).toBe('noPace')
  })

  it('lograda al llegar al 100 % o marcada', () => {
    expect(goalStatus(goal({ saved: 100_000 }), [], '2026-02-01').kind).toBe('done')
    expect(goalStatus(goal({ saved: 10, achievedAt: '2026-01-05' }), [], '2026-02-01').kind).toBe('done')
  })
})

describe('aporte rápido', () => {
  it('los montos se ajustan al tamaño de la meta y no pasan de lo que falta', () => {
    expect(quickAmounts(goal({ target: 30_000 }))).toEqual([500, 1_000, 2_000])
    expect(quickAmounts(goal({ target: 500_000 }))).toEqual([5_000, 10_000, 20_000])
    expect(quickAmounts(goal({ target: 30_000, saved: 29_200 }))).toEqual([500])
  })

  it('el monto del plan sale del aporte automático o de la fecha', () => {
    expect(planAmount(goal({ autoContribute: { amount: 5_000, frequency: 'monthly', fromAccountId: 'a', nextDate: '2026-02-01' } }), '2026-01-01')).toBe(5_000)
    expect(planAmount(goal({ deadline: '2026-06-01' }), '2026-01-01')).toBeGreaterThan(0)
    expect(planAmount(goal(), '2026-01-01')).toBeNull()
  })
})

describe('la serie de la gráfica', () => {
  it('acumula aportes y resta retiros, y la línea del plan va a la meta', () => {
    const contribs: GoalContribution[] = [
      { id: 'a', goalId: 'g1', amount: 10_000, fromAccountId: 'acc_1', date: '2026-01-10' },
      { id: 'b', goalId: 'g1', amount: 3_000, fromAccountId: 'acc_1', date: '2026-02-10', withdraw: true },
    ]
    const s = goalSeries(goal({ saved: 7_000, deadline: '2026-12-31' }), contribs, '2026-03-01')
    expect(s.real.map(p => p.value)).toEqual([10_000, 7_000, 7_000])
    expect(s.plan?.to.value).toBe(100_000)
    expect(s.end).toBe('2026-12-31')
  })
})

describe('modo ligero', () => {
  it('se enciende con poca memoria o pocos núcleos', () => {
    expect(isLowEndDevice({ deviceMemory: 3, hardwareConcurrency: 8 })).toBe(true)
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(true)
    expect(isLowEndDevice({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false)
    expect(isLowEndDevice(undefined)).toBe(false)
  })
})
