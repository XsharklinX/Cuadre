/** Encuadre elegido por el usuario en el editor, en coordenadas del visor. */
export interface AvatarCrop {
  /** Zoom aplicado sobre el tamaño "cubre el visor" (1 = justo cubierto). */
  zoom: number
  /** Desplazamiento del centro de la imagen respecto al centro del visor, en px del visor. */
  offsetX: number
  offsetY: number
  /** Lado del visor cuadrado en px, el mismo con el que se calcularon los offsets. */
  viewport: number
}

/** Escala base: la que hace que la imagen cubra justo el visor cuadrado. */
export function avatarBaseScale(width: number, height: number, viewport: number): number {
  return viewport / Math.min(width, height)
}

/**
 * Límite de arrastre para que la imagen nunca deje ver un hueco dentro del
 * visor. Se calcula aparte porque el editor lo necesita en cada gesto, no solo
 * al guardar.
 */
export function avatarMaxOffset(width: number, height: number, crop: Omit<AvatarCrop, 'offsetX' | 'offsetY'>): { x: number; y: number } {
  const scale = avatarBaseScale(width, height, crop.viewport) * crop.zoom
  return {
    x: Math.max(0, (width * scale - crop.viewport) / 2),
    y: Math.max(0, (height * scale - crop.viewport) / 2),
  }
}

async function canvasToDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob) throw new Error('No se pudo procesar la imagen')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(blob)
  })
}

/**
 * Recorta la foto al encuadre que el usuario dejó en el editor y la reduce a un
 * tamaño fijo — evita guardar fotos de varios MB en el store persistido
 * (localStorage) por una simple foto de perfil circular.
 *
 * `crop` va en coordenadas del visor del editor, así que lo primero es pasar
 * ese recuadro a coordenadas de la imagen original: es la única forma de que
 * lo que se guarda coincida exactamente con lo que se veía en pantalla,
 * independientemente del tamaño en px que tuviera el visor en ese teléfono.
 */
export async function cropAvatarPhoto(
  source: CanvasImageSource & { width: number; height: number },
  crop: AvatarCrop,
  size = 256,
): Promise<string> {
  const scale = avatarBaseScale(source.width, source.height, crop.viewport) * crop.zoom
  const side = crop.viewport / scale
  const sx = (source.width - side) / 2 - crop.offsetX / scale
  const sy = (source.height - side) / 2 - crop.offsetY / scale

  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo procesar la imagen')
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size)

  return canvasToDataUrl(canvas)
}
