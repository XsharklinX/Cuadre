/**
 * CUÁNDO PEDIR UNA VALORACIÓN.
 *
 * Pedirla mal es peor que no pedirla: una app que interrumpe al tercer uso
 * recibe estrellas bajas de gente que todavía no la conoce, y esas estrellas
 * no se borran. Las reglas de aquí existen para que la pregunta llegue solo
 * cuando el usuario ya tiene una opinión formada y está en un buen momento.
 *
 * Toda la lógica es pura y probada; el diálogo solo la consulta.
 */

export interface RatingState {
  /** Epoch ms del primer arranque registrado. */
  firstSeenAt: number
  /** Arranques contados. */
  launches: number
  /** Ya valoró: no se vuelve a preguntar jamás. */
  rated: boolean
  /** Epoch ms de la última vez que se mostró y dijo "ahora no". 0 = nunca. */
  lastAskedAt: number
  /** Cuántas veces se pospuso. */
  timesAsked: number
}

export const EMPTY_RATING_STATE: RatingState = {
  firstSeenAt: 0,
  launches: 0,
  rated: false,
  lastAskedAt: 0,
  timesAsked: 0,
}

/** Días de uso antes de la primera pregunta. */
const MIN_DAYS = 7
/** Arranques antes de la primera pregunta. */
const MIN_LAUNCHES = 8
/** Movimientos registrados: prueba de que la app se está usando de verdad. */
const MIN_TRANSACTIONS = 15
/** Espera tras un "ahora no". */
const SNOOZE_MS = 45 * 24 * 60 * 60 * 1000
/** Tras tantos "ahora no", no se pregunta más. */
const MAX_ASKS = 3

export interface RatingContext {
  state: RatingState
  transactionCount: number
  now: number
}

export type RatingVerdict =
  | 'ask'
  | 'already-rated'
  | 'too-new'
  | 'too-few-launches'
  | 'too-few-transactions'
  | 'snoozed'
  | 'asked-enough'

/**
 * ¿Toca preguntar?
 *
 * Las tres condiciones de entrada (días, arranques, movimientos) son Y, no O:
 * alguien que abrió la app ocho veces en una tarde y no registró nada no tiene
 * una opinión sobre la app, tiene curiosidad.
 */
export function ratingVerdict(ctx: RatingContext): RatingVerdict {
  const { state, transactionCount, now } = ctx

  if (state.rated) return 'already-rated'
  if (state.timesAsked >= MAX_ASKS) return 'asked-enough'

  // Tras un "ahora no" se espera de verdad. Volver a preguntar a los pocos
  // días convierte una duda en un rechazo.
  if (state.lastAskedAt > 0 && now - state.lastAskedAt < SNOOZE_MS) return 'snoozed'

  const daysUsed = state.firstSeenAt > 0 ? (now - state.firstSeenAt) / 86_400_000 : 0
  if (daysUsed < MIN_DAYS) return 'too-new'
  if (state.launches < MIN_LAUNCHES) return 'too-few-launches'
  if (transactionCount < MIN_TRANSACTIONS) return 'too-few-transactions'

  return 'ask'
}

export function shouldAskForRating(ctx: RatingContext): boolean {
  return ratingVerdict(ctx) === 'ask'
}

/** Registra un arranque. El primero fija `firstSeenAt`. */
export function recordLaunch(state: RatingState, now: number): RatingState {
  return {
    ...state,
    firstSeenAt: state.firstSeenAt || now,
    launches: state.launches + 1,
  }
}

/** El usuario pospuso: se anota para respetar la espera. */
export function recordSnooze(state: RatingState, now: number): RatingState {
  return { ...state, lastAskedAt: now, timesAsked: state.timesAsked + 1 }
}

/** El usuario valoró: no se vuelve a preguntar. */
export function recordRated(state: RatingState): RatingState {
  return { ...state, rated: true }
}

/**
 * Enlace a la ficha de Play Store. `market://` abre la app de Play
 * directamente en el diálogo de valoración; la URL web es el respaldo para
 * cuando Play no está instalado (emuladores, dispositivos sin GMS).
 */
export function playStoreUrls(packageName: string): { app: string; web: string } {
  return {
    app: `market://details?id=${packageName}&showAllReviews=true`,
    web: `https://play.google.com/store/apps/details?id=${packageName}`,
  }
}
