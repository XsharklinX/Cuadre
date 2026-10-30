import { cycleMonths } from './billing'
import { dueDatesBetween, type Client } from './clients'
import { serviceAccounts, type PayMode, type Service, type ServiceAccount } from './business'
import type { Transaction } from '@/types'

/**
 * QUE LOS SERVICIOS SE PAGUEN SOLOS EN LA APP.
 *
 * ── LO QUE PIDIÓ EL USUARIO ───────────────────────────────────────────
 * Netflix se paga el 12 de cada mes; Disney, cada marzo. Hasta ahora había
 * que entrar el día que tocaba y registrar el gasto a mano, con su cuenta y
 * su categoría, una y otra vez.
 *
 * ── DE DÓNDE SALEN LAS FECHAS ─────────────────────────────────────────
 * Del MISMO generador que los cobros de los clientes (`dueDatesBetween`): un
 * pago de servicio es un cobro al revés, con los mismos ciclos —mensual,
 * anual, cada N meses, semanal, quincenal— y los mismos recortes de fin de
 * mes. Escribir un segundo calendario habría garantizado que el día 31 de
 * febrero se resolviera distinto en cada lado.
 *
 * ── LO QUE NO PUEDE PASAR NUNCA ───────────────────────────────────────
 *  1. Registrar dos veces el mismo pago. Cada uno tiene su clave
 *     (`cuenta|fecha`) y se apunta en `payHandled` en cuanto se resuelve.
 *  2. Registrar uno que ya pagaste a mano. Antes de crear nada se busca un
 *     gasto de ese servicio y esa cuenta cerca de esa fecha.
 *  3. Rellenar el pasado. Nada antes de `payFrom`: configurarlo hoy no crea
 *     de golpe los doce Netflix del año pasado.
 */

/** Cuánto hacia atrás se recupera un pago que se pasó con la app cerrada. */
export const PAY_BACK_DAYS = 45

const DIA = 86_400_000

