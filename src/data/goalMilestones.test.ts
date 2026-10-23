import { describe, expect, it } from 'vitest'
import { crossedMilestones, milestoneAlertId, topCrossedMilestone } from './goalMilestones'

describe('crossedMilestones', () => {
  it('un aporte que pasa de la mitad cruza el 50', () => {
    expect(crossedMilestones(40_000, 55_000, 100_000)).toEqual([50])
  })

  it('un aporte que no llega al siguiente hito no cruza nada', () => {
    expect(crossedMilestones(55_000, 60_000, 100_000)).toEqual([])
  })

  it('justo en el umbral cuenta como cruzado', () => {
    expect(crossedMilestones(24_999, 25_000, 100_000)).toEqual([25])
  })

  it('quien ya estaba en el umbral no lo vuelve a cruzar', () => {
    expect(crossedMilestones(25_000, 30_000, 100_000)).toEqual([])
  })

  it('un aporte de golpe puede cruzar varios', () => {
    expect(crossedMilestones(0, 80_000, 100_000)).toEqual([25, 50, 75])
  })

  it('completar la meta cruza también el 100', () => {
    expect(crossedMilestones(90_000, 100_000, 100_000)).toEqual([100])
  })

  it('pasarse del objetivo sigue contando como completar', () => {
    expect(crossedMilestones(90_000, 120_000, 100_000)).toEqual([100])
  })

  it('una corrección que resta no celebra nada', () => {
    expect(crossedMilestones(60_000, 40_000, 100_000)).toEqual([])
  })

  it('un aporte de cero no celebra nada', () => {
    expect(crossedMilestones(50_000, 50_000, 100_000)).toEqual([])
  })

  it('una meta sin objetivo no celebra los cuatro hitos con el primer peso', () => {
    expect(crossedMilestones(0, 1, 0)).toEqual([])
    expect(crossedMilestones(0, 1, -5)).toEqual([])
  })

  it('funciona con objetivos pequeños y centavos', () => {
    expect(crossedMilestones(2.4, 2.6, 10)).toEqual([25])
  })
})

describe('topCrossedMilestone', () => {
  it('con varios cruzados devuelve el techo, para no encadenar celebraciones', () => {
    expect(topCrossedMilestone(0, 80_000, 100_000)).toBe(75)
  })

  it('sin cruces devuelve null', () => {
    expect(topCrossedMilestone(55_000, 60_000, 100_000)).toBeNull()
  })

  it('completar la meta gana a los hitos intermedios', () => {
    expect(topCrossedMilestone(0, 100_000, 100_000)).toBe(100)
  })
})

describe('milestoneAlertId', () => {
  it('distingue meta y porcentaje, para que un hito no tape el de otra meta', () => {
    expect(milestoneAlertId('g1', 50)).toBe('goal-ms-g1-50')
    expect(milestoneAlertId('g1', 50)).not.toBe(milestoneAlertId('g2', 50))
    expect(milestoneAlertId('g1', 50)).not.toBe(milestoneAlertId('g1', 75))
  })
})
