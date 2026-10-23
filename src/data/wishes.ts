/**
 * ANTOJOS: LO QUE TODAVÍA NO COMPRASTE.
 *
 * ── LA VUELTA AL CONCEPTO ─────────────────────────────────────────────
 * Caprichos solo miraba atrás: recuperar lo que ya te gastaste. Un antojo se
 * apunta ANTES. Lo que quieres, lo que cuesta, y una espera.
 *
 * Si al séptimo día lo sigues queriendo, se compra sin culpa. Si se te pasaron
 * las ganas, no lo compraste — y eso es la mejor forma de recuperar el dinero
 * de una compra innecesaria: no hacerla.
 *
 * ── LO QUE NO SE GASTÓ NO ES DINERO RECUPERADO ────────────────────────
 * Aquí está la línea que no se cruza, y es la misma de toda la app. Cuando
 * descartas un antojo de 4,500, no se movió ni un peso: tu saldo es
 * exactamente el que era. Abonarlo al bote sin más sería inventarse una
 * recuperación, igual que marcar un cobro sin movimiento detrás sería
 * inventarse un ingreso.
 *
 * Así que lo descartado vive en su propio contador —«lo que no gastaste»— y
 * si quieres que cuente de verdad, la app te ofrece hacer la transferencia a
 * tu ahorro. Entonces sí se movió dinero, y entonces sí abona.
 */

export type WishState = 'waiting' | 'ready' | 'bought' | 'skipped'

export interface Wish {
  id: string
  /** Qué es: «Teclado mecánico». */
  name: string
  /** Lo que cuesta. */
  amount: number
  createdAt: number
  /** Cuándo se puede decidir, en ms. Antes de eso solo se espera. */
  decideAt: number
  /** Comprado o descartado, y cuándo. `0` = todavía esperando. */
  resolvedAt: number
  resolution?: 'bought' | 'skipped'
  /**
   * El gasto con el que se compró, si se compró.
   *
   * Un antojo comprado no es un capricho automáticamente: lo es si tú marcas
   * ese gasto. Esto solo guarda el vínculo para no preguntarlo dos veces.
   */
  txId?: string
  /** Una nota de por qué lo querías, o por qué lo dejaste. */
  note?: string
}

/** Los días que un antojo espera antes de poder decidirse. */
export const WAIT_DAYS = 7

const DIA = 86_400_000

export function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * En qué estado está un antojo, mirado ahora.
 *
 * `ready` es el día de decidir, y existe como estado propio porque es el
 * único momento en que la pantalla tiene que pedir algo: los demás días el
 * antojo solo está, y una lista que pide una decisión cada día deja de pedirla
 * el día que importa.
 */
export function wishState(wish: Wish, now: number): WishState {
  if (wish.resolution) return wish.resolution
  return now >= wish.decideAt ? 'ready' : 'waiting'
}

/** Cuántos días le quedan de espera. `0` cuando ya toca decidir. */
export function daysLeft(wish: Wish, now: number): number {
  if (wish.resolution) return 0
  return Math.max(0, Math.ceil((wish.decideAt - now) / DIA))
}

/** Cuánto de la espera lleva cumplido, de 0 a 1, para la barra. */
export function waitProgress(wish: Wish, now: number): number {
  const total = wish.decideAt - wish.createdAt
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (now - wish.createdAt) / total))
}

export interface WishesSummary {
  /** Los que todavía esperan. */
  waiting: number
  /** Los que ya se pueden decidir hoy. Es lo que la pantalla tiene que pedir. */
  ready: number
  /** Lo que suman los que esperan: el riesgo que tienes sobre la mesa. */
  pending: number
  /** Cuántos descartaste y cuánto suman. */
  skipped: number
  saved: number
  bought: number
}

export function wishesSummary(wishes: Wish[], now: number): WishesSummary {
  let waiting = 0, ready = 0, pending = 0, skipped = 0, saved = 0, bought = 0
  for (const w of wishes) {
    const estado = wishState(w, now)
    if (estado === 'waiting') { waiting += 1; pending += w.amount }
    else if (estado === 'ready') { ready += 1; pending += w.amount }
    else if (estado === 'skipped') { skipped += 1; saved += w.amount }
    else bought += 1
  }
  return { waiting, ready, pending: cents(pending), skipped, saved: cents(saved), bought }
}

/**
 * El orden de la lista.
 *
 * Primero los que hay que decidir HOY, porque son los únicos que piden algo.
 * Luego los que esperan, el que menos le falta primero. Lo resuelto al final,
 * lo más reciente arriba: es historial, no tarea.
 */
export function sortWishes(wishes: Wish[], now: number): Wish[] {
  const peso: Record<WishState, number> = { ready: 0, waiting: 1, bought: 2, skipped: 2 }
  return [...wishes].sort((a, b) => {
    const pa = peso[wishState(a, now)]
    const pb = peso[wishState(b, now)]
    if (pa !== pb) return pa - pb
    if (pa <= 1) return a.decideAt - b.decideAt
    return b.resolvedAt - a.resolvedAt
  })
}

/** Lo ahorrado por no comprar, dentro de un año. */
export function savedInYear(wishes: Wish[], year: number): number {
  return cents(wishes
    .filter(w => w.resolution === 'skipped' && new Date(w.resolvedAt).getFullYear() === year)
    .reduce((sum, w) => sum + w.amount, 0))
}
