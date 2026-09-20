import { describe, expect, it } from 'vitest'
import { projectNetWorth } from './netWorthProjection'
import type { NetWorthPoint } from './helpers'

function point(key: string, value: number): NetWorthPoint {
  return { key, label: key, value }
}

describe('projectNetWorth', () => {
  it('continúa una tendencia lineal perfecta', () => {
    const history = [point('2026-01', 1000), point('2026-02', 1100), point('2026-03', 1200)]
    const projected = projectNetWorth(history, 3)
    expect(projected).toHaveLength(3)
    expect(projected[0].value).toBeCloseTo(1300, 5)
    expect(projected[1].value).toBeCloseTo(1400, 5)
    expect(projected[2].value).toBeCloseTo(1500, 5)
  })

  it('continúa las claves de mes correctamente, cruzando de año', () => {
    const history = [point('2026-11', 1000), point('2026-12', 1100)]
    const projected = projectNetWorth(history, 2)
    expect(projected[0].key).toBe('2027-01')
    expect(projected[1].key).toBe('2027-02')
  })

  it('serie plana (sin variación) proyecta el mismo valor', () => {
    const history = [point('2026-01', 500), point('2026-02', 500), point('2026-03', 500)]
    const projected = projectNetWorth(history, 2)
    expect(projected[0].value).toBeCloseTo(500, 5)
    expect(projected[1].value).toBeCloseTo(500, 5)
  })

  it('con menos de 2 puntos no proyecta nada (evita división por cero)', () => {
    expect(projectNetWorth([point('2026-01', 100)], 3)).toEqual([])
    expect(projectNetWorth([], 3)).toEqual([])
  })

  it('monthsAhead 0 devuelve vacío', () => {
    const history = [point('2026-01', 100), point('2026-02', 200)]
    expect(projectNetWorth(history, 0)).toEqual([])
  })

  it('tendencia negativa (patrimonio bajando) se proyecta hacia abajo', () => {
    const history = [point('2026-01', 3000), point('2026-02', 2000), point('2026-03', 1000)]
    const projected = projectNetWorth(history, 1)
    expect(projected[0].value).toBeCloseTo(0, 5)
  })
})
