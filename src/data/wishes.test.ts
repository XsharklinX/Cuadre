import { describe, expect, it } from 'vitest'
import {
  WAIT_DAYS, daysLeft, savedInYear, sortWishes, waitProgress, wishState, wishesSummary,
  type Wish,
} from './wishes'

const DIA = 86_400_000
const AHORA = new Date(2026, 9, 22, 12).getTime()

let n = 0
function antojo(over: Partial<Wish> = {}): Wish {
  n += 1
  return {
    id: `w${n}`, name: 'Teclado', amount: 6_800,
    createdAt: AHORA - 5 * DIA,
    decideAt: AHORA + 2 * DIA,
    resolvedAt: 0,
    ...over,
  }
}

describe('wishState · la espera de siete días', () => {
  it('antes del día señalado, espera', () => {
    expect(wishState(antojo(), AHORA)).toBe('waiting')
  })

  it('EL DÍA DE DECIDIR es un estado propio', () => {
    /*
     * Es el único momento en que la pantalla tiene que pedir algo. Si todos
     * los días pidiera una decisión, el día que importa ya se habría
     * aprendido a ignorar.
     */
    expect(wishState(antojo({ decideAt: AHORA }), AHORA)).toBe('ready')
    expect(wishState(antojo({ decideAt: AHORA - DIA }), AHORA)).toBe('ready')
  })

  it('una vez resuelto, manda lo que decidiste', () => {
    expect(wishState(antojo({ resolution: 'bought', resolvedAt: AHORA }), AHORA)).toBe('bought')
    expect(wishState(antojo({ resolution: 'skipped', resolvedAt: AHORA }), AHORA)).toBe('skipped')
  })

  it('un antojo resuelto no vuelve a esperar aunque su fecha sea futura', () => {
    const w = antojo({ decideAt: AHORA + 30 * DIA, resolution: 'skipped', resolvedAt: AHORA })
    expect(wishState(w, AHORA)).toBe('skipped')
  })
})

describe('daysLeft y waitProgress', () => {
  it('cuenta los días que faltan', () => {
    expect(daysLeft(antojo({ decideAt: AHORA + 2 * DIA }), AHORA)).toBe(2)
  })

  it('nunca da días negativos', () => {
    expect(daysLeft(antojo({ decideAt: AHORA - 9 * DIA }), AHORA)).toBe(0)
  })

  it('el progreso va de 0 a 1 y se queda ahí', () => {
    const w = antojo({ createdAt: AHORA - 7 * DIA, decideAt: AHORA })
    expect(waitProgress(w, AHORA - 7 * DIA)).toBe(0)
    expect(waitProgress(w, AHORA)).toBe(1)
    expect(waitProgress(w, AHORA + 99 * DIA)).toBe(1)
    expect(waitProgress(w, AHORA - 3.5 * DIA)).toBeCloseTo(0.5, 2)
  })

  it('una espera de cero días no divide entre cero', () => {
    const w = antojo({ createdAt: AHORA, decideAt: AHORA })
    expect(waitProgress(w, AHORA)).toBe(1)
  })
})

describe('wishesSummary', () => {
  const lista = [
    antojo({ amount: 6_800, decideAt: AHORA + 2 * DIA }),
    antojo({ amount: 4_500, decideAt: AHORA }),
    antojo({ amount: 3_000, resolution: 'skipped', resolvedAt: AHORA - DIA }),
    antojo({ amount: 1_200, resolution: 'skipped', resolvedAt: AHORA - 2 * DIA }),
    antojo({ amount: 9_000, resolution: 'bought', resolvedAt: AHORA - 3 * DIA }),
  ]

  it('cuenta los que esperan y los que hay que decidir hoy', () => {
    const r = wishesSummary(lista, AHORA)
    expect(r.waiting).toBe(1)
    expect(r.ready).toBe(1)
  })

  it('lo pendiente es el riesgo que tienes sobre la mesa', () => {
    // Los dos sin resolver, estén esperando o listos.
    expect(wishesSummary(lista, AHORA).pending).toBe(11_300)
  })

  it('lo AHORRADO es lo que no compraste', () => {
    const r = wishesSummary(lista, AHORA)
    expect(r.skipped).toBe(2)
    expect(r.saved).toBe(4_200)
  })

  it('lo comprado se cuenta pero no suma a lo ahorrado', () => {
    expect(wishesSummary(lista, AHORA).bought).toBe(1)
  })

  it('sin antojos, todo a cero', () => {
    expect(wishesSummary([], AHORA)).toEqual({
      waiting: 0, ready: 0, pending: 0, skipped: 0, saved: 0, bought: 0,
    })
  })
})

describe('sortWishes · lo que pide algo, primero', () => {
  it('los de decidir hoy van arriba', () => {
    const orden = sortWishes([
      antojo({ id: 'espera', decideAt: AHORA + 3 * DIA }),
      antojo({ id: 'resuelto', resolution: 'skipped', resolvedAt: AHORA }),
      antojo({ id: 'hoy', decideAt: AHORA }),
    ], AHORA)
    expect(orden.map(w => w.id)).toEqual(['hoy', 'espera', 'resuelto'])
  })

  it('entre los que esperan, el que menos le falta', () => {
    const orden = sortWishes([
      antojo({ id: 'lejos', decideAt: AHORA + 6 * DIA }),
      antojo({ id: 'cerca', decideAt: AHORA + 1 * DIA }),
    ], AHORA)
    expect(orden.map(w => w.id)).toEqual(['cerca', 'lejos'])
  })

  it('lo resuelto es historial: lo más reciente arriba', () => {
    const orden = sortWishes([
      antojo({ id: 'viejo', resolution: 'bought', resolvedAt: AHORA - 10 * DIA }),
      antojo({ id: 'nuevo', resolution: 'skipped', resolvedAt: AHORA - DIA }),
    ], AHORA)
    expect(orden.map(w => w.id)).toEqual(['nuevo', 'viejo'])
  })

  it('no toca la lista original', () => {
    const original = [antojo({ id: 'a' }), antojo({ id: 'b', decideAt: AHORA })]
    const copia = [...original]
    sortWishes(original, AHORA)
    expect(original).toEqual(copia)
  })
})

describe('savedInYear', () => {
  it('suma lo descartado en ese año', () => {
    const lista = [
      antojo({ amount: 3_000, resolution: 'skipped', resolvedAt: new Date(2026, 2, 1).getTime() }),
      antojo({ amount: 1_500, resolution: 'skipped', resolvedAt: new Date(2026, 8, 1).getTime() }),
      antojo({ amount: 9_999, resolution: 'skipped', resolvedAt: new Date(2025, 5, 1).getTime() }),
      antojo({ amount: 7_000, resolution: 'bought', resolvedAt: new Date(2026, 4, 1).getTime() }),
    ]
    expect(savedInYear(lista, 2026)).toBe(4_500)
  })

  it('un año sin nada da cero', () => {
    expect(savedInYear([], 2026)).toBe(0)
  })
})

describe('la espera son siete días', () => {
  it('y está dicho en un solo sitio', () => {
    expect(WAIT_DAYS).toBe(7)
  })
})
