import {
  chargeState, clientTotalAmount, daysLate, dueDatesBetween, dueWithin, outstanding,
  type Charge, type Client,
} from './clients'
import { monthKey } from './helpers'

/**
 * EL GENERADOR DE COBROS Y EL RESUMEN DE «POR COBRAR».
 *
 * Nada de esto es dinero. Son expectativas con fecha; el dinero aparece solo
 * cuando un cobro se cruza al libro como ingreso real (ver `clients.ts`).
 */

/** Cuánto por delante se generan cobros. Un mes basta para avisar a tiempo. */
export const GENERATE_AHEAD_DAYS = 35

/**
 * Cuánto hacia atrás se recuperan cobros que se pasaron.
 *
 * Existe para quien no abre la app en semanas: al volver tiene que encontrar
 * los cobros que se le pasaron, no solo el próximo. Noventa días es el límite
 * de lo que todavía se puede reclamar sin que sea arqueología.
 */
export const GENERATE_BACK_DAYS = 90

const DIA = 86_400_000

function iso(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseMs(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const ms = Date.parse(`${date}T00:00:00`)
  return Number.isFinite(ms) ? ms : null
}

/**
 * Los cobros que faltan por crear.
 *
 * ── LA PROPIEDAD QUE NO SE PUEDE PERDER ───────────────────────────────
 * Esto se llama cada vez que se abre la pantalla, así que TIENE que ser
 * idempotente: llamarlo diez veces no puede crear diez cobros. La clave de
 * identidad es la pareja (cliente, fecha de vencimiento) — un cliente no paga
 * dos veces el mismo día.
 *
 * Y nunca toca los cobros que ya existen. Si el usuario cambió el monto de uno
 * a mano, o lo marcó pagado, o lo dio por perdido, eso manda sobre la plantilla
 * del cliente: la plantilla dice qué esperar en el futuro, no qué pasó.
 */
export function pendingCharges(
  clients: Client[],
  existing: Charge[],
  today: string,
): Array<Omit<Charge, 'id'>> {
  const hoy = parseMs(today)
  if (hoy === null) return []

  const yaHay = new Set(existing.map(c => `${c.clientId}|${c.dueDate}`))
  const desde = iso(hoy - GENERATE_BACK_DAYS * DIA)
  const hasta = iso(hoy + GENERATE_AHEAD_DAYS * DIA)

  const nuevos: Array<Omit<Charge, 'id'>> = []
  for (const client of clients) {
    if (!client.active) continue
    // Nunca antes de que el cliente existiera: generar hacia atrás noventa días
    // le inventaría deudas a quien acabas de registrar.
    const nacido = iso(client.createdAt)
    const inicio = desde > nacido ? desde : nacido
    if (inicio > hasta) continue

    for (const dueDate of dueDatesBetween(client, inicio, hasta)) {
      if (yaHay.has(`${client.id}|${dueDate}`)) continue
      nuevos.push({
        clientId: client.id,
        dueDate,
        // El TOTAL de sus servicios, no su `amount`: con varios servicios
        // `amount` deja de ser la verdad, y cobrar por el seria cobrarle de
        // menos todos los meses sin que nadie lo note.
        amount: clientTotalAmount(client),
        paid: 0,
        txIds: [],
        paidAt: 0,
      })
      // Se marca en el set para que dos clientes nunca colisionen y para que
      // este mismo bucle no repita si una plantilla devolviera la fecha dos veces.
      yaHay.add(`${client.id}|${dueDate}`)
    }
  }
  return nuevos
}

export interface ReceivablesSummary {
  /** Lo que falta por cobrar de cobros ya vencidos. */
  lateAmount: number
  lateCount: number
  /** Lo que falta por cobrar en los próximos 7 días, hoy incluido. */
  weekAmount: number
  weekCount: number
  /** Cobrado de verdad en el mes en curso (lo que llegó, no lo esperado). */
  collectedThisMonth: number
  /** Todo lo que falta por cobrar, sin límite de fecha. */
  outstandingTotal: number
}

/** El resumen que contesta las tres preguntas de quien vive de cobrar. */
export function receivablesSummary(charges: Charge[], today: string): ReceivablesSummary {
  const mes = monthKey(today)
  let lateAmount = 0, lateCount = 0, weekAmount = 0, weekCount = 0
  let collectedThisMonth = 0, outstandingTotal = 0

  for (const charge of charges) {
    if (charge.waived) continue
    const falta = outstanding(charge)
    const estado = chargeState(charge, today)

    // Lo COBRADO se cuenta por la fecha en que llegó, no por la de vencimiento:
    // un cobro de septiembre que entró en octubre es dinero de octubre.
    if (charge.paid > 0 && charge.paidAt > 0 && monthKey(iso(charge.paidAt)) === mes) {
      collectedThisMonth += charge.paid
    }

    if (falta <= 0.005) continue
    outstandingTotal += falta

    if (estado === 'late' || (estado === 'partial' && charge.dueDate < today)) {
      lateAmount += falta
      lateCount += 1
    } else if (dueWithin(charge, today, 7)) {
      weekAmount += falta
      weekCount += 1
    }
  }

  const c = (n: number) => Math.round(n * 100) / 100
  return {
    lateAmount: c(lateAmount), lateCount,
    weekAmount: c(weekAmount), weekCount,
    collectedThisMonth: c(collectedThisMonth),
    outstandingTotal: c(outstandingTotal),
  }
}

/**
 * Los cobros ordenados como hay que enseñarlos.
 *
 * Los atrasados primero y por antigüedad —el que lleva más esperando es el más
 * urgente—, luego lo que vence pronto. Los pagados y los perdonados al final:
 * ya no hay nada que hacer con ellos.
 */
export function sortForList(charges: Charge[], today: string): Charge[] {
  const peso: Record<string, number> = { late: 0, today: 1, partial: 1, upcoming: 2, paid: 3, waived: 4 }
  return [...charges].sort((a, b) => {
    const pa = peso[chargeState(a, today)] ?? 5
    const pb = peso[chargeState(b, today)] ?? 5
    if (pa !== pb) return pa - pb
    // Dentro de los atrasados, el más viejo arriba; en el resto, el más próximo.
    return pa === 0 ? a.dueDate.localeCompare(b.dueDate) : a.dueDate.localeCompare(b.dueDate)
  })
}

/**
 * Aplica un pago a un cobro.
 *
 * `txId` es obligatorio y no es burocracia: es la prueba de que el dinero
 * existe. Un cobro marcado pagado sin un movimiento detrás sería una opinión,
 * y en ese momento «lo que te deben» y «lo que tienes» dejarían de cuadrar.
 */
export function applyPayment(charge: Charge, amount: number, txId: string, now: number): Charge {
  if (!(amount > 0) || !txId) return charge
  const paid = Math.round((charge.paid + amount) * 100) / 100
  const completo = paid >= charge.amount - 0.005
  return {
    ...charge,
    paid,
    txIds: [...charge.txIds, txId],
    paidAt: completo ? now : charge.paidAt,
  }
}

/** Deshace un pago, quitando el movimiento que lo respaldaba. */
export function revokePayment(charge: Charge, txId: string, amount: number): Charge {
  if (!charge.txIds.includes(txId)) return charge
  const paid = Math.max(0, Math.round((charge.paid - amount) * 100) / 100)
  return {
    ...charge,
    paid,
    txIds: charge.txIds.filter(id => id !== txId),
    paidAt: paid >= charge.amount - 0.005 ? charge.paidAt : 0,
  }
}

/**
 * Días de atraso medios de un cliente, sobre sus cobros ya cobrados.
 *
 * ── POR QUÉ `floor` Y NO `round` ──────────────────────────────────────
 * `paidAt` es el instante en que se marcó el cobro —con su hora— y la fecha de
 * vencimiento es una medianoche. Redondeando, un cliente que pagaba el mismo
 * día a mediodía daba 0,5 → 1, y su ficha decía «paga 1 día tarde» por haber
 * pagado a su hora. Con el día entero, pagar en cualquier momento del día de
 * vencimiento es cero, y el primer día de atraso empieza al día siguiente:
 * lo mismo que cuenta `daysLate`, que es lo que el usuario ve en la lista.
 */
export function averageDelay(charges: Charge[]): number | null {
  const cobrados = charges.filter(c => c.paidAt > 0 && !c.waived)
  if (!cobrados.length) return null
  const total = cobrados.reduce((sum, c) => {
    const vence = parseMs(c.dueDate)
    if (vence === null) return sum
    return sum + Math.max(0, Math.floor((c.paidAt - vence) / DIA))
  }, 0)
  return Math.round((total / cobrados.length) * 10) / 10
}

/** Atraso de hoy, para la lista. */
export { daysLate }
