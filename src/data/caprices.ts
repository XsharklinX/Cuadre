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
  /**
   * Para cuándo quieres tenerlo recuperado, `YYYY-MM-DD`.
   *
   * No es una promesa ni un plazo que la app vigile: es lo que permite
   * calcular el RITMO —«si abonas 600 al mes lo cierras en cuatro»—, que es
   * lo que convierte una barra de progreso en algo que se puede accionar.
   * Sin fecha, la barra solo dice cuánto falta.
   */
  targetDate?: string
  /**
   * UN RETO ABIERTO: una semana sin algo, y lo que te ahorres lo abonas.
   *
   * Solo uno a la vez. Dos retos simultáneos compiten por el mismo dinero
   * ahorrado y el usuario acaba abonando dos veces lo que ahorró una.
   *
   * Lo importante: terminar un reto NO abona nada por su cuenta. Propone la
   * transferencia, y el abono lo respalda un movimiento real — la misma regla
   * que el resto del bote.
   */
  challenge?: {
    /** Lo que te propones no hacer: «comida a domicilio». */
    what: string
    /** Lo que calculas que te ahorras. */
    amount: number
    /** Cuándo termina, en ms. */
    endsAt: number
  }
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

/**
 * EL RITMO: cuánto hay que abonar al mes para llegar a la fecha.
 *
 * Es lo que convierte una barra de progreso en algo accionable. «Te faltan
 * 2,400» no dice qué hacer; «si abonas 600 al mes lo cierras en cuatro» sí.
 *
 * Devuelve `null` cuando no hay nada que calcular: sin fecha objetivo, con el
 * bote ya saldado, o con la fecha ya pasada —ahí el plazo no es una meta, es
 * una deuda consigo mismo y la app no va a regañar por ella—.
 */
export function pace(caprice: Caprice, today: string): { perMonth: number; months: number } | null {
  if (!caprice.targetDate || caprice.closed) return null
  const falta = remaining(caprice)
  if (falta <= 0) return null

  const hoy = Date.parse(`${today}T00:00:00`)
  const meta = Date.parse(`${caprice.targetDate}T00:00:00`)
  if (!Number.isFinite(hoy) || !Number.isFinite(meta) || meta <= hoy) return null

  // Al menos un mes: con diez días por delante, «0,3 meses» no se lee.
  const months = Math.max(1, Math.round((meta - hoy) / (30 * 86_400_000)))
  return { perMonth: cents(falta / months), months }
}

/**
 * A este ritmo, ¿cuándo se cierra?
 *
 * La otra mitad de la pregunta: con lo que ya has abonado de media al mes,
 * cuántos meses quedan. Sin aportes no hay ritmo del que partir, y suponer
 * uno sería inventarse justo el dato que se está preguntando.
 */
export function monthsAtCurrentPace(caprice: Caprice, now: number): number | null {
  const falta = remaining(caprice)
  if (falta <= 0 || !caprice.payments.length) return null

  const meses = Math.max(1, (now - caprice.createdAt) / (30 * 86_400_000))
  const porMes = recovered(caprice) / meses
  if (porMes <= 0) return null
  return Math.ceil(falta / porMes)
}

/** Si el reto de un capricho ya terminó y toca cobrarlo. */
export function challengeDone(caprice: Caprice, now: number): boolean {
  return !!caprice.challenge && now >= caprice.challenge.endsAt
}

/** Días que le quedan al reto. `0` si ya terminó o no hay. */
export function challengeDaysLeft(caprice: Caprice, now: number): number {
  if (!caprice.challenge) return 0
  return Math.max(0, Math.ceil((caprice.challenge.endsAt - now) / 86_400_000))
}

/**
 * Lo recuperado dentro de un año, por si se quiere mirar el año.
 *
 * Por fecha del APORTE, no del capricho: un capricho de diciembre que se
 * termina de pagar en marzo recuperó ese dinero en marzo.
 */
export function recoveredInYear(caprices: Caprice[], year: number): number {
  let total = 0
  for (const c of caprices) {
    for (const p of c.payments) {
      if (new Date(p.at).getFullYear() === year) total += p.amount
    }
  }
  return cents(total)
}

/**
 * EN QUÉ CAES: lo gastado en caprichos, agrupado por la categoría del gasto.
 *
 * La categoría sale del movimiento que abrió el bote, no de un campo nuevo:
 * es un dato que ya existe, y duplicarlo daría dos respuestas en cuanto
 * alguien editara el gasto.
 */
export function capricesByCategory(
  caprices: Caprice[],
  categoryOf: (txId: string) => string | undefined,
): Array<{ categoryId: string; amount: number; count: number }> {
  const porCat = new Map<string, { amount: number; count: number }>()
  for (const c of caprices) {
    const cat = categoryOf(c.txId)
    if (!cat) continue
    const actual = porCat.get(cat) ?? { amount: 0, count: 0 }
    actual.amount += c.amount
    actual.count += 1
    porCat.set(cat, actual)
  }
  return [...porCat.entries()]
    .map(([categoryId, v]) => ({ categoryId, amount: cents(v.amount), count: v.count }))
    .sort((a, b) => b.amount - a.amount)
}

/**
 * ¿SUELES MARCAR LOS DE ESTA CATEGORÍA?
 *
 * El momento de sinceridad con uno mismo es cuando estás escribiendo el
 * monto, no tres días después. Si de los gastos que has marcado como capricho
 * la mayoría son de una categoría, al crear otro de esa categoría vale la pena
 * preguntarlo — una vez, sin insistir.
 *
 * ── POR QUÉ PIDE TRES ─────────────────────────────────────────────────
 * Con uno o dos no hay patrón, hay casualidad. Sugerir a partir de ahí
 * convertiría la función en una app que opina sobre cada compra, que es
 * exactamente lo que esta función no debe ser.
 */
export function looksLikeCaprice(
  categoryId: string | undefined,
  caprices: Caprice[],
  categoryOf: (txId: string) => string | undefined,
): boolean {
  if (!categoryId) return false
  const deEsa = caprices.filter(c => categoryOf(c.txId) === categoryId).length
  return deEsa >= 3
}
