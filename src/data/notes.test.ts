import { describe, expect, it } from 'vitest'
import { APP_NAME } from '@/data/release'
import { itemLineTotal, noteProgress, noteShareText, noteTotals, orderedItems, type Note, type NoteItem, budgetState, budgetLeft } from './notes'

const item = (over: Partial<NoteItem>): NoteItem => ({ id: over.id ?? 'i', text: 'x', done: false, ...over })

const note = (over: Partial<Note>): Note => ({
  id: 'n', title: 'Compra', type: 'shopping', items: [], color: '#fff', icon: 'cart',
  createdAt: 0, updatedAt: 0, ...over,
})

describe('itemLineTotal', () => {
  it('precio × cantidad (cantidad mínima 1)', () => {
    expect(itemLineTotal(item({ price: 180, qty: 3 }))).toBe(540)
    expect(itemLineTotal(item({ price: 380 }))).toBe(380)
    expect(itemLineTotal(item({ price: 380, qty: 0 }))).toBe(380)
  })
  it('sin precio = 0', () => {
    expect(itemLineTotal(item({}))).toBe(0)
  })
})

describe('noteTotals', () => {
  it('reparte total en comprado y falta', () => {
    const n = note({ items: [
      item({ id: 'a', price: 380, done: true }),
      item({ id: 'b', price: 320, qty: 2, done: true }),  // 640
      item({ id: 'c', price: 295, done: false }),
    ] })
    const t = noteTotals(n)
    expect(t.total).toBe(380 + 640 + 295)
    expect(t.bought).toBe(380 + 640)
    expect(t.remaining).toBe(295)
    expect(t.boughtCount).toBe(2)
    expect(t.totalCount).toBe(3)
    expect(t.pricedCount).toBe(3)
  })

  it('ítems sin precio no rompen el total (checklist mixta)', () => {
    const n = note({ items: [item({ id: 'a', price: 100, done: true }), item({ id: 'b', done: false })] })
    const t = noteTotals(n)
    expect(t.total).toBe(100)
    expect(t.pricedCount).toBe(1)
    expect(t.totalCount).toBe(2)
  })
})

describe('noteProgress', () => {
  it('por dinero cuando hay precios', () => {
    const n = note({ items: [item({ id: 'a', price: 100, done: true }), item({ id: 'b', price: 300, done: false })] })
    expect(noteProgress(n)).toBeCloseTo(0.25)
  })
  it('por conteo cuando no hay precios (checklist)', () => {
    const n = note({ type: 'checklist', items: [item({ id: 'a', done: true }), item({ id: 'b', done: false }), item({ id: 'c', done: false })] })
    expect(noteProgress(n)).toBeCloseTo(1 / 3)
  })
  it('lista vacía = 0', () => {
    expect(noteProgress(note({ items: [] }))).toBe(0)
  })
})

describe('orderedItems', () => {
  it('manda los comprados al fondo y sube los imprescindibles pendientes', () => {
    const items = [
      item({ id: 'a', text: 'normal-pendiente' }),
      item({ id: 'b', text: 'comprado', done: true }),
      item({ id: 'c', text: 'imprescindible', important: true }),
      item({ id: 'd', text: 'otro-pendiente' }),
    ]
    const ids = orderedItems(items).map(i => i.id)
    expect(ids).toEqual(['c', 'a', 'd', 'b'])
  })
  it('es estable entre empates (no reordena lo que ya está igual)', () => {
    const items = [item({ id: 'x' }), item({ id: 'y' }), item({ id: 'z' })]
    expect(orderedItems(items).map(i => i.id)).toEqual(['x', 'y', 'z'])
  })
  it('un imprescindible ya comprado no salta al tope (sigue al fondo)', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', important: true, done: true })]
    expect(orderedItems(items).map(i => i.id)).toEqual(['a', 'b'])
  })
})

describe('noteShareText', () => {
  const money = (n: number) => `RD$${n.toLocaleString('en-US')}`

  it('lista de compras con precios y total', () => {
    const n = note({ title: 'Compra del súper', items: [
      item({ id: 'a', text: 'Arroz 5 lb', price: 380, done: true }),
      item({ id: 'b', text: 'Café', price: 180, qty: 3, done: false }),
    ] })
    const text = noteShareText(n, money, { withPrices: true })
    expect(text).toContain('🛒 Compra del súper')
    expect(text).toContain('☑ Arroz 5 lb — RD$380')
    expect(text).toContain('▢ Café ×3 — RD$540')
    expect(text).toContain('Total estimado: RD$920')
    expect(text).toContain(`Hecho con ${APP_NAME}`)
  })

  it('sin precios: solo nombres, sin total', () => {
    const n = note({ items: [item({ id: 'a', text: 'Arroz', price: 380 })] })
    const text = noteShareText(n, money, { withPrices: false, brand: false })
    expect(text).toContain('▢ Arroz')
    expect(text).not.toContain('RD$')
    expect(text).not.toContain('Total estimado')
  })

  it('nota de texto libre comparte el body', () => {
    const n = note({ type: 'note', title: 'Idea', body: 'Comprar regalo de Ana', items: [] })
    const text = noteShareText(n, money)
    expect(text).toContain('Idea')
    expect(text).toContain('Comprar regalo de Ana')
  })
})

describe('tope de gasto de una lista', () => {
  const lista = (items: Array<{ price?: number; qty?: number }>, budget?: number): Note => ({
    id: 'n1', title: 'Super', type: 'shopping', color: '#fff', icon: 'cart',
    createdAt: 0, updatedAt: 0, budget,
    items: items.map((it, i) => ({ id: `i${i}`, text: `x${i}`, done: false, ...it })),
  })

  it('sin tope no opina', () => {
    expect(budgetState(lista([{ price: 500 }]))).toBe('none')
    expect(budgetState(lista([{ price: 500 }], 0))).toBe('none')
    expect(budgetLeft(lista([{ price: 500 }]))).toBeNull()
  })

  it('holgado', () => {
    expect(budgetState(lista([{ price: 1_000 }], 3_000))).toBe('ok')
    expect(budgetLeft(lista([{ price: 1_000 }], 3_000))).toBe(2_000)
  })

  it('avisa cuando queda poco margen', () => {
    expect(budgetState(lista([{ price: 2_800 }], 3_000))).toBe('close')
  })

  it('pasado de tope', () => {
    expect(budgetState(lista([{ price: 3_400 }], 3_000))).toBe('over')
    expect(budgetLeft(lista([{ price: 3_400 }], 3_000))).toBe(-400)
  })

  /*
   * Se mide contra el TOTAL estimado, no contra lo ya marcado: la pregunta es
   * "me alcanza para todo esto", y responderla con lo que ya echaste al
   * carrito llegaria siempre tarde — en la caja.
   */
  it('cuenta todo lo de la lista, no solo lo ya marcado', () => {
    const n = lista([{ price: 1_000 }, { price: 2_500 }], 3_000)
    expect(budgetState(n)).toBe('over')
  })

  it('las cantidades cuentan', () => {
    expect(budgetState(lista([{ price: 500, qty: 8 }], 3_000))).toBe('over')
  })
})
