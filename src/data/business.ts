import { perMonth, type BillingCycle } from './billing'
import { clientPerMonthForService, isOnService, type Client } from './clients'
import { convertCurrency } from './currencies'
import { monthKey } from './helpers'
import type { CurrencyCode, IconName, Transaction } from '@/types'

/**
 * EL NEGOCIO Y SU GANANCIA.
 *
 * ── POR QUÉ NO ES UN SALDO APARTE ─────────────────────────────────────
 * Lo intuitivo es crear una bolsa «Negocio» con su dinero dentro. Sería un
 * error, y es la decisión estructural más importante de este módulo: habría
 * **dos verdades sobre el mismo peso**. Un cliente te deposita 250 en el
 * Popular; si eso además sumara a una bolsa del negocio, ese peso estaría
 * contado dos veces y ningún total volvería a cuadrar. Y tendrías que
 * conciliar las dos bolsas entre ellas, para siempre.
 *
 * La ganancia es una **vista**, no un bolsillo: lo cobrado menos los gastos del
 * negocio, en el periodo que elijas. El dinero sigue viviendo en las cuentas
 * reales —donde está de verdad— y el negocio es una forma de mirarlo. Se
 * deriva, no se duplica.
 *
 * Ventaja práctica que se nota: esto no se puede descuadrar. No hay un segundo
 * sitio donde el dinero se desincronice, así que no hay nada que conciliar.
 *
 * ── CÓMO SABE QUÉ ES SUYO ─────────────────────────────────────────────
 * Por CATEGORÍAS, no por un campo nuevo en cada movimiento. Un negocio declara
 * qué categorías de ingreso son sus cobros y qué categorías de gasto son sus
 * costes; todo lo demás se deriva de ahí. Así el libro no cambia de forma —cero
 * migraciones, cero riesgo— y clasificar un movimiento viejo es cambiarle la
 * categoría, que ya se podía hacer.
 */

/**
 * CÓMO LLAMA CADA NEGOCIO A SUS COSAS.
 *
 * La app está en producción y quien la use no tiene por qué tener el negocio de
 * quien la escribió. A un cliente se le puede llamar estudiante, inquilino,
 * paciente, miembro o socio; a un servicio, producto, plan, propiedad o
 * materia; y a una plaza, perfil, cupo, asiento o habitación.
 *
 * Son solo PALABRAS: ninguna cambia el comportamiento. Pero una app que te
 * llama «cliente» al alumno al que le das clases se siente prestada, y eso es
 * suficiente para que alguien no la use.
 *
 * Vacío = la app usa sus palabras por defecto.
 */
export interface BusinessLabels {
  /** Singular de quien te paga: «estudiante», «inquilino». */
  client?: string
  /** Singular de lo que vendes: «materia», «propiedad», «plan». */
  service?: string
  /** Singular de una plaza: «perfil», «cupo», «habitación». */
  slot?: string
}

export interface Business {
  id: string
  name: string
  color: string
  icon: IconName
  /** Las palabras de este negocio. Opcional: hay defectos razonables. */
  labels?: BusinessLabels
  /** Categorías de ingreso que son cobros de este negocio. */
  incomeCategoryIds: string[]
  /** Categorías de gasto que son costes de este negocio. */
  expenseCategoryIds: string[]
  /**
   * Porcentaje de cada cobro que se aparta porque no es tuyo del todo
   * (impuestos, reinversión, el coste del servicio). `0` = no apartar nada.
   */
  setAsidePct?: number
  /**
   * LA CUENTA A LA QUE SE APARTA DE VERDAD.
   *
   * Sin esto, apartar era un consejo: la hoja de cobro decía «aparta 500» y
   * el dinero se quedaba donde estaba. Un porcentaje que nadie mueve no
   * protege de nada —llega el trimestre de los impuestos y el dinero se
   * gastó—, así que la app puede hacer el movimiento ella.
   *
   * Ausente = se sigue diciendo y no se mueve, que es como funcionaba.
   */
  setAsideAccountId?: string
  /**
   * Cuando se archivo, en ms. Ausente = en pie.
   *
   * Archivar no es borrar: el negocio sale de la lista y deja de generar
   * cobros, pero sus movimientos siguen en el libro y su año sigue contando
   * en los informes. Borrarlo haria perder un trimestre de datos reales por
   * querer limpiar una lista.
   */
  archivedAt?: number
  createdAt: number
  /** Cuánto vale cada estrella de un cliente. Ausente = las de siempre. */
  referral?: ReferralRules
  /** Meta de cobro al mes («quiero cobrar RD$15,000»). En «Hoy» el anillo mide contra ella. */
  monthlyGoal?: number
}

