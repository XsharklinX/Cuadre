import { useEffect, useState } from 'react'
import { syncExchangeRates } from '@/data/exchangeRates'

/** Sincroniza tasas de cambio en vivo (con cache local) y re-renderiza si cambiaron. */
export function useLiveExchangeRates() {
  const [, bump] = useState(0)
  useEffect(() => {
    let cancelled = false
    syncExchangeRates().then(changed => {
      if (changed && !cancelled) bump(n => n + 1)
    })
    return () => { cancelled = true }
  }, [])
}
