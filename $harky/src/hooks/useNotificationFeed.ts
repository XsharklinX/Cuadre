import { useCallback, useMemo } from 'react'
import { getMobileAlerts, type MobileAlert } from '@/data/alerts'
import { useBankSuggestions, type BankSuggestion } from '@/store/bankSuggestions'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useNotificationCenter } from '@/store/notificationCenter'

export interface NotificationFeed {
  /** Sugerencias de transacciones detectadas por notificación bancaria (accionables). */
  suggestions: BankSuggestion[]
  /** Avisos financieros: presupuestos excedidos y pagos recurrentes próximos. */
  alerts: MobileAlert[]
  /** Cuántos elementos no se han visto todavía — alimenta el numerito de la campanita. */
  unseenCount: number
  /** Total de elementos en la campanita (vistos o no). */
  total: number
  /** Marca todo lo actual como visto (se llama al abrir la campanita). */
  markAllSeen: () => void
}

/**
 * Reúne las dos fuentes del centro de notificaciones (campanita): las
 * transacciones detectadas por avisos bancarios y los avisos financieros
 * (presupuesto/recurrentes). Lo usan la barra superior (para el numerito) y el
 * propio centro. El "no visto" se calcula contra los ids ya marcados.
 */
export function useNotificationFeed(): NotificationFeed {
  const transactions = useFinance(s => s.transactions)
  const categories = useFinance(s => s.categories)
  const currency = useFinance(s => s.currency)
  const lang = useSettings(s => s.language)
  const suggestions = useBankSuggestions(s => s.items)
  const seenIds = useNotificationCenter(s => s.seenIds)
  const markSeen = useNotificationCenter(s => s.markSeen)
  const dismissedAlerts = useSettings(s => s.dismissedAlerts)
  const silencedRecurring = useSettings(s => s.silencedRecurring)

  const locale = lang === 'es' ? 'es-DO' : 'en-US'

  const alerts = useMemo(
    () => getMobileAlerts(transactions, categories, currency, undefined, locale, dismissedAlerts, silencedRecurring),
    [transactions, categories, currency, locale, dismissedAlerts, silencedRecurring],
  )

  const allIds = useMemo(
    () => [...suggestions.map(s => s.id), ...alerts.map(a => a.id)],
    [suggestions, alerts],
  )

  const seen = useMemo(() => new Set(seenIds), [seenIds])
  const unseenCount = allIds.reduce((count, id) => (seen.has(id) ? count : count + 1), 0)

  const markAllSeen = useCallback(() => markSeen(allIds), [markSeen, allIds])

  return { suggestions, alerts, unseenCount, total: allIds.length, markAllSeen }
}
