import type { CurrencyCode } from '@/types'

/**
 * CÓMO SE HA MOVIDO UNA MONEDA.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ EL HISTORIAL SE CONSTRUYE AQUÍ Y NO SE DESCARGA
 *
 * Lo natural sería pedirle la serie histórica a una API. No se puede: la
 * moneda que importa en esta app es el PESO DOMINICANO, y ninguna fuente
 * gratuita y sin clave lo publica. El BCE —que es quien alimenta a
 * Frankfurter y compañía— cubre unas treinta monedas y el DOP no está entre
 * ellas; se comprobó. Un gráfico que funcione para el euro y el dólar pero no
 * para la moneda del país de la app no es la funcionalidad que se pidió.
 *
 * Así que la serie se construye con lo que la app YA descarga: cada vez que
 * `syncExchangeRates` trae tasas frescas, se apunta un punto. No hace falta
 * una fuente nueva, ni una clave, ni un servidor — y encaja con que la app sea
 * 100% local, que fue una decisión deliberada.
 *
 * EL PRECIO DE ESTO, Y HAY QUE DECIRLO: el gráfico empieza VACÍO y se va
 * llenando con los días de uso. No hay forma de rellenar hacia atrás. Por eso
 * `enoughToChart` existe y la pantalla tiene que saber decir "todavía no hay
 * suficiente" en vez de dibujar una línea de un solo punto, que miente sobre
 * lo que se sabe.
 */

export interface FxPoint {
  /** Día en formato YYYY-MM-DD. */
  day: string
  /** Cuántas unidades de esta moneda vale 1 USD. */
  rate: number
}

/**
 * Cuántos días se guardan.
 *
 * Con nueve monedas y un punto diario, medio año son ~1.600 números: cabe de
 * sobra. Pero sin tope crece para siempre en el mismo almacenamiento donde
 * vive el libro de cuentas, y el libro es lo que no se puede perder.
 */
export const MAX_DAYS = 180

/** Mínimo para que una línea signifique algo. Con un punto no hay tendencia. */
const MIN_POINTS = 2

export type FxSeries = Partial<Record<CurrencyCode, FxPoint[]>>

/** El día de una fecha, en UTC, para que no cambie según dónde esté el usuario. */
export function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}

/**
 * Apunta la tasa del día. Devuelve la serie nueva.
 *
 * UN PUNTO POR DÍA, y gana el último. Las tasas se refrescan cada 12h, así que
 * sin esto habría dos puntos diarios y el eje del tiempo dejaría de ser
 * regular: dos muestras de un martes y una de un miércoles dibujan un martes
 * que pesa el doble, y la línea insinúa un movimiento que no existió.
 */
export function recordRate(
  series: FxSeries,
  code: CurrencyCode,
  rate: number,
  at: number,
): FxSeries {
  // Una tasa que no es un número positivo y finito no se guarda: entraría en
  // el grafico y en los porcentajes, y un cero convierte el cambio en
  // infinito.
  if (!Number.isFinite(rate) || rate <= 0) return series

  const day = dayKey(at)
  const previos = series[code] ?? []
  const sinHoy = previos.filter(p => p.day !== day)
  const next = [...sinHoy, { day, rate }]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-MAX_DAYS)

  return { ...series, [code]: next }
}

/** Los últimos `days` días de una moneda, en orden. */
export function seriesFor(series: FxSeries, code: CurrencyCode, days: number): FxPoint[] {
  return (series[code] ?? []).slice(-days)
}

/** ¿Hay bastante para dibujar una línea honesta? */
export function enoughToChart(points: FxPoint[]): boolean {
  return points.length >= MIN_POINTS
}

export interface FxChange {
  /** Diferencia absoluta entre el primer y el último punto. */
  delta: number
  /** La misma diferencia en porcentaje. */
  percent: number
  direction: 'up' | 'down' | 'flat'
  first: number
  last: number
  min: number
  max: number
}

/**
 * Cuánto se movió en el tramo que se está viendo.
 *
 * Se compara el primer punto con el último, no con el mínimo o el máximo: es
 * lo que responde «¿está más cara que hace un mes?», que es la pregunta.
 */
export function changeOver(points: FxPoint[]): FxChange | null {
  if (points.length < MIN_POINTS) return null

  const rates = points.map(p => p.rate)
  const first = rates[0]
  const last = rates[rates.length - 1]
  const delta = last - first

  return {
    delta,
    percent: (delta / first) * 100,
    // El umbral evita que un movimiento invisible se pinte como subida: con
    // dos decimales en pantalla, una milesima se veria como "sin cambio" con
    // una flecha verde al lado.
    direction: Math.abs(delta / first) < 0.00005 ? 'flat' : delta > 0 ? 'up' : 'down',
    first,
    last,
    min: Math.min(...rates),
    max: Math.max(...rates),
  }
}

/**
 * Los puntos convertidos a coordenadas de un `viewBox` de `w` x `h`.
 *
 * El eje vertical se ajusta al mínimo y al máximo DEL TRAMO, no a cero: una
 * moneda que se mueve entre 60.10 y 60.40 contra un eje que arranca en cero
 * sale como una raya plana, y el movimiento —que es justo lo que se viene a
 * mirar— desaparece.
 */
export function toPath(points: FxPoint[], w: number, h: number, pad = 2): string {
  if (points.length < MIN_POINTS) return ''

  const rates = points.map(p => p.rate)
  const min = Math.min(...rates)
  const max = Math.max(...rates)
  // Serie plana: una recta a media altura. Sin esto se divide entre cero.
  const span = max - min || 1
  const alto = h - pad * 2

  return points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w
      const y = pad + alto - ((p.rate - min) / span) * alto
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
