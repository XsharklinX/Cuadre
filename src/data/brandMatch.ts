import { SUBSCRIPTION_CATALOG, type SubscriptionCatalogItem } from './subscriptionCatalog'

/**
 * RECONOCER LA MARCA POR SU NOMBRE.
 *
 * ── POR QUÉ HACE FALTA ────────────────────────────────────────────────
 * Las suscripciones que se crean desde el catálogo guardan su `serviceId` y
 * pintan el logo real. Pero un SERVICIO de Negocio se escribe a mano: el
 * usuario teclea «Netflix» y la app no tenía forma de saber que eso es
 * Netflix, así que lo dibujaba como texto gris.
 *
 * Los logos ya estaban en la app —el catálogo y `brandLogos.ts` los usan en
 * Suscripciones—. Lo único que faltaba era mirar el nombre.
 *
 * ── LA COMPARACIÓN ES FLOJA A PROPÓSITO ───────────────────────────────
 * La gente escribe «netflix», «Netflix 4K», «NETFLIX cuenta 2». Comparar
 * exacto no reconocería ninguno. Así que se busca si el nombre escrito
 * CONTIENE el de la marca, normalizado.
 *
 * Y se pide un mínimo de cuatro letras: con tres, «hbo» dentro de cualquier
 * palabra daría un falso positivo, y un logo equivocado es peor que ninguno
 * porque afirma algo que no es.
 */

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+]/g, '')
}

/** Nombre normalizado de cada marca, calculado una vez. */
const MARCAS: Array<{ clave: string; item: SubscriptionCatalogItem }> = SUBSCRIPTION_CATALOG
  .map(item => ({ clave: normalizar(item.name), item }))
  // Las más largas primero: «youtubepremium» antes que «youtube», o
  // «YouTube Premium» se reconocería como YouTube a secas.
  .sort((a, b) => b.clave.length - a.clave.length)

/**
 * La marca que parece ser, o `null`.
 *
 * `null` no es un fallo: la mayoría de los servicios de un negocio pequeño
 * —un local, una herramienta, un alquiler— no son marcas de catálogo, y
 * ponerles un logo inventado sería peor que dejarlos con su inicial.
 */
export function matchBrand(name: string): SubscriptionCatalogItem | null {
  const buscado = normalizar(name)
  if (buscado.length < 3) return null
  for (const { clave, item } of MARCAS) {
    if (clave.length < 4) continue
    if (buscado.includes(clave)) return item
  }
  return null
}
