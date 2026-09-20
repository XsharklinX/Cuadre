/** Logo $harky — fin de tiburón como línea de tendencia, SVG inline. */
interface Props {
  size?:      number
  className?: string
  style?:     React.CSSProperties
}

export function BrandMark({ size = 34, className, style }: Props) {
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
        <radialGradient id="bm-bg" cx="50%" cy="35%" r="70%">
          <stop offset="0%"   stopColor="#0E1E38"/>
          <stop offset="100%" stopColor="#070C18"/>
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="108" fill="url(#bm-bg)"/>
      <polyline
        points="76,388 256,88 426,268"
        fill="none" stroke="white" strokeWidth="40"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.96"
      />
      <circle cx="256" cy="88" r="30" fill="#3B82F6"/>
      <circle cx="248" cy="80" r="10" fill="#93C5FD" opacity="0.6"/>
      <line x1="58" y1="416" x2="454" y2="416"
        stroke="#3B82F6" strokeWidth="7" strokeLinecap="round" opacity="0.28"/>
    </svg>
  )
}