/**
 * HISTORIAL DE RECÁLCULOS — qué tocó la app, cuándo, y cómo deshacerlo.
 *
 * «Recalcular saldos» reescribe el saldo de todas las cuentas de golpe. Es
 * seguro en el sentido de que no borra movimientos, pero el usuario pulsa un
 * botón, ve unos números cambiar, y a partir de ahí no tiene forma de saber
 * qué cambió ni de volver atrás. Pedirle que confíe no es lo mismo que darle
 * con qué comprobar.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ NO BASTA CON LOS PUNTOS DE RECUPERACIÓN
 *
 * Ya existía `recovery.ts`, que guarda copias completas del libro. Sirve para
 * un desastre, no para esto: restaurar una copia entera para deshacer un
 * recálculo revierte TAMBIÉN los movimientos que el usuario anotó después.
 * Un deshacer que se lleva por delante trabajo ajeno no se usa.
 *
 * Aquí se guarda solo lo que el recálculo cambió —los saldos, cuenta por
 * cuenta, antes y después— así que deshacer devuelve exactamente eso y nada
 * más.
 */

/** Un saldo que cambió: lo justo para poder devolverlo. */
export interface RecalcMove {
  accountId: string
  /** El nombre de entonces: la cuenta puede renombrarse o borrarse después. */
  name: string
  before: number
  after: number
  /** El segundo libro de una tarjeta, si lo tiene. */
  beforeSecondary?: number
  afterSecondary?: number
}

export interface RecalcEntry {
  id: string
  /** ISO. */
  at: string
  /** 'all' = el botón de recalcular todo; 'account' = una sola cuenta. */
  scope: 'all' | 'account'
  moves: RecalcMove[]
  /** true cuando ya se deshizo: se deja a la vista, no se borra. */
  undone?: boolean
}

const KEY = 'cuadre-recalc-history-v1'

/**
 * Cuántos se guardan.
 *
 * El historial es para responder «¿qué pasó hace un momento?», no para ser un
 * archivo contable. Sin tope, cada recálculo deja una entrada con un saldo por
 * cuenta y el almacenamiento del WebView —que es donde vive TODO el libro— se
 * llena con lo menos importante que hay en él.
 */
const MAX = 20

export function listRecalcs(): RecalcEntry[] {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '[]') as RecalcEntry[]
    return Array.isArray(value) ? value.filter(isEntry).slice(0, MAX) : []
  } catch {
    return []
  }
}

/**
 * Apunta un recálculo. Devuelve la entrada, o null si no cambió nada.
 *
 * Un recálculo que no movió ningún saldo NO se apunta: es el caso normal —el
 * usuario comprueba y todo cuadra— y llenar el historial de «no pasó nada»
 * esconde las tres veces que sí pasó algo.
 */
export function recordRecalc(scope: RecalcEntry['scope'], moves: RecalcMove[]): RecalcEntry | null {
  const reales = moves.filter(moved)
  if (reales.length === 0) return null

  const entry: RecalcEntry = {
    id: `recalc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    scope,
    moves: reales,
  }
  write([entry, ...listRecalcs()].slice(0, MAX))
  return entry
}

/** ¿Este saldo cambió de verdad? Por debajo del céntimo, no. */
export function moved(m: RecalcMove): boolean {
  return Math.abs(m.after - m.before) > 0.005
    || Math.abs((m.afterSecondary ?? 0) - (m.beforeSecondary ?? 0)) > 0.005
}

/**
 * Marca una entrada como deshecha y devuelve los saldos a restaurar.
 *
 * No la borra: el historial tiene que poder contar también que se deshizo. Un
 * registro que se edita a sí mismo para que parezca que no pasó nada no es un
 * registro.
 */
export function undoRecalc(id: string): RecalcMove[] {
  const entries = listRecalcs()
  const entry = entries.find(e => e.id === id)
  if (!entry || entry.undone) return []
  write(entries.map(e => e.id === id ? { ...e, undone: true } : e))
  return entry.moves
}

/** Vacía el historial. Los saldos no se tocan: esto es solo el registro. */
export function clearRecalcs(): void {
  try { localStorage.removeItem(KEY) } catch { /* sin almacenamiento, nada que limpiar */ }
}

/** Cuánto movió un recálculo en total, para resumirlo en una línea. */
export function totalMoved(entry: RecalcEntry): number {
  return entry.moves.reduce((sum, m) => sum + (m.after - m.before), 0)
}

function write(entries: RecalcEntry[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(entries)) } catch { /* cuota llena: el historial es lo prescindible */ }
}

/*
 * Lo que se lee del almacenamiento puede ser de una versión anterior, estar a
 * medias o estar corrupto. Una entrada sin `moves` reventaría al pintarla, y
 * peor: al deshacerla escribiría `undefined` en un saldo.
 */
function isEntry(value: unknown): value is RecalcEntry {
  if (!value || typeof value !== 'object') return false
  const e = value as Partial<RecalcEntry>
  return typeof e.id === 'string'
    && typeof e.at === 'string'
    && (e.scope === 'all' || e.scope === 'account')
    && Array.isArray(e.moves)
    && e.moves.every(m =>
      !!m && typeof m.accountId === 'string'
      && typeof m.before === 'number' && Number.isFinite(m.before)
      && typeof m.after === 'number' && Number.isFinite(m.after))
}
