import { clientPerMonthForService, clientServices, type Charge, type Client } from './clients'
import { accountOccupancy, placeClients, serviceAccounts, serviceCostPerMonth, type Business, type Service } from './business'
import { monthKey } from './helpers'
import type { CurrencyCode, Transaction } from '@/types'

/**
 * DE QUIÉN ES CADA MOVIMIENTO.
 *
 * ── LO QUE HABÍA, Y POR QUÉ NO BASTABA ────────────────────────────────
 * Un negocio sabía qué era suyo por las CATEGORÍAS que le marcaste. Era
 * sencillo y no pedía migrar nada, pero tenía tres consecuencias que se
 * notaban:
 *
 *  1. Mover un servicio a otro negocio movía el servicio y sus clientes, pero
 *     no su dinero: lo cobrado seguía en la categoría del negocio viejo.
 *  2. Unir dos servicios no podía unir su dinero por lo mismo.
 *  3. Dos negocios con la misma categoría se repartían el mismo peso.
 *
 * ── LO QUE HAY AHORA ──────────────────────────────────────────────────
 * Cada movimiento ya sabe de quién es, sin preguntarle a la categoría:
 *
 *  · Un GASTO con `paidService` pagó ese servicio, y el servicio dice de qué
 *    negocio es.
 *  · Un INGRESO que está en los `txIds` de un cobro pagó a ese cliente, y el
 *    cliente dice de qué negocio y servicio es.
 *  · Lo demás —lo que se registró antes de que existieran estas marcas, o a
 *    mano fuera de Negocio— sigue contando por categoría, como siempre. Así
 *    nada de lo que ya tienes deja de sumar.
 *
 * Se deriva, no se guarda: no hay un campo «negocio» en cada movimiento que se
 * pueda desincronizar. Mover un servicio es cambiar un `businessId`, y todo su
 * dinero se va con él solo.
 */

export interface TxOwner {
  businessId: string
  /** El servicio, cuando se sabe uno solo. */
  serviceId?: string
  /** El cliente que pagó, si el movimiento es un cobro. */
  clientId?: string
  /** Cómo se supo: por la marca del movimiento, o por su categoría. */
  via: 'service' | 'client' | 'category'
}

export type OwnerFn = (tx: Transaction) => TxOwner | null

export interface OwnerContext {
  businesses: Business[]
  services: Service[]
  clients: Client[]
  charges: Charge[]
}

/**
 * La función que dice de quién es un movimiento.
 *
 * Se construye UNA vez con los índices hechos, y se llama por movimiento: la
 * pantalla de Ganancia la usa para miles de ellos en cada repintado.
 */
export function makeOwner(ctx: OwnerContext): OwnerFn {
  const servicios = new Map(ctx.services.map(s => [s.id, s]))
  const clientes = new Map(ctx.clients.map(c => [c.id, c]))
  const negocios = new Set(ctx.businesses.map(b => b.id))
  const cobroDe = new Map<string, string>()
  for (const ch of ctx.charges) for (const txId of ch.txIds) cobroDe.set(txId, ch.clientId)

  // Por categoría, el primer negocio que la reclama: con dos negocios y la
  // misma categoría, antes los dos se sumaban el mismo peso.
  const ingresoDe = new Map<string, string>()
  const gastoDe = new Map<string, string>()
  for (const b of ctx.businesses) {
    for (const id of b.incomeCategoryIds) if (!ingresoDe.has(id)) ingresoDe.set(id, b.id)
    for (const id of b.expenseCategoryIds) if (!gastoDe.has(id)) gastoDe.set(id, b.id)
  }

  const porCategoria = (tx: Transaction): TxOwner | null => {
    if (!tx.categoryId) return null
    const id = tx.type === 'income' ? ingresoDe.get(tx.categoryId) : gastoDe.get(tx.categoryId)
    return id ? { businessId: id, via: 'category' } : null
  }

  return (tx) => {
    if (tx.type === 'transfer') return null

    if (tx.type === 'expense' && tx.paidService) {
      const svc = servicios.get(tx.paidService)
      if (svc && negocios.has(svc.businessId)) {
        return { businessId: svc.businessId, serviceId: svc.id, via: 'service' }
      }
    }

    if (tx.type === 'income') {
      const clientId = cobroDe.get(tx.id)
      const client = clientId ? clientes.get(clientId) : undefined
      if (client) {
        const suyos = clientServices(client)
        const primero = suyos[0] ? servicios.get(suyos[0].serviceId) : undefined
        const businessId = client.businessId && negocios.has(client.businessId)
          ? client.businessId
          : primero?.businessId
        if (businessId && negocios.has(businessId)) {
          return {
            businessId,
            clientId: client.id,
            // Con dos servicios no hay UN servicio: se reparte al contar.
            serviceId: suyos.length === 1 ? suyos[0].serviceId : undefined,
            via: 'client',
          }
        }
      }
    }

    return porCategoria(tx)
  }
}

/**
 * Qué parte de un pago va a cada uno de sus servicios.
 *
 * Proporcional a lo que paga por cada uno: Netflix a 250 y Disney a 150 no son
 * 200 y 200. Sin servicios, todo queda fuera de ellos.
 */
