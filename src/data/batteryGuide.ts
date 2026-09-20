/**
 * GUÍA DE BATERÍA POR FABRICANTE.
 *
 * La evidencia del dispositivo de prueba: los jobs de WorkManager se diferían
 * a **17h20m** con un período nominal de 6h, y la app no estaba en la lista
 * blanca de batería. Con esas ventanas, cualquier cosa que dependa de
 * despertar en un momento concreto —recordatorios, backup, recurrentes— falla
 * la mayoría de las veces.
 *
 * Android estándar lo resuelve con `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`,
 * pero Xiaomi, Huawei, Samsung, Oppo/Realme y Vivo añaden su PROPIO gestor
 * encima, con ajustes que viven en pantallas distintas y que la API no puede
 * abrir directamente. Por eso hace falta decirle al usuario dónde tocar, con
 * los nombres que su teléfono usa de verdad.
 */

export type Vendor = 'xiaomi' | 'huawei' | 'samsung' | 'oppo' | 'vivo' | 'other'

export interface VendorGuide {
  vendor: Vendor
  /** Nombre comercial, para poder decirlo en pantalla. */
  label: string
  /** Pasos con los nombres EXACTOS de los ajustes de ese fabricante. */
  stepKeys: string[]
  /**
   * true si además del ajuste estándar de Android hace falta uno propio del
   * fabricante. En esos teléfonos, conceder la exención estándar NO basta.
   */
  needsExtraStep: boolean
}

/** Fragmentos de `navigator.userAgent` / marca que identifican al fabricante. */
const VENDOR_HINTS: Array<{ vendor: Vendor; hints: string[] }> = [
  { vendor: 'xiaomi',  hints: ['xiaomi', 'redmi', 'poco', 'miui'] },
  { vendor: 'huawei',  hints: ['huawei', 'honor', 'emui', 'harmonyos'] },
  { vendor: 'samsung', hints: ['samsung', 'sm-', 'galaxy', 'oneui'] },
  { vendor: 'oppo',    hints: ['oppo', 'realme', 'oneplus', 'coloros'] },
  { vendor: 'vivo',    hints: ['vivo', 'funtouch', 'iqoo'] },
]

export function detectVendor(userAgentOrBrand: string): Vendor {
  const haystack = userAgentOrBrand.toLowerCase()
  for (const { vendor, hints } of VENDOR_HINTS) {
    if (hints.some(hint => haystack.includes(hint))) return vendor
  }
  return 'other'
}

/**
 * Los pasos de cada fabricante. Las claves son de i18n: los nombres de los
 * ajustes se traducen, porque un usuario con el teléfono en inglés ve
 * "Battery saver", no "Ahorro de batería", y darle el nombre que NO aparece
 * en su pantalla es peor que no darle ninguno.
 */
const GUIDES: Record<Vendor, VendorGuide> = {
  xiaomi: {
    vendor: 'xiaomi',
    label: 'Xiaomi · Redmi · POCO',
    // MIUI es el caso más agresivo: mata procesos en segundo plano incluso con
    // la exención estándar concedida.
    stepKeys: ['batXiaomi1', 'batXiaomi2', 'batXiaomi3'],
    needsExtraStep: true,
  },
  huawei: {
    vendor: 'huawei',
    label: 'Huawei · Honor',
    stepKeys: ['batHuawei1', 'batHuawei2', 'batHuawei3'],
    needsExtraStep: true,
  },
  samsung: {
    vendor: 'samsung',
    label: 'Samsung',
    stepKeys: ['batSamsung1', 'batSamsung2'],
    needsExtraStep: true,
  },
  oppo: {
    vendor: 'oppo',
    label: 'OPPO · realme · OnePlus',
    stepKeys: ['batOppo1', 'batOppo2'],
    needsExtraStep: true,
  },
  vivo: {
    vendor: 'vivo',
    label: 'vivo · iQOO',
    stepKeys: ['batVivo1', 'batVivo2'],
    needsExtraStep: true,
  },
  other: {
    vendor: 'other',
    label: 'Android',
    stepKeys: ['batGeneric1'],
    needsExtraStep: false,
  },
}

export function guideFor(vendor: Vendor): VendorGuide {
  return GUIDES[vendor]
}

/** Todos los fabricantes, para que el usuario pueda elegir si no se detectó bien. */
export function allGuides(): VendorGuide[] {
  return [GUIDES.xiaomi, GUIDES.samsung, GUIDES.huawei, GUIDES.oppo, GUIDES.vivo, GUIDES.other]
}

// ── Cuándo volver a pedirlo ────────────────────────────────

export interface BatteryPromptState {
  /** El usuario ya concedió la exención (o dijo que sí lo hizo). */
  done: boolean
  /** Epoch ms del último "ahora no". */
  lastAskedAt: number
  timesAsked: number
}

export const EMPTY_BATTERY_STATE: BatteryPromptState = { done: false, lastAskedAt: 0, timesAsked: 0 }

const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_ASKS = 3

/**
 * ¿Toca pedirlo?
 *
 * Solo si hay algo de fondo ENCENDIDO. Pedir permisos de batería a quien tiene
 * recordatorios y backup apagados es pedir por pedir: no hay nada que
 * proteger, y gastar el permiso ahí significa que cuando de verdad haga falta
 * el usuario ya dijo que no.
 */
export function shouldAskBattery(input: {
  state: BatteryPromptState
  /** ¿Hay recordatorios, backup o avisos bancarios activos? */
  hasBackgroundWork: boolean
  /** ¿Android ya concedió la exención estándar? */
  alreadyExempt: boolean
  now: number
}): boolean {
  const { state, hasBackgroundWork, alreadyExempt, now } = input
  if (state.done || alreadyExempt) return false
  if (!hasBackgroundWork) return false
  if (state.timesAsked >= MAX_ASKS) return false
  if (state.lastAskedAt > 0 && now - state.lastAskedAt < SNOOZE_MS) return false
  return true
}
