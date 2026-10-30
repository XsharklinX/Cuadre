import { chargeState, clientPerMonth, clientPerMonthForService, clientServices, outstanding, daysLate, isOnService, type Charge, type Client } from './clients'
import { serviceCostPerMonth, serviceMargin, type Service } from './business'
import { averageDelay } from './receivables'
import type { CurrencyCode } from '@/types'

/*
 * LA PORTADA DE NEGOCIO («HOY») Y LO QUE LA ACOMPAÑA.
 *
 * Funciones puras sobre clientes, cobros y servicios. Quien vive de cobrar
 * abre Negocio para saber tres cosas: quién me paga hoy, quién está atrasado
 * y cómo va el mes. Todo sale de aquí.
 */

const cents = (n: number) => Math.round(n * 100) / 100

export interface LateClient {
  client: Client
  charges: Charge[]
  owed: number
  maxDays: number
}

export interface BizToday {
  /** Lo que llegó este mes, de verdad. */
  collected: number
  /** Lo que se esperaba cobrar este mes (vencido este mes, cobrado o no). */
  expected: number
  /** Cobros que vencen hoy y siguen abiertos. */
  dueToday: Charge[]
  /** Atrasados, uno por cliente, el que más debe primero. */
  late: LateClient[]
  /** Los próximos cobros, para el día en que no toca nada. */
  upcoming: Charge[]
}

export function bizToday(charges: Charge[], clients: Client[], today: string): BizToday {
  const vivos = new Map(clients.filter(c => !c.deletedAt).map(c => [c.id, c]))
  const mine = charges.filter(ch => vivos.has(ch.clientId) && !ch.waived)
  const mes = today.slice(0, 7)
  let collected = 0, expected = 0
  for (const ch of mine) {
    if (ch.dueDate.slice(0, 7) === mes) expected += ch.amount
    if (ch.paidAt > 0 && new Date(ch.paidAt).toISOString().slice(0, 7) === mes) collected += ch.paid
    else if (ch.paid > 0 && ch.dueDate.slice(0, 7) === mes) collected += ch.paid
  }
  const dueToday = mine.filter(ch => {
    const e = chargeState(ch, today)
    return e === 'today' || (e === 'partial' && ch.dueDate === today)
  })
  const byClient = new Map<string, LateClient>()
  for (const ch of mine) {
    const e = chargeState(ch, today)
    const atrasado = e === 'late' || (e === 'partial' && ch.dueDate < today)
    if (!atrasado) continue
    const client = vivos.get(ch.clientId)!
    const g = byClient.get(client.id) ?? { client, charges: [], owed: 0, maxDays: 0 }
    g.charges.push(ch)
    g.owed = cents(g.owed + outstanding(ch))
    g.maxDays = Math.max(g.maxDays, daysLate(ch, today))
    byClient.set(client.id, g)
  }
  const upcoming = mine
    .filter(ch => chargeState(ch, today) === 'upcoming')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 3)
  return {
    collected: cents(collected),
    expected: cents(expected),
    dueToday,
    late: [...byClient.values()].sort((a, b) => b.owed - a.owed || b.maxDays - a.maxDays),
    upcoming,
  }
}

/*
 * PLAZAS LIBRES: EL DINERO QUE SE QUEDA EN LA MESA.
 *
 * Cada servicio con tope de plazas sabe cuántas le quedan. Cada plaza libre
 * vale lo que pagan de media los que ya están en ese servicio.
 */
export function freeSlotsValue(services: Service[], clients: Client[], base?: CurrencyCode): {
  slots: number
  perMonth: number
  byService: { service: Service; free: number; value: number }[]
} {
  const byService = services
    .filter(s => !s.archivedAt)
    .map(service => {
      const m = serviceMargin(service, clients, base)
      if (m.freeSlots === null || m.freeSlots <= 0) return null
      const precio = m.clientCount > 0 ? m.revenue / m.clientCount : 0
      return { service, free: m.freeSlots, value: cents(precio * m.freeSlots) }
    })
    .filter((x): x is { service: Service; free: number; value: number } => !!x)
  return {
    slots: byService.reduce((s, x) => s + x.free, 0),
    perMonth: cents(byService.reduce((s, x) => s + x.value, 0)),
    byService,
  }
}

/*
 * QUIÉN TE DEJA MÁS: lo que paga cada cliente al mes menos lo que te cuesta
 * su plaza (el coste del servicio repartido entre los que lo usan).
 */
export function clientProfit(clients: Client[], services: Service[], base?: CurrencyCode): { client: Client; pays: number; cost: number; profit: number }[] {
  const activos = clients.filter(c => c.active && !c.deletedAt)
  const costePorPlaza = new Map<string, number>()
  for (const s of services) {
    const usan = activos.filter(c => isOnService(c, s.id)).length
    if (usan > 0) costePorPlaza.set(s.id, serviceCostPerMonth(s, base) / usan)
  }
  return activos
    .map(client => {
      const pays = clientPerMonth(client, base)
      const cost = clientServices(client).reduce((sum, sh) => sum + (costePorPlaza.get(sh.serviceId) ?? 0), 0)
      return { client, pays: cents(pays), cost: cents(cost), profit: cents(pays - cost) }
    })
    .sort((a, b) => b.profit - a.profit)
}

export type Punctuality = 'onTime' | 'sometimes' | 'late'

/*
 * LA PUNTUALIDAD DE UN CLIENTE, sobre sus cobros ya pagados: media de días
 * de retraso. Hacen falta al menos dos cobros para opinar.
 */
export function punctuality(charges: Charge[]): { kind: Punctuality; avgDays: number } | null {
  const pagados = charges.filter(c => c.paidAt > 0 && !c.waived)
  if (pagados.length < 2) return null
  const avg = averageDelay(pagados) ?? 0
  return { kind: avg <= 1 ? 'onTime' : avg <= 5 ? 'sometimes' : 'late', avgDays: avg }
}

/** Lo que paga un cliente a un servicio al mes (atajo para las listas). */
export function clientServiceMonthly(client: Client, serviceId: string, base?: CurrencyCode): number {
  return clientPerMonthForService(client, serviceId, base)
}