/**
 * EL PROGRAMA DE RECOMENDADOS DE UN NEGOCIO.
 *
 * Cada estrella de un cliente es alguien que te trajo, y cada una le baja el
 * precio un porcentaje. Con tope: sin él, quien te trae a veinte acabaría
 * usando el servicio gratis y pagándolo tú.
 */
export interface ReferralRules {
  /** Lo que baja cada estrella, en %. `0` = el programa está apagado. */
  pctPerStar: number
  /** El descuento máximo, en %, por muchas estrellas que tenga. */
  maxPct: number
  /**
   * Meses que dura una estrella. `0` o ausente = no caduca.
   *
   * Que caduquen es lo que hace que sigan recomendando: una estrella de hace
   * dos años ya se cobró en descuentos.
   */
  expiresMonths?: number
}

/**
 * UNA CUENTA COMPRADA DE UN SERVICIO.
 *
 * ── EL CASO QUE OBLIGA A ESTO ─────────────────────────────────────────
 * Netflix admite cuatro perfiles. Cuando llega el quinto cliente hay que
 * comprar OTRA cuenta de Netflix, con su coste y sus cuatro plazas. Con un
 * servicio de coste y tope únicos no se puede representar: o se miente sobre
 * el coste, o se crea «Netflix 2» como servicio aparte y entonces el margen
 * del producto queda partido en dos y no se puede leer.
 *
 * Así el SERVICIO es el producto («Netflix») y cada cuenta es una unidad
 * comprada. El margen se calcula por producto sumando sus cuentas, y de paso
 * la app puede decir lo que de verdad hace falta saber: cuándo toca comprar
 * otra.
 *
 * El `label` es para distinguirlas de un vistazo («la del correo viejo»): sin
 * algo así, dos cuentas iguales son indistinguibles al asignarles un cliente.
 */
export interface ServiceAccount {
  id: string
  /** Para reconocerla. Vacío = la app la numera («Cuenta 1»). */
  label?: string
  /** Lo que cuesta ESTA cuenta, en el ciclo del servicio. */
  cost: number
  /** Plazas de esta cuenta. `0` o ausente = sin tope. */
  capacity?: number
  /** Cuándo se dio de baja. `0` = activa. Las de baja no cuestan ni cuentan. */
  closedAt?: number
  /**
   * El día que se paga ESTA cuenta, si no es el del servicio.
   *
   * Dos cuentas de Netflix compradas en meses distintos se cobran en días
   * distintos, y el pago automático tiene que crear cada una el suyo.
   */
  payDay?: number
}

/**
 * CÓMO SE PAGA UN SERVICIO.
 *
 *  · `auto`   — ese día la app registra el gasto sola.
 *  · `ask`    — ese día te pregunta, y un toque lo registra.
 *  · `manual` — como siempre: lo pagas tú desde el botón Pagar.
 *
 * Se elige servicio por servicio: Netflix nunca falla y se puede dejar solo;
 * un hosting que cambia de precio cada mes mejor que pregunte.
 */
export type PayMode = 'auto' | 'ask' | 'manual'

