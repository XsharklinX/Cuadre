import { describe, expect, it } from 'vitest'
import { computeVerdict, savingsRate, type VerdictInput } from './analyticsVerdict'
import type { Totals } from '@/types'

const totals = (income: number, expense: number): Totals =>
  ({ income, expense, net: income - expense })

const input = (over: Partial<VerdictInput> = {}): VerdictInput => ({
  current: totals(60_000, 40_000),
  previous: totals(60_000, 40_000),
  txCount: 25,
  noPrevious: false,
  ...over,
})

describe('no opinar sin datos', () => {
  it('con menos de 3 movimientos no emite juicio', () => {
    // Una app que dice "vas bien" sobre dos movimientos está adivinando, y el
    // usuario lo nota.
    expect(computeVerdict(input({ txCount: 2 })).key).toBe('verdictNoData')
    expect(computeVerdict(input({ txCount: 0 })).key).toBe('verdictNoData')
  })

  it('a partir de 3 sí opina', () => {
    expect(computeVerdict(input({ txCount: 3 })).key).not.toBe('verdictNoData')
  })
})

describe('gastar más de lo que entra gana sobre todo', () => {
  it('lo dice aunque hayas gastado menos que el mes pasado', () => {
    // Es el hecho más importante que puede haber: bajar el gasto un 30% y
    // seguir en rojo no es una buena noticia.
    const v = computeVerdict(input({
      current: totals(30_000, 45_000),
      previous: totals(60_000, 70_000),
    }))
    expect(v.key).toBe('verdictNegativeNet')
    expect(v.tone).toBe('bad')
  })

  it('el héroe es cuánto te pasaste, en positivo', () => {
    const v = computeVerdict(input({ current: totals(30_000, 45_000) }))
    expect(v.hero).toBe(15_000)
    expect(v.heroKind).toBe('overspent')
  })
})

describe('comparación con el período anterior', () => {
  it('avisa cuando el gasto sube de verdad', () => {
    const v = computeVerdict(input({
      current: totals(60_000, 50_000),
      previous: totals(60_000, 40_000),
    }))
    expect(v.key).toBe('verdictSpendingMore')
    expect(v.tone).toBe('warn')
    expect(v.params.pct).toBe(25)
  })

  it('felicita cuando baja de verdad', () => {
    const v = computeVerdict(input({
      current: totals(60_000, 30_000),
      previous: totals(60_000, 40_000),
    }))
    expect(v.key).toBe('verdictSpendingLess')
    expect(v.tone).toBe('good')
    expect(v.params.pct).toBe(25)
  })

  it('una variación pequeña es ruido de calendario, no un cambio', () => {
    // Un mes tiene 30 o 31 días y los pagos caen distinto. Llamar "cambio" a
    // un 4% convierte la pantalla en una alarma que nadie cree.
    const v = computeVerdict(input({
      current: totals(60_000, 41_500),
      previous: totals(60_000, 40_000),
    }))
    expect(v.key).toBe('verdictSteady')
    expect(v.tone).toBe('neutral')
  })

  it('el umbral de ruido está en 8%', () => {
    const justUnder = computeVerdict(input({
      current: totals(60_000, 42_800), previous: totals(60_000, 40_000),
    }))
    const justOver = computeVerdict(input({
      current: totals(60_000, 43_600), previous: totals(60_000, 40_000),
    }))
    expect(justUnder.key).toBe('verdictSteady')
    expect(justOver.key).toBe('verdictSpendingMore')
  })
})

describe('primer período de uso', () => {
  it('no compara contra un mes que no existe', () => {
    const v = computeVerdict(input({ noPrevious: true }))
    expect(v.key).toBe('verdictFirstMonth')
  })

  it('tampoco compara si el mes anterior no tuvo gasto', () => {
    // Dividir entre cero daría porcentajes infinitos.
    const v = computeVerdict(input({ previous: totals(0, 0) }))
    expect(v.key).toBe('verdictFirstMonth')
  })
})

describe('tasa de ahorro', () => {
  it('calcula el porcentaje guardado', () => {
    expect(savingsRate(totals(100_000, 75_000))).toBe(25)
  })

  it('sin ingresos no hay tasa, no es cero', () => {
    // "Ahorraste ∞%" o "0%" son ambos mentira si no entró nada.
    expect(savingsRate(totals(0, 5_000))).toBeNull()
  })

  it('nunca es negativa ni pasa de 100', () => {
    expect(savingsRate(totals(10_000, 50_000))).toBe(0)
    expect(savingsRate(totals(10_000, -5_000))).toBe(100)
  })
})

describe('el veredicto siempre trae una cifra que lo sostiene', () => {
  it('toda salida tiene héroe y tipo de héroe', () => {
    const cases: VerdictInput[] = [
      input({ txCount: 1 }),
      input({ current: totals(10_000, 20_000) }),
      input({ noPrevious: true }),
      input({ current: totals(60_000, 50_000), previous: totals(60_000, 40_000) }),
      input({ current: totals(60_000, 30_000), previous: totals(60_000, 40_000) }),
    ]
    for (const c of cases) {
      const v = computeVerdict(c)
      expect(Number.isFinite(v.hero), v.key).toBe(true)
      expect(['net', 'saved', 'overspent']).toContain(v.heroKind)
    }
  })
})
