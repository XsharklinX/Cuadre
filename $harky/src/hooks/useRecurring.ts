import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui/Toast'
import { localToday } from '@/data/helpers'
import { tt } from '@/i18n'
import { useFinance } from '@/store/finance'
import type { RecurrenceFrequency, Transaction } from '@/types'

export function advanceRecurrenceDate(date: string, frequency: RecurrenceFrequency): string {
  const next = new Date(`${date}T00:00:00`)
  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7)
  } else {
    // Mensual: NO usar setMonth(+1) a secas — en día 29-31 desborda al mes
    // siguiente (31-ene → 3-mar), SALTÁNDOSE el mes corto: una suscripción del
    // día 31 no se generaría en febrero. Se fija el día 1 antes de avanzar y
    // luego se recorta al último día real del mes destino (31 → 28/30).
    const day = next.getDate()
    next.setDate(1)
    next.setMonth(next.getMonth() + 1)
    const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, lastDayOfMonth))
  }
  return localToday(next)
}

export function firstRecurrenceDate(tx: Transaction): string {
  return tx.recurringNext ?? advanceRecurrenceDate(tx.recurringStart ?? tx.date, tx.recurring ?? 'monthly')
}

/**
 * true si ya existe una ocurrencia generada de `template` para `date`.
 * Vínculo estable por `generatedFrom`, no una adivinanza por nota/cuenta/
 * categoría: sobrevive a que el usuario edite la plantilla después de
 * generar ocurrencias, y de paso sirve de historial de ejecución
 * (`transactions.filter(t => t.generatedFrom === template.id)`). El OR con
 * el matching por contenido es compatibilidad: ocurrencias generadas antes
 * de que existiera `generatedFrom` no lo tienen y no deben duplicarse.
 */
export function isOccurrenceGenerated(template: Transaction, date: string, transactions: Transaction[]): boolean {
  return transactions.some(tx => tx.date === date && (
    tx.generatedFrom === template.id
    || (tx.note === template.note && tx.categoryId === template.categoryId && tx.accountId === template.accountId)
  ))
}

export function useRecurring(): void {
  const addTx = useFinance(s => s.addTx)
  const updateTx = useFinance(s => s.updateTx)
  /**
   * Último día en que se generó. Sustituye al antiguo "ya corrí una vez":
   * ese guard hacía que la generación ocurriera SOLO al montar el componente.
   *
   * Consecuencia real: si dejabas la app abierta y cruzaba la medianoche, o
   * si volvía de segundo plano tres días después, no se generaba nada hasta
   * cerrarla y abrirla de nuevo. Con las ventanas de WorkManager que mide
   * este teléfono (jobs diferidos a 17h+), "volver a primer plano" es la
   * señal más fiable que tenemos.
   */
  const lastRunDay = useRef<string | null>(null)

  useEffect(() => {
    const run = () => {
      const day = localToday()
      if (lastRunDay.current === day) return
      lastRunDay.current = day
      generate()
    }

    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)

    function generate() {
    // Se lee del STORE, no del closure: el efecto se monta una vez y vuelve a
    // correr al pasar a primer plano, así que una lista capturada en el
    // primer render estaría vieja — y comprobar duplicados contra una lista
    // vieja es exactamente cómo se generan ocurrencias repetidas.
    const transactions = useFinance.getState().transactions
    const today = localToday()
    let created = 0
    let skipped = 0

    transactions.filter(tx => tx.recurring).forEach(template => {
      let next = firstRecurrenceDate(template)
      let generated = 0
      while (next <= today && (!template.recurringEnd || next <= template.recurringEnd) && generated < 24) {
        const exists = isOccurrenceGenerated(template, next, transactions)
        const isSkipped = template.skippedDates?.includes(next) ?? false
        if (!exists && !isSkipped) {
          // Un recurrente nunca debe poder tumbar el arranque: si el saldo no
          // alcanza (política "bloquear") lo saltamos y seguimos generando el resto.
          try {
            addTx({
              type: template.type, amount: template.amount, note: template.note,
              date: next, accountId: template.accountId, categoryId: template.categoryId,
              tags: template.tags, generatedFrom: template.id,
            })
            created++
          } catch {
            skipped++
          }
        }
        next = advanceRecurrenceDate(next, template.recurring!)
        generated++
      }
      if (next !== template.recurringNext) updateTx(template.id, { recurringNext: next })
    })

    if (created > 0) toast(
      tt(created > 1 ? 'recurringGeneratedMany' : 'recurringGeneratedOne', { n: created }),
      { icon: 'calendar', type: 'ok' },
    )
    if (skipped > 0) toast(
      tt(skipped > 1 ? 'recurringSkippedMany' : 'recurringSkippedOne', { n: skipped }),
      { icon: 'alert' },
    )
    }
    // Las dependencias se leen del store dentro de `generate`, y el guard por
    // día evita re-generar: montar este efecto una vez es suficiente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