/** Algo que revendes o alquilas: lo que te cuesta y a quién se lo das. */
export interface Service {
  id: string
  businessId: string
  name: string
  /**
   * Lo que te cuesta, EN SU CICLO. No necesariamente al mes.
   *
   * Mucha gente compra las suscripciones anuales porque salen más baratas, y
   * tratar esos 6,000 como mensuales daría un mes de −6,000 y once de ganancia
   * pura. Para comparar contra lo que cobras se usa `perMonth`, nunca `cost`
   * a secas.
   */
  cost: number
  costCycle: BillingCycle
  /**
   * Divisa del coste. Ausente = la divisa base de la app.
   *
   * Hace falta de verdad: muchas suscripciones se pagan en dólares aunque la
   * app lleve pesos, y hay clientes que pagan en una divisa y servicios que se
   * pagan en otra. Restar pesos de dólares daría un margen inventado.
   */
  currency?: CurrencyCode
  /** Solo con `costCycle: 'custom'`: cada cuántos meses se paga. */
  costCustomMonths?: number
  /**
   * El precio mensual del mismo servicio, si lo sabes.
   *
   * Sirve para una sola cosa, y es la que justifica haber pagado por
   * adelantado: enseñar lo que te ahorras al año comprando el plazo largo.
   */
  monthlyListPrice?: number
  /** Cuántas plazas tiene como máximo. `0` o ausente = sin tope. */
  capacity?: number
  /**
   * Las cuentas compradas de este servicio.
   *
   * Ausente o vacío = el servicio es una sola cosa y mandan `cost`/`capacity`.
   * Así los servicios creados antes de esto siguen significando lo mismo sin
   * migrar nada.
   */
  accounts?: ServiceAccount[]
  createdAt: number
  /** Cómo se paga. Ausente = a mano, que es como funcionaba. */
  payMode?: PayMode
  /**
   * Día del pago: del mes para los ciclos de meses, de la semana (0 domingo)
   * para el semanal. Sin él no hay fecha y no se automatiza nada.
   */
  payDay?: number
  /**
   * El primer pago, `YYYY-MM-DD`, para los ciclos de varios meses y el
   * quincenal: un anual de marzo y uno de octubre tienen el mismo día 15.
   */
  payAnchor?: string
  /**
   * Desde cuándo se automatiza. Nunca se registra nada antes: configurar el
   * pago hoy no puede crear de golpe los doce Netflix del año pasado.
   */
  payFrom?: string
  /** De qué cuenta sale. */
  payAccountId?: string
  /** En qué categoría de gasto entra. */
  payCategoryId?: string
  /**
   * Los pagos ya resueltos, `cuenta|fecha`: registrados solos, marcados a
   * mano o descartados. Es lo que hace que nada se registre dos veces.
   */
  payHandled?: string[]
  /** «Mañana»: hasta cuándo no se vuelve a preguntar por ese pago. */
  paySnooze?: Record<string, string>
  /**
   * Lo que cobras por cada plaza. Cada cliente nuevo de este servicio sale
   * con este precio puesto, y si se le cambia, solo ese queda distinto.
   */
  slotPrice?: number
  /**
   * Archivado: ya no lo vendes. No cuesta en la ganancia al mes ni se paga
   * solo, y su historial sigue contando. Igual que archivar un negocio.
   */
  archivedAt?: number
}

/**
 * Las cuentas activas de un servicio, o una implícita si no tiene ninguna.
 *
 * Que un servicio sin cuentas se comporte como si tuviera una es lo que
 * permite no migrar: era exactamente su significado antes de que las cuentas
 * existieran.
 */
export function serviceAccounts(service: Service): ServiceAccount[] {
  const propias = (service.accounts ?? []).filter(a => !a.closedAt)
  if (propias.length) return propias
  return [{ id: `${service.id}:single`, cost: service.cost, capacity: service.capacity }]
}

/**
 * Lo que cuesta este servicio al mes, en la divisa que se pida.
 *
 * Dos normalizaciones, y las dos obligatorias para que la resta signifique
 * algo: el CICLO (un pago anual no son 6,000 al mes) y la DIVISA (un servicio
 * en dólares contra clientes en pesos).
 */
