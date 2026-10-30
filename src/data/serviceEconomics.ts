import { cycleMonths, perMonth } from './billing'
import { serviceAccounts, serviceCostPerMonth, type Service } from './business'
import { clientPerMonthForService, isOnService, type Client } from './clients'
import type { CurrencyCode, Transaction } from '@/types'

/**
 * LAS CUENTAS DE UN SERVICIO, POR PLAZA.
 *
 * ── POR QUÉ LA UNIDAD Y NO EL TOTAL ───────────────────────────────────
 * La pantalla decía lo que un servicio cuesta en total y lo que deja en
 * total. Lo que de verdad decide si vale la pena es la unidad: cuánto te
 * cuesta UNA plaza y a cuánto la vendes. Con eso se contestan las dos
 * preguntas que uno se hace —si el precio está bien y si meter a uno más
 * compensa— y es una división que el usuario hacía de cabeza cada vez.
 */

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

export interface SlotEconomics {
  /** Plazas totales, o `null` si alguna cuenta no tiene tope. */
  slots: number | null
  /** Lo que te cuesta una plaza al mes. `null` sin tope: no se puede dividir. */
  costPerSlot: number | null
  /** Lo que cobras de media por cliente al mes. `null` sin clientes. */
  pricePerSlot: number | null
  /** Lo que te queda por plaza. `null` si falta cualquiera de los dos. */
  marginPerSlot: number | null
}

export function slotEconomics(
  service: Service,
  clients: Client[],
  base?: CurrencyCode,
): SlotEconomics {
  const cuentas = serviceAccounts(service)
  /*
   * Si una sola cuenta no tiene tope, el conjunto no lo tiene.
   *
   * Dividir el coste entre «las plazas que hay» cuando no se sabe cuántas hay
   * daría un coste por plaza inventado, y es el número con el que se decide
   * el precio.
   */
  const sinTope = cuentas.some(c => !c.capacity || c.capacity <= 0)
  const slots = sinTope ? null : cuentas.reduce((sum, c) => sum + (c.capacity ?? 0), 0)

  const costeMes = serviceCostPerMonth(service, base)
  const suyos = clients.filter(c => c.active && isOnService(c, service.id))
  const ingresoMes = suyos.reduce((sum, c) => sum + clientPerMonthForService(c, service.id, base), 0)

  const costPerSlot = slots && slots > 0 ? cents(costeMes / slots) : null
  const pricePerSlot = suyos.length ? cents(ingresoMes / suyos.length) : null

  return {
    slots,
    costPerSlot,
    pricePerSlot,
    marginPerSlot: costPerSlot !== null && pricePerSlot !== null
      ? cents(pricePerSlot - costPerSlot)
      : null,
  }
}

export interface Fix {
  /** Clientes que faltan al precio actual. `null` si no hay precio medio. */
  clientsNeeded: number | null
  /** Precio al que habría que subir a los que ya hay. `null` sin clientes. */
  priceNeeded: number | null
}

/**
 * CUANDO EL SERVICIO PIERDE DINERO, QUÉ LO ARREGLA.
 *
 * Las dos salidas con sus números: meter más gente al precio de ahora, o
 * subirle el precio a la que ya está. Son las dos cosas que se pueden hacer,
 * y la app tiene los datos para decir cuánto de cada una.
 *
 * Devuelve `null` en lo que no se pueda calcular en vez de aproximar: sin un
 * solo cliente no hay precio medio del que partir, y suponer uno sería
 * inventarse el dato más importante de la decisión.
 */
export function howToFix(
  service: Service,
  clients: Client[],
  base?: CurrencyCode,
): Fix | null {
  const costeMes = serviceCostPerMonth(service, base)
  const suyos = clients.filter(c => c.active && isOnService(c, service.id))
  const ingresoMes = suyos.reduce((sum, c) => sum + clientPerMonthForService(c, service.id, base), 0)

  // Si ya gana dinero no hay nada que arreglar.
  if (ingresoMes >= costeMes) return null
  if (!suyos.length) return { clientsNeeded: null, priceNeeded: null }

  const medio = ingresoMes / suyos.length
  const falta = costeMes - ingresoMes

  return {
    clientsNeeded: medio > 0 ? Math.ceil(falta / medio) : null,
    priceNeeded: cents(costeMes / suyos.length),
  }
}

/**
 * CUÁNDO TOCA PAGAR ESTE SERVICIO.
 *
 * Sale del último pago registrado y del ciclo. El botón «Pagar» estaba
 * siempre igual el día 1 que el día 20, sin decir cuándo tocaba ni si ya
 * habías pagado este mes.
 *
 * `null` cuando no hay ningún pago registrado —no se puede saber desde
 * cuándo contar— o cuando el ciclo no se repite.
 */
export function nextPaymentDate(service: Service, txns: Transaction[]): string | null {
  const meses = cycleMonths(service.costCycle, service.costCustomMonths)
  if (meses === null || meses <= 0) return null

  const pagos = servicePayments(service, txns)
  const ultimo = pagos[0]
  if (!ultimo) return null

  const d = new Date(`${ultimo.date}T00:00:00`)
  if (!Number.isFinite(d.getTime())) return null
  const dia = d.getDate()
  d.setMonth(d.getMonth() + meses, 1)
  // Se recorta al último día: alguien que paga el 31 paga el 28 en febrero.
  const tope = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(dia, tope))

  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Los pagos de este servicio, el más reciente primero.
 *
 * Son los gastos marcados con su id, que es lo que el botón «Pagar» guarda
 * desde esta versión. Lo de antes no está marcado, y no se adivina: adivinarlo
 * es exactamente lo que producía el «Has puesto 13,671» que nadie se creía.
 */
export function servicePayments(service: Service, txns: Transaction[]): Transaction[] {
  return txns
    .filter(tx => tx.type === 'expense' && tx.paidService === service.id)
    .sort((a, b) => b.date.localeCompare(a.date))
}

/** Lo que llevas pagado de este servicio, en la divisa de cada movimiento. */
export function totalPaid(service: Service, txns: Transaction[]): number {
  return cents(servicePayments(service, txns).reduce((sum, tx) => sum + tx.amount, 0))
}

/** Días que faltan para el próximo pago. Negativo = ya pasó. */
export function daysUntil(date: string, today: string): number {
  const a = Date.parse(`${date}T00:00:00`)
  const b = Date.parse(`${today}T00:00:00`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0
  return Math.round((a - b) / 86_400_000)
}

/** Reexportado para quien solo necesita el equivalente mensual. */
export { perMonth }
