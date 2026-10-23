import type { Transaction } from '@/types'

/**
 * CONTAR EL FALLO EN EL MOMENTO EN QUE OCURRE.
 *
 * ── QUÉ PASABA ────────────────────────────────────────────────────────
 * Cuando guardar fallaba —saldo insuficiente, una cuenta que ya no existe,
 * cualquier cosa— el error salía en un toast de tres segundos y se iba. Si en
 * ese momento estabas mirando a otro lado, o el teléfono se bloqueó, o
 * simplemente no te dio tiempo a leer: el movimiento no se guardó y no quedaba
 * ni rastro de que lo habías intentado.
 *
 * En una app de dinero eso es el peor fallo posible, porque es SILENCIOSO. El
 * agujero se descubre semanas después, cuadrando contra el banco, y entonces
 * ya no hay forma de saber qué faltaba.
 *
 * ── QUÉ CAMBIA ────────────────────────────────────────────────────────
 * Un fallo al guardar deja constancia: qué se intentaba, cuándo y por qué no
 * se pudo. Se queda puesto hasta que se lee, y lleva el intento guardado para
 * poder reintentarlo de un toque.
 *
 * El toast se queda igual: avisa al instante, que para eso está. Esto es la
 * red por debajo, para cuando el toast no se ve.
 *
 * ── QUÉ *NO* ENTRA AQUÍ ───────────────────────────────────────────────
 * Solo lo que perdió datos del usuario. Un error al exportar un PDF, una
 * descarga de tasas que falló, un permiso denegado: eso no se apunta. Si se
 * apuntara todo, la lista se volvería ruido y nadie la miraría — que es
 * exactamente el problema que esto viene a resolver.
 */

export interface Incident {
  id: string
  /** Cuándo ocurrió, en ms. */
  at: number
  /** Lo que la app no pudo hacer. */
  kind: 'save-tx'
  /** El mensaje de error, tal cual, sin adornar. */
  message: string
  /**
   * El intento, guardado entero para poder repetirlo.
   *
   * Sin esto «Reintentar» tendría que pedirle al usuario que volviera a
   * teclearlo todo, que es justo el trabajo que acaba de perder.
   */
  payload: Transaction
}

/** Cuántos fallos se guardan. Más allá de esto ya no es una lista, es un log. */
export const MAX_INCIDENTS = 20

export function newIncident(kind: Incident['kind'], message: string, payload: Transaction, now = Date.now()): Incident {
  return {
    // El id incluye el instante y una cola aleatoria: dos fallos en el mismo
    // milisegundo (un guardado en lote) no deben pisarse.
    id: `inc_${now}_${Math.random().toString(36).slice(2, 8)}`,
    at: now,
    kind,
    message,
    payload,
  }
}

/** Añade un fallo, con el más reciente primero, y recorta al tope. */
export function addIncident(items: Incident[], incident: Incident): Incident[] {
  return [incident, ...items].slice(0, MAX_INCIDENTS)
}

/**
 * Valida lo que viene de disco.
 *
 * Descartar aquí es seguro: estos son intentos FALLIDOS, no dinero vivo. Una
 * entrada corrupta se tira sin pensarlo — al revés que en el libro, donde
 * tirar un movimiento sería perderle dinero a alguien.
 */
export function sanitizeIncidents(value: unknown): Incident[] {
  if (!Array.isArray(value)) return []
  const limpio: Incident[] = []
  for (const bruto of value) {
    if (!bruto || typeof bruto !== 'object') continue
    const item = bruto as Partial<Incident>
    if (typeof item.id !== 'string' || !item.id) continue
    if (typeof item.at !== 'number' || !Number.isFinite(item.at)) continue
    if (item.kind !== 'save-tx') continue
    if (typeof item.message !== 'string') continue
    const payload = item.payload as Partial<Transaction> | undefined
    if (!payload || typeof payload !== 'object') continue
    if (typeof payload.amount !== 'number' || !Number.isFinite(payload.amount)) continue
    if (typeof payload.date !== 'string') continue
    limpio.push({
      id: item.id,
      at: item.at,
      kind: 'save-tx',
      message: item.message,
      payload: payload as Transaction,
    })
  }
  return limpio.sort((a, b) => b.at - a.at).slice(0, MAX_INCIDENTS)
}
