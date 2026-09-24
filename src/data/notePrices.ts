import { normalizeNote } from './noteSuggestions'
import type { Note } from './notes'

/**
 * MEMORIA DE PRECIOS.
 *
 * La app ya recordaba lo que escribes en el concepto de un gasto. Esto hace lo
 * mismo con lo que CUESTAN las cosas: escribes «pollo» en una lista de compras
 * y te dice a cómo lo pagaste la última vez.
 *
 * Por qué importa aquí y no en cualquier app: en República Dominicana los
 * precios del súper se mueven de semana en semana, y la pregunta real antes de
 * salir de casa no es «¿qué llevo?» sino «¿me alcanza?». Una lista que estima
 * su total con precios del mes pasado responde a eso; una que te obliga a
 * teclear cada precio de memoria, no — porque nadie los teclea.
 *
 * Sale de las listas anteriores del propio usuario, incluidas las archivadas:
 * el historial de compras ya estaba ahí, solo que nadie lo leía.
 */

export interface PriceMemory {
  /** Precio unitario de la última vez. */
  price: number
  /** Cuándo fue, para poder avisar de que el dato ya tiene polvo. */
  at: number
  /** Cuántas veces se ha comprado. Más veces = más confianza. */
  seen: number
}

/**
 * A partir de cuántos días se considera que el precio ya no es de fiar.
 *
 * Dos meses. Menos sería descartar datos buenos —el arroz no cambia cada
 * semana—; más sería sugerir con aplomo un precio de otra temporada, que es
 * peor que no sugerir nada: un total estimado que miente hace que la persona
 * salga de casa con el dinero justo y vuelva sin la mitad de la compra.
 */
export const STALE_DAYS = 60

/**
 * Índice de precios a partir de todas las listas.
 *
 * Solo cuentan los ítems MARCADOS: un ítem sin marcar es un precio que se
 * anotó, no uno que se pagó. Confundirlos convertiría una estimación
 * optimista de hace tres meses en «lo que costó».
 */
export function buildPriceMemory(notes: Note[]): Map<string, PriceMemory> {
  const index = new Map<string, PriceMemory>()

  for (const note of notes) {
    for (const item of note.items) {
      if (!item.done || item.price == null || item.price <= 0) continue
      const key = normalizeNote(item.text)
      if (!key) continue

      const previous = index.get(key)
      // `updatedAt` de la lista es lo más cercano a «cuándo se compró» que hay:
      // los ítems no guardan su propia fecha.
      const at = note.updatedAt
      if (!previous) {
        index.set(key, { price: item.price, at, seen: 1 })
      } else {
        index.set(key, {
          // Gana el MÁS RECIENTE, no el más repetido: en un precio, lo último
          // que pagaste es siempre mejor información que lo que pagaste más veces.
          price: at >= previous.at ? item.price : previous.price,
          at: Math.max(at, previous.at),
          seen: previous.seen + 1,
        })
      }
    }
  }

  return index
}

export interface PriceSuggestion extends PriceMemory {
  /** El dato ya tiene más de `STALE_DAYS`: se ofrece, pero avisando. */
  stale: boolean
}

/** Lo que costó la última vez, si consta. */
export function suggestPrice(
  index: Map<string, PriceMemory>,
  text: string,
  now = Date.now(),
): PriceSuggestion | null {
  const memory = index.get(normalizeNote(text))
  if (!memory) return null
  return { ...memory, stale: now - memory.at > STALE_DAYS * 86_400_000 }
}

/**
 * Cuánto de la lista se puede estimar sola.
 *
 * Sirve para decidir si merece la pena ofrecer «rellenar precios»: con dos
 * ítems conocidos de veinte, el botón promete algo que no puede cumplir.
 */
export function fillableCount(index: Map<string, PriceMemory>, note: Note): number {
  return note.items.filter(item => item.price == null && index.has(normalizeNote(item.text))).length
}
