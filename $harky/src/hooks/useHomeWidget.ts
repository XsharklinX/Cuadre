import { useEffect, useRef } from 'react'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { syncHomeWidgetSnapshot } from '@/lib/homeWidget'

/**
 * Mantiene sincronizado el snapshot que lee el widget de pantalla de inicio
 * (saldo, presupuesto, próximo pago). No-op fuera de Android+Tauri.
 */
export function useHomeWidget(): void {
  const accounts = useFinance(s => s.accounts)
  const transactions = useFinance(s => s.transactions)
  const categories = useFinance(s => s.categories)
  const currency = useFinance(s => s.currency)
  const language = useSettings(s => s.language)
  const widgetAccountIds = useSettings(s => s.widgetAccountIds)
  const isFirstSync = useRef(true)

  useEffect(() => {
    const delay = isFirstSync.current ? 0 : 1500
    isFirstSync.current = false
    const id = setTimeout(() => { void syncHomeWidgetSnapshot() }, delay)
    return () => clearTimeout(id)
  }, [accounts, transactions, categories, currency, language, widgetAccountIds])
}
