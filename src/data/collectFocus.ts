import { chargeState, daysLate, dueWithin, outstanding, type Charge, type Client } from './clients'
import { monthKey } from './helpers'

/**
 * QUÉ HAY QUE HACER HOY.
 *
 * ── POR QUÉ ESTO EXISTE ───────────────────────────────────────────────
 * La pestaña de cobros abría con tres cifras del mismo peso —atrasado, esta
 * semana, cobrado— y debajo una lista. El usuario tenía que leer las tres y
 * decidir cuál importaba, todas las mañanas.
 *
 * Una pantalla de cobros es una lista de tareas disfrazada de informe. Lo único
 * que se viene a preguntar al abrirla es «¿a quién le escribo?», y eso tiene
 * una respuesta, no tres números.
 *
 * ── EL ORDEN DE URGENCIA, Y POR QUÉ ESE ───────────────────────────────
 * 1. **Atrasados.** Alguien ya debía haber pagado: es lo único que requiere una
 *    acción hoy y que empeora cada día que pasa.
 * 2. **Vence hoy.** Todavía no es un problema, pero lo será mañana.
 * 3. **Nada urgente.** Entonces la cifra grande pasa a ser lo cobrado del mes,
 *    que es la buena noticia. Una pantalla sin nada que hacer no debería
 *    enseñar un cero rojo.
 */

export type FocusKind = 'late' | 'today' | 'calm'

export interface CollectFocus {
  kind: FocusKind
  /** La cifra que manda: lo atrasado, lo de hoy, o lo cobrado del mes. */
  amount: number
  /** Cuántas personas afecta. `0` cuando no hay nada urgente. */
  people: number
  /** Los nombres, para poder decir «Carlos lleva 9 días. Ana, 3». */
  names: string[]
  /** Días de atraso del peor, para el titular. `0` si no hay atrasados. */
  worstDays: number
  /** Los cobros implicados, por si hay que actuar sobre ellos. */
  chargeIds: string[]
}

/** Cuántos nombres se nombran antes de resumir. Tres ya no se leen. */
const MAX_NOMBRES = 2

