import { cycleMonths } from './billing'
import { clientServices, type Client } from './clients'
import { serviceAccounts, type Business, type Service, type ServiceAccount } from './business'
import { matchBrand } from './brandMatch'
import { convertCurrency } from './currencies'
import type { Transaction } from '@/types'

/**
 * S3 · UNIR SERVICIOS: «NETFLIX SUB 2» PASA A SER LA CUENTA 2.
 *
 * ── POR QUÉ HAY SERVICIOS REPETIDOS ───────────────────────────────────
 * Las cuentas de un servicio no tuvieron pantalla hasta la 2.3.0. Quien
 * compraba una segunda cuenta de Netflix la daba de alta como OTRO servicio,
 * y desde entonces el margen se calcula dos veces y el negocio suma dos filas
 * que son una.
 *
 * ── QUÉ HACE UNIR ─────────────────────────────────────────────────────
 *  · Las cuentas del que se une pasan al que queda, con su coste convertido
 *    al ciclo y la divisa del que queda: una cuenta anual en dólares unida a
 *    un servicio mensual en pesos tiene que seguir costando lo mismo.
 *  · Sus clientes pasan al que queda, en la cuenta en la que estaban.
 *  · Sus pagos del libro pasan a estar marcados con el que queda.
 *  · El que se une desaparece. Todo se puede deshacer.
 */

export interface ServiceMergePlan {
  /** Las cuentas del que queda, ya con las del que se une. */
  accounts: ServiceAccount[]
  /** Cliente → campos que cambian. */
  clientChanges: Map<string, Partial<Client>>
  /** Los gastos del libro que pasan a marcarse con el que queda. */
  paymentIds: string[]
  /** Para la vista previa. */
  clients: number
}

/** El coste de una cuenta pasado al ciclo y la divisa de otro servicio. */
function costeComo(cost: number, from: Service, to: Service): number {
  const mFrom = cycleMonths(from.costCycle, from.costCustomMonths)
  const mTo = cycleMonths(to.costCycle, to.costCustomMonths)
  let c = cost
  if (mFrom && mTo && mFrom !== mTo) c = (c / mFrom) * mTo
  if (from.currency && to.currency && from.currency !== to.currency) c = convertCurrency(c, from.currency, to.currency)
  return Math.round(c * 100) / 100
}

export function serviceMergePlan(
  target: Service,
  source: Service,
  clients: Client[],
  txns: Transaction[],
): ServiceMergePlan {
  // Las del que queda, MATERIALIZADAS: si tenía la implícita, pasa a ser una
  // de verdad con el mismo id, y los clientes que estaban en ella siguen ahí.
  const propias = serviceAccounts(target)
  const ajenas = serviceAccounts(source).map(a => ({ ...a, cost: costeComo(a.cost, source, target) }))
  const accounts = [...propias, ...ajenas]
  const primeraAjena = ajenas[0]?.id

  const clientChanges = new Map<string, Partial<Client>>()
  for (const c of clients) {
    const suyos = clientServices(c)
    if (!suyos.some(s => s.serviceId === source.id)) continue
    if (c.serviceShares?.length) {
      // Si ya tenía los dos, se queda uno con la suma: dos repartos al mismo
      // servicio harían que pagara dos veces por la misma plaza.
      const juntos = new Map<string, number>()
      for (const s of c.serviceShares) {
        const id = s.serviceId === source.id ? target.id : s.serviceId
        juntos.set(id, Math.round(((juntos.get(id) ?? 0) + s.amount) * 100) / 100)
      }
      clientChanges.set(c.id, {
        serviceShares: [...juntos].map(([serviceId, amount]) => ({ serviceId, amount })),
        businessId: target.businessId,
        serviceAccountId: c.serviceAccountId ?? primeraAjena,
      })
    } else {
      clientChanges.set(c.id, {
        serviceId: target.id,
        businessId: target.businessId,
        // Donde estaba, si estaba en una; si no, en la primera de las que
        // traía su servicio: así ocupa plaza en la cuenta que de verdad usa.
        serviceAccountId: c.serviceAccountId ?? primeraAjena,
      })
    }
  }

  const paymentIds = txns
    .filter(tx => tx.type === 'expense' && tx.paidService === source.id)
    .map(tx => tx.id)

  return { accounts, clientChanges, paymentIds, clients: clientChanges.size }
}

/**
 * G2 · UNIR NEGOCIOS: tus varios Netflix en uno.
 *
 * Sus servicios y clientes pasan al que queda, y sus categorías se suman a
 * las suyas para que lo viejo, que se cuenta por categoría, también venga.
 */
