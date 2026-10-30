import { daysLate, type Charge, type Client } from './clients'

/**
 * L4 · LA HISTORIA DE UN CLIENTE.
 *
 * Cada pago, cada atraso, cada cambio de precio y cada recomendación, en una
 * sola línea de tiempo y del más nuevo al más viejo. Es lo que hace falta
 * cuando alguien dice «yo ya te pagué»: ahí sale cuándo, cuánto y con qué
 * retraso.
 *
 * Todo sale de datos que ya existen —los cobros, el registro de precios, las
 * estrellas—: no hay un diario aparte que se pueda desincronizar.
 */

export type TimelineKind = 'paid' | 'late-paid' | 'partial' | 'waived' | 'price' | 'star' | 'joined' | 'referred'

export interface TimelineEvent {
  kind: TimelineKind
  /** En ms, para ordenar. */
  at: number
  /** `YYYY-MM-DD` para enseñar. */
  date: string
  amount?: number
  /** Precio de antes, en un cambio de precio. */
  from?: number
  /** Días de retraso, en un pago tardío. */
  days?: number
  /** Otro cliente implicado: a quién trajo, o quién lo trajo. */
  otherId?: string
  note?: string
  /** El cobro de un pago, para sacar su comprobante. */
  chargeId?: string
}

function iso(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function clientTimeline(client: Client, charges: Charge[], limit = 40): TimelineEvent[] {
  const fuera: TimelineEvent[] = []

  for (const ch of charges) {
    if (ch.clientId !== client.id) continue
    if (ch.waived) {
      fuera.push({ kind: 'waived', at: Date.parse(`${ch.dueDate}T12:00:00`), date: ch.dueDate, amount: ch.amount, note: ch.note, chargeId: ch.id })
      continue
    }
    if (!(ch.paid > 0)) continue
    const cuando = ch.paidAt > 0 ? iso(ch.paidAt) : ch.dueDate
    const retraso = daysLate(ch, cuando)
    const parcial = ch.paid + 0.005 < ch.amount
    fuera.push({
      kind: parcial ? 'partial' : retraso > 0 ? 'late-paid' : 'paid',
      at: ch.paidAt > 0 ? ch.paidAt : Date.parse(`${ch.dueDate}T12:00:00`),
      date: cuando,
      amount: ch.paid,
      ...(retraso > 0 ? { days: retraso } : {}),
      note: ch.note,
      chargeId: ch.id,
    })
  }

  // El registro guarda el precio que había ANTES de cada cambio, así que el
  // nuevo es el siguiente del registro, o el actual para el último.
  const log = client.priceLog ?? []
  log.forEach((entrada, i) => {
    const nuevo = log[i + 1]?.amount ?? client.amount
    if (Math.abs(nuevo - entrada.amount) < 0.005) return
    fuera.push({ kind: 'price', at: entrada.at, date: iso(entrada.at), from: entrada.amount, amount: nuevo })
  })

  for (const s of client.stars ?? []) {
    fuera.push({ kind: 'star', at: s.at, date: iso(s.at), otherId: s.referredId, note: s.note })
  }

  if (client.createdAt > 0) {
    fuera.push({
      kind: client.referredBy ? 'referred' : 'joined',
      at: client.createdAt,
      date: iso(client.createdAt),
      otherId: client.referredBy,
    })
  }

  return fuera.sort((a, b) => b.at - a.at).slice(0, limit)
}
