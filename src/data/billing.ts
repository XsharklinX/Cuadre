/**
 * CADA CUÁNTO SE PAGA ALGO, Y CUÁNTO ES ESO AL MES.
 *
 * ── EL FALLO QUE OBLIGA A QUE ESTO EXISTA ─────────────────────────────
 * Mucha gente compra las suscripciones ANUALES porque salen más baratas. Si el
 * coste de un servicio se tratara como mensual, pagar RD$ 6,000 de golpe en
 * marzo daría un marzo catastrófico (−6,000) y once meses de ganancia pura. La
 * ganancia mensual sería mentira doce veces al año.
 *
 * Lo que cuesta de verdad al mes es 500. Esto hace esa conversión, y la hace en
 * un solo sitio porque la necesitan los dos lados: lo que te cuesta un servicio
 * y lo que te paga un cliente —hay quien cobra por adelantado el año entero—.
 *
 * ── DOS FORMAS DE MIRAR EL MISMO DINERO, Y LAS DOS CIERTAS ────────────
 * · **Caja**: lo que salió o entró este mes de verdad. Es lo que vio tu banco.
 * · **Al mes**: lo que cuesta o rinde repartido en el plazo que cubre. Es lo que
 *   contesta «¿esto me deja algo?».
 *
 * Ninguna sustituye a la otra y la app enseña las dos etiquetadas, porque
 * presentar una como «la» ganancia sería esconder la mitad del asunto.
 */

/**
 * Los ciclos que la app entiende.
 *
 * La lista es generosa a propósito: la app está en producción y quien la use no
 * tiene por qué cobrar como el que la escribió. Hay negocios que facturan por
 * semana, por quincena, por trimestre o una sola vez, y obligar a todos al mes
 * sería imponerles una forma de trabajar.
 */
export type BillingCycle =
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'semiannual'
  | 'annual'
  | 'once'
  /**
   * SIN CICLO: no genera cobros solos.
   *
   * Es el caso de quien trabaja por encargo. Un cliente te paga una tarea, se
   * va, y vuelve tres meses despues por otra. Con `once` habia que crear al
   * cliente otra vez cada vez —«es algo coñazo», dicho tal cual—, porque un
   * cobro unico se agota y el cliente se queda inerte.
   *
   * Asi el cliente PERSISTE con su historial y su telefono, y los cobros se
   * añaden a mano cuando hay trabajo.
   */
  | 'none'
  /** Cada N meses, con N en `customMonths`. Para lo que no encaja en la lista. */
  | 'custom'

export interface Billing {
  amount: number
  cycle: BillingCycle
  /** Solo con `cycle: 'custom'`: cada cuántos meses. */
  customMonths?: number
}

/** Cuántos meses cubre cada ciclo. `null` = no es recurrente. */
export function cycleMonths(cycle: BillingCycle, customMonths?: number): number | null {
  switch (cycle) {
    case 'weekly':     return 7 / 30.4375
    case 'biweekly':   return 14 / 30.4375
    case 'monthly':    return 1
    case 'bimonthly':  return 2
    case 'quarterly':  return 3
    case 'semiannual': return 6
    case 'annual':     return 12
    case 'custom':     return customMonths && customMonths > 0 ? customMonths : null
    case 'once':       return null
    // Sin ciclo no hay nada que repartir ni que prever.
    case 'none':       return null
  }
}

/**
 * Lo que esto supone al mes.
 *
 * Un pago único devuelve 0: no es un coste recurrente, y repartirlo entre
 * infinitos meses no significa nada. Quien necesite contarlo lo verá en la
 * vista de caja, donde sí está.
 */
export function perMonth(billing: Billing): number {
  const meses = cycleMonths(billing.cycle, billing.customMonths)
  if (meses === null || !(meses > 0) || !Number.isFinite(billing.amount)) return 0
  return Math.round((billing.amount / meses) * 100) / 100
}

/** Lo que esto supone al año. */
export function perYear(billing: Billing): number {
  return Math.round(perMonth(billing) * 12 * 100) / 100
}

/**
 * Lo que se ahorra pagando por adelantado, comparado con pagarlo mes a mes.
 *
 * Es justo el motivo por el que alguien compra el año entero, así que merece
 * verse: «pagando anual te ahorras RD$ 1,200 al año».
 */
