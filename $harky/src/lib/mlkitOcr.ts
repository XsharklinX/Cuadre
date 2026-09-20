import { isTauri } from '@/hooks/useTauri'

/** Caja delimitadora de un bloque de texto, en píxeles de la imagen analizada. */
export interface MlKitBoundingBox {
  left: number
  top: number
  right: number
  bottom: number
}

export interface MlKitTextBlock {
  text: string
  /** `undefined` en los raros casos en que ML Kit no calcula la caja del bloque. */
  boundingBox?: MlKitBoundingBox
}

export interface MlKitRecognizeResult {
  text: string
  imageWidth: number
  imageHeight: number
  /** Bloques con su caja — hoy sin usar fuera de este módulo; los usará la
   * cámara en vivo (recuadro azul sobre el monto) más adelante. */
  blocks: MlKitTextBlock[]
}

/**
 * Reconoce texto en una imagen usando Google ML Kit (on-device, vía el
 * plugin nativo de Tauri). Devuelve `null` si no estamos en Android+Tauri,
 * si Google Play Services no está disponible, o si el plugin falla por
 * cualquier otra razón — en cuyo caso el llamador debe usar Tesseract.js.
 */
export async function recognizeWithMlKit(imageBase64: string): Promise<string | null> {
  const result = await recognizeWithMlKitDetailed(imageBase64)
  return result?.text ?? null
}

/**
 * Igual que {@link recognizeWithMlKit} pero devuelve el resultado completo,
 * incluyendo los bloques con sus cajas delimitadoras (ver {@link MlKitTextBlock}).
 */
export async function recognizeWithMlKitDetailed(imageBase64: string): Promise<MlKitRecognizeResult | null> {
  const isAndroid = /android/i.test(navigator.userAgent)
  if (!isTauri() || !isAndroid) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<MlKitRecognizeResult>('plugin:mlkit-ocr|recognize_text', { imageBase64 })
  } catch {
    return null
  }
}

export interface NativeScanResult {
  dataUrl: string
  /** Campos ya extraídos en la propia cámara (Fase 4) sobre el último frame
   * analizado — evita correr OCR otra vez en JS sobre la foto ya capturada. */
  amount: number | null
  date: string | null
  cardLast4: string | null
  merchant: string | null
}

/**
 * Abre la pantalla de cámara nativa de escaneo de recibos: preview fluido,
 * flash, tap-to-focus, recuadro azul sobre el monto en vivo y auto-captura
 * cuando el monto se mantiene estable (vibra y dispara sola). Devuelve la
 * foto ya con la extracción hecha, o `null` si el usuario cancela, no estamos
 * en Android+Tauri, o el plugin falla — en cuyo caso el llamador debe caer al
 * `<input capture>` de siempre.
 */
export async function openNativeScanner(): Promise<NativeScanResult | null> {
  const isAndroid = /android/i.test(navigator.userAgent)
  if (!isTauri() || !isAndroid) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{
      cancelled: boolean
      photoBase64?: string
      amount?: number
      date?: string
      cardLast4?: string
      merchant?: string
    }>('plugin:mlkit-ocr|open_scanner')
    if (result.cancelled || !result.photoBase64) return null
    return {
      dataUrl: `data:image/jpeg;base64,${result.photoBase64}`,
      amount: result.amount ?? null,
      date: result.date ?? null,
      cardLast4: result.cardLast4 ?? null,
      merchant: result.merchant ?? null,
    }
  } catch {
    return null
  }
}
