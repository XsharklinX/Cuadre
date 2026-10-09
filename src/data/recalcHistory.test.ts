import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearRecalcs, listRecalcs, moved, recordRecalc, totalMoved, undoRecalc,
  type RecalcMove,
} from './recalcHistory'

const KEY = 'cuadre-recalc-history-v1'

const m = (over: Partial<RecalcMove> = {}): RecalcMove => ({
  accountId: 'acc_1', name: 'Banco', before: 100, after: 250, ...over,
})

beforeEach(() => { localStorage.clear() })

describe('apuntar un recalculo', () => {
  it('guarda lo que cambio, con el antes y el despues', () => {
    recordRecalc('all', [m()])
    const [entry] = listRecalcs()
    expect(entry.scope).toBe('all')
    expect(entry.moves).toEqual([m()])
  })

  /*
   * El caso normal es que todo cuadre. Si eso dejara entrada, el historial se
   * llenaria de «no paso nada» y escondería las tres veces que si paso algo.
   */
  it('un recalculo que no movio nada NO se apunta', () => {
    expect(recordRecalc('all', [m({ before: 100, after: 100 })])).toBeNull()
    expect(listRecalcs()).toEqual([])
  })

  it('de varias cuentas, solo apunta las que se movieron', () => {
    recordRecalc('all', [m({ accountId: 'a', after: 100 }), m({ accountId: 'b', after: 999 })])
    expect(listRecalcs()[0].moves.map(x => x.accountId)).toEqual(['b'])
  })

  it('el mas reciente va primero', () => {
    recordRecalc('account', [m({ name: 'viejo' })])
    recordRecalc('account', [m({ name: 'nuevo' })])
    expect(listRecalcs()[0].moves[0].name).toBe('nuevo')
  })

  /* El segundo libro de una tarjeta tambien cuenta como cambio. */
  it('un cambio solo en la divisa extranjera si se apunta', () => {
    const solo2 = m({ before: 100, after: 100, beforeSecondary: 0, afterSecondary: -40 })
    expect(recordRecalc('account', [solo2])).not.toBeNull()
  })

  it('no guarda mas de 20', () => {
    for (let i = 0; i < 25; i++) recordRecalc('account', [m({ after: 100 + i + 1 })])
    expect(listRecalcs()).toHaveLength(20)
  })
})

describe('deshacer', () => {
  it('devuelve los saldos que hay que restaurar', () => {
    const entry = recordRecalc('all', [m()])!
    expect(undoRecalc(entry.id)).toEqual([m()])
  })

  /*
   * La entrada NO se borra: el historial tiene que poder contar tambien que
   * se deshizo. Un registro que se edita para que parezca que no paso nada no
   * es un registro.
   */
  it('la entrada se queda, marcada como deshecha', () => {
    const entry = recordRecalc('all', [m()])!
    undoRecalc(entry.id)
    expect(listRecalcs()[0].undone).toBe(true)
  })

  it('deshacer dos veces no devuelve nada la segunda', () => {
    const entry = recordRecalc('all', [m()])!
    undoRecalc(entry.id)
    expect(undoRecalc(entry.id)).toEqual([])
  })

  it('un id que no existe no revienta', () => {
    expect(undoRecalc('nada')).toEqual([])
  })
})

describe('almacenamiento corrupto', () => {
  /*
   * Lo guardado puede venir de una version anterior o estar a medias. Una
   * entrada sin `moves` reventaria al pintarla y, peor, al deshacerla
   * escribiria `undefined` en un saldo.
   */
  it('descarta entradas ilegibles en vez de reventar', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'x', at: '2026-01-01', scope: 'all' },                    // sin moves
      { id: 'y', at: '2026-01-01', scope: 'all', moves: [m()] },      // buena
      { id: 'z', at: '2026-01-01', scope: 'raro', moves: [] },        // scope invalido
    ]))
    expect(listRecalcs().map(e => e.id)).toEqual(['y'])
  })

  it('un saldo que no es numero descarta la entrada', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: 'x', at: '2026-01-01', scope: 'all', moves: [{ accountId: 'a', name: 'A', before: 1, after: null }] },
    ]))
    expect(listRecalcs()).toEqual([])
  })

  it('basura entera devuelve lista vacia', () => {
    localStorage.setItem(KEY, 'no es json')
    expect(listRecalcs()).toEqual([])
  })
})

describe('resumen', () => {
  it('suma cuanto se movio en total', () => {
    const entry = recordRecalc('all', [
      m({ accountId: 'a', before: 100, after: 150 }),
      m({ accountId: 'b', before: 100, after: 80 }),
    ])!
    expect(totalMoved(entry)).toBe(30)
  })

  it('por debajo del centimo no cuenta como movido', () => {
    expect(moved(m({ before: 100, after: 100.004 }))).toBe(false)
    expect(moved(m({ before: 100, after: 100.01 }))).toBe(true)
  })

  it('limpiar deja el historial vacio', () => {
    recordRecalc('all', [m()])
    clearRecalcs()
    expect(listRecalcs()).toEqual([])
  })
})
