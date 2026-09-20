import { useState, useEffect, useRef } from 'react'
import { useFinance } from '@/store/finance'
import { fmt, fmtCompact } from '@/data/helpers'
import type { CurrencyCode } from '@/types'

interface Props {
  value:     number
  compact?:  boolean
  decimals?: number
  style?:    React.CSSProperties
  className?: string
  /** Divisa a mostrar; por defecto la divisa base de la app. */
  currency?: CurrencyCode
}

export function AnimatedMoney({ value, compact, decimals, style, className, currency: currencyOverride }: Props) {
  const baseCurrency = useFinance(s => s.currency)
  const currency = currencyOverride ?? baseCurrency
  const [disp, setDisp] = useState(0)
  const from = useRef(0)

  useEffect(() => {
    const start = from.current, end = value
    if (start === end) { setDisp(end); return }
    const dur = 650, t0 = performance.now()
    let raf: number
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur)
      const e = 1 - Math.pow(1 - p, 3)
      setDisp(start + (end - start) * e)
      if (p < 1) raf = requestAnimationFrame(tick)
      else { from.current = end; setDisp(end) }
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = value }
  }, [value])

  const text = compact ? fmtCompact(disp, currency) : fmt(disp, currency, { decimals })
  return (
    <span style={{ fontVariantNumeric: 'tabular-nums', ...style }} className={className}>
      {text}
    </span>
  )
}
