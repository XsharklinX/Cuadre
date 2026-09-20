import { fmt, fmtCompact } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import type { CurrencyCode } from '@/types'

/** Devuelve una función de formato que respeta el setting "Números resumidos". */
export function useFmt() {
  const compact = useSettings(s => s.compactNumbers)
  return (n: number, currency: CurrencyCode | string) =>
    compact ? fmtCompact(n, currency as CurrencyCode) : fmt(n, currency as CurrencyCode)
}
