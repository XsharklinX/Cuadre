import { networkMeta } from '@/data/cardNetwork'
import type { CardNetwork } from '@/types'

/**
 * Distintivo de la red de la tarjeta (Visa, Mastercard…).
 *
 * Se dibuja con GEOMETRÍA PROPIA y el nombre en texto, no con los logotipos
 * de las marcas: esas son marcas registradas, y reproducirlas en la app sería
 * usarlas sin licencia. Mastercard lleva sus dos círculos porque la forma es
 * lo que se reconoce; las demás van con el nombre legible.
 *
 * El objetivo es funcional, no decorativo: que el usuario identifique su
 * tarjeta de un vistazo, sin leer el nombre que le puso.
 */
export function NetworkMark({ network, size = 26, onCard = false }: {
  network: CardNetwork
  size?: number
  /**
   * `true` cuando va impreso sobre el plástico.
   *
   * POR QUÉ HACE FALTA DISTINGUIRLO: el color de marca de Visa es #1a1f71,
   * azul marino, y el de Amex un azul medio. Sobre una tarjeta oscura —que es
   * como se pintan todas aquí— esos tonos desaparecen contra el fondo. Las
   * tarjetas de verdad resuelven esto igual: sobre plástico oscuro el logotipo
   * va impreso en blanco.
   *
   * Fuera del plástico (el selector de red, la ficha de ajustes) el fondo es
   * claro y ahí sí manda el color de marca, que es lo que la hace reconocible.
   */
  onCard?: boolean
}) {
  const meta = networkMeta(network)
  if (!meta) return null

  if (network === 'mastercard') {
    /*
     * Dos círculos solapados. La forma es lo reconocible, y no reproduce el
     * logotipo (que lleva tipografía y degradado propios).
     *
     * El radio va fijo en unidades del viewBox, no calculado desde `size`: el
     * SVG ya escala solo. Antes se derivaba de `size` y se volvía a dividir
     * entre `size`, que daba exactamente la misma constante por un camino que
     * parecía depender del tamaño sin depender de él.
     */
    return (
      <span className="netmark" aria-label={meta.name} role="img">
        <svg width={size} height={size * 0.62} viewBox="0 0 40 25" aria-hidden="true">
          <circle cx="15" cy="12.5" r="12" fill="#eb001b" />
          <circle cx="25" cy="12.5" r="12" fill="#f79e1b" opacity="0.85" />
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`netmark netmark-word${onCard ? ' on-card' : ''}`}
      style={onCard ? { fontSize: size * 0.38 } : { color: meta.color, fontSize: size * 0.38 }}
      aria-label={meta.name}
      role="img"
    >
      {network === 'other' ? '••••' : meta.name}
    </span>
  )
}
