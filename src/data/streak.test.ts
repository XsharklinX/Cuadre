import { describe, expect, it } from 'vitest'
import { isStreakMilestone, loggingStreak } from './streak'

describe('loggingStreak', () => {
  it('sin movimientos no hay racha', () => {
    expect(loggingStreak([], '2026-03-10')).toEqual({ days: 0, loggedToday: false })
  })

  it('cuenta los días seguidos hacia atrás desde hoy', () => {
    const fechas = ['2026-03-10', '2026-03-09', '2026-03-08']
    expect(loggingStreak(fechas, '2026-03-10')).toEqual({ days: 3, loggedToday: true })
  })

  it('varios movimientos el mismo día cuentan como un día', () => {
    const fechas = ['2026-03-10', '2026-03-10', '2026-03-10', '2026-03-09']
    expect(loggingStreak(fechas, '2026-03-10').days).toBe(2)
  })

  it('si hoy aún no hay nada, la racha de ayer sigue viva', () => {
    // Son las ocho de la mañana. La racha no se rompe hasta que acabe el día.
    const fechas = ['2026-03-09', '2026-03-08', '2026-03-07']
    expect(loggingStreak(fechas, '2026-03-10')).toEqual({ days: 3, loggedToday: false })
  })

  it('un día saltado corta la racha ahí', () => {
    const fechas = ['2026-03-10', '2026-03-09', '2026-03-07', '2026-03-06']
    expect(loggingStreak(fechas, '2026-03-10').days).toBe(2)
  })

  it('con dos días sin anotar la racha ya es cero', () => {
    const fechas = ['2026-03-08', '2026-03-07']
    expect(loggingStreak(fechas, '2026-03-10').days).toBe(0)
  })

  it('cruza el cambio de mes', () => {
    const fechas = ['2026-03-02', '2026-03-01', '2026-02-28', '2026-02-27']
    expect(loggingStreak(fechas, '2026-03-02').days).toBe(4)
  })

  it('cruza el 29 de febrero de un año bisiesto', () => {
    const fechas = ['2024-03-01', '2024-02-29', '2024-02-28']
    expect(loggingStreak(fechas, '2024-03-01').days).toBe(3)
  })

  it('cruza el cambio de año', () => {
    const fechas = ['2026-01-01', '2025-12-31', '2025-12-30']
    expect(loggingStreak(fechas, '2026-01-01').days).toBe(3)
  })

  it('movimientos futuros no inflan la racha', () => {
    // Un recurrente programado para mañana no es un día ya vivido.
    const fechas = ['2026-03-12', '2026-03-11', '2026-03-10']
    expect(loggingStreak(fechas, '2026-03-10').days).toBe(1)
  })

  it('no se cuelga ni se desborda con un libro muy largo', () => {
    const fechas: string[] = []
    const d = new Date('2026-03-10T00:00:00')
    for (let i = 0; i < 3000; i += 1) {
      fechas.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
      d.setDate(d.getDate() - 1)
    }
    expect(loggingStreak(fechas, '2026-03-10').days).toBe(1825)
  })
})

describe('isStreakMilestone', () => {
  it('los días redondos se celebran', () => {
    expect(isStreakMilestone(7)).toBe(true)
    expect(isStreakMilestone(30)).toBe(true)
    expect(isStreakMilestone(365)).toBe(true)
  })

  it('el resto de los días solo se cuentan', () => {
    expect(isStreakMilestone(6)).toBe(false)
    expect(isStreakMilestone(31)).toBe(false)
    expect(isStreakMilestone(0)).toBe(false)
  })
})
