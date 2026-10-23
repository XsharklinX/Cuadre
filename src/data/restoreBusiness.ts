import type { Caprice } from './caprices'
import type { Charge, Client } from './clients'
import type { Business, Service } from './business'
import type { Transaction } from '@/types'

/**
 * RESTAURAR LOS DATOS DE NEGOCIO SIN DESTRUIR NADA.
 *
 * ── EL DAÑO QUE ESTO EVITA ────────────────────────────────────────────
 * Clientes, cobros y caprichos viven en almacenes propios y hasta ahora la
 * copia de seguridad no los incluía. Restaurar reemplazaba los movimientos y
 * dejaba esos almacenes intactos, así que:
 *
 * · Los cobros marcados como pagados apuntaban a `txId` de movimientos que ya
 *   no existían: el libro decía una cosa y la lista de clientes otra.
 * · `useCaprices.prune` y `pruneOrphanReceipts` —que corren al arrancar— veían
 *   esos ids huérfanos y BORRABAN los caprichos y las fotos de recibo por
 *   considerarlos basura.
 *
 * O sea: restaurar una copia destruía datos en silencio. Esto lo arregla
 * reconciliando en vez de borrando.
 *
 * ── LAS DOS REGLAS ────────────────────────────────────────────────────
 *
 * **Un cobro cuyo movimiento ya no está vuelve a PENDIENTE.** No se borra: el
 * cobro sigue siendo cierto —ese cliente te debía ese dinero ese día—; lo que
 * se perdió es la prueba de que llegó. Dejarlo «pagado» sería afirmar un
 * ingreso que el libro no tiene.
 *
 * **Un capricho cuyo gasto ya no está se descarta.** Aquí sí, y por lo
 * contrario: un capricho ES la referencia a un gasto. Sin el gasto no queda
 * nada que recuperar, y un bote que pide devolver dinero de una compra que
 * nadie puede ver no se puede ni entender ni cerrar.
 */

export interface BusinessData {
  clients: Client[]
  businesses: Business[]
  services: Service[]
  charges: Charge[]
  caprices: Caprice[]
}

export interface RestoreReport {
  /** Cobros que volvieron a pendiente porque su movimiento no está. */
  chargesUnlinked: number
  /** Aportes de caprichos descartados por lo mismo. */
  capricePaymentsDropped: number
  /** Caprichos descartados porque su gasto ya no existe. */
  capricesDropped: number
  /** Cobros descartados porque su cliente no vino en la copia. */
  chargesOrphaned: number
  /** Servicios descartados porque su negocio no vino en la copia. */
  servicesOrphaned: number
}

export interface RestoreResult {
  data: BusinessData
  report: RestoreReport
}

/** Si el informe tiene algo que contar al usuario. */
export function hasChanges(report: RestoreReport): boolean {
  return Object.values(report).some(n => n > 0)
}

/**
 * Reconcilia los datos de negocio contra el libro que se acaba de restaurar.
 *
 * @param incoming  lo que venía en la copia; `undefined` donde no traía nada.
 * @param transactions  el libro YA restaurado, que es la verdad.
 */
export function reconcileBusinessData(
  incoming: Partial<BusinessData>,
  transactions: Transaction[],
): RestoreResult {
  const txIds = new Set(transactions.map(t => t.id))

  const clients = incoming.clients ?? []
  const businesses = incoming.businesses ?? []
  const clientIds = new Set(clients.map(c => c.id))
  const businessIds = new Set(businesses.map(b => b.id))

  // Un servicio sin su negocio no se puede enseñar en ningún sitio.
  const services = (incoming.services ?? []).filter(s => businessIds.has(s.businessId))
  const servicesOrphaned = (incoming.services ?? []).length - services.length

  let chargesUnlinked = 0
  const conCliente = (incoming.charges ?? []).filter(c => clientIds.has(c.clientId))
  const chargesOrphaned = (incoming.charges ?? []).length - conCliente.length

  const charges = conCliente.map((charge): Charge => {
    const vivos = charge.txIds.filter(id => txIds.has(id))
    if (vivos.length === charge.txIds.length) return charge
    chargesUnlinked += 1
    /*
     * Vuelve a pendiente, no se borra.
     *
     * `paid` se recalcula a cero porque no hay forma de saber cuánto aportaba
     * cada movimiento perdido: el cobro guarda la suma, no el desglose.
     * Afirmar un pago parcial inventado sería peor que decir que no llegó.
     */
    return { ...charge, txIds: vivos, paid: 0, paidAt: 0 }
  })

  let capricePaymentsDropped = 0
  const conGasto = (incoming.caprices ?? []).filter(c => txIds.has(c.txId))
  const capricesDropped = (incoming.caprices ?? []).length - conGasto.length

  const caprices = conGasto.map((caprice): Caprice => {
    const vivos = caprice.payments.filter(p => txIds.has(p.txId))
    if (vivos.length === caprice.payments.length) return caprice
    capricePaymentsDropped += caprice.payments.length - vivos.length
    return { ...caprice, payments: vivos }
  })

  return {
    data: { clients, businesses, services, charges, caprices },
    report: {
      chargesUnlinked,
      capricePaymentsDropped,
      capricesDropped,
      chargesOrphaned,
      servicesOrphaned,
    },
  }
}

/**
 * Lo que una copia trae de negocio, para poder decirlo ANTES de restaurar.
 *
 * Una copia vieja (v1–v3) no trae nada, y restaurarla sobre datos actuales
 * dejaría al usuario con clientes que ya no cuadran con su libro. Eso hay que
 * avisarlo antes, no después.
 */
export interface BackupContents {
  transactions: number
  accounts: number
  clients: number
  businesses: number
  charges: number
  caprices: number
  /** `true` si la copia no trae NADA de negocio pero el usuario sí tiene. */
  missingBusiness: boolean
}

export function describeBackup(
  // Todo `unknown[]`: aqui solo se CUENTAN, y contar no necesita que esten
  // validados. Pedir los tipos reales obligaria a sanear antes de poder
  // decirle al usuario cuantos clientes trae la copia.
  data: {
    transactions?: unknown[]; accounts?: unknown[]
    clients?: unknown[]; businesses?: unknown[]; charges?: unknown[]; caprices?: unknown[]
  },
  currentClientCount: number,
): BackupContents {
  const clients = data.clients?.length ?? 0
  const businesses = data.businesses?.length ?? 0
  return {
    transactions: data.transactions?.length ?? 0,
    accounts: data.accounts?.length ?? 0,
    clients,
    businesses,
    charges: data.charges?.length ?? 0,
    caprices: data.caprices?.length ?? 0,
    missingBusiness: clients === 0 && businesses === 0 && currentClientCount > 0,
  }
}
