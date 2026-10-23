import { monthKey, prevMonthKey, totals } from './helpers'
import type { Transaction } from '@/types'

/**
 * EL MES QUE CIERRAS EN VERDE.
 *
 * El mes cambiaba y no pasaba absolutamente nada. Si gastaste menos de lo que
 * ingresaste, eso es exactamente lo que la app existe para ayudarte a
 * conseguir, y es lo único que merece celebrarse de verdad en una app de
 * dinero: no gastar, sino que haya sobrado.
 *
 * TRES DECISIONES:
 *
 * · Solo se dice cuando el mes salió BIEN. Si te pasaste, la app se calla.
 *   Nadie necesita que su teléfono le recuerde que gastó de más, y un aviso
 *   así es lo que hace que la gente deje de abrir la app justo el mes en que
 *   más falta le hace.
 *
 * · Solo durante los primeros días del mes siguiente. Un resumen de octubre el
 *   23 de noviembre no es una noticia, es un trasto.
 *
 * · Necesita un mes con movimientos de verdad. Un mes con un solo ingreso y
 *   nada más «cierra en verde» sin que eso signifique nada.
 */

/** Hasta qué día del mes nuevo tiene sentido hablar del anterior. */
export const CLOSE_WINDOW_DAYS = 7

/** Movimientos mínimos para que el mes cuente como vivido. */
const MIN_TX = 4

export interface MonthClose {
  /** `YYYY-MM` del mes cerrado. */
  monthKey: string
  income: number
  expense: number
  /** Lo que sobró. Siempre positivo: si no sobró, no hay informe. */
  net: number
  /** Lo que sobró el mes anterior a ése, o `null` si no hay con qué comparar. */
  prevNet: number | null
  /** Meses seguidos cerrados en verde, contando éste. */
  greenRun: number
}

/** Lo que sobró en un mes, o `null` si ese mes no tuvo bastante vida. */
function netOfMonth(txns: Transaction[], key: string): number | null {
  const delMes = txns.filter(t => monthKey(t.date) === key)
  if (delMes.length < MIN_TX) return null
  const { income, expense } = totals(delMes)
  return income - expense
}

/**
 * El informe del mes recién cerrado, si hay algo bueno que contar.
 *
 * @param txns  los movimientos, ya convertidos a la divisa base.
 * @param today la fecha de hoy, `YYYY-MM-DD`.
 */
export function lastMonthClose(txns: Transaction[], today: string): MonthClose | null {
  const dayOfMonth = Number(today.slice(8, 10))
  if (!(dayOfMonth >= 1 && dayOfMonth <= CLOSE_WINDOW_DAYS)) return null

  const cerrado = prevMonthKey(today.slice(0, 7))
  const delMes = txns.filter(t => monthKey(t.date) === cerrado)
  if (delMes.length < MIN_TX) return null

  const { income, expense } = totals(delMes)
  const net = income - expense
  if (net <= 0) return null

  // La racha de meses en verde: se cuenta hacia atrás y se corta en el primer
  // mes que no lo fue o del que no hay datos suficientes para afirmarlo.
  let greenRun = 1
  let cursor = prevMonthKey(cerrado)
  // Doce es todo lo que cabe decir en una frase; más atrás ya no es noticia.
  while (greenRun < 12) {
    const anterior = netOfMonth(txns, cursor)
    if (anterior === null || anterior <= 0) break
    greenRun += 1
    cursor = prevMonthKey(cursor)
  }

  return {
    monthKey: cerrado,
    income,
    expense,
    net,
    prevNet: netOfMonth(txns, prevMonthKey(cerrado)),
    greenRun,
  }
}

/** Clave para descartar el informe de un mes concreto. */
export function monthCloseAlertId(key: string): string {
  return `month-close-${key}`
}
