import { useEffect, useRef, useState } from 'react'

const SIZE = 3
const HIT_RATIO = 0.42 // radio de "acierto" alrededor de cada punto, relativo al tamaño de celda

function dotIndexAt(rect: DOMRect, clientX: number, clientY: number): number | null {
  const cell = rect.width / SIZE
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null
  const col = Math.floor(x / cell)
  const row = Math.floor(y / cell)
  if (col < 0 || col > SIZE - 1 || row < 0 || row > SIZE - 1) return null
  const cx = (col + 0.5) * cell
  const cy = (row + 0.5) * cell
  if (Math.hypot(x - cx, y - cy) > cell * HIT_RATIO) return null
  return row * SIZE + col
}

function dotCenter(rect: DOMRect, index: number): { x: number; y: number } {
  const cell = rect.width / SIZE
  const col = index % SIZE
  const row = Math.floor(index / SIZE)
  return { x: (col + 0.5) * cell, y: (row + 0.5) * cell }
}

/**
 * Patrón de desbloqueo estilo Android: grid de 3x3 puntos que el usuario
 * conecta arrastrando. Llama a `onComplete` con la secuencia ("0,4,8,...")
 * al soltar, si tiene al menos `minLength` puntos.
 */
export function PatternPad({
  onComplete,
  minLength = 4,
  shake = false,
  success = false,
}: {
  /** `null` cuando el patrón soltado tiene menos de `minLength` puntos. */
  onComplete: (pattern: string | null) => void
  minLength?: number
  /** El padre activa esto brevemente cuando el patrón ingresado es incorrecto. */
  shake?: boolean
  /** El padre activa esto cuando el patrón ingresado es correcto. */
  success?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [path, setPath] = useState<number[]>([])
  const [drawing, setDrawing] = useState(false)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (shake || success) {
      const t = setTimeout(() => setPath([]), shake ? 380 : 180)
      return () => clearTimeout(t)
    }
  }, [shake, success])

  const handleStart = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setDrawing(true)
    setCursor({ x: clientX - rect.left, y: clientY - rect.top })
    const idx = dotIndexAt(rect, clientX, clientY)
    if (idx !== null) setPath([idx])
  }

  const handleMove = (clientX: number, clientY: number) => {
    if (!drawing) return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    setCursor({ x: clientX - rect.left, y: clientY - rect.top })
    const idx = dotIndexAt(rect, clientX, clientY)
    if (idx !== null) setPath(p => (p.includes(idx) ? p : [...p, idx]))
  }

  const handleEnd = () => {
    if (!drawing) return
    setDrawing(false)
    setCursor(null)
    setPath(p => {
      onComplete(p.length >= minLength ? p.join(',') : null)
      return p
    })
  }

  const rect = containerRef.current?.getBoundingClientRect()
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  if (rect) {
    for (let i = 1; i < path.length; i++) {
      const a = dotCenter(rect, path[i - 1])
      const b = dotCenter(rect, path[i])
      lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    }
    if (drawing && cursor && path.length > 0) {
      const a = dotCenter(rect, path[path.length - 1])
      lines.push({ x1: a.x, y1: a.y, x2: cursor.x, y2: cursor.y })
    }
  }

  const stroke = shake ? '#ff6b8a' : 'var(--accent, #ffdd3d)'

  return (
    <div
      ref={containerRef}
      className={`mpattern-pad${shake ? ' err' : ''}${success ? ' ok' : ''}`}
      onPointerDown={e => { e.preventDefault(); (e.target as Element).setPointerCapture?.(e.pointerId); handleStart(e.clientX, e.clientY) }}
      onPointerMove={e => { e.preventDefault(); handleMove(e.clientX, e.clientY) }}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
    >
      <svg className="mpattern-svg">
        {lines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={stroke} strokeWidth={4} strokeLinecap="round" />
        ))}
      </svg>
      {Array.from({ length: SIZE * SIZE }).map((_, i) => (
        <span key={i} className={`mpattern-dot${path.includes(i) ? ' on' : ''}${shake ? ' err' : ''}`} />
      ))}
    </div>
  )
}
