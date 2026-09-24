import { describe, expect, it } from 'vitest'
import { STALE_DAYS, buildPriceMemory, fillableCount, suggestPrice } from './notePrices'
import type { Note, NoteItem } from './notes'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 9, 3)

const item = (text: string, over: Partial<NoteItem> = {}): NoteItem => ({
  id: `i_${text}`, text, done: true, price: 100, ...over,
})

const note = (items: NoteItem[], updatedAt = NOW): Note => ({
  id: 'n1', title: 'Super', type: 'shopping', items,
  color: '#fff', icon: 'cart', createdAt: updatedAt, updatedAt,
})

describe('memoria de precios', () => {
  it('recuerda lo que costo la ultima vez', () => {
    const index = buildPriceMemory([note([item('Pollo', { price: 280 })])])
    expect(suggestPrice(index, 'Pollo', NOW)?.price).toBe(280)
  })

  it('ignora acentos y mayusculas', () => {
    const index = buildPriceMemory([note([item('Plátano', { price: 45 })])])
    expect(suggestPrice(index, 'platano', NOW)?.price).toBe(45)
    expect(suggestPrice(index, 'PLATANO', NOW)?.price).toBe(45)
  })

  /*
   * Un item SIN marcar es un precio que se anoto, no uno que se pago.
   * Contarlo convertiria una estimacion optimista de hace tres meses en
   * "lo que costo".
   */
  it('solo cuenta lo que de verdad se compro', () => {
    const index = buildPriceMemory([note([item('Queso', { price: 300, done: false })])])
    expect(suggestPrice(index, 'Queso', NOW)).toBeNull()
  })

  it('descarta precios sin sentido', () => {
    const index = buildPriceMemory([
      note([item('A', { price: 0 }), item('B', { price: -5 }), item('C', { price: undefined })]),
    ])
    expect(suggestPrice(index, 'A', NOW)).toBeNull()
    expect(suggestPrice(index, 'B', NOW)).toBeNull()
    expect(suggestPrice(index, 'C', NOW)).toBeNull()
  })

  /**
   * GANA EL MAS RECIENTE, no el mas repetido: en un precio, lo ultimo que
   * pagaste es siempre mejor informacion que lo que pagaste mas veces.
   */
  it('se queda con el precio mas reciente', () => {
    const index = buildPriceMemory([
      note([item('Pollo', { price: 240 })], NOW - 40 * DAY),
      note([item('Pollo', { price: 285 })], NOW - 2 * DAY),
      note([item('Pollo', { price: 250 })], NOW - 30 * DAY),
    ])
    const found = suggestPrice(index, 'Pollo', NOW)
    expect(found?.price).toBe(285)
    expect(found?.seen).toBe(3)
  })

  it('no le afecta el orden en que lleguen las listas', () => {
    const viejo = note([item('Arroz', { price: 50 })], NOW - 30 * DAY)
    const nuevo = note([item('Arroz', { price: 62 })], NOW - 1 * DAY)
    expect(buildPriceMemory([viejo, nuevo]).get('arroz')?.price).toBe(62)
    expect(buildPriceMemory([nuevo, viejo]).get('arroz')?.price).toBe(62)
  })
})

describe('precios con polvo', () => {
  /*
   * Un total estimado que miente hace que la persona salga de casa con el
   * dinero justo y vuelva sin la mitad de la compra. Se ofrece igual —es mejor
   * que nada— pero avisando.
   */
  it('marca como viejo lo que pasa del umbral', () => {
    const index = buildPriceMemory([note([item('Leche', { price: 90 })], NOW - (STALE_DAYS + 1) * DAY)])
    expect(suggestPrice(index, 'Leche', NOW)?.stale).toBe(true)
  })

  it('lo reciente no se marca', () => {
    const index = buildPriceMemory([note([item('Leche', { price: 90 })], NOW - 3 * DAY)])
    expect(suggestPrice(index, 'Leche', NOW)?.stale).toBe(false)
  })
})

describe('cuanto se puede rellenar solo', () => {
  it('cuenta los que faltan y se conocen', () => {
    const index = buildPriceMemory([note([item('Pollo', { price: 280 }), item('Arroz', { price: 60 })])])
    const lista = note([
      item('Pollo', { price: undefined, done: false }),
      item('Arroz', { price: 55, done: false }),   // ya tiene precio: no cuenta
      item('Mangu', { price: undefined, done: false }),  // desconocido
    ])
    expect(fillableCount(index, lista)).toBe(1)
  })

  it('sin historial no ofrece nada', () => {
    expect(fillableCount(new Map(), note([item('X', { price: undefined })]))).toBe(0)
  })
})
