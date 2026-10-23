/**
 * GUARDAR LA FOTO DEL RECIBO CON EL MOVIMIENTO.
 *
 * Hoy la app abre la cámara, hace la foto, le lee el monto y la fecha… y la
 * tira. Todo ese trabajo se desperdicia justo cuando más serviría: al mes
 * siguiente, cuando hay que reclamar una garantía, justificar un gasto o
 * recordar qué era aquello de RD$ 4,800.
 *
 * ── DÓNDE *NO* PUEDE IR LA IMAGEN ─────────────────────────────────────
 * En `localStorage`, que es donde vive el libro entero. Ese almacén tiene un
 * tope duro de unos pocos megas por origen, y una foto de recibo son cientos
 * de kilobytes: con veinte recibos la app se quedaría sin poder guardar NADA
 * más —ni un gasto, ni un ajuste—, que es la forma más silenciosa que existe
 * de perderle los datos a alguien. Es el mismo razonamiento por el que la
 * descripción larga tiene tope (ver `MAX_DESCRIPTION`).
 *
 * Así que el movimiento solo guarda un IDENTIFICADOR —unos pocos bytes— y la
 * imagen vive en IndexedDB, que sí está pensada para esto. Ver
 * `lib/receiptStore.ts`.
 *
 * Aquí está solo lo que se puede decidir sin navegador: cuánto encoger y qué
 * se acepta. Lo que toca el disco va aparte, para poder probar esto.
 */

/**
 * Lado mayor al que se reduce la foto.
 *
 * Un recibo tiene que poder LEERSE, no imprimirse: 1400 px bastan para que se
 * distingan los renglones de un ticket de supermercado en pantalla. La foto
 * original de un teléfono de hoy ronda los 4000 px y pesa cuatro megas, y
 * guardar eso por gasto llena el almacén en una semana.
 */
export const RECEIPT_MAX_DIM = 1400

/** Calidad JPEG. 0.72 es donde el texto sigue nítido y el peso ya bajó mucho. */
export const RECEIPT_QUALITY = 0.72

/**
 * Tope por imagen, ya comprimida. Si se pasa, no se guarda.
 *
 * Es un cinturón de seguridad, no el camino normal: una foto de 1400 px al
 * 72 % ronda los 200 KB. Que una llegue a dos megas significa que algo no
 * salió como se esperaba, y en ese caso es mejor quedarse sin recibo que
 * empezar a llenar el disco del usuario.
 */
export const RECEIPT_MAX_BYTES = 2 * 1024 * 1024

/**
 * Las medidas a las que hay que redibujar, conservando la proporción.
 *
 * Una foto que ya es pequeña NO se agranda: reescalar hacia arriba no añade
 * detalle, solo peso y borrosidad.
 */
export function scaledDimensions(width: number, height: number, maxDim = RECEIPT_MAX_DIM): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 }
  const mayor = Math.max(width, height)
  if (mayor <= maxDim) return { width: Math.round(width), height: Math.round(height) }
  const factor = maxDim / mayor
  return {
    // Nunca menos de 1 px: una foto larguísima y estrechísima podría redondear
    // su lado corto a cero y dejar un lienzo que no se puede dibujar.
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  }
}

/** Bytes reales que ocupa un data URL en base64, sin tener que decodificarlo. */
export function dataUrlBytes(dataUrl: string): number {
  const coma = dataUrl.indexOf(',')
  if (coma < 0) return 0
  const base64 = dataUrl.slice(coma + 1)
  const relleno = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((base64.length * 3) / 4) - relleno)
}

/** Si esto es una imagen que tiene sentido guardar como recibo. */
export function isStorableReceipt(dataUrl: string): boolean {
  if (!dataUrl.startsWith('data:image/')) return false
  if (!dataUrl.includes(';base64,')) return false
  const bytes = dataUrlBytes(dataUrl)
  return bytes > 0 && bytes <= RECEIPT_MAX_BYTES
}

/** La clave con la que la imagen se guarda, derivada del movimiento. */
export function receiptKey(txId: string): string {
  return `receipt_${txId}`
}
