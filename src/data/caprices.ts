/**
 * RECUPERAR LO QUE TE GASTASTE SIN QUERER.
 *
 * Hay gastos que uno hace sabiendo que no hacían falta. Esto es la forma de
 * saldar la cuenta, y es la idea más delicada de todo el módulo porque hecha de
 * la forma fácil se convierte en una app que te hace sentir mal.
 *
 * ── DOS TRAMPAS, Y CÓMO SE ESQUIVAN ───────────────────────────────────
 *
 * **La culpa.** La app NUNCA decide qué fue un capricho: lo marcas tú, cuando
 * quieras, incluso días después. No hay contador de caprichos, ni medidor de
 * autocontrol, ni avisos de que llevas muchos. Un bote se puede cerrar y
 * olvidar sin consecuencias, y cerrarlo no es un fracaso: es una decisión.
 *
 * **El dinero de mentira.** Si «recuperar» fuera pulsar un botón y ver subir
 * una barra, sería un videojuego pegado encima de tus finanzas. Cada aporte
 * tiene que apuntar a un MOVIMIENTO REAL —una transferencia a tu ahorro, un
 * cobro que llegó—. Si no se movió dinero, no se recuperó nada. Por eso
 * `CapricePayment` exige `txId` y no hay forma de añadir un aporte sin él.
 *
 * ── LAS DOS FORMAS DE SALDARLO ────────────────────────────────────────
 * Son la misma estructura, no dos sistemas:
 *  · **a plazos** — el bote baja poco a poco, con cada movimiento que le asignes.
 *  · **igualar**  — lo saldas de una, mandando el mismo monto al ahorro ahí mismo.
 * «Igualar» es simplemente un aporte del 100% hecho el primer día.
 */

export interface CapricePayment {
  /**
   * El movimiento que respalda este aporte. Obligatorio.
   *
   * Es la diferencia entre llevar una cuenta y jugar a llevarla.
   */
  txId: string
  amount: number
  at: number
}

export interface Caprice {
  id: string
  /** El gasto que lo abrió. */
  txId: string
  /** Lo que costó el capricho: lo que hay que recuperar. */
  amount: number
  /** Para reconocerlo en la lista («Audífonos»). */
  note: string
  createdAt: number
  payments: CapricePayment[]
  /** Cerrado a mano. No es un fracaso: deja de contar y se puede olvidar. */
  closed?: boolean
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/** Lo recuperado de un capricho, respaldado por movimientos. */
export function recovered(caprice: Caprice): number {
  return cents(caprice.payments.reduce((sum, p) => sum + p.amount, 0))
}

/** Lo que falta por recuperar. Nunca negativo. */
export function remaining(caprice: Caprice): number {
  return Math.max(0, cents(caprice.amount - recovered(caprice)))
}

/** Si ya está saldado. */
export function isSettled(caprice: Caprice): boolean {
  return remaining(caprice) <= 0.005
}

/** Cuánto se ha recuperado, de 0 a 1. */
export function progress(caprice: Caprice): number {
  if (!(caprice.amount > 0)) return 1
  return Math.min(1, recovered(caprice) / caprice.amount)
}

/**
 * Añade un aporte.
 *
 * Sin `txId` no se añade nada, y no es validación por validar: un aporte sin
 * movimiento detrás haría que «recuperado» fuera una opinión.
 *
 * Tampoco se acepta el mismo movimiento dos veces: asignar un ingreso a un
 * capricho y volver a asignarlo lo saldaría con dinero que solo entró una vez.
 */
export function addPayment(caprice: Caprice, amount: number, txId: string, at: number): Caprice {
  if (!txId || !(amount > 0)) return caprice
  if (caprice.payments.some(p => p.txId === txId)) return caprice
  return { ...caprice, payments: [...caprice.payments, { txId, amount: cents(amount), at }] }
}

/** Quita un aporte, por ejemplo si se borró el movimiento que lo respaldaba. */
export function removePayment(caprice: Caprice, txId: string): Caprice {
  if (!caprice.payments.some(p => p.txId === txId)) return caprice
  return { ...caprice, payments: caprice.payments.filter(p => p.txId !== txId) }
}

export interface CapricesSummary {
  /** Lo que falta por recuperar, de los botes abiertos. */
  outstanding: number
  /** Lo recuperado de esos botes. */
  recovered: number
  /** Cuántos botes están abiertos. */
  openCount: number
  /** Lo que costaron en total los botes abiertos. */
  total: number
}

/**
 * El resumen de los botes ABIERTOS.
 *
 * Los cerrados y los saldados no se cuentan: la cifra tiene que ser «lo que te
 * queda por recuperar», no un historial de todo lo que has gastado mal alguna
 * vez. Esa segunda cifra sería exactamente el reproche que esto evita.
 */
export function capricesSummary(caprices: Caprice[]): CapricesSummary {
  const abiertos = caprices.filter(c => !c.closed && !isSettled(c))
  return {
    outstanding: cents(abiertos.reduce((sum, c) => sum + remaining(c), 0)),
    recovered: cents(abiertos.reduce((sum, c) => sum + recovered(c), 0)),
    openCount: abiertos.length,
    total: cents(abiertos.reduce((sum, c) => sum + c.amount, 0)),
  }
}

/** Lo que propone «igualar»: el mismo monto, o una fracción si el doble es irreal. */
export function matchAmount(amount: number, pct = 100): number {
  if (!(amount > 0)) return 0
  return cents(amount * Math.min(100, Math.max(0, pct)) / 100)
}

/** Los botes ordenados para la lista: lo que más falta, primero. */
export function sortCaprices(caprices: Caprice[]): Caprice[] {
  return [...caprices].sort((a, b) => {
    const cerradoA = a.closed || isSettled(a) ? 1 : 0
    const cerradoB = b.closed || isSettled(b) ? 1 : 0
    if (cerradoA !== cerradoB) return cerradoA - cerradoB
    return remaining(b) - remaining(a)
  })
}
