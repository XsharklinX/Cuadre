/**
 * LAS DOS FORMAS DE DECIR LO MISMO en una tarjeta de crédito.
 *
 * Nadie mira su tarjeta en términos de "cuánto debo". La app del banco dice
 * "Disponible: RD$ 2,218.55", y eso es lo que la gente teclea donde se le
 * pida un número. Cuando la app solo aceptaba la deuda, ese 2,218.55 entraba
 * como saldo A FAVOR: la tarjeta quedaba "sin usar", con el cupo entero libre
 * y el botón de pagar ofreciendo RD$ 0.00 sobre una deuda real de diez mil.
 *
 * No es un error del usuario, es una pregunta mal hecha. Así que ahora se
 * puede entrar por cualquiera de los dos lados y la app convierte.
 *
 * El libro sigue guardando UNA sola cosa —`balance`, negativo cuando se
 * debe— porque dos campos que dicen lo mismo se desincronizan en cuanto uno
 * se edita sin el otro.
 */

/** Deuda (positiva) a partir del saldo del libro. */
export function owedFromBalance(balance: number): number {
  return Math.max(0, -balance)
}

/** Saldo del libro a partir de la deuda que teclea el usuario. */
export function balanceFromOwed(owed: number): number {
  const amount = Math.max(0, owed)
  return amount > 0 ? -amount : 0
}

/**
 * Cupo libre: lo que el banco llama "disponible".
 *
 * Nunca negativo: pasarse del límite no significa "menos cero disponible",
 * significa que no queda nada. Y un saldo a favor tampoco da más cupo del que
 * la tarjeta tiene.
 */
export function availableFromBalance(balance: number, limit: number): number {
  return Math.max(0, Math.min(limit, limit - owedFromBalance(balance)))
}

/**
 * Saldo del libro a partir del disponible que teclea el usuario.
 *
 * Escribir más que el límite deja la deuda en cero en vez de inventar un
 * saldo a favor: alguien que teclea de más se equivocó de número, no acaba de
 * regalarle dinero al banco.
 */
export function balanceFromAvailable(available: number, limit: number): number {
  const owed = Math.max(0, limit - Math.max(0, available))
  return balanceFromOwed(owed)
}
