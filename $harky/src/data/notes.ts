import type { CurrencyCode, IconName } from '@/types'

/**
 * Modelo puro de "Listas" — el objeto es uno solo con tres modos:
 *  - `note`: texto libre (una idea, un recordatorio).
 *  - `checklist`: ítems marcables (un TO-DO), sin precio.
 *  - `shopping`: ítems con precio/cantidad opcionales → total estimado en vivo.
 *
 * Toda la lógica de totales vive aquí, pura y testeable, igual que los cálculos
 * financieros. El store (`store/notes.ts`) solo guarda y muta; la UI solo pinta.
 */

export type NoteType = 'note' | 'checklist' | 'shopping'

export interface NoteItem {
  id: string
  text: string
  done: boolean
  /** Precio unitario. Opcional: una checklist no lo usa. */
  price?: number
  /** Cantidad (default 1 si hay precio). */
  qty?: number
  /** Marcado como imprescindible — para saber qué comprar primero si no alcanza. */
  important?: boolean
}

export interface Note {
  id: string
  title: string
  type: NoteType
  /** Texto libre, solo para `type: 'note'`. */
  body?: string
  items: NoteItem[]
  color: string
  icon: IconName
  /** Meta de ahorro enlazada (una lista con precios es una meta de compra). */
  goalId?: string
  /** Categoría para el aviso de presupuesto y para "registrar gasto". */
  categoryId?: string
  /** Cuenta sugerida al registrar el gasto. */
  accountId?: string
  archived?: boolean
  /** Fijada arriba de la lista, por encima del orden por fecha. */
  pinned?: boolean
  createdAt: number
  updatedAt: number
}

export interface NoteTotals {
  /** Suma de todos los ítems con precio (precio × cantidad). */
  total: number
  /** Suma de los ítems marcados como comprados. */
  bought: number
  /** total − bought. */
  remaining: number
  /** Cuántos ítems están marcados. */
  boughtCount: number
  /** Total de ítems. */
  totalCount: number
  /** Cuántos ítems tienen precio (para saber si mostrar montos). */
  pricedCount: number
}

/** Precio de una línea: precio unitario × cantidad (cantidad mínima 1). */
export function itemLineTotal(item: NoteItem): number {
  if (item.price == null) return 0
  const qty = item.qty && item.qty > 0 ? item.qty : 1
  return item.price * qty
}

/** Calcula los totales de una lista. Ignora precios en notas de texto libre. */
export function noteTotals(note: Note): NoteTotals {
  let total = 0
  let bought = 0
  let boughtCount = 0
  let pricedCount = 0
  for (const item of note.items) {
    const line = itemLineTotal(item)
    if (item.price != null) pricedCount++
    total += line
    if (item.done) {
      bought += line
      boughtCount++
    }
  }
  return {
    total,
    bought,
    remaining: total - bought,
    boughtCount,
    totalCount: note.items.length,
    pricedCount,
  }
}

/**
 * Orden de visualización de los ítems: los comprados se van al fondo, y entre
 * los pendientes los imprescindibles suben — así ves de un vistazo qué falta y
 * qué comprar primero si no alcanza. Estable (no reordena empates).
 */
export function orderedItems(items: NoteItem[]): NoteItem[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      if (a.item.done !== b.item.done) return a.item.done ? 1 : -1
      if (!a.item.done && !!a.item.important !== !!b.item.important) return a.item.important ? -1 : 1
      return a.index - b.index
    })
    .map(entry => entry.item)
}

/** Progreso 0–1: por dinero si hay precios, si no por conteo de ítems marcados. */
export function noteProgress(note: Note): number {
  const t = noteTotals(note)
  if (t.pricedCount > 0 && t.total > 0) return Math.min(1, t.bought / t.total)
  if (t.totalCount > 0) return t.boughtCount / t.totalCount
  return 0
}

/**
 * Texto para compartir (WhatsApp, notas…). `withPrices` decide si van los
 * montos o solo los nombres. `formatMoney` inyecta el formateo de la app para
 * respetar la moneda del usuario.
 */
export function noteShareText(
  note: Note,
  formatMoney: (amount: number) => string,
  options: { withPrices?: boolean; brand?: boolean } = {},
): string {
  const withPrices = options.withPrices ?? true
  const lines: string[] = []
  const heading = note.type === 'shopping' ? `🛒 ${note.title}` : note.title
  lines.push(heading)

  if (note.type === 'note') {
    if (note.body?.trim()) lines.push(note.body.trim())
  } else {
    for (const item of note.items) {
      const check = item.done ? '☑' : '▢'
      const qty = item.qty && item.qty > 1 ? ` ×${item.qty}` : ''
      const price = withPrices && item.price != null ? ` — ${formatMoney(itemLineTotal(item))}` : ''
      lines.push(`${check} ${item.text}${qty}${price}`)
    }
    if (withPrices) {
      const totals = noteTotals(note)
      if (totals.pricedCount > 0) lines.push(`\nTotal estimado: ${formatMoney(totals.total)}`)
    }
  }

  if (options.brand ?? true) lines.push('\nHecho con $harky')
  return lines.join('\n')
}

/** Formatea la línea de un ítem para la UI: "×3 · RD$540". */
export function itemPriceLabel(item: NoteItem, formatMoney: (n: number) => string): string | null {
  if (item.price == null) return null
  const qty = item.qty && item.qty > 1 ? `×${item.qty} · ` : ''
  return `${qty}${formatMoney(itemLineTotal(item))}`
}

/** Ícono por defecto según el tipo de lista. */
export function defaultIconFor(type: NoteType): IconName {
  return type === 'shopping' ? 'cart' : type === 'checklist' ? 'grid' : 'edit'
}

// Reexporta el tipo de moneda para quien consuma este módulo sin importar types.
export type { CurrencyCode }
