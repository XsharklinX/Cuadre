import { clientServices, type Charge, type Client } from './clients'

/**
 * DOS FICHAS, UNA PERSONA.
 *
 * ── DE DÓNDE SALEN LOS DUPLICADOS ─────────────────────────────────────
 * Hasta la 2.1.0 un cliente solo podía tener UN servicio. Quien te compraba
 * Netflix y Crunchyroll había que apuntarlo dos veces, y su historial quedó
 * repartido entre dos fichas que no se hablan: una dice que lleva un año
 * pagando puntual y la otra que es nuevo.
 *
 * ── POR QUÉ NO SE FUSIONA SOLO ────────────────────────────────────────
 * Dos hermanos pueden llamarse igual. Dos clientes pueden llamarse «Mamá».
 * Una app que junta dos personas por su cuenta destruye datos sin preguntar,
 * y lo hace justo con los clientes que más historial tienen —los que llevan
 * más tiempo—. Así que esto detecta y propone; unir lo decide el usuario,
 * viendo antes cómo queda la ficha resultante.
 */

/** Un nombre comparable: sin tildes, sin mayúsculas, sin espacios de más. */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Un teléfono comparable: solo sus dígitos, y los últimos ocho. */
export function normalizePhone(phone: string | undefined): string {
  const digitos = (phone ?? '').replace(/\D/g, '')
  // Los últimos ocho, para que «809-555-1234» y «+1 809 555 1234» casen: el
  // prefijo del país se escribe o no según el día.
  return digitos.length >= 7 ? digitos.slice(-8) : ''
}

export interface DuplicateGroup {
  /** Por qué se parecen, para poder decírselo al usuario. */
  reason: 'name' | 'phone'
  /** El texto que comparten, ya normalizado. */
  key: string
  clients: Client[]
}

/**
 * Los grupos de clientes que parecen la misma persona.
 *
 * Por nombre normalizado y por teléfono. El teléfono es la señal fuerte —dos
 * personas no comparten número— y el nombre la débil, pero es la que pilla
 * los duplicados de verdad, porque son el mismo nombre escrito dos veces.
 *
 * Un cliente solo sale en UN grupo: si coincide por las dos cosas, manda el
 * teléfono. Verlo repetido en dos avisos haría pensar que hay cuatro fichas.
 */
export function findDuplicates(clients: Client[]): DuplicateGroup[] {
  const grupos: DuplicateGroup[] = []
  const yaAgrupados = new Set<string>()

  const porTelefono = new Map<string, Client[]>()
  for (const c of clients) {
    const tel = normalizePhone(c.phone)
    if (!tel) continue
    if (!porTelefono.has(tel)) porTelefono.set(tel, [])
    porTelefono.get(tel)!.push(c)
  }
  for (const [key, lista] of porTelefono) {
    if (lista.length < 2) continue
    grupos.push({ reason: 'phone', key, clients: lista })
    for (const c of lista) yaAgrupados.add(c.id)
  }

  const porNombre = new Map<string, Client[]>()
  for (const c of clients) {
    if (yaAgrupados.has(c.id)) continue
    const nombre = normalizeName(c.name)
    if (!nombre) continue
    if (!porNombre.has(nombre)) porNombre.set(nombre, [])
    porNombre.get(nombre)!.push(c)
  }
  for (const [key, lista] of porNombre) {
    if (lista.length < 2) continue
    grupos.push({ reason: 'name', key, clients: lista })
  }

  // Los grupos más grandes primero: son los que más historial están partiendo.
  return grupos.sort((a, b) => b.clients.length - a.clients.length)
}

/** Si un nombre ya existe, mientras se escribe uno nuevo. */
export function nameAlreadyUsed(name: string, clients: Client[], exceptId?: string): Client | null {
  const buscado = normalizeName(name)
  if (buscado.length < 3) return null
  return clients.find(c => c.id !== exceptId && normalizeName(c.name) === buscado) ?? null
}

