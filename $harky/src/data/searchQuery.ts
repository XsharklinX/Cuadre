/**
 * Convierte una consulta en lenguaje natural ("comida en mayo", "más de
 * $1000") en filtros estructurados para aplicar sobre transacciones. Puro y
 * testeable — la búsqueda global solo llama a `parseSearchQuery` y aplica
 * los filtros resultantes; el texto que sobra sigue matcheando como antes
 * (substring plano sobre nota/categoría/cuenta), así que una consulta que no
 * dispara ningún filtro estructurado se comporta exactamente igual que hoy.
 */
import type { Category } from '@/types'

function clean(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Normaliza texto (sin tildes, minúsculas) para comparar contra `freeText`. */
export const normalizeSearchText = clean

const MONTH_NAMES: Record<string, number> = (() => {
  const map: Record<string, number> = {}
  const locales = ['es-DO', 'en-US']
  const formats: Intl.DateTimeFormatOptions[] = [{ month: 'long' }, { month: 'short' }]
  for (const locale of locales) {
    for (const format of formats) {
      for (let m = 0; m < 12; m++) {
        const name = clean(new Date(2000, m, 1).toLocaleDateString(locale, format)).replace(/\.$/, '')
        map[name] = m + 1
      }
    }
  }
  return map
})()

const AMOUNT_GT_WORDS = ['mas de', 'superior a', 'arriba de', 'more than', 'above', 'over']
const AMOUNT_LT_WORDS = ['menos de', 'inferior a', 'debajo de', 'less than', 'under', 'below']

/** Sinónimos coloquiales → id de categoría semilla (ver CATEGORY_NAME_MAP en i18n). */
const CATEGORY_SYNONYMS: Record<string, string[]> = {
  cat_renta:   ['renta', 'alquiler', 'vivienda', 'housing', 'rent'],
  cat_super:   ['comida', 'super', 'supermercado', 'groceries', 'mercado', 'food'],
  cat_rest:    ['comida', 'restaurante', 'restaurantes', 'comer fuera', 'restaurant', 'dining', 'food'],
  cat_trans:   ['transporte', 'transport', 'gasolina', 'combustible', 'uber', 'taxi', 'gas'],
  cat_serv:    ['servicios', 'services', 'luz', 'agua', 'internet', 'utilities'],
  cat_ocio:    ['entretenimiento', 'entertainment', 'ocio', 'diversion', 'streaming'],
  cat_salud:   ['salud', 'health', 'medico', 'farmacia', 'doctor'],
  cat_compras: ['compras', 'shopping', 'ropa'],
  cat_edu:     ['educacion', 'education', 'colegio', 'universidad', 'escuela'],
  cat_salario: ['salario', 'salary', 'sueldo', 'nomina'],
  cat_free:    ['freelance'],
  cat_inv:     ['inversiones', 'investments', 'inversion'],
}

export interface AmountFilter { op: 'gt' | 'lt'; value: number }
export interface MonthFilter { year: number; month: number }

export interface ParsedSearchQuery {
  /** Texto restante tras extraer los filtros reconocidos — se sigue usando para el match por substring de siempre. */
  freeText: string
  amountFilter?: AmountFilter
  monthFilter?: MonthFilter
  /** Etiquetas escritas con `#` (ya normalizadas, sin el `#`). Vacío si no hay. */
  tagFilters: string[]
}

// Etiquetas escritas como `#viaje`. Se aceptan letras, dígitos, guion y guion
// bajo — mismo alfabeto con el que el formulario guarda una etiqueta. Se
// extraen antes que nada para que su `#` no confunda al resto de filtros.
function extractTagFilters(text: string): { text: string; tags: string[] } {
  const tags: string[] = []
  const stripped = text.replace(/#([\p{L}\p{N}_-]+)/gu, (_, tag: string) => {
    tags.push(clean(tag))
    return ' '
  })
  return { text: stripped.replace(/\s+/g, ' ').trim(), tags }
}

