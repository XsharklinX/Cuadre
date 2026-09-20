import type { IconName } from '@/types'

export interface SubscriptionCatalogItem {
  id: string
  name: string
  color: string
  icon: IconName
  /** Categoría sugerida al crear la recurrencia (mapeada a una categoría semilla). */
  categoryHint: 'entertainment' | 'services'
  /**
   * Slug en `src/data/brandLogos.ts` con el logo real de la marca. Si falta
   * (marca no disponible en la librería de logos), se usa `icon`+`color`
   * como respaldo — sigue siendo reconocible, solo no es el logo exacto.
   */
  logoSlug?: string
}

/** Catálogo de servicios de suscripción comunes para el flujo "Agregar suscripción". */
export const SUBSCRIPTION_CATALOG: SubscriptionCatalogItem[] = [
  { id: 'netflix',     name: 'Netflix',                color: '#E50914', icon: 'tv',        categoryHint: 'entertainment', logoSlug: 'netflix' },
  { id: 'prime',       name: 'Amazon Prime',           color: '#00A8E1', icon: 'play',      categoryHint: 'entertainment' },
  { id: 'disney',      name: 'Disney+',                color: '#113CCF', icon: 'tv',        categoryHint: 'entertainment' },
  { id: 'hbo',         name: 'HBO Max',                color: '#9B30FF', icon: 'tv',        categoryHint: 'entertainment', logoSlug: 'hbo' },
  { id: 'crunchyroll', name: 'Crunchyroll',            color: '#F47521', icon: 'tv',        categoryHint: 'entertainment', logoSlug: 'crunchyroll' },
  { id: 'spotify',     name: 'Spotify',                color: '#1DB954', icon: 'music',     categoryHint: 'entertainment', logoSlug: 'spotify' },
  { id: 'applemusic',  name: 'Apple Music',            color: '#FA243C', icon: 'music',     categoryHint: 'entertainment', logoSlug: 'applemusic' },
  { id: 'youtube',     name: 'YouTube Premium',        color: '#FF0000', icon: 'play',      categoryHint: 'entertainment', logoSlug: 'youtube' },
  { id: 'twitch',      name: 'Twitch',                 color: '#9146FF', icon: 'tv',        categoryHint: 'entertainment', logoSlug: 'twitch' },
  { id: 'xbox',        name: 'Xbox Game Pass',         color: '#107C10', icon: 'gamepad',   categoryHint: 'entertainment' },
  { id: 'playstation', name: 'PlayStation Plus',       color: '#0070D1', icon: 'gamepad',   categoryHint: 'entertainment', logoSlug: 'playstation' },
  { id: 'nintendo',    name: 'Nintendo Switch Online', color: '#E60012', icon: 'gamepad',   categoryHint: 'entertainment' },
  { id: 'patreon',     name: 'Patreon',                color: '#FF424D', icon: 'heart',     categoryHint: 'entertainment', logoSlug: 'patreon' },
  { id: 'icloud',      name: 'iCloud+',                color: '#3693F3', icon: 'package',   categoryHint: 'services',      logoSlug: 'icloud' },
  { id: 'googleone',   name: 'Google One',             color: '#4285F4', icon: 'package',   categoryHint: 'services' },
  { id: 'dropbox',     name: 'Dropbox',                color: '#0061FF', icon: 'package',   categoryHint: 'services',      logoSlug: 'dropbox' },
  { id: 'microsoft365',name: 'Microsoft 365',          color: '#E3008C', icon: 'briefcase', categoryHint: 'services' },
  { id: 'adobecc',     name: 'Adobe Creative Cloud',   color: '#DA1F26', icon: 'brush',     categoryHint: 'services' },
]

/** Categoría semilla sugerida para un `categoryHint`, con fallback a la primera categoría de gasto. */
export function suggestedCategoryId(
  hint: SubscriptionCatalogItem['categoryHint'],
  categories: { id: string; type: string }[],
): string {
  const preferredId = hint === 'entertainment' ? 'cat_ocio' : 'cat_serv'
  return categories.find(c => c.id === preferredId)?.id
    ?? categories.find(c => c.type === 'expense')?.id
    ?? ''
}
