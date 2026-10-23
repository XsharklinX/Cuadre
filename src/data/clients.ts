import { cycleMonths, perMonth, type BillingCycle } from './billing'
import { convertCurrency } from './currencies'
import type { CurrencyCode } from '@/types'

/**
 * CLIENTES Y COBROS.
 *
 * ── EL PRINCIPIO QUE SOSTIENE TODO ESTE MÓDULO ────────────────────────
 * **Lo que te deben no es dinero tuyo hasta que llega.** Un cobro esperado no
 * toca ningún saldo, no cuenta como ingreso y no entra en los informes. Vive
 * aquí, en su propio almacén, completamente aparte del libro.
 *
 * No es escrúpulo contable: es lo que hace que la app siga sirviendo. Si lo que
 * esperas sumara al balance, verías RD$ 50,000 que no puedes gastar, y el único
 * número que la app tiene de verdad confiable dejaría de serlo.
 *
 * Cuando el pago llega, un toque lo cruza: el cobro se convierte en un ingreso
 * real (un movimiento normal, por `addTx`) en la cuenta donde depositó y con su
 * categoría. Ese toque es el ÚNICO sitio donde las dos mitades se tocan, y es a
 * propósito — una sola puerta es una sola cosa que puede fallar.
 *
 * ── LO QUE HAY AQUÍ ───────────────────────────────────────────────────
 * Solo el modelo y las fechas, que es lo que tiene reglas y se puede probar sin
 * navegador. El almacén está en `store/business.ts`.
 */

/**
 * Cada cuánto paga un cliente.
 *
 * Es el MISMO juego de ciclos que usan los costes (ver `billing.ts`), y no una
 * lista propia más corta: la app está en producción y quien la use no tiene por
 * qué cobrar como el que la escribió. Hay quien factura por semana, por
 * trimestre, una sola vez, o cobra el año entero por adelantado.
 */
export type ClientCycle = BillingCycle

export interface Client {
  id: string
  name: string
  /** Para escribirle por WhatsApp. Opcional: no todo cliente se gestiona así. */
  phone?: string
  /** Qué le vendes: «Netflix compartido», «Tareas de cálculo». */
  concept: string
  /**
   * Lo que te paga cada ciclo.
   *
   * Con `variableAmount` activo esto es solo una ESTIMACIÓN para las
   * previsiones: el monto real se escribe al crear cada cobro. Es el caso de
   * quien factura por proyecto y nunca cobra lo mismo dos veces.
   */
  amount: number
  /**
   * El monto cambia en cada cobro.
   *
   * Existe porque obligar a un monto fijo excluiría a media app: un freelance,
   * un taller que cobra por reparación, alguien que vende por encargo. Con esto
   * los cobros se crean a mano con su monto, y el ciclo solo sirve para
   * recordarte cuándo toca mirar.
   */
  variableAmount?: boolean
  /**
   * Divisa del cobro. Ausente = la divisa base de la app.
   *
   * Hay clientes que pagan en dólares y clientes que pagan en pesos, a veces
   * en el mismo negocio. Sin esto, los dos montos se sumarían en crudo y el
   * total no significaría nada.
   */
  currency?: CurrencyCode
  cycle: ClientCycle
  /**
   * Día de pago. Su significado depende del ciclo:
   *  · mensual y múltiplos → día del mes, 1–31 (se recorta al último día)
   *  · `weekly`            → día de la semana, 0 domingo … 6 sábado
   *  · `biweekly`, `once`  → se ignora; manda `startDate`
   */
  dueDay: number
  /** Ancla para `biweekly` y fecha única para `once`, en `YYYY-MM-DD`. */
  startDate?: string
  /** Solo con `cycle: 'custom'`: cada cuántos meses paga. */
  customMonths?: number
  /** Cuenta donde deposita. */
  accountId: string
  /** Categoría de ingreso en la que entra su pago. */
  categoryId: string
  /** Negocio al que pertenece, si lo hay. */
  businessId?: string
  /** Servicio que consume (una cuenta de streaming, por ejemplo). */
  serviceId?: string
  /**
   * VARIOS SERVICIOS, CON SU PRECIO CADA UNO.
   *
   * Un cliente puede comprarte Netflix Y Disney. Con un solo `serviceId` había
   * que inventarse un segundo cliente con el mismo nombre, y su historial
   * quedaba partido en dos personas que no existen.
   *
   * ── POR QUÉ LLEVA EL PRECIO Y NO SOLO LOS IDS ───────────────────────
   * Si fuera una lista de ids, habría que repartir su `amount` entre ellos
   * para saber cuánto deja cada servicio, y repartir a partes iguales sería
   * inventarse unos números que el usuario no escribió: Netflix a 250 y Disney
   * a 150 no son 200 y 200. Aquí cada servicio dice lo suyo.
   *
   * Ausente = sigue mandando `serviceId` con el `amount` entero, que es como
   * funcionaba y como siguen estando los clientes de siempre.
   */
  serviceShares?: Array<{ serviceId: string; amount: number }>
  /**
   * LO QUE LE HAS IDO COBRANDO, con la fecha de cada cambio.
   *
   * Un precio que lleva dos años sin tocarse es dinero que se pierde sin que
   * nadie lo note, y la app no tenía forma de enseñarlo: al cambiar el monto,
   * el anterior desaparecía. Solo se apunta el cambio, no cada guardado.
   */
  priceLog?: Array<{ at: number; amount: number }>
  /**
   * CUAL de las cuentas compradas de ese servicio ocupa.
   *
   * Hace falta desde que un servicio puede tener varias: Netflix admite cuatro
   * perfiles, y al quinto cliente se compra otra cuenta. Sin esto no se puede
   * saber que cuenta esta llena, y el usuario tendria que llevarlo en la
   * cabeza — justo lo que la app deberia quitarle.
   *
   * Ausente = el servicio tiene una sola cuenta, o todavia no se le asigno.
   */
  serviceAccountId?: string
  /** Un cliente inactivo no genera cobros nuevos; su historial se conserva. */
  active: boolean
  createdAt: number
  notes?: string
}

