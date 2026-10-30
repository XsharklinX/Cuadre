import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { CYCLE_ORDER, type BillingCycle } from '@/data/billing'
import { applyPayment, pendingCharges, revokePayment } from '@/data/receivables'
import { serviceAccounts, type Business, type PayMode, type Service, type ServiceAccount } from '@/data/business'
import type { Charge, Client, ClientStar } from '@/data/clients'
import { referralDiscount, referralRules } from '@/data/referrals'
import { trimHandled } from '@/data/autopay'
import { localToday } from '@/data/helpers'
import { mergePlan } from '@/data/duplicateClients'
import { newId } from '@/data/seed'

/**
 * CLIENTES, NEGOCIOS, SERVICIOS Y COBROS.
 *
 * ── POR QUÉ ESTO NO VIVE EN EL LIBRO ──────────────────────────────────
 * Clave de almacenamiento propia, igual que la papelera. Nada de esto es
 * dinero: un cobro esperado es una expectativa con fecha, y un negocio es una
 * forma de mirar movimientos que ya existen. Meterlo en `sharky-finance-v2`
 * obligaría a tocar el saneado al cargar, el formato de las copias de seguridad
 * y Salud de datos — para guardar cosas que no mueven ni un peso.
 *
 * El dinero sigue viviendo donde vivía: en `transactions` y en los saldos de
 * las cuentas. La única puerta entre las dos mitades es `markPaid`, que crea un
 * movimiento de verdad por `addTx` y guarda su id. Una sola puerta es una sola
 * cosa que puede fallar.
 */

/** Todo lo necesario para que una fusión se pueda deshacer de verdad. */
export interface MergeUndo {
  /** Los clientes absorbidos, enteros y tal como estaban. */
  absorbed: Client[]
  /** El cliente que sobrevivió, tal como estaba ANTES de absorber. */
  survivorBefore: Client
  /** Cada cobro movido, con el dueño que tenía. */
  charges: Array<{ chargeId: string; clientId: string }>
}

interface BusinessState {
  clients: Client[]
  businesses: Business[]
  services: Service[]
  charges: Charge[]

  // ── Clientes ───────────────────────────────────────────
  addClient: (c: Omit<Client, 'id' | 'createdAt'>) => string
  updateClient: (id: string, fields: Partial<Omit<Client, 'id'>>) => void
  deleteClient: (id: string) => void
  /**
   * L1 · BORRAR CONSERVANDO SU HISTORIAL.
   *
   * Sale de todas las listas y no genera cobros, pero sus cobros pagados
   * siguen sumando en Ganancia. No puede ser un borrado de verdad: al cargar,
   * los cobros sin cliente se descartan.
   */
  softDeleteClient: (id: string) => void
  restoreClient: (id: string) => void
  /** L1 · BORRAR TODO: el cliente y todos sus cobros. El libro no se toca. */
  purgeClient: (id: string) => void
  /** L2 · Los mismos campos a varios clientes a la vez. */
  updateClients: (ids: string[], fields: Partial<Omit<Client, 'id'>>) => void
  /** Una estrella más: alguien que te trajo. */
  addStar: (clientId: string, star: ClientStar) => void
  removeStar: (clientId: string, at: number) => void

  // ── Cuentas de un servicio ─────────────────────────────
  /** Cambia una cuenta. Si el servicio tenía la implícita, la materializa. */
  updateAccount: (serviceId: string, accountId: string, fields: Partial<Omit<ServiceAccount, 'id'>>) => void
  /** Cierra una cuenta y pasa sus clientes a otra. */
  closeAccount: (serviceId: string, accountId: string, moveTo: string | null) => void
  /** S2 · Deja guardado en qué cuenta está cada cliente. */
  assignAccounts: (assignments: Map<string, string>) => void

