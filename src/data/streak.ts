/**
 * LA RACHA DE DÍAS ANOTANDO.
 *
 * Lo difícil de una app de finanzas no es apuntar un gasto: es apuntar el de
 * pasado mañana. Hasta ahora la app reaccionaba igual tanto si anotabas un día
 * como si llevabas treinta seguidos, así que el único esfuerzo que de verdad
 * cuesta sostener era además el único invisible.
 *
 * DOS REGLAS QUE LA HACEN AYUDA Y NO DEUDA:
 *
 * · No castiga. Si se rompe, no hay aviso ni reproche: vuelve a empezar en
 *   silencio. «Perdiste tu racha de 30 días» convierte una ayuda en una
 *   factura, y quien ya se siente mal con su dinero no necesita otra.
 *
 * · El día de hoy no cuenta en contra hasta que termina. Son las ocho de la
 *   mañana y todavía no has anotado nada: la racha de ayer sigue viva. Si
 *   contáramos hoy como fallo, la racha aparecería rota cada mañana.
 *
 * Se calcula desde los movimientos, sin estado guardado: nada que migrar,
 * nada que se desincronice al restaurar una copia de seguridad, y borrar un
 * movimiento ajusta la racha sola.
 */

export interface Streak {
  /** Días seguidos anotando, contando hacia atrás. */
  days: number
  /** Si ya hay algo anotado hoy. La tarjeta lo usa para cambiar el texto. */
  loggedToday: boolean
}

/** Resta un día a una fecha `YYYY-MM-DD`, respetando meses y bisiestos. */
function dayBefore(date: string): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Cuenta los días seguidos con al menos un movimiento anotado.
 *
 * @param dates fechas `YYYY-MM-DD` de los movimientos, en cualquier orden y
 *              con repetidos (varios gastos del mismo día cuentan como uno).
 * @param today la fecha de hoy, `YYYY-MM-DD`.
 */
export function loggingStreak(dates: string[], today: string): Streak {
  const logged = new Set(dates)
  const loggedToday = logged.has(today)

  // Si hoy aún no hay nada, se cuenta desde ayer: la racha de ayer no se
  // rompe hasta que el día de hoy se acaba sin anotar.
  let cursor = loggedToday ? today : dayBefore(today)
  let days = 0
  // El tope evita recorrer años enteros día a día en un libro muy viejo; una
  // racha de cinco años ya no necesita más precisión que «más de 1825».
  while (logged.has(cursor) && days < 1825) {
    days += 1
    cursor = dayBefore(cursor)
  }

  return { days, loggedToday }
}

/**
 * Si la racha merece enseñarse.
 *
 * Con dos días no es una racha, es una casualidad, y una tarjeta que aparece
 * el segundo día gasta el efecto antes de que signifique nada.
 */
export const STREAK_MIN_DAYS = 3

/** Los días redondos en los que la racha se celebra en vez de solo contarse. */
export const STREAK_MILESTONES = [7, 14, 30, 60, 100, 180, 365]

export function isStreakMilestone(days: number): boolean {
  return STREAK_MILESTONES.includes(days)
}
