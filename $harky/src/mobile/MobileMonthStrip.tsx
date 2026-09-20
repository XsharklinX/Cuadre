import { useEffect, useRef } from 'react'
import { shortMonth } from '@/data/helpers'

export function MobileMonthStrip({
  keys,
  active,
  locale,
  onSelect,
}: {
  keys: string[]
  active: string
  locale: string
  onSelect: (key: string) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = trackRef.current?.querySelector<HTMLElement>(`[data-key="${active}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [active])

  return (
    <div className="mobile-month-strip" ref={trackRef}>
      {keys.map(key => {
        const year = key.slice(0, 4)
        return (
          <button
            key={key}
            data-key={key}
            className={`mobile-month-chip${key === active ? ' on' : ''}`}
            onClick={() => onSelect(key)}
          >
            <span className="mobile-month-chip-month">{shortMonth(key, locale)}</span>
            <span className="mobile-month-chip-year">{year}</span>
          </button>
        )
      })}
    </div>
  )
}
