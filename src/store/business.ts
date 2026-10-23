import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { CYCLE_ORDER, type BillingCycle } from '@/data/billing'
import { applyPayment, pendingCharges, revokePayment } from '@/data/receivables'
import type { Business, Service } from '@/data/business'
import type { Charge, Client } from '@/data/clients'
import { localToday } from '@/data/helpers'
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
    }))

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
      createdAt: num(b.createdAt, Date.now()),
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
            }))
        : undefined,
      createdAt: num(s.createdAt, Date.now()),
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
        set(s => ({ clients: [...s.clients, { ...c, id, createdAt: Date.now() }] }))
        return id
      },

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
        const { clients, charges } = get()
        const nuevos = pendingCharges(clients, charges, today)
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
