import { describe, expect, it } from 'vitest'
import { MAX_INCIDENTS, addIncident, newIncident, sanitizeIncidents, type Incident } from './incidents'
import type { Transaction } from '@/types'

const AHORA = Date.UTC(2026, 9, 18, 12, 0, 0)

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', type: 'expense', amount: 1200, date: '2026-10-18',
    note: 'Súper', categoryId: 'c1', accountId: 'a1', ...over,
  } as Transaction
}

describe('newIncident', () => {
  it('guarda qué falló, cuándo y por qué', () => {
    const inc = newIncident('save-tx', 'Saldo insuficiente', tx(), AHORA)
    expect(inc.kind).toBe('save-tx')
    expect(inc.message).toBe('Saldo insuficiente')
    expect(inc.at).toBe(AHORA)
  })

  it('guarda el intento ENTERO, para poder repetirlo', () => {
    // Sin esto, «Reintentar» tendría que pedir al usuario que volviera a
    // teclear justo el trabajo que acaba de perder.
    const intento = tx({ amount: 4800, note: 'Ferretería' })
    expect(newIncident('save-tx', 'x', intento, AHORA).payload).toEqual(intento)
  })

  it('dos fallos en el mismo milisegundo no se pisan', () => {
    const a = newIncident('save-tx', 'x', tx(), AHORA)
    const b = newIncident('save-tx', 'x', tx(), AHORA)
    expect(a.id).not.toBe(b.id)
  })
})

describe('addIncident', () => {
  it('el más reciente va primero', () => {
    const viejo = newIncident('save-tx', 'viejo', tx(), AHORA - 1000)
    const nuevo = newIncident('save-tx', 'nuevo', tx(), AHORA)
    expect(addIncident([viejo], nuevo).map(i => i.message)).toEqual(['nuevo', 'viejo'])
  })

  it('no crece sin límite', () => {
    let items: Incident[] = []
    for (let i = 0; i < MAX_INCIDENTS + 15; i += 1) {
      items = addIncident(items, newIncident('save-tx', `e${i}`, tx(), AHORA + i))
    }
    expect(items).toHaveLength(MAX_INCIDENTS)
    // Y lo que sobrevive es lo reciente, no lo primero que entró.
    expect(items[0].message).toBe(`e${MAX_INCIDENTS + 14}`)
  })
})

describe('sanitizeIncidents', () => {
  it('lo que no es una lista no es nada', () => {
    expect(sanitizeIncidents(null)).toEqual([])
    expect(sanitizeIncidents({ a: 1 })).toEqual([])
    expect(sanitizeIncidents('[]')).toEqual([])
  })

  it('deja pasar una entrada buena', () => {
    const bueno = [newIncident('save-tx', 'Saldo insuficiente', tx(), AHORA)]
    expect(sanitizeIncidents(bueno)).toHaveLength(1)
  })

  it('tira las rotas sin llevarse las buenas', () => {
    const mezcla = [
      newIncident('save-tx', 'ok', tx(), AHORA),
      null,
      { id: 'x', at: AHORA, kind: 'save-tx', message: 'm' },                      // sin payload
      { id: '', at: AHORA, kind: 'save-tx', message: 'm', payload: tx() },        // sin id
      { id: 'y', at: 'ayer', kind: 'save-tx', message: 'm', payload: tx() },      // fecha mala
      { id: 'z', at: AHORA, kind: 'otra-cosa', message: 'm', payload: tx() },     // tipo desconocido
      { id: 'w', at: AHORA, kind: 'save-tx', message: 'm', payload: { date: 'x' } },
    ]
    expect(sanitizeIncidents(mezcla).map(i => i.message)).toEqual(['ok'])
  })

  it('ordena por fecha y recorta al tope', () => {
    const muchos = Array.from({ length: MAX_INCIDENTS + 5 },
      (_, i) => newIncident('save-tx', `e${i}`, tx(), AHORA + i))
    const r = sanitizeIncidents([...muchos].reverse())
    expect(r).toHaveLength(MAX_INCIDENTS)
    expect(r[0].message).toBe(`e${MAX_INCIDENTS + 4}`)
  })
})
