import { chargeState, clientServices, daysLate, outstanding, type Charge, type Client } from './clients'
import { monthKey } from './helpers'

/**
 * LO QUE VA EN UN COMPROBANTE Y EN UN ESTADO DE CUENTA.
 *
 * ── POR QUÉ ESTO ESTÁ SEPARADO DEL PDF ────────────────────────────────
 * Armar un PDF es dibujar: coordenadas, saltos de página, fuentes. Decidir qué
 * dice el papel es otra cosa, y es la que puede estar mal de una forma que
 * importa — un comprobante que dice «pagado 250» cuando pagó 200 es un
 * problema con un cliente delante, no un píxel descolocado.
 *
 * Aquí vive esa decisión, sin jsPDF y sin DOM, para poder probarla.
 *
 * ── LO QUE NO SE INVENTA ──────────────────────────────────────────────
 * Un comprobante solo se emite de un cobro que tiene un movimiento detrás. La
 * regla de toda la app: el `txId` es la prueba de que el dinero existe, y un
 * papel con membrete que diga «recibido» sin esa prueba es exactamente el tipo
 * de documento que no se puede emitir a la ligera.
 */

export interface Receipt {
  clientName: string
  concept: string
  /** Lo que de verdad llegó, no lo que se esperaba. */
  paid: number
  /** Lo que se esperaba, solo si difiere: entonces el papel lo dice. */
  expected: number
  outstanding: number
  dueDate: string
  /** Cuándo se cobró, en ms. */
  paidAt: number
  note?: string
}

/**
 * El comprobante de un cobro, o `null` si no se puede emitir.
 *
 * No se emite de un cobro sin movimiento detrás ni de uno dado por perdido:
 * en los dos casos el papel afirmaría algo que la app no puede sostener.
 */
export function receiptFor(charge: Charge, client: Client): Receipt | null {
  if (charge.waived) return null
  if (charge.paid <= 0 || !charge.txIds.length) return null
  return {
    clientName: client.name,
    concept: charge.note?.trim() || client.concept || '',
    paid: charge.paid,
    expected: charge.amount,
    outstanding: outstanding(charge),
    dueDate: charge.dueDate,
    paidAt: charge.paidAt,
    note: charge.note?.trim() || undefined,
  }
}

export interface StatementRow {
  mkey: string
  /** Lo que se le cobró ese mes. */
  billed: number
  /** Lo que pagó ese mes, por fecha de PAGO. */
  paid: number
}

export interface Statement {
  client: Client
  year: number
  rows: StatementRow[]
  totalBilled: number
  totalPaid: number
  /** Lo que sigue debiendo del año, hoy. */
  stillOwed: number
  /** Cuántos cobros cerró y cuántos se le hicieron. */
  paidCount: number
  chargeCount: number
  /** Su atraso medio en el año, o `null` si no cerró ninguno. */
  avgDelay: number | null
  /** Los servicios que consume, para que el papel diga de qué va. */
  services: Array<{ serviceId: string; amount: number }>
}

/**
 * EL ESTADO DE CUENTA DE UN AÑO.
 *
 * Es lo que un cliente pide cuando quiere saber qué pagó, y lo que hace falta
 * para cobrarle a alguien que dice que ya pagó. La app tenía los datos y la
 * única forma de verlos era contar a mano en la lista.
 *
 * ── LO FACTURADO VA POR FECHA DE VENCIMIENTO, LO PAGADO POR FECHA DE PAGO ──
 * No es lo mismo y mezclarlo haría cuadrar un año que no cuadra: un cobro de
 * diciembre que se paga en enero pertenece a diciembre en una columna y a
 * enero en la otra. Ponerlo en el mismo mes escondería justo el retraso que
 * un estado de cuenta existe para enseñar.
 */
export function clientStatement(
  client: Client,
  charges: Charge[],
  year: number,
  today: string,
): Statement {
  const suyos = charges.filter(c => c.clientId === client.id && !c.waived)

  const rows: StatementRow[] = []
  for (let m = 1; m <= 12; m += 1) {
    const mkey = `${year}-${String(m).padStart(2, '0')}`
    const billed = suyos
      .filter(c => monthKey(c.dueDate) === mkey)
      .reduce((sum, c) => sum + c.amount, 0)
    const paid = suyos
      .filter(c => c.paid > 0 && c.paidAt > 0 && monthKey(isoOf(c.paidAt)) === mkey)
      .reduce((sum, c) => sum + c.paid, 0)
    rows.push({ mkey, billed: cents(billed), paid: cents(paid) })
  }

  const delYear = suyos.filter(c => monthKey(c.dueDate).startsWith(String(year)))
  const cerrados = delYear.filter(c => c.paidAt > 0)
  const atrasos = cerrados.map(c => Math.max(0, Math.floor((c.paidAt - msOf(c.dueDate)) / DIA)))

  return {
    client,
    year,
    rows,
    totalBilled: cents(rows.reduce((sum, r) => sum + r.billed, 0)),
    totalPaid: cents(rows.reduce((sum, r) => sum + r.paid, 0)),
    stillOwed: cents(delYear
      .filter(c => chargeState(c, today) !== 'paid')
      .reduce((sum, c) => sum + outstanding(c), 0)),
    paidCount: cerrados.length,
    chargeCount: delYear.length,
    avgDelay: atrasos.length
      ? Math.round((atrasos.reduce((a, b) => a + b, 0) / atrasos.length) * 10) / 10
      : null,
    services: clientServices(client),
  }
}

export interface ChargeExportRow {
  client: string
  concept: string
  dueDate: string
  state: string
  amount: number
  paid: number
  outstanding: number
  daysLate: number
  paidOn: string
  note: string
}

/**
 * LA LISTA DE COBROS, EN FILAS PLANAS.
 *
 * Para Excel y para el PDF, con la misma forma: dos tablas con columnas
 * distintas serían dos verdades del mismo mes en cuanto una de las dos se
 * tocara y la otra no.
 *
 * `state` llega ya traducido desde quien llama: este módulo no sabe de
 * idiomas, y meterle `tt()` lo ataría a la app para siempre.
 */
export function chargeRows(
  charges: Charge[],
  clients: Client[],
  today: string,
  stateLabel: (s: ReturnType<typeof chargeState>) => string,
): ChargeExportRow[] {
  const porId = new Map(clients.map(c => [c.id, c]))
  return charges
    .filter(c => porId.has(c.clientId))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .map(c => {
      const client = porId.get(c.clientId)!
      return {
        client: client.name,
        concept: client.concept || '',
        dueDate: c.dueDate,
        state: stateLabel(chargeState(c, today)),
        amount: c.amount,
        paid: c.paid,
        outstanding: outstanding(c),
        daysLate: daysLate(c, today),
        paidOn: c.paidAt > 0 ? isoOf(c.paidAt) : '',
        note: c.note ?? '',
      }
    })
}

const DIA = 86_400_000

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

function isoOf(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function msOf(date: string): number {
  return Date.parse(`${date}T00:00:00`)
}