/** Un cobro esperado. NO es dinero: es una expectativa con fecha. */
export interface Charge {
  id: string
  clientId: string
  /** Cuándo debería pagar, `YYYY-MM-DD`. */
  dueDate: string
  /** Lo que se espera cobrar. */
  amount: number
  /** Lo que ha llegado. Menor que `amount` = pagó de menos. */
  paid: number
  /**
   * Los movimientos reales que lo pagaron.
   *
   * Es la prueba de que el dinero existe: un cobro no se puede marcar pagado
   * sin un movimiento detrás. Si se pudiera, «cobrado» sería una opinión.
   */
  txIds: string[]
  /** Cuándo se cobró del todo, en ms. `0` = sin cobrar. */
  paidAt: number
  /** Dado por perdido a mano: no cuenta como atrasado ni como cobrado. */
  waived?: boolean
  /**
   * Una nota de ESTE cobro, no del cliente.
   *
   * «Este mes le hice además el logo», «pagó en efectivo», «le fié hasta el
   * viernes». Las notas del cliente son permanentes y estas son de una vez:
   * meterlas en la ficha convertiría su perfil en un diario.
   */
  note?: string
}

export type ChargeState = 'paid' | 'partial' | 'late' | 'today' | 'upcoming' | 'waived'

const DIA = 86_400_000

/** Último día de un mes, para no inventar un 31 de febrero. */
function lastDayOfMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate()
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parse(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const d = new Date(`${date}T00:00:00`)
  return Number.isFinite(d.getTime()) ? d : null
}

/**
 * La fecha de pago del mes de `ref` para un cliente mensual.
 *
 * Recorta al último día: alguien que paga el 31 paga el 28 en febrero. Sin
 * esto, `new Date(2026, 1, 31)` se desborda a marzo y el cobro de febrero
 * aparecería con fecha de marzo — un cliente que nunca se atrasa.
 */