export function serviceSplit(client: Client): Array<{ serviceId: string; share: number }> {
  const suyos = clientServices(client)
  const total = suyos.reduce((sum, s) => sum + s.amount, 0)
  if (!suyos.length) return []
  if (!(total > 0)) return [{ serviceId: suyos[0].serviceId, share: 1 }]
  return suyos.map(s => ({ serviceId: s.serviceId, share: s.amount / total }))
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

export interface ServiceRow {
  service: Service
  /** Lo que cobraste este mes a sus clientes. */
  collected: number
  /** Lo que te cuesta al mes, con todas sus cuentas. */
  monthlyCost: number
  profit: number
}

export interface ServiceBreakdown {
  rows: ServiceRow[]
  /** Cobrado por el negocio que no es de ningún servicio. */
  otherCollected: number
}

/**
 * LA GANANCIA DEL NEGOCIO, SERVICIO POR SERVICIO.
 *
 * Es G1 en una tabla: cada fila es lo que cobraste a los clientes de ese
 * servicio menos lo que te cuesta. La suma de las filas más lo que no es de
 * ningún servicio da la ganancia al mes del negocio, la de su cabecera.
 *
 * Los montos tienen que llegar ya en la divisa base, como en `businessMonth`.
 */
export function serviceBreakdown(
  business: Business,
  services: Service[],
  clients: Client[],
  txns: Transaction[],
  mkey: string,
  owner: OwnerFn,
  base?: CurrencyCode,
): ServiceBreakdown {
  const suyos = services.filter(s => s.businessId === business.id && !s.archivedAt)
  const cobrado = new Map<string, number>(suyos.map(s => [s.id, 0]))
  const clientes = new Map(clients.map(c => [c.id, c]))
  let otherCollected = 0

  for (const tx of txns) {
    if (tx.type !== 'income' || monthKey(tx.date) !== mkey) continue
    const quien = owner(tx)
    if (!quien || quien.businessId !== business.id) continue
    const client = quien.clientId ? clientes.get(quien.clientId) : undefined
    const reparto = client ? serviceSplit(client).filter(r => cobrado.has(r.serviceId)) : []
    if (!reparto.length) { otherCollected += tx.amount; continue }
    const suma = reparto.reduce((s, r) => s + r.share, 0)
    for (const r of reparto) cobrado.set(r.serviceId, (cobrado.get(r.serviceId) ?? 0) + tx.amount * r.share / suma)
  }

  const rows = suyos.map(service => {
    const collected = cents(cobrado.get(service.id) ?? 0)
    const monthlyCost = serviceCostPerMonth(service, base)
    return { service, collected, monthlyCost, profit: cents(collected - monthlyCost) }
  })
  return { rows, otherCollected: cents(otherCollected) }
}

export interface ClientProfit {
  client: Client
  /** Lo que paga al mes por este servicio. */
  pays: number
  /** Lo que te cuesta su plaza al mes. */
  slotCost: number
  /** Lo que te deja al mes. Negativo si debe: su plaza la estás pagando tú. */
  profit: number
  owes: number
}

/**
 * G3 · LO QUE TE DEJA CADA CLIENTE.
 *
 * Lo que paga por el servicio menos lo que cuesta su plaza. Si debe, su
 * ganancia es la plaza en negativo: la estás pagando tú mientras no paga.
 */
export function clientProfits(
  service: Service,
  clients: Client[],
  owesOf: (client: Client) => number,
  base?: CurrencyCode,
): ClientProfit[] {
  const suyos = clients.filter(c => c.active && !c.deletedAt && clientServices(c).some(s => s.serviceId === service.id))
  const coste = serviceCostPerMonth(service, base)
  const cuentas = serviceAccounts(service)
  const plazas = cuentas.every(a => a.capacity && a.capacity > 0)
    ? cuentas.reduce((sum, a) => sum + (a.capacity ?? 0), 0)
    : suyos.length
  // Con las plazas llenas cada una cuesta su parte; con huecos, las vacías no
  // son culpa de nadie y no se le cargan a quien sí está.
  const slotCost = cents(plazas > 0 ? coste / plazas : 0)
  return suyos
    .map(client => {
      const pays = clientPerMonthForService(client, service.id, base)
      const owes = owesOf(client)
      return { client, pays, slotCost, owes, profit: cents(owes > 0 ? -slotCost : pays - slotCost) }
    })
    .sort((a, b) => b.profit - a.profit)
}

export interface AccountProfit {
  accountId: string
  label?: string
  cost: number
  revenue: number
  profit: number
  used: number
  free: number | null
}

/**
 * G3 · Y CADA CUENTA.
 *
 * Una cuenta llena te deja; una con plazas vacías las pagas tú. Es lo que
 * contesta «¿cierro la cuenta 2?».
 */
export function accountProfits(service: Service, clients: Client[], base?: CurrencyCode): AccountProfit[] {
  // Lo que vale al mes UNA unidad del coste del servicio, ya con su ciclo y su
  // divisa: así cada cuenta se pasa al mes con la misma regla que el total,
  // sin repetir aquí las dos normalizaciones.
  const alMes = serviceCostPerMonth({ ...service, accounts: [{ id: 'unidad', cost: 1 }] }, base)
  // Con la MISMA colocación que la ocupación: si no, un cliente sin cuenta
  // ocuparía plaza en una y pagaría en ninguna.
  const dondeEsta = placeClients(service, clients)
  return accountOccupancy(service, clients).map(({ account, used, free }) => {
    const cost = cents(account.cost * alMes)
    const revenue = cents(clients
      .filter(c => dondeEsta.get(c.id) === account.id)
      .reduce((sum, c) => sum + clientPerMonthForService(c, service.id, base), 0))
    return { accountId: account.id, label: account.label, cost, revenue, profit: cents(revenue - cost), used, free }
  })
}
