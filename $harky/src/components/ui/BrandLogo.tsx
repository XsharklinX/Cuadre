import { BRAND_LOGOS } from '@/data/brandLogos'

/**
 * Logo real de una marca (Netflix, Spotify, etc.). Los logos de simple-icons
 * son monocromos de un solo path: por defecto se pintan en su color oficial,
 * pero se puede forzar un color (ej. blanco) para mostrarlos sobre una baldosa
 * del color de la marca — un look uniforme tipo "app icon".
 */
export function BrandLogo({ slug, size = 22, color }: { slug: string; size?: number; color?: string }) {
  const logo = BRAND_LOGOS[slug]
  if (!logo) return null
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={logo.title}>
      <path d={logo.path} fill={color ?? logo.hex} />
    </svg>
  )
}
