import { isTauri } from '@/hooks/useTauri'

/**
 * Capa JS sobre el plugin de Google Play Billing.
 *
 * Todo lo de aquí degrada a "no disponible" en vez de reventar: en escritorio,
 * en el navegador y en un Android sin Play Store la app tiene que seguir
 * funcionando igual, simplemente sin ofrecer la compra. Una pantalla de pago
 * rota es peor que ninguna.
 */

/**
 * El id del producto tal y como se crea en Play Console → Productos → Productos
 * integrados en la aplicación. Tiene que coincidir EXACTAMENTE con el de allí:
 * si no coincide, Play responde "producto no encontrado" y no dice por qué.
 */
export const VIP_PRODUCT_ID = 'cuadre_vip_lifetime'

export interface BillingAvailability {
  available: boolean
  reason?: string | null
}

export interface BillingProduct {
  found: boolean
  productId?: string | null
  /** Precio ya formateado por Play, en la moneda del país del usuario. */
  price?: string | null
  currency?: string | null
  priceMicros?: number | null
}

export interface PurchaseOutcome {
  owned: boolean
  /** Cerró el diálogo. NO es un error y no debe pintarse como tal. */
  cancelled: boolean
  /** Pago pendiente (efectivo, control parental): todavía no es dueño. */
  pending: boolean
  error?: string | null
}

const UNAVAILABLE: PurchaseOutcome = { owned: false, cancelled: false, pending: false, error: 'unavailable' }

async function call<T>(command: string, args: Record<string, unknown> = {}): Promise<T | null> {
  if (!isTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<T>(`plugin:play-billing|${command}`, args)
  } catch {
    // Plugin ausente (build viejo) o Play caído: se trata como no disponible.
    return null
  }
}

export async function billingAvailable(): Promise<BillingAvailability> {
  return (await call<BillingAvailability>('available')) ?? { available: false, reason: 'no_plugin' }
}

export async function getVipProduct(): Promise<BillingProduct> {
  return (await call<BillingProduct>('product', { productId: VIP_PRODUCT_ID })) ?? { found: false }
}

export async function buyVip(): Promise<PurchaseOutcome> {
  return (await call<PurchaseOutcome>('purchase', { productId: VIP_PRODUCT_ID })) ?? UNAVAILABLE
}

/**
 * Vuelve a preguntarle a Play qué posee esta cuenta de Google.
 *
 * Se llama al abrir la pantalla VIP, no solo con el botón: quien reinstala
 * debe recuperar lo que pagó sin tener que buscar dónde se pide.
 */
export async function restoreVip(): Promise<PurchaseOutcome> {
  return (await call<PurchaseOutcome>('restore', { productId: VIP_PRODUCT_ID })) ?? UNAVAILABLE
}
