/**
 * «Rápidos»: los movimientos que más repites, sacados de tu propio historial,
 * para anotarlos de un toque. Reemplaza al campo de texto libre que intentaba
 * adivinar frases — aquí no se interpreta nada, solo se reutiliza lo ya hecho.
 * Puro y testeable.
 */
import type { Transaction } from '@/types'

export interface QuickAdd {
  /** Identidad estable (nota normalizada + categoría + cuenta + tipo). */
  key: string
  /** Nota tal cual se escribió la última vez — es la que se rellena. */
  note: string
  type: 'expense' | 'income'
  categoryId?: string
  accountId?: string
  /**
   * Monto a rellenar, o null si el gasto varía demasiado (ej. el súper). Se
   * deja vacío a propósito: un importe inventado se guarda por error con
   * demasiada facilidad, y corregirlo cuesta más que teclearlo.
   */
  amount: number | null
  /** Veces que se repitió — ordena la lista. */
  uses: number
}

/** Mínimo de repeticiones para considerarlo un hábito y no una casualidad. */
const MIN_USES = 3
/** Variación relativa por debajo de la cual el monto se considera estable. */
const STABLE_VARIATION = 0.08

function normalizeNote(note: string): string {
  return note
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[0-9#*_.:/-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Monto representativo, o null si la serie varía demasiado para adivinarlo. */
function stableAmount(amounts: number[]): number | null {
  if (amounts.length === 0) return null
  const first = amounts[0]
  if (amounts.every(a => a === first)) return first

  const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length
  if (mean <= 0) return null
  const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length
  const variation = Math.sqrt(variance) / mean
  return variation <= STABLE_VARIATION ? Math.round(median(amounts)) : null
}

export function deriveQuickAdds(transactions: Transaction[], limit = 8): QuickAdd[] {
  const groups = new Map<string, { rows: Transaction[]; note: string }>()

  for (const tx of transactions) {
    // Las transferencias no se "repiten" como hábito de gasto y necesitan dos
    // cuentas: quedan fuera.
    if (tx.type === 'transfer') continue
    const note = tx.note?.trim()
    if (!note) continue
    const key = `${tx.type}|${normalizeNote(note)}|${tx.categoryId ?? ''}|${tx.accountId ?? ''}`
    const entry = groups.get(key)
    if (entry) entry.rows.push(tx)
    else groups.set(key, { rows: [tx], note })
  }

  return [...groups.entries()]
    .filter(([, g]) => g.rows.length >= MIN_USES)
    .map(([key, g]) => {
      // La nota que se rellena es la de la vez más reciente (respeta cómo la
      // escribe el usuario hoy, no como la escribía hace un año).
      const latest = [...g.rows].sort((a, b) => b.date.localeCompare(a.date))[0]
      return {
        key,
        note: latest.note,
        type: latest.type as 'expense' | 'income',
        categoryId: latest.categoryId,
        accountId: latest.accountId,
        amount: stableAmount(g.rows.map(r => r.amount)),
        uses: g.rows.length,
      }
    })
    .sort((a, b) => b.uses - a.uses)
    .slice(0, limit)
}


/**
 * EL ÚLTIMO MOVIMIENTO, PARA REPETIRLO DE UN TOQUE.
 *
 * `deriveQuickAdds` pide tres repeticiones antes de ofrecer nada, y con razón:
 * dos veces seguidas puede ser casualidad y no un hábito. Pero eso deja sin
 * atajos justo el arranque — las dos primeras veces que anotas el café son
 * manuales enteras, que es cuando el usuario decide si la app le compensa.
 *
 * Esto no adivina ningún hábito: ofrece repetir lo que acabas de hacer, que es
 * una afirmación que no puede estar equivocada.
 *
 * AQUÍ SÍ VIAJA EL MONTO, al revés que en los rápidos derivados. Allí se deja
 * vacío porque un importe promediado es un importe inventado; aquí es
 * exactamente el de la última vez, y repetirlo tal cual es justo lo que
 * promete el botón.
 */
export function lastMovementQuickAdd(
  transactions: Transaction[],
  type: 'expense' | 'income',
): QuickAdd | null {
  let ultimo: Transaction | null = null
  for (const tx of transactions) {
    // Las transferencias necesitan dos cuentas y no caben en un atajo.
    if (tx.type !== type) continue
    if (!tx.note?.trim()) continue
    if (!ultimo || tx.date > ultimo.date) ultimo = tx
  }
  if (!ultimo) return null

  return {
    // La misma identidad que usan los rápidos derivados, para poder
    // reconocer si este movimiento YA esta en la lista y no duplicarlo.
    key: `${ultimo.type}|${normalizeNote(ultimo.note)}|${ultimo.categoryId ?? ''}|${ultimo.accountId ?? ''}`,
    note: ultimo.note.trim(),
    type,
    categoryId: ultimo.categoryId,
    accountId: ultimo.accountId,
    amount: ultimo.amount,
    uses: 1,
  }
}