export interface MergePlan {
  /** El que se queda, con todo dentro. */
  survivor: Client
  /** Los que se absorben y desaparecen. */
  absorbed: Client[]
  /** Cómo queda el cliente después de unir. */
  result: Client
  /** Cuántos cobros cambian de dueño. */
  movedCharges: number
  /** Lo que se le cobrará al mes después de unir. */
  totalAmount: number
  /** Los servicios que tendrá, ya sin repetidos. */
  services: Array<{ serviceId: string; amount: number }>
}

/**
 * CÓMO QUEDA LA FICHA DESPUÉS DE UNIR, antes de unir.
 *
 * Es pura y no toca nada: la pantalla la usa para enseñar el resultado, y el
 * store la usa para aplicarlo. Las dos cosas salen de la misma función
 * porque, si no, lo que se enseña y lo que pasa acabarían siendo distintos.
 *
 * ── QUÉ SE QUEDA DE CADA UNO ──────────────────────────────────────────
 * Lo que el superviviente ya tenga manda; de los absorbidos se toma lo que
 * él no tenga. Un teléfono vacío se rellena con el del otro, una nota se
 * añade en vez de pisarse, y la fecha de alta es la MÁS ANTIGUA de todas:
 * es cliente tuyo desde que lo fue por primera vez, no desde la segunda ficha.
 */
export function mergePlan(survivor: Client, absorbed: Client[], charges: Charge[]): MergePlan {
  const todos = [survivor, ...absorbed]

  // Los servicios de todos, sin repetir. Si el mismo servicio aparece en dos
  // fichas con precios distintos, manda el del superviviente: es el que el
  // usuario está mirando cuando decide.
  const porServicio = new Map<string, number>()
  for (const c of [...absorbed, survivor]) {
    for (const s of clientServices(c)) porServicio.set(s.serviceId, s.amount)
  }
  const services = [...porServicio.entries()].map(([serviceId, amount]) => ({ serviceId, amount }))
  const totalAmount = Math.round(services.reduce((sum, s) => sum + s.amount, 0) * 100) / 100

  const notas = todos.map(c => c.notes?.trim()).filter(Boolean)
  const movedCharges = charges.filter(c => absorbed.some(a => a.id === c.clientId)).length

  const result: Client = {
    ...survivor,
    // Cliente tuyo desde que lo fue por primera vez.
    createdAt: Math.min(...todos.map(c => c.createdAt || Date.now())),
    phone: survivor.phone?.trim() || absorbed.find(c => c.phone?.trim())?.phone,
    notes: notas.length ? notas.join(' · ').slice(0, 500) : undefined,
    // Con dos o más servicios se guarda el reparto; con uno se deja como
    // estaba, para no convertir una ficha sencilla en una complicada.
    serviceId: services.length === 1 ? services[0].serviceId : undefined,
    serviceShares: services.length > 1 ? services : undefined,
    amount: services.length ? totalAmount : survivor.amount,
    // El historial de precios de todos, en orden.
    priceLog: [...todos.flatMap(c => c.priceLog ?? [])]
      .sort((a, b) => a.at - b.at)
      .slice(-12),
    // Si alguno estaba activo, el resultado lo está: unir no debe apagar a un
    // cliente que te sigue pagando.
    active: todos.some(c => c.active),
  }

  return {
    survivor,
    absorbed,
    result,
    movedCharges,
    totalAmount: services.length ? totalAmount : survivor.amount,
    services,
  }
}

/**
 * Cuál conviene que sobreviva: el que más historial tiene.
 *
 * Por cobros cerrados, y a igualdad, el más antiguo. Da igual para los datos
 * —se conserva todo— pero no para el id: los movimientos del libro no apuntan
 * a clientes, pero los cobros sí, y mover menos cobros es menos que pueda
 * salir mal.
 */
export function suggestSurvivor(clients: Client[], charges: Charge[]): Client {
  const puntos = (c: Client) => charges.filter(ch => ch.clientId === c.id && ch.paidAt > 0).length
  return [...clients].sort((a, b) => {
    const d = puntos(b) - puntos(a)
    return d !== 0 ? d : (a.createdAt || 0) - (b.createdAt || 0)
  })[0]
}