export function prepaySaving(prepaid: Billing, monthlyPrice: number): number {
  if (!(monthlyPrice > 0)) return 0
  const meses = cycleMonths(prepaid.cycle, prepaid.customMonths)
  if (meses === null || !(meses > 0) || !Number.isFinite(prepaid.amount)) return 0
  /*
   * PAGANDO AL MES NO SE ADELANTA NADA.
   *
   * Un ciclo de un mes o menos no es un pago por adelantado, así que no hay
   * ahorro que calcular. Sin esto, un Netflix mensual comparado contra un
   * precio de lista daba «ahorras 3,420» — una cifra que no existe, sobre
   * una suscripción que se paga mes a mes como cualquier otra.
   *
   * Quien llama tiene además que pasar los dos montos en la MISMA divisa: un
   * coste en dólares contra un precio en pesos resta números que no se pueden
   * restar, y fue la otra mitad de ese 3,420.
   */
  if (meses <= 1) return 0
  /*
   * Se calcula sobre el AÑO, no multiplicando el mensual por doce.
   *
   * `perMonth` redondea a céntimos, y ese redondeo multiplicado por doce
   * desplaza el resultado: un plan de 1,000 al año frente a 100 al mes daba
   * 200.04 de ahorro en vez de 200. Son cuatro céntimos, pero es una cifra que
   * el usuario puede comprobar a mano —1,200 menos 1,000— y no cuadraba.
   */
  const alAnio = (prepaid.amount * 12) / meses
  return Math.round((monthlyPrice * 12 - alAnio) * 100) / 100
}

/**
 * El ahorro en PORCENTAJE de pagar por adelantado.
 *
 * Es como lo anuncian los propios servicios —«ahorra un 16% con el plan
 * anual»—, y por tanto el número con el que el usuario decidió comprarlo. Dar
 * solo el monto le obligaría a calcular el porcentaje de cabeza para comparar
 * un servicio con otro.
 */
export function prepaySavingPct(prepaid: Billing, monthlyPrice: number): number {
  if (!(monthlyPrice > 0)) return 0
  const equivalente = perMonth(prepaid)
  if (!(equivalente > 0)) return 0
  return Math.round(((monthlyPrice - equivalente) / monthlyPrice) * 1000) / 10
}

/**
 * Los meses que cubre un pago hecho en `date`, incluido el suyo.
 *
 * Es lo que permite que la gráfica mensual diga la verdad: el pago anual de
 * marzo se reparte entre marzo y los once meses siguientes, en vez de dejar un
 * agujero en marzo y once meses de regalo.
 */
export function coveredMonths(date: string, cycle: BillingCycle, customMonths?: number): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  const meses = cycleMonths(cycle, customMonths)
  const mkey = date.slice(0, 7)
  // Menos de un mes (semanal, quincenal) o pago único: el mes en que se pagó.
  if (meses === null || meses <= 1) return [mkey]

  const [year, month] = [Number(date.slice(0, 4)), Number(date.slice(5, 7))]
  const cuantos = Math.round(meses)
  const fuera: string[] = []
  for (let i = 0; i < cuantos; i += 1) {
    const d = new Date(year, month - 1 + i, 1)
    fuera.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return fuera
}

/** La parte de un pago que corresponde a cada mes que cubre. */
export function amortizedShare(amount: number, cycle: BillingCycle, customMonths?: number): number {
  const meses = cycleMonths(cycle, customMonths)
  if (meses === null || meses <= 1) return Math.round(amount * 100) / 100
  return Math.round((amount / Math.round(meses)) * 100) / 100
}

/** Clave de traducción del nombre de cada ciclo. */
export const CYCLE_KEY: Record<BillingCycle, string> = {
  weekly:     'cycleWeekly',
  biweekly:   'cycleBiweekly',
  monthly:    'cycleMonthly',
  bimonthly:  'cycleBimonthly',
  quarterly:  'cycleQuarterly',
  semiannual: 'cycleSemiannual',
  annual:     'cycleAnnual',
  once:       'cycleOnce',
  none:       'cycleNone',
  custom:     'cycleCustom',
}

/** Los ciclos en el orden en que tiene sentido ofrecerlos. */
export const CYCLE_ORDER: BillingCycle[] = [
  'monthly', 'weekly', 'biweekly', 'bimonthly', 'quarterly', 'semiannual', 'annual', 'once', 'none', 'custom',
]
