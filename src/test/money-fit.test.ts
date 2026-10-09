import { describe, expect, it } from 'vitest'
import { fitScale } from '@/components/ui/AnimatedMoney'
import { fmt } from '@/data/helpers'

/**
 * UNA CIFRA DE DINERO NO SE PUEDE RECORTAR.
 *
 * En la franja de resumen —Ingresos · Gastos · Balance total— las tres cifras
 * comparten el ancho de la pantalla en tres columnas de unos 115px. Con saldos
 * de millones el texto no cabía y el CSS lo cortaba con puntos suspensivos:
 * «RD$ 1,166,62…».
 *
 * Eso no es solo feo. Es ILEGIBLE Y ENGAÑOSO: esa cifra recortada parece cien
 * mil pesos menos de los que son, y en una app de finanzas la cifra equivocada
 * es peor que ninguna cifra.
 *
 * `fitScale` encoge la letra según lo larga que sea la cadena ya formateada,
 * así que el número siempre entra entero. Este test fija los casos reales
 * dominicanos —de unos cientos a decenas de millones— porque el error se
 * cometió justo al pasar de uno a otro.
 */

const peso = (n: number) => fmt(n, 'DOP')

describe('encoger la letra para que la cifra quepa', () => {
  it('una cifra corta no se toca', () => {
    // RD$ 5,788.20 → cabe de sobra a tamaño completo.
    expect(fitScale(peso(5_788.2))).toBe(1)
  })

  /*
   * El caso de la captura: el balance que se cortaba. Tiene que encoger, no
   * quedarse a tamaño completo.
   */
  it('un millon con centavos encoge', () => {
    expect(fitScale(peso(1_166_625.4))).toBeLessThan(1)
  })

  it('cuanto mas larga la cifra, mas encoge', () => {
    const escalas = [5_788.2, 1_166_625.4, 45_800_300.55, 999_888_777.66].map(n => fitScale(peso(n)))
    for (let i = 1; i < escalas.length; i++) {
      expect(escalas[i], `la cifra ${i} deberia encoger al menos tanto como la anterior`)
        .toBeLessThanOrEqual(escalas[i - 1])
    }
  })

  /*
   * Hay un suelo: por debajo de cierto tamaño la cifra deja de leerse, y una
   * cifra ilegible no es mejor que una cortada. Se prefiere el suelo a seguir
   * encogiendo sin fin.
   */
  it('nunca encoge por debajo del 70%', () => {
    expect(fitScale(peso(999_999_999_999.99))).toBeGreaterThanOrEqual(0.7)
    expect(fitScale('x'.repeat(200))).toBeGreaterThanOrEqual(0.7)
  })

  it('nunca agranda', () => {
    for (const n of [0, 1, 250, 5_788.2, 1_000_500.75, 1_166_625.4]) {
      expect(fitScale(peso(n)), `${peso(n)}`).toBeLessThanOrEqual(1)
    }
  })

  /*
   * El negativo lleva un signo mas: es un caracter mas que empuja hacia el
   * recorte, asi que nunca puede encoger MENOS que su positivo.
   */
  it('un negativo no encoge menos que el mismo numero en positivo', () => {
    const p = fitScale(peso(1_166_625.4))
    const n = fitScale('-' + peso(1_166_625.4))
    expect(n).toBeLessThanOrEqual(p)
  })
})