function monthlyDue(year: number, month1: number, dueDay: number): string {
  const tope = lastDayOfMonth(year, month1)
  const dia = Math.min(Math.max(1, Math.round(dueDay)), tope)
  return `${year}-${String(month1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/**
 * Las fechas en que este cliente debe pagar dentro de un rango, inclusive.
 *
 * Es la base del generador de cobros: en vez de «el próximo», devuelve todos
 * los del periodo, así que un usuario que no abre la app en dos meses recupera
 * los dos cobros que se le pasaron en vez de solo el último.
 */
export function dueDatesBetween(client: Client, from: string, to: string): string[] {
  const desde = parse(from)
  const hasta = parse(to)
  if (!desde || !hasta || desde > hasta) return []

  // Sin ciclo: los cobros se crean a mano cuando hay trabajo.
  if (client.cycle === 'none') return []

  if (client.cycle === 'once') {
    const unico = client.startDate
    return unico && unico >= from && unico <= to ? [unico] : []
  }

  /*
   * TODO LO QUE SE MIDE EN MESES, incluido cada 2, 3, 6 o 12.
   *
   * Un cliente que paga el año por adelantado tiene UN cobro al año, no doce:
   * generarle doce le inventaría once deudas que no tiene. El salto sale del
   * ciclo, y para los de varios meses hace falta un ancla que diga en qué mes
   * cae — sin ella no se puede saber si el año empieza en enero o en marzo.
   */
  const pasoMeses = cycleMonths(client.cycle, client.customMonths)
  if (pasoMeses !== null && pasoMeses >= 1) {
    const salto = Math.round(pasoMeses)
    const fechas: string[] = []

    if (salto === 1) {
      const cursor = new Date(desde.getFullYear(), desde.getMonth(), 1)
      const fin = new Date(hasta.getFullYear(), hasta.getMonth(), 1)
      while (cursor <= fin) {
        const fecha = monthlyDue(cursor.getFullYear(), cursor.getMonth() + 1, client.dueDay)
        if (fecha >= from && fecha <= to) fechas.push(fecha)
        cursor.setMonth(cursor.getMonth() + 1)
      }
      return fechas
    }

    // El ancla da el mes de referencia; sin ella se usa el mes en que se creó
    // el cliente, que es lo más parecido a «desde cuándo paga».
    const ancla = client.startDate ? parse(client.startDate) : new Date(client.createdAt)
    if (!ancla || !Number.isFinite(ancla.getTime())) return []
    const anclaMes = ancla.getFullYear() * 12 + ancla.getMonth()
    const desdeMes = desde.getFullYear() * 12 + desde.getMonth()
    const hastaMes = hasta.getFullYear() * 12 + hasta.getMonth()
    // Se arranca en el primer múltiplo del salto que alcanza el rango, en vez
    // de recorrer mes a mes desde el ancla: con un ancla vieja eso serían
    // cientos de vueltas inútiles.
    const saltos = Math.max(0, Math.ceil((desdeMes - anclaMes) / salto))
    for (let mes = anclaMes + saltos * salto; mes <= hastaMes; mes += salto) {
      const fecha = monthlyDue(Math.floor(mes / 12), (mes % 12) + 1, client.dueDay)
      if (fecha >= from && fecha <= to) fechas.push(fecha)
    }
    return fechas
  }

  if (client.cycle === 'weekly') {
    const objetivo = ((Math.round(client.dueDay) % 7) + 7) % 7
    const fechas: string[] = []
    const cursor = new Date(desde)
    // Avanza hasta el primer día de la semana que toca.
    while (cursor.getDay() !== objetivo && cursor <= hasta) cursor.setDate(cursor.getDate() + 1)
    while (cursor <= hasta) {
      fechas.push(iso(cursor))
      cursor.setDate(cursor.getDate() + 7)
    }
    return fechas
  }

  /*
   * QUINCENAL, y SOLO quincenal.
   *
   * La condición es explícita a propósito. Esto era el `else` de la función, y
   * eso convertía cualquier ciclo que no se hubiera resuelto antes en un
   * quincenal: un `custom` sin su número de meses generaba un cobro cada
   * catorce días —veintiséis deudas al año que el cliente no tiene—. Lo que no
   * se reconoce no genera nada.
   */
  if (client.cycle !== 'biweekly') return []

  // Cada 14 días desde el ancla. Sin ancla no hay cómo saber qué quincena es,
  // y adivinar generaría cobros que el usuario no reconoce.
  const ancla = client.startDate ? parse(client.startDate) : null
  if (!ancla) return []
  const fechas: string[] = []
  const cursor = new Date(ancla)
  // Si el ancla es muy vieja, se salta de golpe en vez de iterar día a día.
  if (cursor < desde) {
    const saltos = Math.floor((desde.getTime() - cursor.getTime()) / (14 * DIA))
    cursor.setDate(cursor.getDate() + saltos * 14)
  }
  while (cursor <= hasta) {
    if (iso(cursor) >= from) fechas.push(iso(cursor))
    cursor.setDate(cursor.getDate() + 14)
  }
  return fechas
}

/** La próxima fecha de pago desde hoy, inclusive. `null` si ya no hay más. */
export function nextDueDate(client: Client, today: string): string | null {
  const hoy = parse(today)
  if (!hoy) return null
  // Un año por delante basta: todos los ciclos repiten dentro de ese plazo, y
  // un cobro único más lejano ya no es «el próximo» de nada.
  const fin = new Date(hoy)
  fin.setFullYear(fin.getFullYear() + 1)
  return dueDatesBetween(client, today, iso(fin))[0] ?? null
}

/**
 * Lo que este cliente rinde AL MES, cualquiera que sea su ciclo.
 *
 * Es la cifra con la que se compara contra un coste, y por eso tiene que
 * normalizarse: un cliente que paga 3,000 al año aporta 250 al mes, y sumarle
 * 3,000 al margen mensual lo haría parecer doce veces mejor de lo que es.
 */
export function clientPerMonth(client: Client, base?: CurrencyCode): number {
  const mensual = perMonth({ amount: client.amount, cycle: client.cycle, customMonths: client.customMonths })
  if (!base || !client.currency || client.currency === base) return mensual
  return Math.round(convertCurrency(mensual, client.currency, base) * 100) / 100
}

/**
 * Los servicios de un cliente, con el precio de cada uno.
 *
 * Normaliza las dos formas que conviven: la de siempre —un `serviceId` y el
 * `amount` entero— y la nueva, con varios. Todo lo que pregunta «¿qué me deja
 * este servicio?» pasa por aquí, para que no haya dos respuestas.
 */
export function clientServices(client: Client): Array<{ serviceId: string; amount: number }> {
  const varios = client.serviceShares?.filter(s => s.serviceId && s.amount > 0)
  if (varios?.length) return varios
  return client.serviceId ? [{ serviceId: client.serviceId, amount: client.amount }] : []
}

/** Si este cliente consume ese servicio, de cualquiera de las dos formas. */
export function isOnService(client: Client, serviceId: string): boolean {
  return clientServices(client).some(s => s.serviceId === serviceId)
}

/** Lo que ESTE servicio le cobra al cliente, no lo que paga en total. */
export function clientServiceAmount(client: Client, serviceId: string): number {
  const suyo = clientServices(client).find(s => s.serviceId === serviceId)
  return suyo ? suyo.amount : 0
}

/**
 * Lo que un cliente rinde al mes POR UN SERVICIO concreto.
 *
 * Sin esto, un cliente que te compra Netflix y Disney sumaría su pago entero
 * al margen de los dos, y cada servicio parecería el doble de bueno.
 */
export function clientPerMonthForService(
  client: Client,
  serviceId: string,
  base?: CurrencyCode,
): number {
  const monto = clientServiceAmount(client, serviceId)
  if (monto <= 0) return 0
  const mensual = perMonth({ amount: monto, cycle: client.cycle, customMonths: client.customMonths })
  if (!base || !client.currency || client.currency === base) return mensual
  return Math.round(convertCurrency(mensual, client.currency, base) * 100) / 100
}

/**
 * Lo que se le cobra en total: la suma de sus servicios, o su `amount`.
 *
 * Con varios servicios, `amount` deja de ser la verdad —la verdad es la suma—
 * y quien genera los cobros tiene que usar esto o cobraría de menos.
 */
export function clientTotalAmount(client: Client): number {
  const varios = client.serviceShares?.filter(s => s.serviceId && s.amount > 0)
  if (!varios?.length) return client.amount
  return Math.round(varios.reduce((sum, s) => sum + s.amount, 0) * 100) / 100
}

/**
 * EL PRECIO DE ANTES, si lo han cambiado alguna vez.
 *
 * Devuelve el último precio distinto del actual y cuándo se cambió. Sirve
 * para una sola frase en su ficha —«antes le cobrabas 200, desde marzo
 * 250»—, que es lo que hace ver de un golpe a quién lleva años sin subirle.
 */
export function lastPriceChange(client: Client): { amount: number; at: number } | null {
  const log = client.priceLog
  if (!log?.length) return null
  for (let i = log.length - 1; i >= 0; i -= 1) {
    if (Math.abs(log[i].amount - client.amount) > 0.005) return log[i]
  }
  return null
}

/** Lo que falta por cobrar de un cobro. */
export function outstanding(charge: Charge): number {
  return Math.max(0, Math.round((charge.amount - charge.paid) * 100) / 100)
}

/** En qué estado está un cobro, mirado hoy. */
export function chargeState(charge: Charge, today: string): ChargeState {
  if (charge.waived) return 'waived'
  if (outstanding(charge) <= 0.005) return 'paid'
  if (charge.paid > 0.005) return 'partial'
  if (charge.dueDate < today) return 'late'
  if (charge.dueDate === today) return 'today'
  return 'upcoming'
}

/** Días de atraso. `0` si todavía no le toca. */
export function daysLate(charge: Charge, today: string): number {
  const vence = parse(charge.dueDate)
  const hoy = parse(today)
  if (!vence || !hoy || vence >= hoy) return 0
  return Math.floor((hoy.getTime() - vence.getTime()) / DIA)
}

/** Si el cobro cae dentro de los próximos `days` días (hoy incluido). */
export function dueWithin(charge: Charge, today: string, days: number): boolean {
  const vence = parse(charge.dueDate)
  const hoy = parse(today)
  if (!vence || !hoy) return false
  const dias = (vence.getTime() - hoy.getTime()) / DIA
  return dias >= 0 && dias <= days
}