  // ── Pagos de servicios ─────────────────────────────────
  /** Apunta pagos como resueltos: registrados, pagados a mano o descartados. */
  markPayHandled: (serviceId: string, keys: string[], today: string) => void
  /** «Mañana»: no vuelve a preguntar por ese pago hasta esa fecha. */
  snoozePay: (serviceId: string, key: string, until: string) => void
  /** Deshace un «resuelto», para el deshacer del aviso. */
  unmarkPayHandled: (serviceId: string, keys: string[]) => void
  archiveService: (id: string, archived: boolean) => void
  /**
   * Otro cliente con el mismo trato: mismo servicio, mismo precio, mismo día.
   *
   * Con doce clientes del mismo servicio al mismo precio, añadir el trece era
   * reescribir ocho campos que ya estaban escritos doce veces.
   *
   * Lo que NO se copia es su historial: los cobros son de él, no del trato.
   * Un cliente nuevo que naciera debiendo lo que debía otro sería dinero
   * inventado.
   */
  duplicateClient: (id: string) => string | null
  /**
   * UNE DOS FICHAS EN UNA. Devuelve lo necesario para deshacerlo.
   *
   * Lo que se guarda para deshacer son los clientes absorbidos ENTEROS y a
   * qué cliente apuntaba cada cobro movido. Con eso se vuelve exactamente al
   * estado anterior; con menos, deshacer sería una aproximación.
   */
  mergeClients: (survivorId: string, absorbedIds: string[]) => MergeUndo | null
  /** Deshace una fusión, con lo que ella misma devolvió. */
  unmergeClients: (undo: MergeUndo) => void

  /** Mueve un servicio a otro negocio. Sus clientes van con él. */
  moveService: (serviceId: string, businessId: string) => void
  /** Cambia a un cliente de servicio sin pasar por su formulario. */
  moveClientToService: (clientId: string, serviceId: string) => void
  /** El orden en que se enseñan, puesto a mano. */
  reorderBusinesses: (ids: string[]) => void
  reorderServices: (ids: string[]) => void
  /** Archivar NO es borrar: sale de la lista y su historial sigue contando. */
  archiveBusiness: (id: string, archived: boolean) => void

  // ── Negocios y servicios ───────────────────────────────
  addBusiness: (b: Omit<Business, 'id' | 'createdAt'>) => string
  updateBusiness: (id: string, fields: Partial<Omit<Business, 'id'>>) => void
  deleteBusiness: (id: string) => void
  addService: (s: Omit<Service, 'id' | 'createdAt'>) => string
  updateService: (id: string, fields: Partial<Omit<Service, 'id'>>) => void
  deleteService: (id: string) => void

  // ── Cobros ─────────────────────────────────────────────
  /** Crea los cobros que faltan según las plantillas. Idempotente. */
  syncCharges: (today: string) => number
  /** Un cobro suelto, para quien factura montos distintos cada vez. */
  addCharge: (clientId: string, dueDate: string, amount: number) => string
  updateCharge: (id: string, fields: Partial<Omit<Charge, 'id'>>) => void
  deleteCharge: (id: string) => void
  /**
   * Marca cobrado con el movimiento que lo respalda.
   *
   * `txId` no es burocracia: es la prueba de que el dinero existe. Quien llama
   * crea primero el movimiento con `addTx` y pasa su id aquí.
   */
  markPaid: (chargeId: string, amount: number, txId: string) => void
  /** Deshace un pago (p. ej. si se borró el movimiento). */
  unmarkPaid: (chargeId: string, txId: string, amount: number) => void
  /** Da por perdido un cobro: deja de contar como atrasado. */
  waiveCharge: (id: string, waived: boolean) => void
}

/** Un ciclo que no reconocemos se trae de una versión futura o está corrupto. */
function safeCycle(value: unknown): BillingCycle {
  return CYCLE_ORDER.includes(value as BillingCycle) ? (value as BillingCycle) : 'monthly'
}

/**
 * Reordena una lista según los ids dados, dejando al final lo que no venga.
 *
 * Lo que no esté en `ids` no se pierde: una lista de orden que llegara
 * incompleta —por una copia vieja, por un filtro en la pantalla— borraría
 * negocios enteros si esto se escribiera como un `map`.
 */
