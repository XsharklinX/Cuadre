import { describe, expect, it } from 'vitest'
import { proactiveInsights } from './proactiveInsights'
import type { Category, Transaction } from '@/types'

const cat = (id: string, budget = 0): Category => ({ id, name: id, type: 'expense', color: '#fff', budget, icon: 'wallet' })
const tx = (id: string, categoryId: string, amount: number, date: string): Transaction =>
  ({ id, type: 'expense', amount, date, note: '', categoryId, accountId: 'a1' })

const base = {
  fmt: (n: number) => `RD$${n}`,
  translateCategory: (c: Category) => c.name,
}

describe('proactiveInsights', () => {
  it('avisa cuando ya te pasaste del presupuesto', () => {
    const r = proactiveInsights({
      ...base, mkey: '2026-08', today: '2026-08-20',
      categories: [cat('Comida', 5000)],
      txns: [tx('t1', 'Comida', 6000, '2026-08-10')],
    })
    const over = r.find(i => i.id.startsWith('budget-over'))
    expect(over).toBeTruthy()
    expect(over!.severity).toBe('warn')
    expect(over!.params.amount).toBe('RD$1000')
  })

  it('proyecta el día en que se agota el presupuesto al ritmo actual', () => {
    // Día 10 de agosto (31 días), gastó 4000 de 6000 → ritmo 400/día → agota en día 15.
    const r = proactiveInsights({
      ...base, mkey: '2026-08', today: '2026-08-10',
      categories: [cat('Comida', 6000)],
      txns: [tx('t1', 'Comida', 4000, '2026-08-05')],
    })
    const pace = r.find(i => i.id.startsWith('budget-pace'))
    expect(pace).toBeTruthy()
    expect(pace!.params.day).toBe(15)
  })

  it('detecta un pico de gasto vs el promedio de meses previos', () => {
    const r = proactiveInsights({
      ...base, mkey: '2026-08', today: '2026-08-25',
      categories: [cat('Ocio')],
      txns: [
        tx('p1', 'Ocio', 1000, '2026-05-10'),
        tx('p2', 'Ocio', 1000, '2026-06-10'),
        tx('p3', 'Ocio', 1000, '2026-07-10'),
        tx('c1', 'Ocio', 2000, '2026-08-10'), // 100% más que el promedio (1000)
      ],
    })
    expect(r.find(i => i.id.startsWith('spike'))).toBeTruthy()
  })

  it('sin presupuestos ni historial no genera avisos de presupuesto', () => {
    const r = proactiveInsights({
      ...base, mkey: '2026-08', today: '2026-08-10',
      categories: [cat('Comida')],
      txns: [tx('t1', 'Comida', 6000, '2026-08-10')],
    })
    expect(r.filter(i => i.id.startsWith('budget'))).toHaveLength(0)
  })

  it('ordena por urgencia (excedido antes que pico)', () => {
    const r = proactiveInsights({
      ...base, mkey: '2026-08', today: '2026-08-25',
      categories: [cat('Comida', 5000), cat('Ocio')],
      txns: [
        tx('o1', 'Ocio', 1000, '2026-06-10'),
        tx('o2', 'Ocio', 1000, '2026-07-10'),
        tx('c1', 'Ocio', 2000, '2026-08-10'),
        tx('f1', 'Comida', 6000, '2026-08-12'),
      ],
    })
    expect(r[0].id.startsWith('budget-over')).toBe(true)
  })
})
