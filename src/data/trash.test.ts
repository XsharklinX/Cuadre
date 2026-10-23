import { describe, expect, it } from 'vitest'
import {
  TRASH_DAYS, TRASH_MAX, addToTrash, daysLeft, isExpired, pruneTrash, sanitizeTrash, takeFromTrash,
  type TrashedTx,
} from './trash'
import type { Transaction } from '@/types'

const DIA = 86_400_000
const AHORA = Date.UTC(2026, 9, 18, 12, 0, 0)

function tx(id: string, over: Partial<Transaction> = {}): Transaction {
  return {
    id, type: 'expense', amount: 2450, date: '2026-10-12',
    note: 'Súper', categoryId: 'c1', accountId: 'a1', ...over,
  } as Transaction
}

function entry(id: string, diasAtras: number): TrashedTx {
  return { tx: tx(id), deletedAt: AHORA - diasAtras * DIA }
}

describe('daysLeft', () => {
  it('recién borrado tiene los 30 días', () => {
    expect(daysLeft(entry('a', 0), AHORA)).toBe(TRASH_DAYS)
  })

  it('va bajando con los días', () => {
    expect(daysLeft(entry('a', 1), AHORA)).toBe(29)
    expect(daysLeft(entry('a', 10), AHORA)).toBe(20)
    expect(daysLeft(entry('a', 29), AHORA)).toBe(1)
  })

  it('nunca es negativo', () => {
    expect(daysLeft(entry('a', 45), AHORA)).toBe(0)
  })
})

describe('isExpired', () => {
  it('a los 30 días justos ya caducó', () => {
    expect(isExpired(entry('a', 30), AHORA)).toBe(true)
  })

  it('al día 29 todavía no', () => {
    expect(isExpired(entry('a', 29), AHORA)).toBe(false)
  })
})

describe('pruneTrash', () => {
  it('tira lo caducado y deja lo vivo', () => {
    const items = [entry('viejo', 40), entry('nuevo', 2), entry('justo', 30)]
    const r = pruneTrash(items, AHORA)
    expect(r.map(e => e.tx.id)).toEqual(['nuevo'])
  })

  it('ordena lo más reciente primero', () => {
    const items = [entry('b', 10), entry('a', 1), entry('c', 20)]
    expect(pruneTrash(items, AHORA).map(e => e.tx.id)).toEqual(['a', 'b', 'c'])
  })

  it('recorta al tope para que un borrado en lote no llene el disco', () => {
    const muchos = Array.from({ length: TRASH_MAX + 50 }, (_, i) => entry(`t${i}`, 0))
    expect(pruneTrash(muchos, AHORA)).toHaveLength(TRASH_MAX)
  })

  it('con la papelera vacía no pasa nada', () => {
    expect(pruneTrash([], AHORA)).toEqual([])
  })
})

describe('addToTrash', () => {
  it('mete el movimiento tal cual, con su id', () => {
    const r = addToTrash([], tx('t1'), AHORA)
    expect(r).toHaveLength(1)
    expect(r[0].tx.id).toBe('t1')
    expect(r[0].deletedAt).toBe(AHORA)
  })

  it('lo nuevo va primero', () => {
    let items = addToTrash([], tx('t1'), AHORA - DIA)
    items = addToTrash(items, tx('t2'), AHORA)
    expect(items.map(e => e.tx.id)).toEqual(['t2', 't1'])
  })

  it('borrar, recuperar y volver a borrar NO deja dos copias', () => {
    let items = addToTrash([], tx('t1'), AHORA - 5 * DIA)
    items = addToTrash(items, tx('t1'), AHORA)
    expect(items).toHaveLength(1)
    // Y el reloj vuelve a empezar desde el último borrado.
    expect(daysLeft(items[0], AHORA)).toBe(TRASH_DAYS)
  })

  it('al meter algo también se limpia lo caducado', () => {
    const items = addToTrash([entry('viejo', 40)], tx('t1'), AHORA)
    expect(items.map(e => e.tx.id)).toEqual(['t1'])
  })

  it('conserva el movimiento entero, no un resumen', () => {
    const completo = tx('t1', { description: 'Compra del mes', tags: ['casa'] } as Partial<Transaction>)
    const r = addToTrash([], completo, AHORA)
    expect(r[0].tx).toEqual(completo)
  })
})

describe('takeFromTrash', () => {
  it('saca el que se pide y lo devuelve', () => {
    const items = [entry('a', 1), entry('b', 2)]
    const { items: quedan, taken } = takeFromTrash(items, 'a')
    expect(taken?.tx.id).toBe('a')
    expect(quedan.map(e => e.tx.id)).toEqual(['b'])
  })

  it('pedir uno que no está no cambia nada', () => {
    const items = [entry('a', 1)]
    const { items: quedan, taken } = takeFromTrash(items, 'zzz')
    expect(taken).toBeNull()
    expect(quedan).toBe(items)
  })
})

describe('sanitizeTrash', () => {
  it('lo que no es una lista no es una papelera', () => {
    expect(sanitizeTrash(null)).toEqual([])
    expect(sanitizeTrash('{}')).toEqual([])
    expect(sanitizeTrash({ a: 1 })).toEqual([])
  })

  it('deja pasar una entrada buena', () => {
    const bueno = [{ tx: tx('t1'), deletedAt: AHORA }]
    expect(sanitizeTrash(bueno)).toHaveLength(1)
  })

  it('tira las entradas rotas sin llevarse las buenas por delante', () => {
    const mezcla = [
      { tx: tx('ok'), deletedAt: AHORA },
      null,
      { deletedAt: AHORA },                                  // sin movimiento
      { tx: { ...tx('x'), id: '' }, deletedAt: AHORA },       // sin id
      { tx: { ...tx('y'), amount: 'mucho' }, deletedAt: AHORA },
      { tx: { ...tx('z'), date: 'ayer' }, deletedAt: AHORA },
      { tx: { ...tx('w'), type: 'regalo' }, deletedAt: AHORA },
      { tx: tx('sinfecha') },                                 // sin deletedAt
      { tx: tx('nanfecha'), deletedAt: NaN },
    ]
    expect(sanitizeTrash(mezcla).map(e => e.tx.id)).toEqual(['ok'])
  })

  it('al cargar también se limpia lo caducado', () => {
    const items = [{ tx: tx('viejo'), deletedAt: Date.now() - 40 * DIA }]
    expect(sanitizeTrash(items)).toEqual([])
  })
})
