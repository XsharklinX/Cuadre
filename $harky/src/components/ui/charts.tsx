import { useState, useEffect } from 'react'
import { useFinance } from '@/store/finance'
import { fmtCompact, fmt } from '@/data/helpers'

// ── Donut ─────────────────────────────────────────────────
interface DonutSlice { label: string; value: number; color: string }
interface DonutProps {
  data:          DonutSlice[]
  size?:         number
  thickness?:    number
  centerTop?:    string
  centerBottom?: string
}

export function Donut({ data, size = 220, thickness = 26, centerTop, centerBottom }: DonutProps) {
  const currency = useFinance(s => s.currency)
  const total    = data.reduce((s, d) => s + d.value, 0) || 1
  const r        = (size - thickness) / 2
  const cx = size / 2, cy = size / 2
  const circ     = 2 * Math.PI * r
  const gap      = 0.012
  const [hover, setHover] = useState<number | null>(null)
  let acc = 0

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--track)" strokeWidth={thickness} />
        {data.map((d, i) => {
          const frac = d.value / total
          const len  = Math.max(0, (frac - gap) * circ)
          const dash = `${len} ${circ - len}`
          const offset = -acc * circ
          acc += frac
          return (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth={hover === i ? thickness + 5 : thickness}
              strokeDasharray={dash} strokeDashoffset={offset} strokeLinecap="butt"
              style={{ transition: 'stroke-width .15s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)} />
          )
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', letterSpacing: '.04em', textTransform: 'uppercase' }}>
          {hover != null ? data[hover].label : centerTop}
        </div>
        <div style={{ fontSize: 21, fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>
          {hover != null ? fmtCompact(data[hover].value, currency) : centerBottom}
        </div>
      </div>
    </div>
  )
}

// ── Bars ──────────────────────────────────────────────────
interface BarSeries { label: string; income: number; expense: number }
interface BarsProps {
  series:          BarSeries[]
  height?:         number
  showIncome?:     boolean
  showComparison?: boolean   // muestra % cambio de gasto vs mes anterior
}

export function Bars({ series, height = 220, showIncome = true, showComparison = false }: BarsProps) {
  const currency  = useFinance(s => s.currency)
  const [m, setM] = useState(false)
  useEffect(() => { const t = setTimeout(() => setM(true), 40); return () => clearTimeout(t) }, [])
  const max     = Math.max(1, ...series.map(s => Math.max(showIncome ? s.income : 0, s.expense)))
  const niceMax = max * 1.12

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, padding: '0 2px' }}>
      {series.map((s, i) => {
        const prev   = series[i - 1]
        const change = showComparison && prev && prev.expense > 0
          ? Math.round(((s.expense - prev.expense) / prev.expense) * 100)
          : null

        return (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%', height: '100%', justifyContent: 'center' }}>
              {showIncome && (
                <div title={fmt(s.income, currency)} style={{ width: '42%', maxWidth: 18,
                  borderRadius: '4px 4px 2px 2px', background: 'var(--income)',
                  height: m ? `${(s.income / niceMax) * 100}%` : 0,
                  minHeight: s.income > 0 && m ? 3 : 0,
                  transition: 'height .55s cubic-bezier(.22,1,.36,1)' }} />
              )}
              <div title={fmt(s.expense, currency)} style={{ width: '42%', maxWidth: 18,
                borderRadius: '4px 4px 2px 2px', background: 'var(--expense)',
                height: m ? `${(s.expense / niceMax) * 100}%` : 0,
                minHeight: s.expense > 0 && m ? 3 : 0,
                transition: 'height .55s cubic-bezier(.22,1,.36,1)' }} />
            </div>
            {/* comparativa % vs mes anterior */}
            {change !== null && (
              <div style={{
                fontSize: 9, fontVariantNumeric: 'tabular-nums', marginTop: 4,
                color: change > 5 ? 'var(--expense)' : change < -5 ? 'var(--income)' : 'var(--text-dim)',
                fontWeight: 600, lineHeight: 1,
              }}>
                {change > 0 ? '+' : ''}{change}%
              </div>
            )}
            <div style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: change !== null ? 3 : 8,
              textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
              {String(s.label).replace('.', '')}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── AreaLine ──────────────────────────────────────────────
interface AreaLineProps {
  points: number[]
  height?: number
  color?:  string
  fill?:   boolean
}

export function AreaLine({ points, height = 120, color = 'var(--accent)', fill = true }: AreaLineProps) {
  const W = 100, H = 100
  const max   = Math.max(1, ...points)
  const min   = Math.min(...points, 0)
  const range = max - min || 1
  const step  = points.length > 1 ? W / (points.length - 1) : W
  const coords = points.map((p, i) => [i * step, H - ((p - min) / range) * H])
  const line   = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ')
  const area   = `${line} L${W},${H} L0,${H} Z`
  const gid    = `ag${Math.random().toString(36).slice(2, 7)}`

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${W} ${H}`}
         preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} />}
      <path d={line} fill="none" stroke={color} strokeWidth="2"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// ── Progress ──────────────────────────────────────────────
interface ProgressProps {
  value:   number
  max:     number
  color?:  string
  height?: number
}

export function Progress({ value, max, color = 'var(--accent)', height = 8 }: ProgressProps) {
  const pct  = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  const over = value > max && max > 0
  return (
    <div style={{ background: 'var(--track)', borderRadius: 999, height, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999,
        background: over ? 'var(--expense)' : color,
        transition: 'width .5s ease' }} />
    </div>
  )
}
