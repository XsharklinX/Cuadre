import { clientServices, clientTotalAmount, outstanding, type Charge, type Client } from './clients'
import { normalizeName } from './duplicateClients'

/**
 * E2 · LA LISTA DE CLIENTES: BUSCAR, FILTRAR Y ORDENAR.
 *
 * Con veinte clientes la lista ya no se lee de arriba abajo. Los filtros
 * llevan su número —«Deben 2»— para que, sin tocarlos, ya se sepa si hay algo
 * pendiente.
 */

export type ClientFilter = 'all' | 'owe' | 'paused' | 'stars' | `svc:${string}`
export type ClientSort = 'service' | 'az' | 'owe' | 'pays' | 'late'

/**
 * Lo que DEBE cada cliente: lo vencido que falta, de una pasada.
 *
 * Solo lo que ya venció (hoy incluido). Un cobro del día 28 generado por
 * adelantado no es una deuda: contarlo ponía «Debe 2 cobros» en rojo a quien
 * se acababa de apuntar y todavía no le tocaba pagar nada.
 */
export function owedByClient(charges: Charge[], today: string): Map<string, number> {
  const fuera = new Map<string, number>()
  for (const ch of charges) {
    if (ch.waived || ch.dueDate > today) continue
    const falta = outstanding(ch)
    if (falta > 0.005) fuera.set(ch.clientId, (fuera.get(ch.clientId) ?? 0) + falta)
  }
  return fuera
}

/** Los clientes que se enseñan: todos menos los borrados con su historial. */
export function visibleClients(clients: Client[]): Client[] {
  return clients.filter(c => !c.deletedAt)
}

/** Si un cliente casa con lo que se busca: nombre, teléfono o concepto. */
export function matchesQuery(client: Client, query: string): boolean {
  const q = normalizeName(query)
  if (!q) return true
  if (normalizeName(client.name).includes(q)) return true
  if (client.concept && normalizeName(client.concept).includes(q)) return true
  // Por los dígitos sueltos, no con `normalizePhone`: esa pide un número
  // entero para comparar dos, y aquí se busca con «5551».
  const tel = query.replace(/\D/g, '')
  return tel.length >= 3 && (client.phone ?? '').replace(/\D/g, '').includes(tel)
}

export function matchesFilter(client: Client, filter: ClientFilter, owed: Map<string, number>): boolean {
  if (filter === 'all') return true
  if (filter === 'owe') return (owed.get(client.id) ?? 0) > 0
  if (filter === 'paused') return !client.active
  if (filter === 'stars') return (client.stars?.length ?? 0) > 0
  const svc = filter.slice(4)
  return clientServices(client).some(s => s.serviceId === svc)
}

/** Cuántos hay en cada filtro, para los números de los botones. */
export function filterCounts(clients: Client[], owed: Map<string, number>): Record<'all' | 'owe' | 'paused' | 'stars', number> {
  return {
    all: clients.length,
    owe: clients.filter(c => (owed.get(c.id) ?? 0) > 0).length,
    paused: clients.filter(c => !c.active).length,
    stars: clients.filter(c => (c.stars?.length ?? 0) > 0).length,
  }
}

/**
 * `delay`: días de retraso medio por cliente (N6, puntualidad). Solo lo usa el
 * orden «los que más se atrasan».
 */
export function sortClients(clients: Client[], sort: ClientSort, owed: Map<string, number>, delay?: Map<string, number>): Client[] {
  const nombre = (a: Client, b: Client) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
  const copia = [...clients]
  switch (sort) {
    case 'az': return copia.sort(nombre)
    case 'owe': return copia.sort((a, b) => (owed.get(b.id) ?? 0) - (owed.get(a.id) ?? 0) || nombre(a, b))
    case 'pays': return copia.sort((a, b) => clientTotalAmount(b) - clientTotalAmount(a) || nombre(a, b))
    case 'late': return copia.sort((a, b) => (delay?.get(b.id) ?? -1) - (delay?.get(a.id) ?? -1) || nombre(a, b))
    // Por servicio lo agrupa la pantalla; aquí basta con dejarlos en orden de
    // nombre dentro de cada grupo.
    case 'service': return copia.sort(nombre)
  }
}

/**
 * L3 · EL RECORDATORIO, LISTO PARA PEGAR.
 *
 * La plantilla se edita una vez y sirve para todos. Es copiar y pegar en
 * WhatsApp: la app no manda nada por su cuenta.
 */
export function reminderMessage(
  template: string,
  values: { name: string; amount: string; service: string; months: number },
): string {
  return template
    .replace(/\{nombre\}|\{name\}/g, values.name.split(/\s+/)[0] ?? values.name)
    .replace(/\{monto\}|\{amount\}/g, values.amount)
    .replace(/\{servicio\}|\{service\}/g, values.service)
    .replace(/\{meses\}|\{months\}/g, String(values.months))
}
