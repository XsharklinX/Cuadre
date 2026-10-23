/**
 * UN GASTO EN VARIAS CATEGORÍAS.
 *
 * Una compra del supermercado trae comida, limpieza y a veces una medicina.
 * Meterla entera en «Súper» miente en los informes, y partirla a mano en tres
 * movimientos obliga a hacer cuentas que la app puede hacer sola.
 *
 * Aquí vive solo la aritmética y el orden de selección. El libro ya sabía
 * guardar `splits`; lo que faltaba era poder elegirlas.
 */

/** Cuántas categorías se pueden combinar en un movimiento. */
export const MAX_SPLIT = 6

/**
 * Añade o quita una categoría de la selección, conservando el ORDEN.
 *
 * El orden importa porque es lo que el usuario ve numerado: la primera que
 * tocó es la 1. Si al quitar una del medio se renumeraran por otro criterio,
 * las etiquetas bailarían bajo el dedo.
 */
export function toggleCategory(selected: string[], id: string): string[] {
  if (selected.includes(id)) return selected.filter(x => x !== id)
  if (selected.length >= MAX_SPLIT) return selected
  return [...selected, id]
}

/**
 * Reparte un total entre `n` partes, en céntimos exactos.
 *
 * El resto va a la PRIMERA parte, no a la última ni diluido: RD$ 100 entre 3
 * son 33.34 + 33.33 + 33.33, y la suma vuelve a dar 100 exacto. Repartir con
 * `total / n` a secas deja un céntimo perdido que luego descuadra el libro
 * contra el saldo de la cuenta.
 */
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return []
  const centimos = Math.round(total * 100)
  const base = Math.floor(centimos / n)
  const sobra = centimos - base * n
  return Array.from({ length: n }, (_, i) => (base + (i < sobra ? 1 : 0)) / 100)
}

/**
 * Lo que falta por repartir. Positivo = queda dinero sin asignar.
 *
 * Se redondea a céntimos para que una suma de decimales no deje un residuo
 * invisible que impida guardar.
 */
export function splitRemainder(total: number, amounts: number[]): number {
  const suma = amounts.reduce((acc, n) => acc + (Number.isFinite(n) ? n : 0), 0)
  return Math.round((total - suma) * 100) / 100
}

/**
 * ¿Se puede guardar este reparto?
 *
 * El libro exige que las partes sumen el total: si no, el movimiento diría una
 * cosa y sus categorías otra, y los informes dejarían de cuadrar contra el
 * saldo. Se admite un céntimo de margen por el redondeo de la división.
 */
export function splitIsComplete(total: number, amounts: number[]): boolean {
  if (amounts.length < 2) return false
  if (amounts.some(n => !Number.isFinite(n) || n <= 0)) return false
  return Math.abs(splitRemainder(total, amounts)) <= 0.01
}
