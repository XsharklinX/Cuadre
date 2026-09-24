import { describe, expect, it } from 'vitest'
import { MAX_SUGGESTIONS, noteSuggestions, normalizeNote } from './noteSuggestions'
import type { Transaction } from '@/types'

const HOY = '2026-09-23'

const tx = (over: Partial<Transaction> & { note: string }): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: 'expense',
  amount: 100,
  date: HOY,
  categoryId: 'cat_casa',
  accountId: 'a1',
  ...over,
})

const textos = (r: ReturnType<typeof noteSuggestions>) => r.map(s => s.text)

describe('sugerencias de concepto', () => {
  it('devuelve lo que ya se escribio, sin repetir', () => {
    const r = noteSuggestions({
      transactions: [tx({ note: 'Altice' }), tx({ note: 'Altice' }), tx({ note: 'Internet' })],
      today: HOY,
    })
    expect(textos(r)).toEqual(['Altice', 'Internet'])
  })

  it('lo mas usado va primero', () => {
    const r = noteSuggestions({
      transactions: [
        tx({ note: 'Internet' }),
        tx({ note: 'Altice' }), tx({ note: 'Altice' }), tx({ note: 'Altice' }),
      ],
      today: HOY,
    })
    expect(textos(r)[0]).toBe('Altice')
  })

  /** Lo que escribiste en Vivienda casi nunca sirve en Restaurantes. */
  it('la categoria activa manda sobre la frecuencia', () => {
    const r = noteSuggestions({
      transactions: [
        tx({ note: 'Alquiler', categoryId: 'cat_casa' }),
        tx({ note: 'Alquiler', categoryId: 'cat_casa' }),
        tx({ note: 'Alquiler', categoryId: 'cat_casa' }),
        tx({ note: 'Pizza', categoryId: 'cat_comida' }),
      ],
      categoryId: 'cat_comida',
      today: HOY,
    })
    expect(textos(r)[0]).toBe('Pizza')
  })

  it('pero lo de otras categorias sigue apareciendo despues', () => {
    const r = noteSuggestions({
      transactions: [
        tx({ note: 'Alquiler', categoryId: 'cat_casa' }),
        tx({ note: 'Pizza', categoryId: 'cat_comida' }),
      ],
      categoryId: 'cat_comida',
      today: HOY,
    })
    expect(textos(r)).toEqual(['Pizza', 'Alquiler'])
  })

  it('filtra por lo que llevas tecleado', () => {
    const r = noteSuggestions({
      transactions: [tx({ note: 'Supermercado Nacional' }), tx({ note: 'Internet' })],
      query: 'sup',
      today: HOY,
    })
    expect(textos(r)).toEqual(['Supermercado Nacional'])
  })

  it('el filtro ignora acentos y mayusculas', () => {
    const r = noteSuggestions({
      transactions: [tx({ note: 'Gasa estéril' })],
      query: 'ESTERIL',
      today: HOY,
    })
    expect(textos(r)).toEqual(['Gasa estéril'])
  })

  it('agrupa variantes y muestra la mas escrita', () => {
    const r = noteSuggestions({
      transactions: [tx({ note: 'altice' }), tx({ note: 'Altice' }), tx({ note: 'Altice' })],
      today: HOY,
    })
    expect(textos(r)).toEqual(['Altice'])
    expect(r[0].uses).toBe(3)
  })

  /**
   * Las transferencias llevan una nota que pone la APP, no el usuario.
   * Ofrecerlas seria devolverle texto que nunca escribio.
   */
  it('ignora las transferencias', () => {
    const r = noteSuggestions({
      transactions: [
        { id: 't', type: 'transfer', amount: 1, date: HOY, note: 'Pago tarjeta', fromAccount: 'a', toAccount: 'b' },
        tx({ note: 'Altice' }),
      ],
      today: HOY,
    })
    expect(textos(r)).toEqual(['Altice'])
  })

  it('a igual uso, gana lo mas reciente', () => {
    const r = noteSuggestions({
      transactions: [
        tx({ note: 'Viejo', date: '2026-01-01' }),
        tx({ note: 'Nuevo', date: HOY }),
      ],
      today: HOY,
    })
    expect(textos(r)[0]).toBe('Nuevo')
  })

  it('pero la frecuencia pesa mas que la recencia', () => {
    const r = noteSuggestions({
      transactions: [
        tx({ note: 'Nuevo', date: HOY }),
        tx({ note: 'Repetido', date: '2026-01-01' }),
        tx({ note: 'Repetido', date: '2026-01-02' }),
      ],
      today: HOY,
    })
    expect(textos(r)[0]).toBe('Repetido')
  })

  it('no devuelve mas de las que caben', () => {
    const muchas = Array.from({ length: 30 }, (_, i) => tx({ note: `Concepto ${i}` }))
    expect(noteSuggestions({ transactions: muchas, today: HOY })).toHaveLength(MAX_SUGGESTIONS)
  })

  it('ignora conceptos vacios o solo espacios', () => {
    const r = noteSuggestions({
      transactions: [tx({ note: '   ' }), tx({ note: '' }), tx({ note: 'Altice' })],
      today: HOY,
    })
    expect(textos(r)).toEqual(['Altice'])
  })

  it('sin movimientos no inventa nada', () => {
    expect(noteSuggestions({ transactions: [], today: HOY })).toEqual([])
  })

  it('normalizeNote quita acentos y mayusculas', () => {
    expect(normalizeNote('  Gasa ESTÉRIL ')).toBe('gasa esteril')
  })
})
