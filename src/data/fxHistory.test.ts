import { describe, expect, it } from 'vitest'
import {
  changeOver, dayKey, enoughToChart, MAX_DAYS, recordRate, seriesFor, toPath,
  type FxSeries,
} from './fxHistory'

const dia = (d: string) => Date.parse(`${d}T12:00:00Z`)

describe('apuntar tasas', () => {
  it('guarda la tasa del dia', () => {
    const s = recordRate({}, 'DOP', 60.5, dia('2026-09-01'))
    expect(s.DOP).toEqual([{ day: '2026-09-01', rate: 60.5 }])
  })

  /*
   * Las tasas se refrescan cada 12h. Sin un punto por dia habria dos muestras
   * de un martes y una de un miercoles: el martes pesaria el doble y la linea
   * insinuaria un movimiento que no existio.
   */
  it('un punto por dia — gana el ultimo del dia', () => {
    let s = recordRate({}, 'DOP', 60.5, dia('2026-09-01'))
    s = recordRate(s, 'DOP', 60.9, dia('2026-09-01'))
    expect(s.DOP).toEqual([{ day: '2026-09-01', rate: 60.9 }])
  })

  it('dias distintos se acumulan, en orden', () => {
    let s = recordRate({}, 'DOP', 61, dia('2026-09-02'))
    s = recordRate(s, 'DOP', 60, dia('2026-09-01'))
    expect(s.DOP!.map(p => p.day)).toEqual(['2026-09-01', '2026-09-02'])
  })

  it('cada moneda lleva su propia serie', () => {
    let s = recordRate({}, 'DOP', 60, dia('2026-09-01'))
    s = recordRate(s, 'EUR', 0.92, dia('2026-09-01'))
    expect(s.DOP).toHaveLength(1)
    expect(s.EUR).toEqual([{ day: '2026-09-01', rate: 0.92 }])
  })

  /* Un cero convertiria el cambio porcentual en infinito. */
  it('descarta tasas que no son numeros positivos', () => {
    const base: FxSeries = {}
    expect(recordRate(base, 'DOP', 0, dia('2026-09-01'))).toBe(base)
    expect(recordRate(base, 'DOP', -3, dia('2026-09-01'))).toBe(base)
    expect(recordRate(base, 'DOP', NaN, dia('2026-09-01'))).toBe(base)
    expect(recordRate(base, 'DOP', Infinity, dia('2026-09-01'))).toBe(base)
  })

  it('no guarda mas dias que el tope', () => {
    let s: FxSeries = {}
    for (let i = 0; i < MAX_DAYS + 30; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
      s = recordRate(s, 'DOP', 60 + i, dia(d))
    }
    expect(s.DOP).toHaveLength(MAX_DAYS)
    // Se tiran los MAS VIEJOS, no los recientes.
    expect(s.DOP![s.DOP!.length - 1].rate).toBe(60 + MAX_DAYS + 29)
  })

  /* El dia se calcula en UTC: si dependiera de la zona del telefono, viajar
     cambiaria el historial ya guardado. */
  it('el dia es el mismo en cualquier huso', () => {
    expect(dayKey(Date.parse('2026-09-01T23:30:00Z'))).toBe('2026-09-01')
    expect(dayKey(Date.parse('2026-09-02T00:30:00Z'))).toBe('2026-09-02')
  })
})

describe('leer la serie', () => {
  const serie = (n: number): FxSeries => {
    let s: FxSeries = {}
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
      s = recordRate(s, 'DOP', 60 + i, dia(d))
    }
    return s
  }

  it('devuelve solo los ultimos N dias', () => {
    expect(seriesFor(serie(40), 'DOP', 7)).toHaveLength(7)
  })

  it('una moneda sin historial devuelve vacio', () => {
    expect(seriesFor({}, 'EUR', 30)).toEqual([])
  })

  /*
   * Con un solo punto NO se dibuja. Una linea de un punto no es una tendencia,
   * y pintarla afirma algo que no se sabe.
   */
  it('hace falta mas de un punto para dibujar', () => {
    expect(enoughToChart(seriesFor(serie(1), 'DOP', 30))).toBe(false)
    expect(enoughToChart(seriesFor(serie(2), 'DOP', 30))).toBe(true)
  })
})

describe('cuanto se movio', () => {
  const pts = (...rates: number[]) =>
    rates.map((rate, i) => ({ day: `2026-09-0${i + 1}`, rate }))

  it('compara el primero con el ultimo', () => {
    const c = changeOver(pts(60, 62, 61.5))!
    expect(c.first).toBe(60)
    expect(c.last).toBe(61.5)
    expect(c.delta).toBeCloseTo(1.5, 6)
    expect(c.percent).toBeCloseTo(2.5, 6)
    expect(c.direction).toBe('up')
  })

  it('a la baja', () => {
    expect(changeOver(pts(60, 58))!.direction).toBe('down')
  })

  /* Con dos decimales en pantalla, una milesima se veria como "sin cambio"
     con una flecha verde al lado. */
  it('un movimiento invisible es "sin cambio"', () => {
    expect(changeOver(pts(60, 60.0001))!.direction).toBe('flat')
    expect(changeOver(pts(60, 60))!.direction).toBe('flat')
  })

  it('da el minimo y el maximo del tramo', () => {
    const c = changeOver(pts(60, 65, 58, 61))!
    expect(c.min).toBe(58)
    expect(c.max).toBe(65)
  })

  it('sin puntos suficientes no inventa nada', () => {
    expect(changeOver(pts(60))).toBeNull()
    expect(changeOver([])).toBeNull()
  })
})

describe('dibujar la linea', () => {
  const pts = (...rates: number[]) =>
    rates.map((rate, i) => ({ day: `2026-09-0${i + 1}`, rate }))

  it('el primer punto abre con M y los demas con L', () => {
    const d = toPath(pts(60, 61, 62), 100, 40)
    expect(d.startsWith('M')).toBe(true)
    expect(d.match(/L/g)).toHaveLength(2)
  })

  /*
   * El eje se ajusta al tramo, no a cero: entre 60.10 y 60.40 contra un eje
   * desde cero saldria una raya plana y el movimiento —lo que se viene a
   * mirar— desapareceria.
   */
  it('el minimo toca abajo y el maximo arriba', () => {
    const d = toPath(pts(60.1, 60.4), 100, 40, 2)
    const ys = [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map(m => Number(m[1]))
    expect(Math.max(...ys)).toBeCloseTo(38, 5)  // el menor valor, abajo
    expect(Math.min(...ys)).toBeCloseTo(2, 5)   // el mayor valor, arriba
  })

  it('una serie plana no divide entre cero', () => {
    const d = toPath(pts(60, 60, 60), 100, 40)
    expect(d).not.toContain('NaN')
  })

  it('sin puntos suficientes no dibuja', () => {
    expect(toPath(pts(60), 100, 40)).toBe('')
  })
})
