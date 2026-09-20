import { describe, expect, it } from 'vitest'
import { deriveQuickAdds } from './quickAdds'
import type { Transaction } from '@/types'

const tx = (over: Partial<Transaction> = {}): Transaction => ({
  id: Math.random().toString(36).slice(2), type: 'expense', amount: 120, date: '2026-07-01',
  note: 'Café', accountId: 'acc_1', categoryId: 'cat_food', ...over,
})

const repeat = (n: number, over: Partial<Transaction> = {}) =>
  Array.from({ length: n }, (_, i) => tx({ ...over, date: `2026-0${(i % 9) + 1}-05` }))

describe('deriveQuickAdds', () => {
  it('ignora lo que no se repite lo suficiente', () => {
    expect(deriveQuickAdds(repeat(2))).toHaveLength(0)
    expect(deriveQuickAdds(repeat(3))).toHaveLength(1)
  })

  it('rellena el monto cuando siempre es el mismo', () => {
    const [q] = deriveQuickAdds(repeat(4, { amount: 120 }))
    expect(q.amount).toBe(120)
    expect(q.uses).toBe(4)
  })

  it('deja el monto vacío cuando varía mucho (el súper)', () => {
    const rows = [
      tx({ note: 'Súper', amount: 1200 }), tx({ note: 'Súper', amount: 3400 }),
      tx({ note: 'Súper', amount: 800 }), tx({ note: 'Súper', amount: 2600 }),
    ]
    const [q] = deriveQuickAdds(rows)
    expect(q.amount).toBeNull()
  })

  it('tolera variaciones pequeñas y usa la mediana', () => {
    const rows = [
      tx({ note: 'Uber', amount: 250 }), tx({ note: 'Uber', amount: 255 }),
      tx({ note: 'Uber', amount: 245 }),
    ]
    const [q] = deriveQuickAdds(rows)
    expect(q.amount).toBe(250)
  })

  it('agrupa ignorando tildes, números y mayúsculas de la nota', () => {
    const rows = [
      tx({ note: 'Cafe 1' }), tx({ note: 'CAFÉ' }), tx({ note: 'café  2' }),
    ]
    expect(deriveQuickAdds(rows)).toHaveLength(1)
  })

  it('separa por categoría, cuenta y tipo', () => {
    const rows = [
      ...repeat(3, { note: 'Pago', categoryId: 'a' }),
      ...repeat(3, { note: 'Pago', categoryId: 'b' }),
      ...repeat(3, { note: 'Pago', categoryId: 'a', type: 'income' }),
    ]
    expect(deriveQuickAdds(rows)).toHaveLength(3)
  })

  it('excluye transferencias', () => {
    const rows = repeat(4, { type: 'transfer', note: 'Ahorro' })
    expect(deriveQuickAdds(rows)).toHaveLength(0)
  })

  it('ordena por uso y respeta el límite', () => {
    const rows = [...repeat(3, { note: 'Poco' }), ...repeat(6, { note: 'Mucho' })]
    const list = deriveQuickAdds(rows, 1)
    expect(list).toHaveLength(1)
    expect(list[0].note).toBe('Mucho')
  })

  it('usa la nota más reciente como texto a rellenar (misma cosa, otra grafía)', () => {
    const rows = [
      tx({ note: 'cafe', date: '2026-01-01' }),
      tx({ note: 'CAFE', date: '2026-02-01' }),
      tx({ note: 'Café', date: '2026-07-01' }),
    ]
    const [q] = deriveQuickAdds(rows)
    expect(q.note).toBe('Café')
    expect(q.uses).toBe(3)
  })
})