function iso(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function ms(date: string): number {
  return Date.parse(`${date}T00:00:00`)
}

export function payKey(accountId: string, date: string): string {
  return `${accountId}|${date}`
}

/**
 * Las fechas en que se paga UNA cuenta de un servicio, en un rango.
 *
 * Se arma un cliente de mentira con el ciclo del servicio y se le pregunta al
 * generador de siempre. `anchor` sirve para cuando el servicio no tiene día
 * configurado (la previsión lo usa con la fecha de su último pago).
 */
export function serviceDueDates(
  service: Service,
  account: ServiceAccount,
  from: string,
  to: string,
  anchor?: string,
): string[] {
  const ancla = service.payAnchor ?? anchor
  const dia = account.payDay ?? service.payDay ?? (ancla ? Number(ancla.slice(8, 10)) : undefined)
  if (dia === undefined) return []
  const plantilla: Client = {
    id: `pay:${account.id}`,
    name: service.name,
    concept: '',
    amount: account.cost,
    cycle: service.costCycle,
    customMonths: service.costCustomMonths,
    dueDay: dia,
    startDate: ancla,
    accountId: '',
    categoryId: '',
    active: true,
    // El ancla, si la hay, es también desde cuándo existe: el generador no
    // inventa pagos antes de que el servicio existiera.
    createdAt: ancla ? ms(ancla) : service.createdAt,
  }
  return dueDatesBetween(plantilla, from, to)
}

export interface DuePayment {
  service: Service
  account: ServiceAccount
  date: string
  key: string
  /** En la divisa del servicio. */
  amount: number
}

/** Un servicio que sabe cuándo se paga. */
export function isScheduled(service: Service): boolean {
  return !service.archivedAt
    && (service.payDay !== undefined || !!service.payAnchor)
    && service.costCycle !== 'none'
}

/**
 * Cuánto se puede alejar un pago a mano de su fecha y seguir siendo ESE pago.
 *
 * La mitad del ciclo, con tope de quince días: un Netflix pagado el 9 en vez
 * del 12 es el de este mes; uno del 28 ya es del siguiente.
 */
export function payWindowDays(service: Service): number {
  const meses = cycleMonths(service.costCycle, service.costCustomMonths)
  if (meses === null) return 3
  return Math.max(2, Math.min(15, Math.floor((meses * 30.4375) / 2)))
}

/**
 * ¿Ya se pagó esto a mano?
 *
 * Un gasto de este servicio, de esta cuenta —o sin cuenta, si el servicio
 * tiene una sola—, dentro de la ventana del pago.
 */
export function paidManually(
  service: Service,
  account: ServiceAccount,
  date: string,
  txns: Transaction[],
): boolean {
  const una = serviceAccounts(service).length <= 1
  const ventana = payWindowDays(service) * DIA
  const t = ms(date)
  return txns.some(tx => tx.type === 'expense'
    && tx.paidService === service.id
    && !tx.autoPaid
    && (tx.paidAccount === account.id || (!tx.paidAccount && una))
    && Math.abs(ms(tx.date) - t) <= ventana)
}

/**
 * LOS PAGOS QUE TOCAN Y NADIE HA RESUELTO.
 *
 * Los de hoy y los que se pasaron con la app cerrada (hasta `PAY_BACK_DAYS`),
 * nunca antes de `payFrom`. Sin los ya resueltos y, salvo que se pida, sin
 * los aplazados con «Mañana».
 */
export function duePayments(
  services: Service[],
  today: string,
  opts: { modes?: PayMode[]; includeSnoozed?: boolean } = {},
): DuePayment[] {
  const modos = opts.modes ?? ['auto', 'ask']
  const fuera: DuePayment[] = []
  const atras = iso(ms(today) - PAY_BACK_DAYS * DIA)
  for (const service of services) {
    if (!isScheduled(service) || !modos.includes(service.payMode ?? 'manual')) continue
    const desde = service.payFrom && service.payFrom > atras ? service.payFrom : atras
    if (desde > today) continue
    const hechos = new Set(service.payHandled ?? [])
    for (const account of serviceAccounts(service)) {
      for (const date of serviceDueDates(service, account, desde, today)) {
        const key = payKey(account.id, date)
        if (hechos.has(key)) continue
        const hasta = service.paySnooze?.[key]
        if (!opts.includeSnoozed && hasta && hasta > today) continue
        fuera.push({ service, account, date, key, amount: account.cost })
      }
    }
  }
  return fuera.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Los que vienen en los próximos `days` días, sin hoy.
 *
 * Para el aviso de la víspera y para «por pagar este mes». Incluye los
 * servicios a mano: avisar no registra nada.
 */
export function upcomingPayments(services: Service[], today: string, days: number): DuePayment[] {
  const fuera: DuePayment[] = []
  const manana = iso(ms(today) + DIA)
  const hasta = iso(ms(today) + days * DIA)
  for (const service of services) {
    if (!isScheduled(service)) continue
    for (const account of serviceAccounts(service)) {
      for (const date of serviceDueDates(service, account, manana, hasta)) {
        fuera.push({ service, account, date, key: payKey(account.id, date), amount: account.cost })
      }
    }
  }
  return fuera.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * EL PAGO AL QUE CORRESPONDE UN GASTO HECHO A MANO.
 *
 * Al pagar Netflix el 9 desde el botón Pagar, el pago del 12 queda resuelto:
 * si no se apuntara, el día 12 la app lo registraría otra vez. Devuelve la
 * clave del pago más cercano dentro de su ventana, o `null`.
 */
export function matchingDueKey(service: Service, account: ServiceAccount, date: string): string | null {
  if (!isScheduled(service)) return null
  const ventana = payWindowDays(service)
  const t = ms(date)
  const fechas = serviceDueDates(service, account, iso(t - ventana * DIA), iso(t + ventana * DIA))
  if (!fechas.length) return null
  const cerca = fechas.reduce((a, b) => (Math.abs(ms(b) - t) < Math.abs(ms(a) - t) ? b : a))
  return payKey(account.id, cerca)
}

/** Si el ciclo es largo: el pago que pilla desprevenido. */
export function isLongCycle(service: Service): boolean {
  const meses = cycleMonths(service.costCycle, service.costCustomMonths)
  return meses !== null && meses >= 3
}

/** Recorta la lista de resueltos: más de dos años de claves no sirven. */
export function trimHandled(keys: string[], today: string): string[] {
  const corte = iso(ms(today) - 400 * DIA)
  return keys.filter(k => (k.split('|')[1] ?? '') >= corte).slice(-120)
}
