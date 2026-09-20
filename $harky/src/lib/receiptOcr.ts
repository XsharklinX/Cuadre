import { recognizeWithMlKit } from './mlkitOcr'

export interface ReceiptOcrResult {
  rawText: string
  amount: number | null
  date: string | null // YYYY-MM-DD
  cardLast4: string | null
  merchant: string | null
}

const AMOUNT_RE = /\d{1,3}(?:[.,]\d{3})*[.,]\d{2}/g
const TOTAL_KEYWORDS = /total|monto|importe|pagar|pago/i
const DATE_RE_YMD = /\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/
const DATE_RE_DMY = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/
// Líneas que delatan una tarjeta/cuenta: solo en ellas buscamos los 4 dígitos,
// para no confundir un RNC, un código de recibo o una fecha con la tarjeta.
const CARD_LINE_RE = /(tarjeta|visa|mastercard|cuenta|terminad|termina|\*{2,})/i
// Encabezados que NO son el nombre del comercio.
const MERCHANT_HEADER_RE = /^(recibo|factura|ticket|comprobante|nota\s+de|orden|invoice|receipt|copia)\b/i

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parseAmount(value: string): number {
  const cleaned = value.replace(/[^\d.,]/g, '')
  const lastComma = cleaned.lastIndexOf(',')
  const lastDot = cleaned.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '')
  } else {
    normalized = cleaned
  }
  return Number(normalized)
}

export function extractDate(text: string): string | null {
  const ymd = text.match(DATE_RE_YMD)
  if (ymd) {
    const [, y, m, d] = ymd
    if (Number(m) <= 12 && Number(d) <= 31) return `${y}-${pad(Number(m))}-${pad(Number(d))}`
  }
  const dmy = text.match(DATE_RE_DMY)
  if (dmy) {
    const [, d, m, yRaw] = dmy
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw
    const dn = Number(d)
    const mn = Number(m)
    if (mn <= 12 && dn <= 31) return `${y}-${pad(mn)}-${pad(dn)}`
    if (dn <= 12 && mn <= 31) return `${y}-${pad(dn)}-${pad(mn)}`
  }
  return null
}

export function extractAmount(text: string): number | null {
  let best: number | null = null
  let bestFromTotalLine: number | null = null

  for (const line of text.split(/\r?\n/)) {
    const matches = line.match(AMOUNT_RE)
    if (!matches) continue
    for (const raw of matches) {
      const value = parseAmount(raw)
      if (!Number.isFinite(value) || value <= 0) continue
      if (TOTAL_KEYWORDS.test(line) && (bestFromTotalLine === null || value > bestFromTotalLine)) {
        bestFromTotalLine = value
      }
      if (best === null || value > best) best = value
    }
  }
  return bestFromTotalLine ?? best
}

/**
 * Últimos 4 dígitos de la tarjeta/cuenta, si el recibo los incluye. Solo mira
 * líneas con una señal de tarjeta (evita confundir un RNC, un código o una
 * fecha con la tarjeta). `null` si no hay ninguna señal.
 */
export function extractCardLast4(text: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    if (!CARD_LINE_RE.test(line)) continue
    // "****4500" / "** 4500"
    const star = line.match(/\*+\s*(\d{4})\b/)
    if (star) return star[1]
    // "terminada en 4500"
    const terminated = line.match(/termin\w*\s+en\s+(\d{4})\b/i)
    if (terminated) return terminated[1]
    // 4 dígitos justo tras un marcador de tarjeta (VISA/TARJETA/#/:…). Es donde
    // está el número; evita agarrar el MONTO que suele ir después en la misma
    // línea, ej. "TARJETA VISA : #:4500  3,313.68" → 4500, no 3313.
    const nearMarker = line.match(/(?:visa|mastercard|tarjeta|cuenta|card|#|:)\D{0,8}(\d{4})\b/i)
    if (nearMarker) return nearMarker[1]
    // Último recurso: el PRIMER grupo de 4 dígitos (la tarjeta suele preceder al
    // monto), no el último.
    const groups = line.match(/\b\d{4}\b/g)
    if (groups) return groups[0]
  }
  return null
}

/**
 * Nombre del comercio: la primera línea con texto real (no un encabezado tipo
 * "RECIBO", ni una línea dominada por números como fechas o códigos). Se
 * recorta a 40 caracteres. `null` si no hay ninguna línea usable.
 */
export function extractMerchant(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (MERCHANT_HEADER_RE.test(line)) continue
    const letters = (line.match(/[a-záéíóúñ]/gi) ?? []).length
    const digits = (line.match(/\d/g) ?? []).length
    if (letters < 3) continue        // necesita algo de texto real
    if (digits > letters) continue   // dominada por números (fecha/código)
    return line.slice(0, 40)
  }
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

/**
 * Reduce la imagen a un máximo de `maxDim` px de lado y la re-codifica como
 * JPEG — acelera el OCR (nativo y Tesseract) y reduce el payload enviado al
 * plugin nativo. Si algo falla, devuelve `null` y el llamador usa la imagen
 * original.
 */
async function downscaleImage(input: Blob | string, maxDim = 1600): Promise<{ base64: string; blob: Blob } | null> {
  try {
    const blob = typeof input === 'string' ? await (await fetch(input)).blob() : input
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bitmap, 0, 0, w, h)
    const outBlob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!outBlob) return null
    return { base64: await blobToBase64(outBlob), blob: outBlob }
  } catch {
    return null
  }
}

function buildResult(rawText: string): ReceiptOcrResult {
  return {
    rawText,
    amount: extractAmount(rawText),
    date: extractDate(rawText),
    cardLast4: extractCardLast4(rawText),
    merchant: extractMerchant(rawText),
  }
}

export async function recognizeReceipt(image: string | Blob): Promise<ReceiptOcrResult> {
  const downscaled = await downscaleImage(image)

  // Intento 1: ML Kit on-device (Android nativo). Sin descarga, sin red.
  if (downscaled) {
    const mlkitText = await recognizeWithMlKit(downscaled.base64)
    if (mlkitText && mlkitText.trim()) {
      return buildResult(mlkitText)
    }
  }

  // Fallback: Tesseract.js (web, desktop, o si ML Kit no está disponible)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('spa')
  try {
    const { data } = await worker.recognize(downscaled?.blob ?? image)
    return buildResult(data.text)
  } finally {
    await worker.terminate()
  }
}
