/**
 * EL AVATAR DE UN CLIENTE: un color estable y sus iniciales.
 *
 * Estaba copiado en cuatro archivos —la lista, la ficha, el formulario y las
 * cuentas—, y una persona tiene que verse igual en los cuatro. Una sola copia
 * es la única forma de que no acaben distintas.
 */

const AVATAR_COLORS = ['#5bc0ff', '#35d0a2', '#ffd166', '#ff6b8a', '#c765ff', '#ff9a3d']

/** Un color estable por cliente, derivado de su id. */
export function avatarColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) % 997
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

/** Las iniciales de un nombre, para el avatar. */
export function avatarInitials(name: string): string {
  const partes = name.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** El estilo de un avatar: su color al 22% de fondo y entero en la letra. */
export function avatarStyle(id: string): { background: string; color: string } {
  const color = avatarColor(id)
  return { background: `color-mix(in oklab, ${color} 22%, transparent)`, color }
}
