/**
 * Protocolo de transferencia de backup por códigos QR: sin red, sin nube —
 * el teléfono viejo muestra el código en pantalla y el teléfono nuevo lo
 * escanea con la cámara. Mismo formato de backup que ya usa `data/backup.ts`
 * (createBackup/parseBackup), pero comprimido (gzip) antes de codificar: la
 * mayoría de los backups reales (cuentas, categorías, metas, ajustes y
 * varios meses de movimientos) caben así en un solo QR — una sola escaneada,
 * un código FIJO. Si el backup es demasiado grande incluso comprimido, el
 * emisor NO cae en un modo de códigos que cambian solos (era imposible de
 * escanear): ofrece migrar por archivo de respaldo, que no tiene límite. El
 * troceado en frames se conserva para el importador, pero el emisor solo
 * muestra código cuando todo cabe en uno.
 */

/** Prefijo que identifica un frame de $harky (para ignorar QR ajenos al escanear). */
const PROTOCOL_PREFIX = 'SHKYQR2'
const SEPARATOR = '|'

/**
 * Capacidad máxima de un solo código: lo más alto posible para que quepan más
 * backups en una sola escaneada, sin pasar del punto en que la densidad del QR
 * lo vuelve difícil de enfocar con la cámara a distancia normal. ~1800 chars
 * ≈ QR versión ~33 con corrección 'L': denso pero legible por un teléfono
 * moderno de cerca.
 */
export const MAX_FRAME_CHARS = 1800

// Se usa el reader/writer nativo de CompressionStream/DecompressionStream
// directamente, sin pasar por Blob/Response: en algunos entornos (WebViews
// viejos, jsdom/happy-dom en tests) `Blob.stream()` no produce un stream
// realmente compatible y `pipeThrough` se queda colgado para siempre.
async function pump(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const writer = transform.writable.getWriter()
  const readAll = (async () => {
    const reader = transform.readable.getReader()
    const chunks: Uint8Array[] = []
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    return chunks
  })()
  await writer.write(bytes as Uint8Array<ArrayBuffer>)
  await writer.close()
  const chunks = await readAll
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}

/** Comprime texto con gzip y lo codifica en base64 (seguro para meter en un QR de texto). */
export async function compressPayload(text: string): Promise<string> {
  const compressed = await pump(new TextEncoder().encode(text), new CompressionStream('gzip'))
  return bufferToBase64(compressed)
}

/** Inverso de `compressPayload`. */
export async function decompressPayload(base64: string): Promise<string> {
  const decompressed = await pump(base64ToBuffer(base64), new DecompressionStream('gzip'))
  return new TextDecoder().decode(decompressed)
}

function bufferToBase64(bytes: Uint8Array): string {
  let binary = ''
  // En trozos: convertir un array grande de una vez con String.fromCharCode(...bytes)
  // puede desbordar el límite de argumentos del motor JS.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface QrFrame {
  transferId: string
  index: number
  total: number
  chunk: string
}

/** Parte un texto en `total` fragmentos de máx. `chunkSize` caracteres cada uno. */
export function chunkPayload(payload: string, chunkSize: number): string[] {
  if (chunkSize <= 0) throw new Error('chunkSize debe ser mayor a 0')
  const chunks: string[] = []
  for (let i = 0; i < payload.length; i += chunkSize) {
    chunks.push(payload.slice(i, i + chunkSize))
  }
  return chunks.length ? chunks : ['']
}

/** Codifica un fragmento como el texto que va dentro del QR. */
export function encodeFrame(transferId: string, index: number, total: number, chunk: string): string {
  return [PROTOCOL_PREFIX, transferId, String(index), String(total), chunk].join(SEPARATOR)
}

/** Decodifica el texto leído de un QR escaneado. `null` si no es un frame válido de $harky. */
export function decodeFrame(raw: string): QrFrame | null {
  if (!raw.startsWith(PROTOCOL_PREFIX + SEPARATOR)) return null
  const rest = raw.slice(PROTOCOL_PREFIX.length + 1)
  const firstSep = rest.indexOf(SEPARATOR)
  if (firstSep === -1) return null
  const transferId = rest.slice(0, firstSep)
  const afterId = rest.slice(firstSep + 1)
  const secondSep = afterId.indexOf(SEPARATOR)
  if (secondSep === -1) return null
  const index = Number(afterId.slice(0, secondSep))
  const afterIndex = afterId.slice(secondSep + 1)
  const thirdSep = afterIndex.indexOf(SEPARATOR)
  if (thirdSep === -1) return null
  const total = Number(afterIndex.slice(0, thirdSep))
  const chunk = afterIndex.slice(thirdSep + 1)

  if (!transferId || !Number.isInteger(index) || !Number.isInteger(total) || index < 0 || total <= 0 || index >= total) {
    return null
  }
  return { transferId, index, total, chunk }
}

/** Genera todos los frames (texto listo para pasar al generador de QR) de un backup. */
export function buildTransferFrames(payload: string, chunkSize: number, transferId: string): string[] {
  const chunks = chunkPayload(payload, chunkSize)
  return chunks.map((chunk, index) => encodeFrame(transferId, index, chunks.length, chunk))
}

/** Estado acumulado de una recepción en curso: frames recibidos por índice. */
export class QrTransferReceiver {
  private transferId: string | null = null
  private total = 0
  private parts = new Map<number, string>()

  /** Procesa un frame escaneado. Devuelve true si aportó un frame nuevo. */
  addFrame(raw: string): boolean {
    const frame = decodeFrame(raw)
    if (!frame) return false
    if (this.transferId === null) {
      this.transferId = frame.transferId
      this.total = frame.total
    } else if (frame.transferId !== this.transferId) {
      // Frame de otra transferencia (ej. el usuario reinició del lado emisor) — reinicia.
      this.transferId = frame.transferId
      this.total = frame.total
      this.parts.clear()
    }
    if (this.parts.has(frame.index)) return false
    this.parts.set(frame.index, frame.chunk)
    return true
  }

  get receivedCount(): number {
    return this.parts.size
  }

  get totalCount(): number {
    return this.total
  }

  get isComplete(): boolean {
    return this.total > 0 && this.parts.size === this.total
  }

  /** Payload reconstruido si ya se recibieron todas las partes, si no `null`. */
  assemble(): string | null {
    if (!this.isComplete) return null
    let out = ''
    for (let i = 0; i < this.total; i++) {
      const part = this.parts.get(i)
      if (part === undefined) return null
      out += part
    }
    return out
  }
}
