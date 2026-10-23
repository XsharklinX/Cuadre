import { BrandLogo } from '@/components/ui/BrandLogo'
import { Icon } from '@/components/ui/Icon'
import { matchBrand } from '@/data/brandMatch'
import type { IconName } from '@/types'

/**
 * LA BALDOSA DE UN SERVICIO, con su logo de marca si se le reconoce.
 *
 * ── POR QUÉ ESTO EXISTE ───────────────────────────────────────────────
 * Suscripciones pintaba los logos reales y Negocio dibujaba los mismos
 * servicios como texto gris, porque allí el nombre se escribe a mano. Los
 * logos ya estaban en la app; lo único que faltaba era mirar el nombre.
 *
 * Es lo que hace que una lista parezca un producto y no una hoja de cálculo,
 * y no cuesta nada: el catálogo y `brandLogos.ts` llevan en el repositorio
 * desde antes de que existiera Negocio.
 *
 * ── CUANDO NO SE RECONOCE ─────────────────────────────────────────────
 * La mayoría de los servicios de un negocio pequeño —un local, una
 * herramienta, un alquiler— no son marcas, así que el respaldo tiene que ser
 * digno y no un hueco: la inicial sobre el color que el usuario eligió.
 */
export function BrandTile({
  name, size = 36, color, icon, className,
}: {
  name: string
  size?: number
  /** El color del negocio, para cuando no hay marca. */
  color?: string
  icon?: IconName
  className?: string
}) {
  const marca = matchBrand(name)
  const glifo = Math.round(size * 0.52)

  if (marca) {
    return (
      <span
        className={`mbrand-tile${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size, background: marca.color }}
        aria-hidden="true"
      >
        {marca.logoSlug
          ? <BrandLogo slug={marca.logoSlug} size={glifo} color="#fff" />
          : <Icon name={marca.icon} size={glifo} />}
      </span>
    )
  }

  const base = color || 'var(--m-primary)'
  return (
    <span
      className={`mbrand-tile plain${className ? ` ${className}` : ''}`}
      style={{
        width: size,
        height: size,
        // El color del usuario SIEMPRE sobre una mezcla: un color elegido a
        // mano puede quedar ilegible en el tema claro si se usa a pelo.
        background: `color-mix(in oklab, ${base} 20%, transparent)`,
        color: base,
        fontSize: Math.round(size * 0.42),
      }}
      aria-hidden="true"
    >
      {icon ? <Icon name={icon} size={glifo} /> : name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
