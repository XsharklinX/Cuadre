import { describe, expect, it } from 'vitest'
import { MAX_SPLIT, splitEvenly, splitIsComplete, splitRemainder, toggleCategory } from './categorySplit'

/**
 * REPARTIR UN GASTO ENTRE VARIAS CATEGORÍAS.
 *
 * Lo que más importa aquí es el céntimo. Un reparto que no suma el total deja
 * el movimiento diciendo una cosa y sus categorías otra, y a partir de ahí los
 * informes dejan de cuadrar contra el saldo de la cuenta — el tipo de error que
 * no falla, solo da números distintos.
 */

describe('elegir categorías', () => {
  it('la primera que tocas abre la lista', () => {
    expect(toggleCategory([], 'comida')).toEqual(['comida'])
  })

  /* El orden es lo que el usuario ve numerado: la primera que tocó es la 1. */
  it('conserva el orden en que se eligieron', () => {
    let sel = toggleCategory([], 'comida')
    sel = toggleCategory(sel, 'limpieza')
    sel = toggleCategory(sel, 'salud')
    expect(sel).toEqual(['comida', 'limpieza', 'salud'])
  })

  it('volver a tocarla la quita', () => {
    expect(toggleCategory(['comida', 'limpieza'], 'comida')).toEqual(['limpieza'])
  })

  /*
   * Quitar una del medio NO renumera por otro criterio: las que quedan
   * mantienen su orden relativo, o las etiquetas bailarían bajo el dedo.
   */
  it('al quitar una del medio, las demás conservan su orden', () => {
    expect(toggleCategory(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('no deja pasar del tope', () => {
    const llena = Array.from({ length: MAX_SPLIT }, (_, i) => `c${i}`)
    expect(toggleCategory(llena, 'una-mas')).toEqual(llena)
  })

  it('con la lista llena, quitar sigue funcionando', () => {
    const llena = Array.from({ length: MAX_SPLIT }, (_, i) => `c${i}`)
    expect(toggleCategory(llena, 'c0')).toHaveLength(MAX_SPLIT - 1)
  })
})

describe('repartir el monto', () => {
  it('en partes iguales cuando divide exacto', () => {
    expect(splitEvenly(100, 4)).toEqual([25, 25, 25, 25])
  })

  /*
   * EL CÉNTIMO PERDIDO. RD$ 100 entre 3 con `total / n` da 33.333…, y
   * redondear cada parte deja 99.99: un céntimo que descuadra el libro contra
   * la cuenta. El resto va entero a la primera parte.
   */
  it('reparte el resto sin perder un céntimo', () => {
    const partes = splitEvenly(100, 3)
    expect(partes).toEqual([33.34, 33.33, 33.33])
    expect(partes.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
  })

  it('con decimales de verdad tampoco pierde nada', () => {
    const partes = splitEvenly(2_450.55, 7)
    expect(partes.reduce((a, b) => a + b, 0)).toBeCloseTo(2_450.55, 10)
  })

  it('una sola parte se lleva todo', () => {
    expect(splitEvenly(99.99, 1)).toEqual([99.99])
  })

  it('cero partes no reparte nada', () => {
    expect(splitEvenly(100, 0)).toEqual([])
  })
})

describe('lo que falta por repartir', () => {
  it('dice cuánto queda sin asignar', () => {
    expect(splitRemainder(1_000, [600, 300])).toBe(100)
  })

  it('en negativo cuando se pasaron', () => {
    expect(splitRemainder(1_000, [600, 500])).toBe(-100)
  })

  it('ignora los valores que no son números', () => {
    expect(splitRemainder(100, [50, NaN])).toBe(50)
  })
})

describe('cuándo se puede guardar', () => {
  it('cuando las partes suman el total', () => {
    expect(splitIsComplete(100, [60, 40])).toBe(true)
  })

  it('con el reparto automático también', () => {
    expect(splitIsComplete(100, splitEvenly(100, 3))).toBe(true)
  })

  it('no si falta o sobra dinero', () => {
    expect(splitIsComplete(100, [60, 30])).toBe(false)
    expect(splitIsComplete(100, [60, 50])).toBe(false)
  })

  /* Una sola categoría no es un reparto: eso es un gasto normal. */
  it('no con una sola parte', () => {
    expect(splitIsComplete(100, [100])).toBe(false)
  })

  it('no si alguna parte es cero o negativa', () => {
    expect(splitIsComplete(100, [100, 0])).toBe(false)
    expect(splitIsComplete(100, [120, -20])).toBe(false)
  })

  /* Un céntimo de margen: es el residuo que deja la propia división. */
  it('perdona un céntimo de redondeo', () => {
    expect(splitIsComplete(100, [33.34, 33.33, 33.33])).toBe(true)
  })
})
