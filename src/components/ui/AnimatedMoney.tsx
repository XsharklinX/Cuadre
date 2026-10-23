import { useState, useEffect, useRef } from 'react'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { fmt } from '@/data/helpers'
import type { CurrencyCode } from '@/types'

interface Props {
  value:     number
  compact?:  boolean
  decimals?: number
  style?:    React.CSSProperties
  className?: string
  /** Divisa a mostrar; por defecto la divisa base de la app. */
  currency?: CurrencyCode
  /**
   * Encoge la letra cuando la cifra es larga, para que quepa entera.
   *
   * Solo donde el hueco es fijo y estrecho — las tres columnas del resumen —
   * no en una ficha donde la cifra manda y tiene sitio de sobra.
   */
  fit?: boolean
}

/**
 * CUÁNTO HAY QUE ENCOGER LA LETRA PARA QUE QUEPA.
 *
 * Una app de dinero no puede recortar una cifra de dinero. «RD$ 1,166,62…» no
 * se puede leer y, peor, se puede leer MAL: parecen cien mil menos de los que
 * son. Antes esto se intentó bajando la letra de 15px a 13.5px, que aguantó
 * hasta que aparecieron los millones.
 *
 * Se calcula por LONGITUD DEL TEXTO, no midiendo la caja: el número ya está
 * formateado aquí, así que sale de una resta en vez de un ciclo de medir y
 * repintar. Y al ser un factor relativo (`em`) se compone con el tamaño que
 * ponga el CSS y con la escala de letra de accesibilidad de la app, en vez de
 * pelearse con ellos.
 */
export function fitScale(text: string): number {
  const n = text.length
  if (n <= 13) return 1
  if (n <= 15) return 0.92
  if (n <= 17) return 0.84
  if (n <= 19) return 0.76
  return 0.7
}

export function AnimatedMoney({ value, compact, decimals, style, className, currency: currencyOverride, fit }: Props) {
  const baseCurrency = useFinance(s => s.currency)
  const currency = currencyOverride ?? baseCurrency
  // El enmascarado del modo privado lo aplica `fmt`, pero hay que suscribirse
  // al ajuste para repintar al encenderlo: sin esto la cifra se quedaba a la
  // vista hasta que algo ajeno forzara un render.
  useSettings(s => s.privacyMode)
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

  // `compact` = el usuario pidio ocultar los centavos. Antes llamaba a
  // `fmtCompact`, que es un alias de `fmt` y por tanto SEGUIA mostrandolos.
  const text = fmt(disp, currency, { decimals: compact ? 0 : decimals })
  return (
    <span
      style={{
        fontVariantNumeric: 'tabular-nums',
        ...(fit ? { fontSize: `${fitScale(text)}em` } : {}),
        ...style,
      }}
      className={className}
    >
      {text}
    </span>
  )
}