function extractAmountFilter(text: string): { text: string; filter?: AmountFilter } {
  const amountPattern = '\\$?\\s*([\\d]{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?|\\d+(?:[.,]\\d+)?)'

  for (const word of AMOUNT_GT_WORDS) {
    const re = new RegExp(`${word}\\s*${amountPattern}`)
    const match = text.match(re)
    if (match) return { text: (text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length)).trim(), filter: { op: 'gt', value: parseAmount(match[1]) } }
  }
  for (const word of AMOUNT_LT_WORDS) {
    const re = new RegExp(`${word}\\s*${amountPattern}`)
    const match = text.match(re)
    if (match) return { text: (text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length)).trim(), filter: { op: 'lt', value: parseAmount(match[1]) } }
  }
  const gtSymbol = text.match(new RegExp(`>\\s*${amountPattern}`))
  if (gtSymbol) return { text: (text.slice(0, gtSymbol.index) + text.slice((gtSymbol.index ?? 0) + gtSymbol[0].length)).trim(), filter: { op: 'gt', value: parseAmount(gtSymbol[1]) } }
  const ltSymbol = text.match(new RegExp(`<\\s*${amountPattern}`))
  if (ltSymbol) return { text: (text.slice(0, ltSymbol.index) + text.slice((ltSymbol.index ?? 0) + ltSymbol[0].length)).trim(), filter: { op: 'lt', value: parseAmount(ltSymbol[1]) } }

  return { text }
}

function parseAmount(raw: string): number {
  // "1,000.50" o "1.000,50" → normaliza a punto decimal simple, sin separador de miles.
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/,/g, '')
    : raw.replace(',', '.')
  return parseFloat(normalized)
}

function extractMonthFilter(text: string, now: Date): { text: string; filter?: MonthFilter } {
  if (/\b(este mes|this month)\b/.test(text)) {
    return { text: text.replace(/\b(este mes|this month)\b/, '').trim(), filter: { year: now.getFullYear(), month: now.getMonth() + 1 } }
  }
  if (/\b(mes pasado|last month)\b/.test(text)) {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return { text: text.replace(/\b(mes pasado|last month)\b/, '').trim(), filter: { year: d.getFullYear(), month: d.getMonth() + 1 } }
  }

  const monthNames = Object.keys(MONTH_NAMES).sort((a, b) => b.length - a.length)
  for (const name of monthNames) {
    const re = new RegExp(`\\b${name}\\b(?:\\s+(?:de|of)?\\s*(\\d{4}))?`)
    const match = text.match(re)
    if (!match) continue
    const year = match[1] ? Number(match[1]) : now.getFullYear()
    const cleanedText = (text.slice(0, match.index) + text.slice((match.index ?? 0) + match[0].length)).trim()
    return { text: cleanedText, filter: { year, month: MONTH_NAMES[name] } }
  }

  return { text }
}

export function parseSearchQuery(raw: string, now = new Date()): ParsedSearchQuery {
  const normalized = clean(raw).replace(/\s+/g, ' ')
  const afterTags = extractTagFilters(normalized)
  const afterAmount = extractAmountFilter(afterTags.text)
  const afterMonth = extractMonthFilter(afterAmount.text, now)
  return {
    freeText: afterMonth.text.replace(/\s+/g, ' ').trim(),
    amountFilter: afterAmount.filter,
    monthFilter: afterMonth.filter,
    tagFilters: afterTags.tags,
  }
}

/** Ids de categorías cuyo sinónimo aparece en `text`, limitado a categorías que existen realmente. */
export function matchSynonymCategoryIds(text: string, categories: Category[]): string[] {
  if (!text) return []
  const availableIds = new Set(categories.map(c => c.id))
  const matches = new Set<string>()
  for (const [categoryId, synonyms] of Object.entries(CATEGORY_SYNONYMS)) {
    if (!availableIds.has(categoryId)) continue
    if (synonyms.some(word => text.includes(word))) matches.add(categoryId)
  }
  return Array.from(matches)
}
