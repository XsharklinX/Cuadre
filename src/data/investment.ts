import { monthKey } from './helpers'
import { serviceAccounts, serviceCostPerMonth, type Business, type Service } from './business'
import type { CurrencyCode, Transaction } from '@/types'

/**
 * LA INVERSIÓN DE UN NEGOCIO: LO QUE HAS PUESTO.
 *
 * ── QUÉ FALTABA ───────────────────────────────────────────────────────
 * Negocio sabía lo que te DEJA y no lo que has PUESTO. Y peor: desde Negocio no
 * había forma de pagar nada. Tienes dinero en tus cuentas, pagas la suscripción
 * de Netflix, y esa operación —que es la mitad del negocio— había que hacerla
 * por el formulario de gastos de siempre, acordándote de elegir la categoría
 * correcta para que el negocio la contara.
 *
 * ── POR QUÉ ES UNA VISTA Y NO UN SALDO ────────────────────────────────
 * Igual que la ganancia: la inversión se DERIVA de los movimientos que ya
 * existen, sumando los gastos de las categorías del negocio. No hay una bolsa
 * «invertido» con dinero dentro, porque entonces el mismo peso estaría contado
 * dos veces y habría dos verdades que conciliar.
 *
 * Lo que se añade no es un almacén: es la ACCIÓN de pagar desde aquí, con la
 * categoría ya puesta, y el total acumulado a la vista.
 */

export interface BusinessInvestment {
  /** Todo lo que has puesto, desde el principio. */
  total: number
  /** Lo puesto este mes. */
  thisMonth: number
  /** Todo lo que has cobrado, desde el principio. */
  collected: number
  /**
   * Lo cobrado menos lo puesto, desde el principio.
   *
   * Es la pregunta que la ganancia mensual no contesta: «¿este negocio ya se
   * pagó solo?». Un negocio puede dejar 400 al mes y llevar dos años sin
   * recuperar lo que costó montarlo.
   */
  returned: number
  /** Si ya recuperaste lo invertido. */
  isProfitable: boolean
  /**
   * Meses que faltan para recuperar, al ritmo de los últimos meses.
   *
   * `null` si ya está recuperado o si el ritmo no da para recuperarlo nunca —
   * y en ese caso hay que decirlo, no dibujar un número enorme.
   */
  monthsToRecover: number | null
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Lo puesto y lo recuperado de un negocio.
 *
 * @param txns movimientos YA convertidos a la divisa base.
 * @param monthlyProfit ganancia media mensual, para estimar la recuperación.
 */
export function businessInvestment(
  business: Business,
  txns: Transaction[],
  mkey: string,
  monthlyProfit: number,
): BusinessInvestment {
  const gastos = new Set(business.expenseCategoryIds)
  const ingresos = new Set(business.incomeCategoryIds)

  let total = 0, thisMonth = 0, collected = 0
  for (const tx of txns) {
    if (tx.type === 'transfer' || !tx.categoryId) continue
    if (tx.type === 'expense' && gastos.has(tx.categoryId)) {
      total += tx.amount
      if (monthKey(tx.date) === mkey) thisMonth += tx.amount
    } else if (tx.type === 'income' && ingresos.has(tx.categoryId)) {
      collected += tx.amount
    }
  }

  const returned = cents(collected - total)
  return {
    total: cents(total),
    thisMonth: cents(thisMonth),
    collected: cents(collected),
    returned,
    isProfitable: returned >= 0,
    // Solo se estima si el negocio de verdad gana algo al mes. Con ganancia
    // cero o negativa no hay plazo: hay un problema, y fingir un plazo de
    // «999 meses» sería una forma rara de decirlo.
    monthsToRecover: returned >= 0 || monthlyProfit <= 0
      ? null
      : Math.ceil(Math.abs(returned) / monthlyProfit),
  }
}

/**
 * El pago que toca de un servicio, con todo resuelto.
 *
 * Existe para que «pagar Netflix» sea un toque y no un formulario: el monto, la
 * divisa y el concepto salen del servicio, y la categoría del negocio. Lo único
 * que el usuario elige es de qué cuenta sale.
 */
export interface ServicePayment {
  serviceId: string
  name: string
  /** Lo que toca pagar: el total de sus cuentas compradas, en su ciclo. */
  amount: number
  currency: CurrencyCode | undefined
  /** Equivalente mensual, para enseñarlo cuando el ciclo no es mensual. */
  perMonth: number
  /** Cuántas cuentas compradas cubre este pago. */
  accountCount: number
}

export function servicePayment(
  service: Service,
  base: CurrencyCode,
): ServicePayment {
  const cuentas = serviceAccounts(service)
  return {
    serviceId: service.id,
    name: service.name,
    // El pago cubre TODAS las cuentas compradas: dos Netflix se pagan los dos.
    amount: cents(cuentas.reduce((sum, c) => sum + c.cost, 0)),
    currency: service.currency,
    perMonth: serviceCostPerMonth(service, base),
    accountCount: cuentas.length,
  }
}

/**
 * Si ya se pagó este servicio en el periodo que cubre su ciclo.
 *
 * Evita el error de pagar dos veces lo mismo, que con una suscripción anual es
 * fácil: no te acuerdas de si lo pagaste en marzo o no. Se busca un gasto de la
 * categoría indicada, por el monto del servicio, dentro del plazo.
 */
export function alreadyPaid(
  payment: ServicePayment,
  categoryIds: string[],
  txns: Transaction[],
  from: string,
): Transaction | null {
  const cats = new Set(categoryIds)
  return txns.find(tx =>
    tx.type === 'expense'
    && !!tx.categoryId
    && cats.has(tx.categoryId)
    && tx.date >= from
    // Margen de un peso: el usuario pudo redondear al teclear.
    && Math.abs(tx.amount - payment.amount) <= 1) ?? null
}
