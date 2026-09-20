import { networkMeta } from '@/data/cardNetwork'
import type { CardNetwork } from '@/types'

/**
 * Distintivo de la red de la tarjeta (Visa, Mastercard…).
 *
 * Se dibuja con GEOMETRÍA PROPIA y el nombre en texto, no con los logotipos
 * de las marcas: esas son marcas registradas, y reproducirlas en la app sería
 * usarlas sin licencia. Mastercard lleva sus dos círculos porque la forma es
 * lo que se reconoce; las demás van en su color con el nombre legible.
 *
 * El objetivo es funcional, no decorativo: que el usuario identifique su
 * tarjeta de un vistazo, sin leer el nombre que le puso.
 */
export function NetworkMark({ network, size = 26 }: { network: CardNetwork; size?: number }) {
  const meta = networkMeta(network)
  if (!meta) return null

  if (network === 'mastercard') {
    // Dos círculos solapados: la forma es lo reconocible, y no reproduce el
    // logotipo (que lleva tipografía y degradado propios).
    const r = size * 0.3
    return (
      <span className="netmark" aria-label={meta.name} role="img">
        <svg width={size} height={size * 0.62} viewBox="0 0 40 25" aria-hidden="true">
          <circle cx="15" cy="12.5" r={r * 40 / size} fill="#eb001b" />
          <circle cx="25" cy="12.5" r={r * 40 / size} fill="#f79e1b" opacity="0.85" />
        </svg>
      </span>
    )
  }

  return (
    <span
      className="netmark netmark-word"
      style={{ color: meta.color, fontSize: size * 0.38 }}
      aria-label={meta.name}
      role="img"
    >
      {network === 'other' ? '••••' : meta.name}
    </span>
  )
}
