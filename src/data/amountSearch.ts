/**
 * BUSCAR POR MONTO, CUANDO NO RECUERDAS LA CIFRA EXACTA.
 *
 * ── LO QUE YA FUNCIONABA ──────────────────────────────────────────────
 * Conviene decirlo porque es fácil equivocarse al mirar esto por encima: la
 * búsqueda global YA encontraba montos. El texto buscable de cada movimiento
 * incluye `String(tx.amount)` y su versión formateada, así que teclear «2450»
 * encuentra el gasto de RD$ 2,450 desde hace versiones. Y `parseSearchQuery`
 * entiende «más de 1000» y «menos de 500».
 *
 * ── LO QUE NO ─────────────────────────────────────────────────────────
 * Esa búsqueda es de SUBCADENA sobre un número, y eso tiene dos caras malas:
 *
 * · Encuentra de más. «245» casa con 245, con 2,450 y con 12,450, porque todos
 *   contienen esos tres dígitos. El orden del resultado no dice nada.
 * · Encuentra de menos. Nadie recuerda «2,448»: recuerda «unos dos mil
 *   quinientos». Teclear 2500 no encontraba 2,448 aunque sea justo lo que se
 *   buscaba, porque como texto no se parecen en nada.
 *
 * Esto añade lo segundo sin quitar lo primero: cuando lo tecleado es SOLO un
 * número, además del match de texto de siempre se buscan los movimientos
 * cercanos a esa cifra, y se ordenan por cercanía. Lo que hoy aparece seguirá
 * apareciendo; lo que falta se suma.
 */

/**
 * El margen: un 2 % arriba y abajo, nunca menos de un peso.
 *
 * Sale de para qué sirve esto. Quien recuerda «unos dos mil quinientos» no
 * recuerda los centavos, pero tampoco está pensando en algo de cuatro mil: un
 * porcentaje acompaña a la magnitud de la cifra, que es como funciona la
 * memoria para el dinero. El mínimo de un peso evita que en cifras pequeñas el
 * margen se quede en nada (el 2 % de 20 son 40 centavos).
 */
const TOLERANCIA = 0.02
const MARGEN_MINIMO = 1

export interface NearAmount {
  value: number
  /** Extremos del rango, ya calculados: la interfaz los enseña al usuario. */
  min: number
  max: number
}

/**
 * Lee la consulta como una cifra, si es que es solo eso.
 *
 * Devuelve `null` en cuanto hay algo más que un número: «super 2450» es una
 * búsqueda de texto con un número dentro, y convertirla en un rango de montos
 * sería ignorar la mitad de lo que el usuario escribió.
 */
export function parseNearAmount(raw: string): NearAmount | null {
  const limpio = raw.trim()
  if (!limpio) return null

  // Se aceptan las dos convenciones de miles y decimales que convive en RD
  // ("1,234.50" y "1.234,50"), más el símbolo de moneda delante.
  const soloCifra = /^[$ ]*\d[\d.,\s]*$/.test(limpio)
  if (!soloCifra) return null

  const sinEspacios = limpio.replace(/[$\s]/g, '')
  const value = normalizarCifra(sinEspacios)
  // Un cero no acota nada: su rango no tiene sentido y además casaría con
  // cualquier movimiento de importe diminuto.
  if (!Number.isFinite(value) || value <= 0) return null

  const margen = Math.max(MARGEN_MINIMO, value * TOLERANCIA)
  return {
    value,
    min: Math.max(0, redondear(value - margen)),
    max: redondear(value + margen),
  }
}

/** «1,234.50» y «1.234,50» son el mismo número escrito de dos maneras. */
function normalizarCifra(raw: string): number {
  if (raw.includes(',') && raw.includes('.')) {
    // El separador decimal es el que aparece MÁS A LA DERECHA.
    return raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? parseFloat(raw.replace(/\./g, '').replace(',', '.'))
      : parseFloat(raw.replace(/,/g, ''))
  }
  if (raw.includes(',')) {
    // Una coma sola: separador de miles si deja grupos de tres («2,450»),
    // decimal en cualquier otro caso («2,45»).
    return /,\d{3}(?:\D|$)/.test(raw)
      ? parseFloat(raw.replace(/,/g, ''))
      : parseFloat(raw.replace(',', '.'))
  }
  if (raw.includes('.')) {
    return /\.\d{3}(?:\D|$)/.test(raw)
      ? parseFloat(raw.replace(/\./g, ''))
      : parseFloat(raw)
  }
  return parseFloat(raw)
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/** ¿Cae este monto dentro del margen? */
export function matchesNearAmount(amount: number, near: NearAmount): boolean {
  return amount >= near.min && amount <= near.max
}

/**
 * Lo lejos que queda un monto de la cifra buscada.
 *
 * Es lo que ordena los resultados: quien teclea 2500 quiere ver primero el de
 * 2,498 y no el de 2,550, aunque los dos entren en el margen.
 */
export function amountDistance(amount: number, near: NearAmount): number {
  return Math.abs(amount - near.value)
}