export interface BusinessMergePlan {
  incomeCategoryIds: string[]
  expenseCategoryIds: string[]
  serviceIds: string[]
  clientIds: string[]
}

export function businessMergePlan(
  target: Business,
  sources: Business[],
  services: Service[],
  clients: Client[],
): BusinessMergePlan {
  const ids = new Set(sources.map(b => b.id))
  const union = (a: string[], extra: string[][]) => [...new Set([...a, ...extra.flat()])]
  return {
    incomeCategoryIds: union(target.incomeCategoryIds, sources.map(b => b.incomeCategoryIds)),
    expenseCategoryIds: union(target.expenseCategoryIds, sources.map(b => b.expenseCategoryIds)),
    serviceIds: services.filter(s => ids.has(s.businessId)).map(s => s.id),
    clientIds: clients.filter(c => c.businessId && ids.has(c.businessId)).map(c => c.id),
  }
}

/**
 * La marca de un servicio para compararlo con otro.
 *
 * El catálogo si la reconoce; si no, el nombre sin números ni «sub», «cuenta»
 * o «plan» al final: «Netflix Sub 2» y «Netflix» son la misma cosa.
 */
export function brandKey(name: string): string {
  const marca = matchBrand(name)
  if (marca) return marca.id
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(sub|cuenta|plan|perfil|premium|familiar|account|profile)\b/g, '')
    .replace(/[^a-z]/g, '')
}

/** Grupos de servicios que parecen el mismo, para proponer unirlos. */
export function similarServices(services: Service[]): Service[][] {
  const grupos = new Map<string, Service[]>()
  for (const s of services) {
    if (s.archivedAt) continue
    const k = brandKey(s.name)
    if (k.length < 3) continue
    grupos.set(k, [...(grupos.get(k) ?? []), s])
  }
  return [...grupos.values()].filter(g => g.length > 1)
}

/**
 * Negocios que parecen el mismo: los que venden la misma marca.
 *
 * No por el nombre del negocio —«Pantallas» y «Netflix» pueden ser lo mismo—
 * sino por lo que venden, que es lo que los hace el mismo negocio.
 */
export function similarBusinesses(businesses: Business[], services: Service[]): Business[][] {
  const vivos = businesses.filter(b => !b.archivedAt)
  const marcasDe = new Map(vivos.map(b => [b.id, new Set(services.filter(s => s.businessId === b.id && !s.archivedAt).map(s => brandKey(s.name)))]))
  const vistos = new Set<string>()
  const fuera: Business[][] = []
  for (const b of vivos) {
    if (vistos.has(b.id)) continue
    const mias = marcasDe.get(b.id)!
    if (!mias.size) continue
    const grupo = vivos.filter(o => o.id !== b.id && !vistos.has(o.id)
      && [...(marcasDe.get(o.id) ?? [])].some(m => mias.has(m)))
    if (grupo.length) {
      fuera.push([b, ...grupo])
      vistos.add(b.id)
      for (const o of grupo) vistos.add(o.id)
    }
  }
  return fuera
}

/**
 * PAGOS VIEJOS SIN MARCA que parecen de este servicio.
 *
 * Antes de la 2.3.0 los pagos de un servicio no llevaban su marca, así que
 * cuentan por categoría y no se mueven con él. Estos son los candidatos: un
 * gasto sin marca, en una categoría del negocio, cuya nota menciona el
 * servicio. La app los propone; el usuario decide.
 */
export function unmarkedPayments(
  service: Service,
  business: Business | undefined,
  txns: Transaction[],
  /** Los demás servicios: un pago cuya nota es el nombre de OTRO no es de este. */
  others: Service[] = [],
): Transaction[] {
  const cats = new Set(business?.expenseCategoryIds ?? [])
  const clave = brandKey(service.name)
  if (clave.length < 3) return []
  const exacto = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
  const mio = exacto(service.name)
  const ajenos = new Set(others.filter(o => o.id !== service.id).map(o => exacto(o.name)).filter(n => n !== mio))
  return txns.filter(tx => tx.type === 'expense'
    && !tx.paidService
    && !!tx.categoryId && cats.has(tx.categoryId)
    && brandKey(tx.note ?? '').includes(clave)
    // «Netflix Sub 2» y «Netflix Sub» son la misma marca, pero si la nota
    // dice exactamente el nombre del otro, ese pago es del otro.
    && !ajenos.has(exacto(tx.note ?? '')))
}
