/**
 * VIAJAR EN EL TIEMPO — solo con el modo desarrollador abierto.
 *
 * Casi todo lo que hay que probar en una app de finanzas ocurre *con el
 * calendario*: el corte de una tarjeta, su fecha de pago, los recurrentes del
 * día 1, el respaldo semanal, el cierre de mes. Probarlo de verdad significaba
 * esperar días reales o cambiar la hora del sistema, que rompe otras cosas.
 *
 * El desfase se aplica en UN solo punto —`localToday()` en `helpers.ts`, que
 * es de dónde saca la app su idea de "hoy"— y en `devNow()`, para lo que
 * razona en milisegundos. NO toca el reloj del sistema ni `new Date()` en
 * general: lo que se mueve es lo que la app *cree* que es hoy, que es
 * exactamente lo que hay que mover para probar.
 *
 * Vive en su propio módulo, sin importar nada, porque `helpers.ts` lo usa y
 * cualquier import cruzado montaría un ciclo.
 */

const KEY = 'cuadre-dev-clock-offset'

/**
 * Desfase en milisegundos respecto al reloj real. Se lee de `localStorage` una
 * sola vez y se guarda en memoria: `localToday()` se llama cientos de veces
 * por render y tocar `localStorage` en cada una se nota.
 */
let offsetMs = read()

function read(): number {
  try {
    const raw = localStorage.getItem(KEY)
    const value = raw ? Number(raw) : 0
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

/** Milisegundos por día, para convertir el desfase a algo legible. */
const DAY = 86_400_000

export function getDevOffsetMs(): number {
  return offsetMs
}

/** Días completos de desfase; 0 = el reloj real. */
export function getDevOffsetDays(): number {
  return Math.round(offsetMs / DAY)
}

/** ¿Estamos viendo una fecha que no es la de verdad? */
export function isTimeTravelling(): boolean {
  return offsetMs !== 0
}

/**
 * Mueve el reloj de la app `days` días respecto al REAL (no acumulativo: 0
 * siempre vuelve a hoy). Se persiste para que sobreviva al reinicio, porque
 * media prueba interesante consiste justo en reiniciar la app con otra fecha.
 */
export function setDevOffsetDays(days: number): void {
  offsetMs = Math.trunc(days) * DAY
  try {
    if (offsetMs === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, String(offsetMs))
  } catch {
    // Sin almacenamiento el viaje dura lo que dure la sesión. Aceptable.
  }
}

/** `Date.now()` corregido con el desfase. */
export function devNow(): number {
  return Date.now() + offsetMs
}

/** `new Date()` corregida con el desfase. */
export function devDate(): Date {
  return new Date(devNow())
}