function ordenarPor<T extends { id: string }>(lista: T[], ids: string[]): T[] {
  const porId = new Map(lista.map(x => [x.id, x]))
  const fuera: T[] = []
  for (const id of ids) {
    const x = porId.get(id)
    if (x) { fuera.push(x); porId.delete(id) }
  }
  return [...fuera, ...porId.values()]
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Sanea lo que viene de disco.
 *
 * Aquí descartar es seguro —no hay dinero vivo, solo expectativas y
 * agrupaciones— pero se repara en vez de descartar cuando se puede: perderle a
 * alguien su lista de clientes por un campo raro sería peor que arreglarlo.
 */
/**
 * Se EXPORTA porque es el unico validador de estos datos.
 *
 * Al restaurar una copia hace falta sanear lo que viene antes de meterlo en el
 * almacen, y escribir un segundo validador alli habria garantizado que los dos
 * acabaran discrepando: uno aceptando lo que el otro rechaza.
 */
/**
 * Cuántos precios se recuerdan de un cliente.
 *
 * Doce es más historia de la que nadie mira y sigue cabiendo en una copia de
 * seguridad sin pesar. Lo que se enseña es el anterior; el resto está por si
 * hace falta mirar atrás.
 */
const PRICE_LOG_MAX = 12

const PAY_MODES: PayMode[] = ['auto', 'ask', 'manual']

/**
 * Las cuentas de un servicio como lista propia.
 *
 * Un servicio sin cuentas tiene una implícita (`id:single`). Para cambiarla o
 * añadir otra hay que hacerla real con ESE mismo id: si no, los clientes que
 * estaban en ella quedarían apuntando a una cuenta que ya no existe.
 */
function materializar(service: Service): ServiceAccount[] {
  return service.accounts?.length ? service.accounts : serviceAccounts(service)
}

export function sanitizeBusinessData(raw: unknown): Pick<BusinessState, 'clients' | 'businesses' | 'services' | 'charges'> {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>

  const clients: Client[] = (Array.isArray(data.clients) ? data.clients : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter(c => str(c.id) && str(c.name).trim())
    .map((c): Client => ({
      id: str(c.id),
      name: str(c.name).trim(),
      phone: str(c.phone) || undefined,
      concept: str(c.concept),
      amount: Math.max(0, num(c.amount)),
      currency: str(c.currency) as Client['currency'] || undefined,
      cycle: safeCycle(c.cycle),
      customMonths: num(c.customMonths) > 0 ? Math.round(num(c.customMonths)) : undefined,
      variableAmount: c.variableAmount === true ? true : undefined,
      dueDay: Math.round(num(c.dueDay, 1)),
      startDate: /^\d{4}-\d{2}-\d{2}$/.test(str(c.startDate)) ? str(c.startDate) : undefined,
      accountId: str(c.accountId),
      categoryId: str(c.categoryId),
      businessId: str(c.businessId) || undefined,
      serviceId: str(c.serviceId) || undefined,
      // Solo los repartos con servicio y monto: uno a cero o sin id no dice
      // nada y haría que `clientServices` lo diera por válido.
      serviceShares: (Array.isArray(c.serviceShares) ? c.serviceShares : [])
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map(v => ({ serviceId: str(v.serviceId), amount: Math.max(0, num(v.amount)) }))
        .filter(v => v.serviceId && v.amount > 0)
        .slice(0, 40) || undefined,
      priceLog: (Array.isArray(c.priceLog) ? c.priceLog : [])
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map(v => ({ at: num(v.at), amount: Math.max(0, num(v.amount)) }))
        .filter(v => v.at > 0)
        .slice(-PRICE_LOG_MAX) || undefined,
      serviceAccountId: str(c.serviceAccountId) || undefined,
      active: c.active !== false,
      createdAt: num(c.createdAt, Date.now()),
      notes: str(c.notes) || undefined,
      deletedAt: num(c.deletedAt) > 0 ? num(c.deletedAt) : undefined,
      // Una estrella sin fecha no puede caducar ni ordenarse: no sirve.
      stars: (Array.isArray(c.stars) ? c.stars : [])
        .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
        .map(v => ({
          at: num(v.at),
          referredId: str(v.referredId) || undefined,
          note: str(v.note).trim().slice(0, 140) || undefined,
        }))
        .filter(v => v.at > 0)
        .slice(-60) || undefined,
      referredBy: str(c.referredBy) || undefined,
      autoCollect: c.autoCollect === true ? true : undefined,
    }))
    // Vacía es como no tenerla: así una copia no se llena de `stars: []`.
    .map(c => (c.stars?.length ? c : { ...c, stars: undefined }))

  const clientIds = new Set(clients.map(c => c.id))

  const businesses: Business[] = (Array.isArray(data.businesses) ? data.businesses : [])
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .filter(b => str(b.id) && str(b.name).trim())
    .map((b): Business => ({
      id: str(b.id),
      name: str(b.name).trim(),
      color: str(b.color) || '#35d0a2',
      icon: (str(b.icon) || 'briefcase') as Business['icon'],
      labels: b.labels && typeof b.labels === 'object' ? b.labels as Business['labels'] : undefined,
      incomeCategoryIds: (Array.isArray(b.incomeCategoryIds) ? b.incomeCategoryIds : []).filter(x => typeof x === 'string'),
      expenseCategoryIds: (Array.isArray(b.expenseCategoryIds) ? b.expenseCategoryIds : []).filter(x => typeof x === 'string'),
      setAsidePct: num(b.setAsidePct) > 0 ? Math.min(100, num(b.setAsidePct)) : undefined,
      setAsideAccountId: str(b.setAsideAccountId) || undefined,
      archivedAt: num(b.archivedAt) > 0 ? num(b.archivedAt) : undefined,
      createdAt: num(b.createdAt, Date.now()),
      monthlyGoal: num(b.monthlyGoal) > 0 ? num(b.monthlyGoal) : undefined,
      referral: b.referral && typeof b.referral === 'object'
        ? (() => {
            const r = b.referral as Record<string, unknown>
            return {
              pctPerStar: Math.min(100, Math.max(0, num(r.pctPerStar))),
              maxPct: Math.min(100, Math.max(0, num(r.maxPct))),
              expiresMonths: num(r.expiresMonths) > 0 ? Math.round(num(r.expiresMonths)) : undefined,
            }
          })()
        : undefined,
    }))

  const businessIds = new Set(businesses.map(b => b.id))

  const services: Service[] = (Array.isArray(data.services) ? data.services : [])
    .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
    .filter(s => str(s.id) && str(s.name).trim())
    // Un servicio cuyo negocio ya no existe no se puede enseñar en ningún sitio.
    .filter(s => businessIds.has(str(s.businessId)))
    .map((s): Service => ({
      id: str(s.id),
      businessId: str(s.businessId),
      name: str(s.name).trim(),
      cost: Math.max(0, num(s.cost)),
      costCycle: safeCycle(s.costCycle),
      costCustomMonths: num(s.costCustomMonths) > 0 ? Math.round(num(s.costCustomMonths)) : undefined,
      currency: str(s.currency) as Service['currency'] || undefined,
      monthlyListPrice: num(s.monthlyListPrice) > 0 ? num(s.monthlyListPrice) : undefined,
      capacity: num(s.capacity) > 0 ? Math.round(num(s.capacity)) : undefined,
      // Las cuentas compradas. Una sin id no se puede asignar a nadie, asi que
      // no sirve de nada conservarla.
      accounts: Array.isArray(s.accounts)
        ? (s.accounts as unknown[])
            .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
            .filter(a => str(a.id))
            .map(a => ({
              id: str(a.id),
              label: str(a.label) || undefined,
              cost: Math.max(0, num(a.cost)),
              capacity: num(a.capacity) > 0 ? Math.round(num(a.capacity)) : undefined,
              closedAt: num(a.closedAt) > 0 ? num(a.closedAt) : undefined,
              payDay: num(a.payDay) > 0 ? Math.round(num(a.payDay)) : undefined,
            }))
        : undefined,
      createdAt: num(s.createdAt, Date.now()),
      payMode: PAY_MODES.includes(str(s.payMode) as PayMode) ? str(s.payMode) as PayMode : undefined,
      // El 0 es domingo en el semanal: se acepta, a diferencia del resto.
      payDay: typeof s.payDay === 'number' && Number.isFinite(s.payDay) && s.payDay >= 0 ? Math.round(s.payDay) : undefined,
      payAnchor: /^\d{4}-\d{2}-\d{2}$/.test(str(s.payAnchor)) ? str(s.payAnchor) : undefined,
      payFrom: /^\d{4}-\d{2}-\d{2}$/.test(str(s.payFrom)) ? str(s.payFrom) : undefined,
      payAccountId: str(s.payAccountId) || undefined,
      payCategoryId: str(s.payCategoryId) || undefined,
      payHandled: (Array.isArray(s.payHandled) ? s.payHandled : [])
        .filter((k): k is string => typeof k === 'string' && k.includes('|'))
        .slice(-120),
      paySnooze: s.paySnooze && typeof s.paySnooze === 'object'
        ? Object.fromEntries(Object.entries(s.paySnooze as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) as Array<[string, string]>)
        : undefined,
      slotPrice: num(s.slotPrice) > 0 ? num(s.slotPrice) : undefined,
      archivedAt: num(s.archivedAt) > 0 ? num(s.archivedAt) : undefined,
    }))
    .map(v => ({
      ...v,
      payHandled: v.payHandled?.length ? v.payHandled : undefined,
      paySnooze: v.paySnooze && Object.keys(v.paySnooze).length ? v.paySnooze : undefined,
    }))

  const charges: Charge[] = (Array.isArray(data.charges) ? data.charges : [])
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter(c => str(c.id) && /^\d{4}-\d{2}-\d{2}$/.test(str(c.dueDate)))
    // Un cobro sin cliente no se puede ni enseñar ni cobrar.
    .filter(c => clientIds.has(str(c.clientId)))
    .map((c): Charge => ({
      id: str(c.id),
      clientId: str(c.clientId),
      dueDate: str(c.dueDate),
      amount: Math.max(0, num(c.amount)),
      paid: Math.max(0, num(c.paid)),
      txIds: (Array.isArray(c.txIds) ? c.txIds : []).filter(x => typeof x === 'string'),
      paidAt: num(c.paidAt),
      waived: c.waived === true ? true : undefined,
      // Recortada: la nota de un cobro es una frase, no un diario, y en una
      // copia de seguridad un campo libre sin tope es lo que la hace crecer.
      note: str(c.note).trim().slice(0, 280) || undefined,
      discountPct: num(c.discountPct) > 0 ? Math.min(100, num(c.discountPct)) : undefined,
    }))

  return { clients, businesses, services, charges }
}

export const useBusiness = create<BusinessState>()(
  persist(
    (set, get) => ({
      clients: [],
      businesses: [],
      services: [],
      charges: [],

      addClient: (c) => {
        const id = newId('cli_')
        const ahora = Date.now()
        set(s => ({
          clients: [
            // Quien lo recomendó gana su estrella en el acto: el programa
            // funciona sin que haya que acordarse de ponerla.
            ...(c.referredBy
              ? s.clients.map(x => x.id === c.referredBy
                ? { ...x, stars: [...(x.stars ?? []), { at: ahora, referredId: id }] }
                : x)
              : s.clients),
            { ...c, id, createdAt: ahora },
          ],
        }))
        return id
      },

      softDeleteClient: (id) => set(s => ({
        clients: s.clients.map(c => c.id === id ? { ...c, deletedAt: Date.now(), active: false } : c),
        // Lo pendiente era solo una expectativa y ya no espera nada.
        charges: s.charges.filter(c => c.clientId !== id || c.paid > 0),
      })),

      restoreClient: (id) => set(s => ({
        clients: s.clients.map(c => c.id === id ? { ...c, deletedAt: undefined, active: true } : c),
      })),

      purgeClient: (id) => set(s => ({
        clients: s.clients
          .filter(c => c.id !== id)
          // Nadie queda «recomendado por» alguien que ya no existe.
          .map(c => c.referredBy === id ? { ...c, referredBy: undefined } : c),
        charges: s.charges.filter(c => c.clientId !== id),
      })),

      updateClients: (ids, fields) => {
        const cuales = new Set(ids)
        for (const c of get().clients) if (cuales.has(c.id)) get().updateClient(c.id, fields)
      },

      addStar: (clientId, star) => set(s => ({
        clients: s.clients.map(c => c.id === clientId ? { ...c, stars: [...(c.stars ?? []), star] } : c),
      })),

      removeStar: (clientId, at) => set(s => ({
        clients: s.clients.map(c => {
          if (c.id !== clientId) return c
          const quedan = (c.stars ?? []).filter(x => x.at !== at)
          return { ...c, stars: quedan.length ? quedan : undefined }
        }),
      })),

      updateAccount: (serviceId, accountId, fields) => set(s => ({
        services: s.services.map(v => v.id !== serviceId ? v : {
          ...v,
          accounts: materializar(v).map(a => a.id === accountId ? { ...a, ...fields } : a),
        }),
      })),

      closeAccount: (serviceId, accountId, moveTo) => set(s => ({
        services: s.services.map(v => v.id !== serviceId ? v : {
          ...v,
          accounts: materializar(v).map(a => a.id === accountId ? { ...a, closedAt: Date.now() } : a),
        }),
        clients: s.clients.map(c => c.serviceAccountId === accountId
          ? { ...c, serviceAccountId: moveTo ?? undefined }
          : c),
      })),

      assignAccounts: (assignments) => set(s => ({
        clients: s.clients.map(c => assignments.has(c.id) && c.serviceAccountId !== assignments.get(c.id)
          ? { ...c, serviceAccountId: assignments.get(c.id) }
          : c),
      })),

      markPayHandled: (serviceId, keys, today) => set(s => ({
        services: s.services.map(v => {
          if (v.id !== serviceId) return v
          const resto = { ...(v.paySnooze ?? {}) }
          for (const k of keys) delete resto[k]
          return {
            ...v,
            payHandled: trimHandled([...new Set([...(v.payHandled ?? []), ...keys])], today),
            paySnooze: Object.keys(resto).length ? resto : undefined,
          }
        }),
      })),

      unmarkPayHandled: (serviceId, keys) => set(s => ({
        services: s.services.map(v => v.id !== serviceId ? v : {
          ...v,
          payHandled: (v.payHandled ?? []).filter(k => !keys.includes(k)),
        }),
      })),

      snoozePay: (serviceId, key, until) => set(s => ({
        services: s.services.map(v => v.id !== serviceId ? v : {
          ...v,
          paySnooze: { ...(v.paySnooze ?? {}), [key]: until },
        }),
      })),

      archiveService: (id, archived) => set(s => ({
        services: s.services.map(v => v.id === id ? { ...v, archivedAt: archived ? Date.now() : undefined } : v),
      })),

      duplicateClient: (id) => {
        const original = get().clients.find(c => c.id === id)
        if (!original) return null
        const nuevo: Client = {
          ...original,
          id: newId('cli_'),
          createdAt: Date.now(),
          // El teléfono es de una persona concreta y no se copia: dejarlo
          // haría que el recordatorio de cobro le llegara al cliente de al
          // lado.
          phone: undefined,
          notes: undefined,
          /*
           * Y la fecha de inicio se pone a HOY, no la del original.
           *
           * Con el ancla vieja, `syncCharges` le generaría de golpe todos los
           * cobros desde que entró el primer cliente: el nuevo nacería
           * debiendo un año.
           */
          startDate: original.startDate ? localToday() : undefined,
          active: true,
        }
        set(s => ({ clients: [...s.clients, nuevo] }))
        return nuevo.id
      },

      /**
       * Al cambiar el precio se apunta el anterior.
       *
       * Un precio que lleva dos años sin tocarse es dinero que se pierde sin
       * que nadie lo note, y hasta ahora el anterior desaparecía al guardar.
       *
       * Se apunta el cambio, no cada guardado: corregir una falta de
       * ortografía en el nombre no es una subida de precio, y un historial
       * lleno de entradas idénticas no se puede leer.
       */
      mergeClients: (survivorId, absorbedIds) => {
        const estado = get()
        const survivor = estado.clients.find(c => c.id === survivorId)
        const absorbed = estado.clients.filter(c => absorbedIds.includes(c.id) && c.id !== survivorId)
        if (!survivor || !absorbed.length) return null

        const plan = mergePlan(survivor, absorbed, estado.charges)
        const idsAbsorbidos = new Set(absorbed.map(c => c.id))

        const undo: MergeUndo = {
          absorbed: absorbed.map(c => ({ ...c })),
          survivorBefore: { ...survivor },
          charges: estado.charges
            .filter(ch => idsAbsorbidos.has(ch.clientId))
            .map(ch => ({ chargeId: ch.id, clientId: ch.clientId })),
        }

        set(st => ({
          clients: st.clients
            .filter(c => !idsAbsorbidos.has(c.id))
            .map(c => c.id === survivorId ? plan.result : c),
          // Los cobros cambian de dueño, no se borran: son dinero que esa
          // persona te debió o te pagó de verdad.
          charges: st.charges.map(ch => idsAbsorbidos.has(ch.clientId)
            ? { ...ch, clientId: survivorId }
            : ch),
        }))
        return undo
      },

      unmergeClients: (undo) => set(st => {
        const vuelven = new Map(undo.charges.map(c => [c.chargeId, c.clientId]))
        return {
          clients: [
            ...st.clients.map(c => c.id === undo.survivorBefore.id ? undo.survivorBefore : c),
            ...undo.absorbed,
          ],
          charges: st.charges.map(ch => vuelven.has(ch.id)
            ? { ...ch, clientId: vuelven.get(ch.id)! }
            : ch),
        }
      }),

      /*
       * MOVER UN SERVICIO: sus clientes van con él.
       *
       * Un cliente pertenece a un negocio a través del servicio que consume;
       * dejarlo atrás lo convertiría en un cliente de un negocio que ya no le
       * vende nada.
       */
      moveService: (serviceId, businessId) => set(st => ({
        services: st.services.map(v => v.id === serviceId ? { ...v, businessId } : v),
        clients: st.clients.map(c => {
          const suyos = c.serviceShares?.some(x => x.serviceId === serviceId) || c.serviceId === serviceId
          return suyos ? { ...c, businessId } : c
        }),
      })),

      moveClientToService: (clientId, serviceId) => set(st => {
        const servicio = st.services.find(v => v.id === serviceId)
        return {
          clients: st.clients.map(c => c.id === clientId
            /* Se mueve TODO el cliente, no uno de sus repartos: cambiar de
               servicio a quien tiene dos es otra operación, y hacerla aquí en
               silencio le borraría el otro. */
            ? {
              ...c,
              serviceId,
              serviceShares: undefined,
              businessId: servicio?.businessId ?? c.businessId,
              serviceAccountId: undefined,
            }
            : c),
        }
      }),

      reorderBusinesses: (ids) => set(st => ({
        businesses: ordenarPor(st.businesses, ids),
      })),

      reorderServices: (ids) => set(st => ({
        services: ordenarPor(st.services, ids),
      })),

      /*
       * ARCHIVAR NO ES BORRAR.
       *
       * Un negocio terminado sale de la lista y deja de generar cobros, pero
       * sus movimientos siguen en el libro y su año sigue contando en los
       * informes. Borrarlo haría perder un trimestre de datos reales por
       * querer limpiar una lista.
       */
      archiveBusiness: (id, archived) => set(st => ({
        businesses: st.businesses.map(b => b.id === id
          ? { ...b, archivedAt: archived ? Date.now() : undefined }
          : b),
        // Sus clientes dejan de generar cobros nuevos, por lo mismo que un
        // cliente pausado: el negocio ya no vende.
        clients: archived
          ? st.clients.map(c => c.businessId === id ? { ...c, active: false } : c)
          : st.clients,
      })),

      updateClient: (id, fields) => set(s => ({
        clients: s.clients.map(c => {
          if (c.id !== id) return c
          const cambiaPrecio = fields.amount !== undefined
            && Math.abs(fields.amount - c.amount) > 0.005
          if (!cambiaPrecio) return { ...c, ...fields }
          return {
            ...c,
            ...fields,
            priceLog: [...(c.priceLog ?? []), { at: Date.now(), amount: c.amount }]
              .slice(-PRICE_LOG_MAX),
          }
        }),
      })),

      /**
       * Borrar un cliente se lleva sus cobros PENDIENTES, nunca los cobrados.
       *
       * Un cobro ya pagado apunta a un movimiento real del libro; borrarlo
       * dejaría ese ingreso sin explicación de dónde vino. Lo pendiente, en
       * cambio, era solo una expectativa y con el cliente fuera ya no espera
       * nada.
       */
      deleteClient: (id) => set(s => ({
        clients: s.clients.filter(c => c.id !== id),
        charges: s.charges.filter(c => c.clientId !== id || c.paid > 0),
      })),

      addBusiness: (b) => {
        const id = newId('biz_')
        set(s => ({ businesses: [...s.businesses, { ...b, id, createdAt: Date.now() }] }))
        return id
      },

      updateBusiness: (id, fields) => set(s => ({
        businesses: s.businesses.map(b => b.id === id ? { ...b, ...fields } : b),
      })),

      /**
       * Borrar un negocio NO borra sus clientes ni sus movimientos.
       *
       * El negocio es una agrupación, no el dueño de nada: sus cobros siguen en
       * el libro y sus clientes siguen existiendo, solo quedan sin agrupar.
       * Borrar en cascada se llevaría dinero real por delante.
       */
      deleteBusiness: (id) => set(s => ({
        businesses: s.businesses.filter(b => b.id !== id),
        services: s.services.filter(v => v.businessId !== id),
        clients: s.clients.map(c => c.businessId === id ? { ...c, businessId: undefined, serviceId: undefined } : c),
      })),

      addService: (v) => {
        const id = newId('svc_')
        set(s => ({ services: [...s.services, { ...v, id, createdAt: Date.now() }] }))
        return id
      },

      updateService: (id, fields) => set(s => ({
        services: s.services.map(v => v.id === id ? { ...v, ...fields } : v),
      })),

      deleteService: (id) => set(s => ({
        services: s.services.filter(v => v.id !== id),
        clients: s.clients.map(c => c.serviceId === id ? { ...c, serviceId: undefined } : c),
      })),

      syncCharges: (today) => {
        const { clients, charges, businesses } = get()
        const negocio = new Map(businesses.map(b => [b.id, b]))
        // El descuento por estrellas de cada uno, con las reglas de SU
        // negocio. Se guarda en el cobro al crearlo y ahí se queda.
        const nuevos = pendingCharges(clients, charges, today, client =>
          referralDiscount(client, referralRules(client.businessId ? negocio.get(client.businessId) : null)))
        if (!nuevos.length) return 0
        set(s => ({
          charges: [...s.charges, ...nuevos.map(c => ({ ...c, id: newId('chg_') }))],
        }))
        return nuevos.length
      },

      addCharge: (clientId, dueDate, amount) => {
        const id = newId('chg_')
        set(s => ({
          charges: [...s.charges, { id, clientId, dueDate, amount, paid: 0, txIds: [], paidAt: 0 }],
        }))
        return id
      },

      updateCharge: (id, fields) => set(s => ({
        charges: s.charges.map(c => c.id === id ? { ...c, ...fields } : c),
      })),

      deleteCharge: (id) => set(s => ({ charges: s.charges.filter(c => c.id !== id) })),

      markPaid: (chargeId, amount, txId) => set(s => ({
        charges: s.charges.map(c => c.id === chargeId ? applyPayment(c, amount, txId, Date.now()) : c),
      })),

      unmarkPaid: (chargeId, txId, amount) => set(s => ({
        charges: s.charges.map(c => c.id === chargeId ? revokePayment(c, txId, amount) : c),
      })),

      waiveCharge: (id, waived) => set(s => ({
        charges: s.charges.map(c => c.id === id ? { ...c, waived: waived || undefined } : c),
      })),
    }),
    {
      name: 'cuadre-business-v1',
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => ({ ...current, ...sanitizeBusinessData(persisted) }),
    },
  ),
)
