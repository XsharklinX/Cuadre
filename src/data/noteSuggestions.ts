import type { Transaction } from '@/types'

/**
 * QUÉ ESCRIBISTE ANTES.
 *
 * La app ya guarda cada concepto en su movimiento, pero no los devolvía: había
 * que volver a teclear "Supermercado Nacional" entero cada semana. Esto lo
 * convierte en una lista de sugerencias.
 *
 * Tres decisiones que definen si esto ayuda o estorba:
 *
 * 1. MANDA LA CATEGORÍA. Lo que escribiste en "Vivienda" casi nunca sirve en
 *    "Restaurantes". Los conceptos de la categoría activa van primero, y los
 *    del resto sólo rellenan si sobra sitio.
 *
 * 2. FRECUENCIA POR ENCIMA DE RECENCIA, pero no sola. Lo que registras cada
 *    mes vale más que lo que registraste ayer una vez; aun así, algo de hace
 *    ocho meses no debería ganarle a lo de esta semana. Se combinan.
 *
 * 3. SIN DUPLICADOS POR MAYÚSCULAS NI ACENTOS. "Altice", "ALTICE" y "altice"
 *    son lo mismo; se muestra la forma que el usuario escribió más veces.
 */

export interface NoteSuggestion {
  /** El texto tal y como conviene mostrarlo. */
  text: string
  /** Veces que aparece en el libro. Para depurar y para ordenar. */
  uses: number
  /** true si viene de la categoría activa. */
  sameCategory: boolean
}

/** Cuántas sugerencias devolver como máximo. Más de esto no se lee: se hojea. */
export const MAX_SUGGESTIONS = 8

/**
 * Peso de la recencia frente a la frecuencia.
 *
 * Con 0.5, un concepto usado hoy vale lo mismo que uno usado dos veces hace
 * mucho. Sube demasiado y la lista cambia cada día; bájalo y se queda anclada
 * en lo de hace un año.
 */
const RECENCY_WEIGHT = 0.5

/** Días tras los que la recencia deja de aportar nada. */
const RECENCY_WINDOW_DAYS = 90

/** Quita acentos y mayúsculas para comparar, no para mostrar. */
export function normalizeNote(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase()
}

interface Bucket {
  variants: Map<string, number>
  uses: number
  lastDate: string
  sameCategory: boolean
}

export interface SuggestionInput {
  transactions: Transaction[]
  /** Categoría activa en el formulario; `undefined` = no hay ninguna elegida. */
  categoryId?: string
  /** Lo que el usuario lleva tecleado. Vacío = se ofrecen las más usadas. */
  query?: string
  /** Hoy, en YYYY-MM-DD. Se pasa para poder probarlo. */
  today: string
  limit?: number
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso), to = Date.parse(toIso)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return RECENCY_WINDOW_DAYS
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

export function noteSuggestions(input: SuggestionInput): NoteSuggestion[] {
  const { transactions, categoryId, today, limit = MAX_SUGGESTIONS } = input
  const query = normalizeNote(input.query ?? '')

  const buckets = new Map<string, Bucket>()

  for (const tx of transactions) {
    // Las transferencias no llevan concepto propio del usuario: su nota la
    // pone la app ("Transferencia", "Pago tarjeta"). Ofrecerlas como
    // sugerencia seria devolverle al usuario texto que el nunca escribio.
    if (tx.type === 'transfer') continue
    const raw = tx.note?.trim()
    if (!raw) continue

    const key = normalizeNote(raw)
    if (!key) continue
    // Se filtra por lo tecleado, no se ordena por ello: quien escribe "sup"
    // quiere ver "Supermercado", no todo el libro.
    if (query && !key.includes(query)) continue

    const bucket = buckets.get(key) ?? {
      variants: new Map<string, number>(),
      uses: 0,
      lastDate: tx.date,
      sameCategory: false,
    }
    bucket.uses += 1
    bucket.variants.set(raw, (bucket.variants.get(raw) ?? 0) + 1)
    if (tx.date > bucket.lastDate) bucket.lastDate = tx.date
    if (categoryId && tx.categoryId === categoryId) bucket.sameCategory = true
    buckets.set(key, bucket)
  }

  const scored = [...buckets.values()].map(bucket => {
    const age = daysBetween(bucket.lastDate, today)
    const recency = Math.max(0, 1 - age / RECENCY_WINDOW_DAYS)
    return {
      text: mostUsedVariant(bucket.variants),
      uses: bucket.uses,
      sameCategory: bucket.sameCategory,
      score: bucket.uses + recency * RECENCY_WEIGHT,
    }
  })

  scored.sort((a, b) => {
    // La categoria activa gana SIEMPRE, por muy usado que sea lo de fuera.
    if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1
    if (b.score !== a.score) return b.score - a.score
    // Empate: alfabetico, para que la lista no baile entre renders.
    return a.text.localeCompare(b.text)
  })

  return scored.slice(0, limit).map(({ text, uses, sameCategory }) => ({ text, uses, sameCategory }))
}

/** De "Altice"/"ALTICE"/"altice", la forma que el usuario escribió más veces. */
function mostUsedVariant(variants: Map<string, number>): string {
  let best = ''
  let bestCount = -1
  for (const [variant, count] of variants) {
    if (count > bestCount || (count === bestCount && variant.localeCompare(best) < 0)) {
      best = variant
      bestCount = count
    }
  }
  return best
}
