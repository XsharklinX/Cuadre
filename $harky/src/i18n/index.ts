import { useSettings } from '@/store/settings'
import { en } from './en'
import { es } from './es'
import type { LangKey } from './en'

export { en, es }
export type { LangKey }
export type Language = 'en' | 'es'
const DICTS: Record<Language, Record<LangKey, string>> = { en, es }
/** Solo para tests (auditoría i18n): no usar en la app — pasar por useT()/tt(). */
export { DICTS as I18N_DICTS }

export function useT() {
  const lang = (useSettings(s => s.language) ?? 'es') as Language
  const dict = DICTS[lang] ?? es
  return (key: LangKey): string => dict[key] ?? es[key]
}

/**
 * Traductor para usar fuera de React (store, capa de datos, errores lanzados).
 * Lee el idioma de forma no reactiva e interpola `{placeholders}`.
 */
export function tt(key: LangKey, vars?: Record<string, string | number>): string {
  const lang = (useSettings.getState().language ?? 'es') as Language
  const dict = DICTS[lang] ?? es
  let out = dict[key] ?? es[key]
  if (vars) for (const k in vars) out = out.replace(`{${k}}`, String(vars[k]))
  return out
}

// ── Nombres de categorías por defecto (es/en) ──────────────
// Permite traducir las 12 categorías semilla al cambiar de idioma sin
// afectar categorías creadas o renombradas por el usuario.
export const CATEGORY_NAME_MAP: Record<string, { es: string; en: string }> = {
  cat_renta:   { es: 'Vivienda',        en: 'Housing' },
  cat_super:   { es: 'Supermercado',    en: 'Groceries' },
  cat_rest:    { es: 'Restaurantes',    en: 'Restaurants' },
  cat_trans:   { es: 'Transporte',      en: 'Transport' },
  cat_serv:    { es: 'Servicios',       en: 'Services' },
  cat_ocio:    { es: 'Entretenimiento', en: 'Entertainment' },
  cat_salud:   { es: 'Salud',           en: 'Health' },
  cat_compras: { es: 'Compras',         en: 'Shopping' },
  cat_edu:     { es: 'Educación',       en: 'Education' },
  cat_salario: { es: 'Salario',         en: 'Salary' },
  cat_free:    { es: 'Freelance',       en: 'Freelance' },
  cat_inv:     { es: 'Inversiones',     en: 'Investments' },
}

/** Traduce el nombre de una categoría semilla si aún tiene su nombre original (es/en). */
export function translateCategoryName(category: { id: string; name: string }, lang: Language): string {
  const names = CATEGORY_NAME_MAP[category.id]
  if (!names) return category.name
  const current = category.name.trim().toLowerCase()
  if (current === names.es.toLowerCase() || current === names.en.toLowerCase()) return names[lang]
  return category.name
}

export function useCategoryName(category: { id: string; name: string }): string {
  const lang = (useSettings(s => s.language) ?? 'es') as Language
  return translateCategoryName(category, lang)
}

