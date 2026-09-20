/**
 * Logo de Cuadre — las dos tarjetas, en SVG inline.
 *
 * Es el MISMO dibujo que el ícono de la app (`public/icon.svg`). Antes eran
 * dos marcas distintas: el ícono del teléfono mostraba un pico azul y dentro
 * de la app aparecía otra versión con su propio degradado. Una marca que se
 * ve distinta en dos sitios no se recuerda en ninguno.
 *
 * El `id` de cada degradado lleva el tamaño porque puede haber varias marcas
 * en la misma pantalla: con ids repetidos, todas heredan el degradado de la
 * primera que se monta.
 */
interface Props {
  size?:      number
  className?: string
  style?:     React.CSSProperties
}

export function BrandMark({ size = 34, className, style }: Props) {
  const uid = `bm${size}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size} height={size}
      viewBox="0 0 512 512"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#12403C"/>
          <stop offset="1" stopColor="#06211F"/>
        </linearGradient>
        <linearGradient id={`${uid}-oro`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD166"/>
          <stop offset="1" stopColor="#F09F1A"/>
        </linearGradient>
        <linearGradient id={`${uid}-tur`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5FEBC9"/>
          <stop offset="1" stopColor="#17A38E"/>
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="108" fill={`url(#${uid}-bg)`}/>

      <g transform="rotate(-9 223 213)">
        <rect x="85" y="123" width="275" height="180" rx="38" fill={`url(#${uid}-oro)`}/>
      </g>

      {/* Sombra de contacto: da el orden de apilado sin usar un filtro, que a
          tamaño pequeño convertiría la marca en una mancha. */}
      <g transform="rotate(7 299 308)">
        <rect x="161" y="218" width="275" height="180" rx="38" fill="#04120F" opacity="0.28"/>
      </g>

      <g transform="rotate(7 299 308)">
        <rect x="161" y="218" width="275" height="180" rx="38" fill={`url(#${uid}-tur)`}/>
        <rect x="190" y="276" width="114" height="19" rx="9" fill="#08332D" opacity="0.42"/>
      </g>
    </svg>
  )
}
