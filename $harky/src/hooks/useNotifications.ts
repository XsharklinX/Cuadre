import { useEffect } from 'react'
import { toast } from '@/components/ui/Toast'
import { amountForCategory, currentMonthKey, fmtCompact, txForMonth } from '@/data/helpers'
import { tt } from '@/i18n'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'

const NOTIFIED_KEY = 'sharky-notified-v2'

/**
 * Alertas proactivas de presupuesto. Cuando un gasto cruza uno de los umbrales
 * configurados (`budgetAlertThresholds`, p.ej. 50/80/100%), avisa una sola vez
 * por categoría/umbral/mes:
 *  - app en primer plano → toast in-app (sin permisos, en todas las plataformas).
 *  - app oculta y permiso concedido → notificación del sistema.
 * El dedup es compartido entre ambos canales para no avisar dos veces.
 */
export function useNotifications(): void {
  const { transactions, categories, currency } = useFinance()
  const thresholds = useSettings(state => state.budgetAlertThresholds)

  useEffect(() => {
    const curKey = currentMonthKey()
    const monthTx = txForMonth(transactions, curKey)
    const notified: Record<string, string[]> = JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '{}')
    const done = new Set(notified[curKey] ?? [])

    // Por categoría, qué umbrales nuevos se cruzaron (y el más alto, para el aviso)
    const crossings = categories.flatMap(cat => {
      if (cat.type !== 'expense' || !cat.budget) return []
      const spent = monthTx
        .filter(tx => tx.type === 'expense')
        .reduce((sum, tx) => sum + amountForCategory(tx, cat.id), 0)
      const crossed = thresholds.filter(threshold => {
        const reached = threshold >= 100 ? spent > cat.budget * threshold / 100 : spent >= cat.budget * threshold / 100
        return reached && !done.has(`${cat.id}:${threshold}`)
      })
      if (!crossed.length) return []
      const top = Math.max(...crossed)
      return [{
        cat, spent, top,
        pct: Math.round(spent / cat.budget * 100),
        keys: crossed.map(threshold => `${cat.id}:${threshold}`),
      }]
    })
    if (!crossings.length) return

    const useSystem = document.hidden && 'Notification' in window && Notification.permission === 'granted'

    crossings.forEach(({ cat, spent, top, pct }) => {
      const vars = { name: cat.name, pct, threshold: top, spent: fmtCompact(spent, currency), budget: fmtCompact(cat.budget, currency) }
      if (useSystem) {
        new Notification(tt('budgetNotifTitle', { name: cat.name }), {
          body: tt(top >= 100 ? 'budgetExceededBody' : 'budgetThresholdBody', vars),
          icon: '/icons/icon-192.png',
          tag: `budget-${cat.id}-${top}-${curKey}`,
        })
      } else {
        toast(tt(top >= 100 ? 'budgetExceededToast' : 'budgetWarnToast', vars), { icon: 'alert' })
      }
    })

    notified[curKey] = [...(notified[curKey] ?? []), ...crossings.flatMap(c => c.keys)]
    localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified))
  }, [categories, currency, thresholds, transactions])
}