export function serviceCostPerMonth(service: Service, base?: CurrencyCode): number {
  // Suma TODAS las cuentas compradas: dos Netflix cuestan dos Netflix. Un
  // servicio sin cuentas devuelve la suya implicita, asi que esto sigue
  // valiendo lo mismo que antes para lo que ya existia.
  const total = serviceAccounts(service).reduce((sum, cuenta) => sum + cuenta.cost, 0)
  const mensual = perMonth({ amount: total, cycle: service.costCycle, customMonths: service.costCustomMonths })
  if (!base || !service.currency || service.currency === base) return mensual
  return Math.round(convertCurrency(mensual, service.currency, base) * 100) / 100
}

export interface BusinessPeriod {
  /** Lo que entró de verdad en el periodo. */
  collected: number
  /** Lo que costó. */
  costs: number
  /** Lo que quedó. Puede ser negativo, y hay que decirlo cuando lo es. */
  profit: number
  /** Movimientos de ingreso que entraron en la cuenta. */
  incomeCount: number
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * De quién es un movimiento (ver `attribution.ts`). Se declara aquí con la
 * forma mínima para no importar ese módulo, que ya importa de este.
 */
type Owner = (tx: Transaction) => { businessId: string } | null

/**
 * Si un movimiento es de este negocio.
 *
 * Con `owner`, manda la marca del movimiento —el servicio que pagó, el
 * cliente que cobró— y la categoría solo para lo que no tiene marca. Sin él,
 * por categoría a secas, que es como funcionaba y como lo siguen usando las
 * pruebas de siempre.
 */
function esDe(business: Business, owner: Owner | undefined, ingresos: Set<string>, gastos: Set<string>) {
  return (tx: Transaction): 'income' | 'expense' | null => {
    if (tx.type === 'transfer') return null
    if (owner) {
      const quien = owner(tx)
      return quien && quien.businessId === business.id ? tx.type : null
    }
    if (!tx.categoryId) return null
    if (tx.type === 'income' && ingresos.has(tx.categoryId)) return 'income'
    if (tx.type === 'expense' && gastos.has(tx.categoryId)) return 'expense'
    return null
  }
}

/**
 * La ganancia de un negocio en un mes.
 *
 * Los montos tienen que llegar YA convertidos a la divisa base: mezclar pesos
 * y dólares en una resta daría una cifra sin significado. Quien llama usa
 * `convertTxAmountsToBase`, como el resto de la app.
 */
export function businessMonth(business: Business, txns: Transaction[], mkey: string, owner?: Owner): BusinessPeriod {
  const tipo = esDe(business, owner, new Set(business.incomeCategoryIds), new Set(business.expenseCategoryIds))
  let collected = 0, costs = 0, incomeCount = 0

  for (const tx of txns) {
    if (monthKey(tx.date) !== mkey) continue
    const t = tipo(tx)
    if (t === 'income') {
      collected += tx.amount
      incomeCount += 1
    } else if (t === 'expense') {
      costs += tx.amount
    }
  }

  return {
    collected: cents(collected),
    costs: cents(costs),
    profit: cents(collected - costs),
    incomeCount,
  }
}

/**
 * Reparte el año en doce casillas con UN solo recorrido del libro.
 *
 * ── POR QUÉ NO DOCE LLAMADAS A `businessMonth` ────────────────────────
 * Era lo que había: `businessYear` y `runRateSeries` llamaban a
 * `businessMonth` doce veces, y cada una recorría TODOS los movimientos
 * calculando `monthKey` de cada fecha para quedarse con un doceavo.
 *
 * En la pantalla de Ganancia las dos corren por cada negocio y en cada
 * repintado: con cinco negocios y unos miles de movimientos son cientos de
 * miles de vueltas y otros tantos cortes de cadena, en el hilo que dibuja.
 * Esto hace una pasada y luego doce lecturas de un mapa.
 */
function yearBuckets(
  business: Business,
  txns: Transaction[],
  year: number,
  owner?: Owner,
): Map<string, BusinessPeriod> {
  const tipo = esDe(business, owner, new Set(business.incomeCategoryIds), new Set(business.expenseCategoryIds))
  const prefijo = `${year}-`

  const crudo = new Map<string, { collected: number; costs: number; incomeCount: number }>()
  for (let m = 1; m <= 12; m += 1) {
    crudo.set(`${year}-${String(m).padStart(2, '0')}`, { collected: 0, costs: 0, incomeCount: 0 })
  }

  for (const tx of txns) {
    // El año se descarta por el prefijo de la fecha, sin construir su clave:
    // la mayoría de los movimientos de un libro viejo no son de este año.
    if (!tx.date.startsWith(prefijo)) continue
    const casilla = crudo.get(monthKey(tx.date))
    if (!casilla) continue
    const t = tipo(tx)
    if (t === 'income') {
      casilla.collected += tx.amount
      casilla.incomeCount += 1
    } else if (t === 'expense') {
      casilla.costs += tx.amount
    }
  }

  const fuera = new Map<string, BusinessPeriod>()
  for (const [mkey, { collected, costs, incomeCount }] of crudo) {
    fuera.set(mkey, {
      collected: cents(collected),
      costs: cents(costs),
      profit: cents(collected - costs),
      incomeCount,
    })
  }
  return fuera
}

export interface BusinessYear extends BusinessPeriod {
  /** Meses con actividad, para que la media signifique algo. */
  activeMonths: number
  /** Ganancia media por mes activo. */
  monthlyAvg: number
  /** Ganancia mes a mes, de más viejo a más nuevo. */
  byMonth: Array<{ mkey: string; profit: number }>
}

/** La ganancia del año, y la media por mes con actividad. */
export function businessYear(business: Business, txns: Transaction[], year: number, owner?: Owner): BusinessYear {
  const byMonth: Array<{ mkey: string; profit: number }> = []
  let collected = 0, costs = 0, incomeCount = 0, activeMonths = 0

  for (const [mkey, mes] of yearBuckets(business, txns, year, owner)) {
    byMonth.push({ mkey, profit: mes.profit })
    collected += mes.collected
    costs += mes.costs
    incomeCount += mes.incomeCount
    // Un mes cuenta como activo si pasó ALGO, cobro o gasto: un mes en el que
    // solo pagaste el servicio sin vender nada también es un mes de negocio.
    if (mes.collected > 0 || mes.costs > 0) activeMonths += 1
  }

  const profit = cents(collected - costs)
  return {
    collected: cents(collected),
    costs: cents(costs),
    profit,
    incomeCount,
    activeMonths,
    // Dividir por 12 cuando solo llevas tres meses daría una media falsamente
    // mala. Se divide por los meses que de verdad hubo.
    monthlyAvg: activeMonths > 0 ? cents(profit / activeMonths) : 0,
    byMonth,
  }
}

export interface ServiceMargin {
  /** Ya normalizado al mes, no el monto de su ciclo. */
  cost: number
  /** Lo que suman los clientes activos de este servicio, por ciclo. */
  revenue: number
  margin: number
  clientCount: number
  /** Cuántos clientes hacen falta para no perder dinero. */
  breakEven: number | null
  /** Plazas libres sumando todas las cuentas, si tienen tope. */
  freeSlots: number | null
  /** Cuántas cuentas compradas tiene en pie. */
  accountCount: number
  /**
   * Si ya no caben más clientes y hace falta comprar otra cuenta.
   *
   * Es la pregunta de verdad del negocio de revender: no «¿cuánto gano?», sino
   * «¿puedo meter al que me acaba de escribir?».
   */
  needsAnotherAccount: boolean
}

/**
 * EL MARGEN DE UN SERVICIO QUE REVENDES.
 *
 * El caso concreto: pagas RD$ 600 por una cuenta de streaming y vendes cuatro
 * perfiles a 250. Eso son 400 de margen — y si se cae un cliente, 150. Hoy el
 * servicio es un gasto y los pagos son ingresos sueltos, así que no hay forma
 * de saber si te deja algo.
 *
 * `breakEven` es lo que ninguna hoja de cálculo te dice sin pelearte: cuántos
 * clientes necesitas para no perder dinero.
 */
export function serviceMargin(service: Service, clients: Client[], base?: CurrencyCode): ServiceMargin {
  const suyos = clients.filter(c => isOnService(c, service.id) && c.active)

  /*
   * TODO SE COMPARA AL MES, los dos lados.
   *
   * Es la única forma de que la resta signifique algo: un servicio que se paga
   * al año contra clientes que pagan al mes, restados en crudo, darían un
   * margen absurdo. Y al revés también pasa — hay quien cobra el año por
   * adelantado.
   */
  const cost = serviceCostPerMonth(service, base)
  // Lo que deja ESTE servicio, no lo que paga el cliente en total: quien te
  // compra Netflix y Disney sumaria su pago entero a los dos, y cada servicio
  // pareceria el doble de bueno.
  const revenue = cents(suyos.reduce((sum, c) => sum + clientPerMonthForService(c, service.id, base), 0))
  const margin = cents(revenue - cost)

  // El punto de equilibrio se calcula con el precio MEDIO de los clientes que
  // ya hay: sin ninguno no hay precio del que partir, y suponer uno sería
  // inventarse el dato más importante.
  const precioMedio = suyos.length ? revenue / suyos.length : 0
  const breakEven = precioMedio > 0 ? Math.ceil(cost / precioMedio) : null

  /*
   * Las plazas salen de SUMAR las cuentas, no del tope del servicio.
   *
   * Si alguna cuenta no tiene tope, el conjunto no tiene tope: una sola plaza
   * ilimitada hace ilimitado el total, y decir «0 libres» ahi seria mentir.
   */
  const cuentas = serviceAccounts(service)
  const algunaSinTope = cuentas.some(c => !c.capacity || c.capacity <= 0)
  const plazas = algunaSinTope ? null : cuentas.reduce((sum, c) => sum + (c.capacity ?? 0), 0)
  const freeSlots = plazas === null ? null : Math.max(0, plazas - suyos.length)

  return {
    cost,
    revenue,
    margin,
    clientCount: suyos.length,
    breakEven,
    freeSlots,
    accountCount: cuentas.length,
    needsAnotherAccount: freeSlots === 0,
  }
}

/**
 * Como estan de llenas las cuentas de un servicio, una por una.
 *
 * Es lo que hace falta para asignar un cliente: sin saber que la cuenta 1 esta
 * llena y la 2 tiene sitio, el usuario tiene que llevar la cuenta en la cabeza
 * — que es exactamente lo que la app deberia quitarle.
 */
export function accountOccupancy(
  service: Service,
  clients: Client[],
): Array<{ account: ServiceAccount; used: number; free: number | null; full: boolean }> {
  const dondeEsta = placeClients(service, clients)
  return serviceAccounts(service).map(account => {
    let used = 0
    for (const accountId of dondeEsta.values()) if (accountId === account.id) used += 1
    const tope = account.capacity && account.capacity > 0 ? account.capacity : null
    return {
      account,
      used,
      free: tope === null ? null : Math.max(0, tope - used),
      full: tope !== null && used >= tope,
    }
  })
}

/**
 * S2 · EN QUÉ CUENTA ESTÁ CADA CLIENTE, aunque no se le haya dicho.
 *
 * ── EL FALLO QUE ARREGLA ──────────────────────────────────────────────
 * Las cuentas contaban solo a los clientes con `serviceAccountId`. Los que ya
 * tenías no lo tienen —se crearon antes de que hubiera cuentas—, así que la
 * Cuenta 1 salía con todas las plazas libres aunque estuviera llena, y un
 * aviso de «sin cuenta» debajo.
 *
 * Ahora los que no tienen cuenta (o la suya se cerró) se colocan en orden de
 * llegada: primero en la cuenta con sitio, y si todas están llenas, en la
 * última. Es determinista —el mismo cliente cae siempre en el mismo sitio—, y
 * la pantalla de cuentas lo guarda en cuanto se abre, para que mover a uno no
 * baraje a los demás.
 *
 * Devuelve cliente → cuenta, solo de los clientes activos del servicio.
 */
export function placeClients(service: Service, clients: Client[]): Map<string, string> {
  const cuentas = serviceAccounts(service)
  const fuera = new Map<string, string>()
  if (!cuentas.length) return fuera
  const ids = new Set(cuentas.map(a => a.id))
  const suyos = clients
    .filter(c => c.active && !c.deletedAt && isOnService(c, service.id))
    .sort((a, b) => a.createdAt - b.createdAt)

  const usadas = new Map(cuentas.map(a => [a.id, 0]))
  const sinSitio: Client[] = []
  for (const c of suyos) {
    if (c.serviceAccountId && ids.has(c.serviceAccountId)) {
      fuera.set(c.id, c.serviceAccountId)
      usadas.set(c.serviceAccountId, (usadas.get(c.serviceAccountId) ?? 0) + 1)
    } else {
      sinSitio.push(c)
    }
  }
  for (const c of sinSitio) {
    const libre = cuentas.find(a => !a.capacity || a.capacity <= 0 || (usadas.get(a.id) ?? 0) < a.capacity)
    const destino = libre ?? cuentas[cuentas.length - 1]
    fuera.set(c.id, destino.id)
    usadas.set(destino.id, (usadas.get(destino.id) ?? 0) + 1)
  }
  return fuera
}

/**
 * DOS FORMAS DE MIRAR EL MISMO DINERO, Y LAS DOS CIERTAS.
 *
 * `businessMonth` da la vista de CAJA: lo que entró y salió de verdad este mes.
 * Es lo que vio el banco, y no se puede discutir.
 *
 * El problema es que la caja miente sobre la rentabilidad cuando los pagos no
 * son mensuales. Quien compra una suscripción anual por RD$ 6,000 para
 * ahorrarse un porcentaje ve un mes de −6,000 y once de ganancia pura: la
 * ganancia mensual sería falsa doce veces al año, y justo al revés de lo que
 * pasa (el servicio cuesta 500 al mes y deja lo que deje).
 *
 * Esta es la vista AL MES: lo cobrado de verdad contra el coste mensual
 * declarado de los servicios. Contesta «¿esto me deja algo?», que es la
 * pregunta que la caja no contesta.
 *
 * ── POR QUÉ EL COSTE SALE DE LO DECLARADO Y NO DE REPARTIR LOS GASTOS ──
 * Repartir cada gasto real entre los meses que cubre exigiría saber el ciclo
 * DE CADA MOVIMIENTO, y el libro no lo guarda: habría que adivinarlo cruzando
 * montos con servicios, y un gasto mal atribuido daría una ganancia inventada
 * con pinta de precisa. Lo declarado es un dato que el usuario escribió a
 * propósito, así que es el único que no hay que suponer.
 *
 * Ninguna de las dos sustituye a la otra y la app enseña las dos etiquetadas.
 */
export interface BusinessRunRate {
  /** Lo cobrado de verdad en el mes. */
  collected: number
  /** Lo que cuestan al mes los servicios declarados. */
  monthlyCost: number
  /** Lo que deja al mes. Puede ser negativo, y hay que decirlo cuando lo es. */
  profit: number
  /** Si hay algún servicio con un ciclo que no sea mensual: entonces las dos
   *  vistas difieren y merece explicarse. */
  hasNonMonthly: boolean
}

export function businessRunRate(
  business: Business,
  services: Service[],
  txns: Transaction[],
  mkey: string,
  base?: CurrencyCode,
  owner?: Owner,
): BusinessRunRate {
  // Un servicio archivado ya no se paga: contarlo al mes sería un coste que
  // no existe.
  const suyos = services.filter(s => s.businessId === business.id && !s.archivedAt)
  const monthlyCost = cents(suyos.reduce((sum, s) => sum + serviceCostPerMonth(s, base), 0))
  const { collected } = businessMonth(business, txns, mkey, owner)
  return {
    collected,
    monthlyCost,
    profit: cents(collected - monthlyCost),
    hasNonMonthly: suyos.some(s => s.costCycle !== 'monthly'),
  }
}

/**
 * La ganancia al mes de los últimos `months` meses, para la gráfica.
 *
 * Los ingresos son los reales de cada mes; el coste es el declarado, constante.
 * Así un pago anual no deja un cráter en su mes y once meses planos: la línea
 * cuenta cómo va el negocio, que es para lo que se mira.
 */
export function runRateSeries(
  business: Business,
  services: Service[],
  txns: Transaction[],
  year: number,
  base?: CurrencyCode,
  owner?: Owner,
): Array<{ mkey: string; profit: number }> {
  const suyos = services.filter(s => s.businessId === business.id && !s.archivedAt)
  const monthlyCost = cents(suyos.reduce((sum, s) => sum + serviceCostPerMonth(s, base), 0))
  const fuera: Array<{ mkey: string; profit: number }> = []
  for (const [mkey, { collected }] of yearBuckets(business, txns, year, owner)) {
    // Un mes sin NADA cobrado se deja en cero en vez de en -coste: un negocio
    // que todavia no habia empezado no estaba perdiendo dinero.
    fuera.push({ mkey, profit: collected > 0 ? cents(collected - monthlyCost) : 0 })
  }
  return fuera
}

/** Lo que aporta cada cliente en un periodo, de más a menos. */
export function clientRanking(
  clients: Client[],
  paidByClient: Record<string, number>,
): Array<{ client: Client; amount: number }> {
  return clients
    .map(client => ({ client, amount: cents(paidByClient[client.id] ?? 0) }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
}

/**
 * PRECIOS DESIGUALES POR EL MISMO CONCEPTO.
 *
 * Un negocio pequeño se desangra por precios que nunca se revisaron: a Juan le
 * cobras 250 y a Ana 200 por lo mismo, y nadie lo mira nunca. Esto lo saca a la
 * luz agrupando por concepto, sin opinar sobre cuál está mal.
 */
export function priceSpread(clients: Client[]): Array<{
  concept: string
  min: number
  max: number
  clients: number
}> {
  const porConcepto = new Map<string, number[]>()
  for (const c of clients) {
    if (!c.active) continue
    const clave = c.concept.trim().toLowerCase()
    if (!clave) continue
    const lista = porConcepto.get(clave) ?? []
    lista.push(c.amount)
    porConcepto.set(clave, lista)
  }

  const fuera: Array<{ concept: string; min: number; max: number; clients: number }> = []
  for (const [clave, montos] of porConcepto) {
    if (montos.length < 2) continue
    const min = Math.min(...montos)
    const max = Math.max(...montos)
    // Solo se enseña cuando hay desigualdad de verdad: si todos pagan lo mismo
    // no hay nada que decidir.
    if (max - min < 0.005) continue
    const original = clients.find(c => c.concept.trim().toLowerCase() === clave)
    fuera.push({ concept: original?.concept ?? clave, min, max, clients: montos.length })
  }
  return fuera.sort((a, b) => (b.max - b.min) - (a.max - a.min))
}

/** Lo que hay que apartar de un cobro, según el ajuste del negocio. */
export function setAsideAmount(business: Business, collected: number): number {
  const pct = business.setAsidePct ?? 0
  if (!(pct > 0) || !(collected > 0)) return 0
  return cents(collected * Math.min(100, pct) / 100)
}
