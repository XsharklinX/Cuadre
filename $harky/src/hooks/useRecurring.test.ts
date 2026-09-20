import { describe, expect, it } from 'vitest'
import { advanceRecurrenceDate, firstRecurrenceDate, isOccurrenceGenerated } from './useRecurring'
import type { Transaction } from '@/types'

describe('advanceRecurrenceDate (fechas de recurrentes)', () => {
  it('semanal: siempre +7 días', () => {
    expect(advanceRecurrenceDate('2026-07-09', 'weekly')).toBe('2026-07-16')
    expect(advanceRecurrenceDate('2026-07-28', 'weekly')).toBe('2026-08-04') // cruza mes
    expect(advanceRecurrenceDate('2026-12-29', 'weekly')).toBe('2027-01-05') // cruza año
  })

  it('mensual: mismo día del mes siguiente', () => {
    expect(advanceRecurrenceDate('2026-07-15', 'monthly')).toBe('2026-08-15')
    expect(advanceRecurrenceDate('2026-12-15', 'monthly')).toBe('2027-01-15') // cruza año
  })

  it('mensual en día 1 y día 28 (siempre existen)', () => {
    expect(advanceRecurrenceDate('2026-07-01', 'monthly')).toBe('2026-08-01')
    expect(advanceRecurrenceDate('2026-01-28', 'monthly')).toBe('2026-02-28')
  })

  it('mensual día 31: recorta al último día del mes corto, NO se salta el mes', () => {
    // Antes 31-ene → 3-mar (febrero desaparecía). Ahora cae en el 28.
    expect(advanceRecurrenceDate('2026-01-31', 'monthly')).toBe('2026-02-28')
    // 2028 es bisiesto → 29 de febrero.
    expect(advanceRecurrenceDate('2028-01-31', 'monthly')).toBe('2028-02-29')
    // 31-mar → 30-abr (abril no tiene 31).
    expect(advanceRecurrenceDate('2026-03-31', 'monthly')).toBe('2026-04-30')
    // 30-nov → 31-dic (diciembre sí tiene 30; se conserva el día).
    expect(advanceRecurrenceDate('2026-11-30', 'monthly')).toBe('2026-12-30')
  })
})

describe('firstRecurrenceDate (primera ocurrencia de una plantilla)', () => {
  const base: Transaction = {
    id: 't1', type: 'expense', amount: 100, date: '2026-07-01',
    note: 'Netflix', categoryId: 'c1', accountId: 'a1',
    recurring: 'monthly', recurringStart: '2026-07-01',
  }

  it('usa recurringNext cuando existe', () => {
    expect(firstRecurrenceDate({ ...base, recurringNext: '2026-09-01' })).toBe('2026-09-01')
  })

  it('sin recurringNext, avanza desde recurringStart', () => {
    expect(firstRecurrenceDate(base)).toBe('2026-08-01')
  })

  it('sin recurringStart, avanza desde la fecha del movimiento', () => {
    const tx = { ...base, recurringStart: undefined, date: '2026-07-10' }
    expect(firstRecurrenceDate(tx)).toBe('2026-08-10')
  })

  it('respeta la frecuencia semanal', () => {
    const tx = { ...base, recurring: 'weekly' as const, recurringStart: '2026-07-06' }
    expect(firstRecurrenceDate(tx)).toBe('2026-07-13')
  })
})

describe('isOccurrenceGenerated (idempotencia de la generación recurrente)', () => {
  const template: Transaction = {
    id: 'tpl1', type: 'expense', amount: 100, date: '2026-07-01',
    note: 'Netflix', categoryId: 'c1', accountId: 'a1', recurring: 'monthly',
  }

  it('false cuando no hay ninguna ocurrencia para esa fecha', () => {
    expect(isOccurrenceGenerated(template, '2026-08-01', [])).toBe(false)
  })

  it('true via generatedFrom (el vínculo robusto, sobrevive a editar la plantilla)', () => {
    const occurrence: Transaction = {
      id: 't2', type: 'expense', amount: 100, date: '2026-08-01',
      note: 'Netflix (nombre editado luego)', categoryId: 'other', accountId: 'other',
      generatedFrom: 'tpl1',
    }
    expect(isOccurrenceGenerated(template, '2026-08-01', [occurrence])).toBe(true)
  })

  it('true via matching por contenido (compatibilidad con ocurrencias generadas antes de generatedFrom)', () => {
    const legacyOccurrence: Transaction = {
      id: 't3', type: 'expense', amount: 100, date: '2026-08-01',
      note: 'Netflix', categoryId: 'c1', accountId: 'a1',
    }
    expect(isOccurrenceGenerated(template, '2026-08-01', [legacyOccurrence])).toBe(true)
  })

  it('false cuando hay una transacción no relacionada en la misma fecha', () => {
    const unrelated: Transaction = {
      id: 't4', type: 'expense', amount: 50, date: '2026-08-01',
      note: 'Otra cosa', categoryId: 'other', accountId: 'other', generatedFrom: 'tpl2',
    }
    expect(isOccurrenceGenerated(template, '2026-08-01', [unrelated])).toBe(false)
  })

  it('permite consultar el historial de ejecución de una plantilla', () => {
    const txns: Transaction[] = [
      { id: 't1', type: 'expense', amount: 100, date: '2026-06-01', note: 'Netflix', accountId: 'a1', generatedFrom: 'tpl1' },
      { id: 't2', type: 'expense', amount: 100, date: '2026-07-01', note: 'Netflix', accountId: 'a1', generatedFrom: 'tpl1' },
      { id: 't3', type: 'expense', amount: 20, date: '2026-07-05', note: 'Otro gasto', accountId: 'a1' },
    ]
    expect(txns.filter(t => t.generatedFrom === 'tpl1')).toHaveLength(2)
  })
})
