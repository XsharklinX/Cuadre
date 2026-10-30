import { convertCurrency } from './currencies'
import type { CurrencyCode } from '@/types'

/**
 * VER EL NEGOCIO EN PESOS O EN DÓLARES.
 *
 * ── POR QUÉ HACE FALTA ────────────────────────────────────────────────
 * Lo que pagas está en dólares —las suscripciones— y lo que cobras en pesos.
 * La pantalla lo enseñaba todo en la divisa de la app, así que para saber si
 * una suscripción de US$14.99 te sale a cuenta había que convertir de cabeza.
 *
 * ── Y POR QUÉ ESTO ES UN MÓDULO Y NO UNA LÍNEA ────────────────────────
 * Porque convertir mal es cómo nacieron los dos errores que esta versión
 * arregla. «Has puesto 13,671» y «ahorras US$3,420» salieron los dos de
 * restar números que no estaban en la misma divisa.
 *
 * Teniendo la conversión en un sitio, la regla es una: antes de restar,
 * sumar o comparar dos montos, los dos pasan por aquí.
 */

export type ViewCurrency = CurrencyCode

/** Convierte un monto a la divisa en que se está mirando el negocio. */
export function toView(amount: number, from: CurrencyCode, view: ViewCurrency): number {
  if (from === view) return amount
  return Math.round(convertCurrency(amount, from, view) * 100) / 100
}

/**
 * Las divisas entre las que merece la pena poder cambiar.
 *
 * La base de la app, más las de sus servicios y sus clientes. No las treinta
 * del conversor: un selector con treinta opciones para elegir entre dos es
 * peor que no tener selector.
 */
export function viewOptions(
  base: CurrencyCode,
  used: Array<CurrencyCode | undefined>,
): CurrencyCode[] {
  const fuera: CurrencyCode[] = [base]
  for (const c of used) {
    if (c && !fuera.includes(c)) fuera.push(c)
  }
  return fuera
}

/**
 * El equivalente en la OTRA divisa, para la línea pequeña.
 *
 * Existe para no tener que cambiar ida y vuelta: la cifra grande está en la
 * que elegiste y debajo, en pequeño, lo que es en la otra. `null` cuando solo
 * hay una divisa en juego y repetir el mismo número no diría nada.
 */
export function alsoIn(
  amount: number,
  view: ViewCurrency,
  options: CurrencyCode[],
): { amount: number; currency: CurrencyCode } | null {
  const otra = options.find(c => c !== view)
  if (!otra) return null
  return { amount: toView(amount, view, otra), currency: otra }
}