export function collectFocus(
  charges: Charge[],
  clients: Client[],
  today: string,
): CollectFocus {
  const nombre = (id: string) => clients.find(c => c.id === id)?.name ?? ''

  const vivos = charges.filter(c => !c.waived && outstanding(c) > 0)

  const atrasados = vivos
    .filter(c => {
      const estado = chargeState(c, today)
      return estado === 'late' || (estado === 'partial' && c.dueDate < today)
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  if (atrasados.length) {
    return {
      kind: 'late',
      amount: cents(atrasados.reduce((sum, c) => sum + outstanding(c), 0)),
      people: new Set(atrasados.map(c => c.clientId)).size,
      names: nombresDe(atrasados.map(c => c.clientId), nombre),
      worstDays: daysLate(atrasados[0], today),
      chargeIds: atrasados.map(c => c.id),
    }
  }

  const deHoy = vivos.filter(c => c.dueDate === today)
  if (deHoy.length) {
    return {
      kind: 'today',
      amount: cents(deHoy.reduce((sum, c) => sum + outstanding(c), 0)),
      people: new Set(deHoy.map(c => c.clientId)).size,
      names: nombresDe(deHoy.map(c => c.clientId), nombre),
      worstDays: 0,
      chargeIds: deHoy.map(c => c.id),
    }
  }

  /*
   * Nada urgente: manda lo COBRADO del mes.
   *
   * Una pantalla sin nada que hacer enseñando «0 atrasado» en rojo convierte la
   * calma en una alarma apagada. Lo que hay que ver entonces es que el mes va
   * bien.
   */
  const mes = monthKey(today)
  const cobrado = charges
    .filter(c => c.paid > 0 && c.paidAt > 0 && monthKey(iso(c.paidAt)) === mes)
    .reduce((sum, c) => sum + c.paid, 0)

  return {
    kind: 'calm',
    amount: cents(cobrado),
    people: 0,
    names: [],
    worstDays: 0,
    chargeIds: [],
  }
}

/** Nombres sin repetir, como mucho dos, en el orden en que llegan. */
function nombresDe(clientIds: string[], nombre: (id: string) => string): string[] {
  const vistos: string[] = []
  for (const id of clientIds) {
    const n = nombre(id)
    if (n && !vistos.includes(n)) vistos.push(n)
    if (vistos.length >= MAX_NOMBRES) break
  }
  return vistos
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

function iso(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ────────────────────────────────────────────────────────────

export type ChargeGroup = 'late' | 'week' | 'later' | 'done'

/**
 * LA LISTA AGRUPADA, Y LO PAGADO A SU HISTÓRICO.
 *
 * Antes era una sola lista con todo dentro —atrasados, próximos y pagados
 * mezclados— que crece sin fin: con un año de uso son cientos de filas, y la
 * mayoría son cosas que ya no hay que hacer.
 *
 * Lo cobrado no es una tarea. No tiene por qué ocupar la pantalla donde se
 * decide a quién escribir.
 */
export function groupCharges(
  charges: Charge[],
  today: string,
): Record<ChargeGroup, Charge[]> {
  const grupos: Record<ChargeGroup, Charge[]> = { late: [], week: [], later: [], done: [] }

  for (const charge of charges) {
    const estado = chargeState(charge, today)
    if (estado === 'paid' || estado === 'waived') { grupos.done.push(charge); continue }
    if (estado === 'late' || (estado === 'partial' && charge.dueDate < today)) { grupos.late.push(charge); continue }
    if (dueWithin(charge, today, 7)) { grupos.week.push(charge); continue }
    grupos.later.push(charge)
  }

  // Los atrasados por antigüedad —el que lleva más esperando primero—; el resto
  // por cuándo toca. En el histórico, lo más reciente arriba.
  grupos.late.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  grupos.week.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  grupos.later.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  grupos.done.sort((a, b) => b.dueDate.localeCompare(a.dueDate))

  return grupos
}

// ────────────────────────────────────────────────────────────

export interface ClientHistory {
  /** Todo lo que te ha pagado, desde el principio. */
  totalPaid: number
  /** Cuántos cobros ha cerrado. */
  paidCount: number
  /** Meses seguidos pagando, contando hacia atrás desde el mes pasado. */
  streak: number
  /** Lo pagado mes a mes del año en curso, para la gráfica. */
  byMonth: Array<{ mkey: string; amount: number }>
  /** Lo que debe ahora mismo. */
  owes: number
}

/**
 * EL HISTORIAL DE UN CLIENTE.
 *
 * La app tenía todos estos datos y ninguna pantalla donde verlos: tocar un
 * cliente abría su formulario de editar. Es la diferencia entre una lista de
 * contactos y saber con quién estás tratando.
 */
export function clientHistory(
  clientId: string,
  charges: Charge[],
  today: string,
): ClientHistory {
  const suyos = charges.filter(c => c.clientId === clientId)
  const year = Number(today.slice(0, 4))

  const byMonth: Array<{ mkey: string; amount: number }> = []
  for (let m = 1; m <= 12; m += 1) {
    const mkey = `${year}-${String(m).padStart(2, '0')}`
    const amount = suyos
      .filter(c => c.paid > 0 && c.paidAt > 0 && monthKey(iso(c.paidAt)) === mkey)
      .reduce((sum, c) => sum + c.paid, 0)
    byMonth.push({ mkey, amount: cents(amount) })
  }

  /*
   * La racha se cuenta desde el mes PASADO, no desde este.
   *
   * Si hoy es día 2 y el cliente paga el 15, este mes todavía no ha pagado y no
   * es un fallo suyo. Contarlo desde este mes le rompería la racha a todo el
   * mundo durante la primera quincena.
   */
  let streak = 0
  const mesActual = Number(today.slice(5, 7))
  for (let m = mesActual - 1; m >= 1; m -= 1) {
    if (byMonth[m - 1].amount > 0) streak += 1
    else break
  }

  return {
    totalPaid: cents(suyos.reduce((sum, c) => sum + c.paid, 0)),
    paidCount: suyos.filter(c => c.paidAt > 0).length,
    streak,
    byMonth,
    // Lo VENCIDO: un cobro generado por adelantado todavía no se debe.
    owes: cents(suyos.filter(c => !c.waived && c.dueDate <= today).reduce((sum, c) => sum + outstanding(c), 0)),
  }
}

/**
 * El margen en porcentaje de un negocio.
 *
 * Es lo que dice si el negocio es bueno, no el monto: subir de 1,000 a 1,200 de
 * ganancia puede ser porque vendiste más o porque te subieron el coste, y el
 * porcentaje distingue las dos cosas.
 */
export function marginPct(collected: number, profit: number): number | null {
  if (!(collected > 0)) return null
  return Math.round((profit / collected) * 100)
}
