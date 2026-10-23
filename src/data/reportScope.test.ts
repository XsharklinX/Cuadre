import { describe, expect, it } from 'vitest'
import { businessCategoryIds, canScope, scopeTransactions } from './reportScope'
import type { Business } from './business'
import type { Transaction } from '@/types'

const NEGOCIO: Business = {
  id: 'b1', name: 'Streaming', color: '#35d0a2', icon: 'play',
  incomeCategoryIds: ['cat_cobros'],
  expenseCategoryIds: ['cat_subs'],
  createdAt: 0,
}

let n = 0
function tx(over: Partial<Transaction> = {}): Transaction {
  n += 1
  return {
    id: `t${n}`, type: 'expense', amount: 100, date: '2026-10-05',
    note: 'x', categoryId: 'cat_comida', accountId: 'a1', ...over,
  } as Transaction
}

const LIBRO = [
  tx({ id: 'cobro', type: 'income', categoryId: 'cat_cobros', amount: 250 }),
  tx({ id: 'netflix', type: 'expense', categoryId: 'cat_subs', amount: 600 }),
  tx({ id: 'comida', type: 'expense', categoryId: 'cat_comida', amount: 400 }),
  tx({ id: 'sueldo', type: 'income', categoryId: 'cat_salario', amount: 30_000 }),
  tx({ id: 'paso', type: 'transfer', amount: 1_000, categoryId: undefined }),
]

describe('businessCategoryIds', () => {
  it('junta las de ingreso y las de gasto de todos los negocios', () => {
    const otro: Business = { ...NEGOCIO, id: 'b2', incomeCategoryIds: ['cat_tareas'], expenseCategoryIds: [] }
    expect([...businessCategoryIds([NEGOCIO, otro])].sort())
      .toEqual(['cat_cobros', 'cat_subs', 'cat_tareas'])
  })

  it('sin negocios, ninguna', () => {
    expect(businessCategoryIds([]).size).toBe(0)
  })
})

describe('scopeTransactions', () => {
  it('«todo» devuelve EL MISMO array, no una copia', () => {
    // El camino de siempre no paga nada por esta funcion, y los `useMemo` de
    // la pantalla no se recalculan por un array nuevo con lo mismo dentro.
    expect(scopeTransactions(LIBRO, [NEGOCIO], 'all')).toBe(LIBRO)
  })

  it('«solo negocio» deja lo de sus categorías', () => {
    expect(scopeTransactions(LIBRO, [NEGOCIO], 'business').map(t => t.id))
      .toEqual(['cobro', 'netflix'])
  })

  it('«solo personal» deja el resto', () => {
    // «Gastaste un 40% mas que el mes pasado» no dice nada si la subida fue
    // comprar otra cuenta de Netflix para cinco clientes nuevos.
    expect(scopeTransactions(LIBRO, [NEGOCIO], 'personal').map(t => t.id))
      .toEqual(['comida', 'sueldo', 'paso'])
  })

  it('una transferencia NO es de negocio: cambia de bolsillo, no de dueño', () => {
    const soloNegocio = scopeTransactions(LIBRO, [NEGOCIO], 'business')
    expect(soloNegocio.some(t => t.type === 'transfer')).toBe(false)
  })

  it('SIN FRONTERA, los dos ámbitos devuelven todo', () => {
    /*
     * Un negocio sin categorias no traza ninguna frontera: «solo personal»
     * seria todo y «solo negocio» seria nada, y ninguna de las dos respuestas
     * ayuda. La pantalla ni ofrece el selector.
     */
    const vacio: Business = { ...NEGOCIO, incomeCategoryIds: [], expenseCategoryIds: [] }
    expect(scopeTransactions(LIBRO, [vacio], 'business')).toBe(LIBRO)
    expect(scopeTransactions(LIBRO, [], 'personal')).toBe(LIBRO)
  })

  it('un movimiento sin categoría cuenta como personal', () => {
    // No está declarado en ningún negocio, así que no es de negocio. Decidir
    // lo contrario le atribuiría al negocio un gasto que nadie le asignó.
    const suelto = [tx({ id: 'suelto', categoryId: undefined })]
    expect(scopeTransactions(suelto, [NEGOCIO], 'business')).toEqual([])
    expect(scopeTransactions(suelto, [NEGOCIO], 'personal').map(t => t.id)).toEqual(['suelto'])
  })

  it('los dos ámbitos juntos son el libro entero, sin repetir nada', () => {
    // Si un movimiento cayera en los dos o en ninguno, las dos vistas no
    // sumarian el mes y el usuario no podria creerse ninguna.
    const neg = scopeTransactions(LIBRO, [NEGOCIO], 'business')
    const per = scopeTransactions(LIBRO, [NEGOCIO], 'personal')
    expect(neg.length + per.length).toBe(LIBRO.length)
    expect(new Set([...neg, ...per].map(t => t.id)).size).toBe(LIBRO.length)
  })
})

describe('canScope', () => {
  it('solo con una frontera real', () => {
    expect(canScope([NEGOCIO])).toBe(true)
    expect(canScope([])).toBe(false)
    expect(canScope([{ ...NEGOCIO, incomeCategoryIds: [], expenseCategoryIds: [] }])).toBe(false)
  })
})
