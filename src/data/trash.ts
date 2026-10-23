import type { Transaction } from '@/types'

/**
 * PAPELERA DE 30 DÍAS.
 *
 * ── QUÉ HABÍA ─────────────────────────────────────────────────────────
 * Borrar daba cinco segundos de «Deshacer» en un snackbar (`undoDelete.ts`).
 * Eso cubre el arrepentimiento inmediato —el dedo que se fue donde no era— y
 * para eso es lo mejor que hay: instantáneo y sin navegar a ningún sitio.
 *
 * Lo que no cubre es el caso de verdad: darte cuenta MAÑANA de que borraste el
 * movimiento equivocado. Pasados los cinco segundos el dinero se fue, y en una
 * app donde el saldo tiene que cuadrar contra el banco, eso es un agujero que
 * nadie sabe de dónde salió.
 *
 * La papelera va DETRÁS del snackbar, no en su lugar: los cinco segundos se
 * quedan tal cual.
 *
 * ── POR QUÉ NO VIVE EN EL LIBRO ───────────────────────────────────────
 * Esto es estado aparte, con su propia clave de almacenamiento, y no un campo
 * nuevo dentro de `sharky-finance-v2`. Tocar la forma del libro obliga a tocar
 * también el saneado al cargar, la validación de las copias de seguridad y
 * Salud de datos — y ese archivo ya causó corrupción en producción una vez.
 * Un movimiento borrado no tiene por qué poner eso en riesgo.
 *
 * Efecto secundario que además es correcto: la papelera no viaja en las copias
 * de seguridad. Una copia es lo que TIENES, no lo que tiraste.
 */

/** Cuánto sobrevive lo borrado. */
export const TRASH_DAYS = 30

/** Tope de la papelera, por si alguien borra en lote. */
export const TRASH_MAX = 200

export interface TrashedTx {
  /** El movimiento tal cual estaba, con su id, para reinsertarlo idéntico. */
  tx: Transaction
  /** Cuándo se borró, en milisegundos. */
  deletedAt: number
}

/** Días que le quedan antes de irse sola. Nunca negativo. */
export function daysLeft(entry: TrashedTx, now = Date.now()): number {
  const vividos = (now - entry.deletedAt) / 86_400_000
  return Math.max(0, Math.ceil(TRASH_DAYS - vividos))
}

/** Si ya le tocaba desaparecer. */
export function isExpired(entry: TrashedTx, now = Date.now()): boolean {
  return now - entry.deletedAt >= TRASH_DAYS * 86_400_000
}

/**
 * Quita lo caducado y recorta al tope.
 *
 * Se llama al leer y al escribir, no desde un temporizador: un temporizador no
 * corre con la app cerrada, que es justo donde pasan los treinta días. Así el
 * vaciado ocurre la primera vez que se mira, que es cuando importa.
 */
export function pruneTrash(items: TrashedTx[], now = Date.now()): TrashedTx[] {
  return items
    .filter(entry => !isExpired(entry, now))
    .sort((a, b) => b.deletedAt - a.deletedAt)
    .slice(0, TRASH_MAX)
}

/**
 * Mete un movimiento en la papelera.
 *
 * Si ya había una entrada con ese id, se reemplaza: borrar algo, recuperarlo y
 * volver a borrarlo no debe dejar dos copias del mismo movimiento esperando a
 * que lo recuperen dos veces.
 */
export function addToTrash(items: TrashedTx[], tx: Transaction, now = Date.now()): TrashedTx[] {
  const sinDuplicado = items.filter(entry => entry.tx.id !== tx.id)
  return pruneTrash([{ tx, deletedAt: now }, ...sinDuplicado], now)
}

/** Saca un movimiento de la papelera. Devuelve la lista nueva y lo sacado. */
export function takeFromTrash(items: TrashedTx[], id: string): { items: TrashedTx[]; taken: TrashedTx | null } {
  const taken = items.find(entry => entry.tx.id === id) ?? null
  return { items: taken ? items.filter(entry => entry.tx.id !== id) : items, taken }
}

/**
 * Valida lo que viene de disco.
 *
 * La papelera se guarda en `localStorage`, que cualquiera puede editar y que
 * puede traer basura de una versión vieja. Una entrada mal formada se tira:
 * aquí no hay dinero vivo que proteger, solo copias de lo ya borrado, así que
 * descartar es seguro — al revés que en el libro, donde tirar un movimiento
 * sería perder dinero del usuario.
 */
export function sanitizeTrash(value: unknown): TrashedTx[] {
  if (!Array.isArray(value)) return []
  const limpio: TrashedTx[] = []
  for (const bruto of value) {
    if (!bruto || typeof bruto !== 'object') continue
    const entry = bruto as Partial<TrashedTx>
    const tx = entry.tx as Partial<Transaction> | undefined
    if (!tx || typeof tx !== 'object') continue
    if (typeof tx.id !== 'string' || !tx.id) continue
    if (typeof tx.amount !== 'number' || !Number.isFinite(tx.amount)) continue
    if (typeof tx.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(tx.date)) continue
    if (!['income', 'expense', 'transfer'].includes(String(tx.type))) continue
    if (typeof entry.deletedAt !== 'number' || !Number.isFinite(entry.deletedAt)) continue
    limpio.push({ tx: tx as Transaction, deletedAt: entry.deletedAt })
  }
  return pruneTrash(limpio)
}
