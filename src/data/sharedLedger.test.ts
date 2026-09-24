import { describe, expect, it } from 'vitest'
import {
  compareOps, emit, mergeOps, nextLamport, opsMissingFrom, replay,
  withDerivedBalances, type OpEnvelope, type SharedOp,
} from './sharedLedger'
import type { Account, Transaction } from '@/types'

const ACC: Account = {
  id: 'acc_casa', name: 'Cuenta de la casa', short: 'Casa', type: 'debit',
  color: '#fff', balance: 0, openingBalance: 10_000, last4: '4412',
}

const tx = (id: string, amount: number, type: Transaction['type'] = 'expense'): Transaction => ({
  id, type, amount, date: '2026-10-03', note: `mov ${id}`,
  accountId: ACC.id, categoryId: 'cat_super',
} as Transaction)

/** Un hecho, con reloj e identidad fijos: las pruebas no pueden depender del azar. */
let seq = 0
function op(author: string, lamport: number, o: SharedOp): OpEnvelope {
  return { id: `op${++seq}`, author, lamport, at: '2026-10-03T12:00:00.000Z', op: o }
}

describe('orden total', () => {
  it('manda el reloj logico', () => {
    const a = op('ana', 1, { kind: 'tx.delete', id: 'x' })
    const b = op('ana', 2, { kind: 'tx.delete', id: 'y' })
    expect(compareOps(a, b)).toBeLessThan(0)
  })

  /**
   * Dos cambios GENUINAMENTE simultaneos: ninguno sabia del otro, asi que los
   * dos relojes marcan lo mismo. Hay que desempatar con algo estable, o cada
   * telefono ordenaria a su manera y llegarian a libros distintos.
   */
  it('desempata por autor cuando los relojes coinciden', () => {
    const ana  = op('ana',  5, { kind: 'tx.delete', id: 'x' })
    const beto = op('beto', 5, { kind: 'tx.delete', id: 'y' })
    expect(compareOps(ana, beto)).toBeLessThan(0)
    expect(compareOps(beto, ana)).toBeGreaterThan(0)
  })

  it('el desempate final es el id del hecho', () => {
    const a: OpEnvelope = { id: 'aaa', author: 'ana', lamport: 5, at: '', op: { kind: 'tx.delete', id: 'x' } }
    const b: OpEnvelope = { id: 'bbb', author: 'ana', lamport: 5, at: '', op: { kind: 'tx.delete', id: 'y' } }
    expect(compareOps(a, b)).toBeLessThan(0)
    expect(compareOps(a, a)).toBe(0)
  })
})

describe('fusion', () => {
  it('une sin duplicar', () => {
    const comun = op('ana', 1, { kind: 'tx.add', tx: tx('t1', 100) })
    const mio   = op('ana', 2, { kind: 'tx.add', tx: tx('t2', 200) })
    const suyo  = op('beto', 2, { kind: 'tx.add', tx: tx('t3', 300) })

    const merged = mergeOps([comun, mio], [comun, suyo])
    expect(merged).toHaveLength(3)
  })

  /** Fusionar dos veces tiene que dar lo mismo que fusionar una. */
  it('es idempotente', () => {
    const a = op('ana', 1, { kind: 'tx.add', tx: tx('t1', 100) })
    const b = op('beto', 1, { kind: 'tx.add', tx: tx('t2', 200) })
    const once = mergeOps([a], [b])
    expect(mergeOps(once, [b])).toEqual(once)
    expect(mergeOps(once, once)).toEqual(once)
  })

  /** Fusionar A con B tiene que dar lo mismo que fusionar B con A. */
  it('es conmutativa', () => {
    const a = op('ana', 1, { kind: 'tx.add', tx: tx('t1', 100) })
    const b = op('beto', 3, { kind: 'tx.add', tx: tx('t2', 200) })
    const c = op('ana', 2, { kind: 'tx.add', tx: tx('t3', 300) })
    expect(mergeOps([a, c], [b])).toEqual(mergeOps([b], [a, c]))
  })

  it('un registro ajeno no puede reescribir un hecho que ya tengo', () => {
    const mio: OpEnvelope = { id: 'op_x', author: 'ana', lamport: 1, at: '', op: { kind: 'tx.add', tx: tx('t1', 100) } }
    const falso: OpEnvelope = { id: 'op_x', author: 'beto', lamport: 9, at: '', op: { kind: 'tx.add', tx: tx('t1', 999_999) } }
    const [only] = mergeOps([mio], [falso])
    expect(only).toEqual(mio)
  })
})

describe('EL CASO REAL: dos telefonos que se reencuentran', () => {
  /*
   * Ella apunta el super, el paga la luz, ninguno con senal del otro. Al
   * sincronizar los dos libros tienen que quedar IDENTICOS — y da igual en que
   * orden les llegue cada cosa.
   */
  const base = op('ana', 1, { kind: 'account.add', account: ACC })
  const ella = op('ana',  2, { kind: 'tx.add', tx: tx('t_super', 2_400) })
  const el   = op('beto', 2, { kind: 'tx.add', tx: tx('t_luz', 1_850) })

  it('convergen al mismo libro', () => {
    const suyoDeElla = replay(mergeOps([base, ella], [el]))
    const suyoDeEl   = replay(mergeOps([base, el], [ella]))
    expect(suyoDeElla).toEqual(suyoDeEl)
  })

  it('el saldo sale de la resta, no de un numero que viajo', () => {
    const libro = replay(mergeOps([base, ella], [el]))
    // 10.000 de apertura − 2.400 − 1.850
    expect(libro.accounts[0].balance).toBeCloseTo(5_750, 2)
    expect(libro.transactions).toHaveLength(2)
  })

  /** El orden de llegada no puede cambiar el resultado. */
  it('convergen aunque los hechos lleguen desordenados', () => {
    const revuelto = replay(mergeOps([el, base], [ella]))
    const ordenado = replay(mergeOps([base, ella], [el]))
    expect(revuelto).toEqual(ordenado)
  })
})

describe('conflictos de verdad', () => {
  const alta = op('ana', 1, { kind: 'tx.add', tx: tx('t1', 1_000) })

  it('dos ediciones del mismo movimiento: gana la ultima del orden total', () => {
    const edicionAna  = op('ana',  2, { kind: 'tx.update', id: 't1', fields: { amount: 1_100 } })
    const edicionBeto = op('beto', 3, { kind: 'tx.update', id: 't1', fields: { amount: 1_200 } })
    const libro = replay(mergeOps([alta, edicionAna], [edicionBeto]))
    expect(libro.transactions[0].amount).toBe(1_200)
  })

  /**
   * LA LAPIDA GANA SIEMPRE. Si el alta llega DESPUES del borrado —un telefono
   * que estuvo un mes sin conectarse—, el movimiento no debe resucitar.
   * Un gasto que reaparece solo despues de borrarlo es de las cosas que hacen
   * desinstalar una app.
   */
  it('un alta atrasada no resucita lo borrado', () => {
    const borrado = op('beto', 2, { kind: 'tx.delete', id: 't1' })
    const libro = replay(mergeOps([borrado], [alta]))
    expect(libro.transactions).toHaveLength(0)
    expect(libro.deleted).toContain('t1')
  })

  it('una edicion atrasada tampoco lo resucita', () => {
    const borrado = op('ana', 2, { kind: 'tx.delete', id: 't1' })
    const edicion = op('beto', 3, { kind: 'tx.update', id: 't1', fields: { amount: 9_999 } })
    const libro = replay(mergeOps([alta, borrado], [edicion]))
    expect(libro.transactions).toHaveLength(0)
  })

  /**
   * Dos personas creando "BHD" a la vez crean DOS cuentas, no una. Fusionarlas
   * por nombre seria inventar: puede que de verdad sean dos cuentas distintas
   * en el mismo banco, y unir dinero ajeno es peor que dejar un duplicado que
   * se borra en dos toques.
   */
  it('dos altas distintas con el mismo nombre no se fusionan', () => {
    const a = op('ana',  1, { kind: 'account.add', account: { ...ACC, id: 'acc_a' } })
    const b = op('beto', 1, { kind: 'account.add', account: { ...ACC, id: 'acc_b' } })
    expect(replay(mergeOps([a], [b])).accounts).toHaveLength(2)
  })

  it('un alta repetida del mismo id no duplica', () => {
    const otra = op('beto', 5, { kind: 'tx.add', tx: tx('t1', 7_777) })
    const libro = replay(mergeOps([alta], [otra]))
    expect(libro.transactions).toHaveLength(1)
    expect(libro.transactions[0].amount).toBe(1_000)   // gana el primero del orden
  })
})

describe('saldos derivados', () => {
  it('apertura mas movimientos, nunca un numero transmitido', () => {
    const [cuenta] = withDerivedBalances([ACC], [tx('t1', 1_000), tx('t2', 500, 'income')])
    expect(cuenta.balance).toBeCloseTo(9_500, 2)
  })

  it('una transferencia mueve las dos puntas', () => {
    const otra: Account = { ...ACC, id: 'acc_2', openingBalance: 0, balance: 0 }
    const transfer = {
      id: 'tr1', type: 'transfer', amount: 3_000, date: '2026-10-03',
      note: 'traspaso', fromAccount: ACC.id, toAccount: otra.id,
    } as Transaction
    const [a, b] = withDerivedBalances([ACC, otra], [transfer])
    expect(a.balance).toBeCloseTo(7_000, 2)
    expect(b.balance).toBeCloseTo(3_000, 2)
  })

  /** No existe ninguna operacion que fije un saldo: por eso no puede divergir. */
  it('el saldo que traiga la cuenta se ignora', () => {
    const mentiroso: Account = { ...ACC, balance: 999_999 }
    expect(withDerivedBalances([mentiroso], [])[0].balance).toBe(10_000)
  })
})

describe('reloj logico', () => {
  it('siempre por delante de todo lo visto', () => {
    const log = [op('ana', 3, { kind: 'tx.delete', id: 'x' }), op('beto', 7, { kind: 'tx.delete', id: 'y' })]
    expect(nextLamport(log)).toBe(8)
    expect(nextLamport(log, 20)).toBe(21)
    expect(nextLamport([])).toBe(1)
  })
})

describe('que mandarle al otro', () => {
  it('solo lo que le falta', () => {
    const a = op('ana', 1, { kind: 'tx.delete', id: 'x' })
    const b = op('ana', 2, { kind: 'tx.delete', id: 'y' })
    const c = op('ana', 3, { kind: 'tx.delete', id: 'z' })
    expect(opsMissingFrom([a, b, c], [a.id]).map(o => o.id)).toEqual([b.id, c.id])
  })

  it('si no le falta nada, no se manda nada', () => {
    const a = op('ana', 1, { kind: 'tx.delete', id: 'x' })
    expect(opsMissingFrom([a], [a.id])).toEqual([])
  })
})

describe('emitir', () => {
  it('cada hecho nace con identidad propia', () => {
    const a = emit({ kind: 'tx.delete', id: 'x' }, 'ana', 1)
    const b = emit({ kind: 'tx.delete', id: 'x' }, 'ana', 2)
    expect(a.id).not.toBe(b.id)
    expect(a.author).toBe('ana')
  })
})

/*
 * ─────────────────────────────────────────────────────────────────────
 * LA PRUEBA QUE DE VERDAD IMPORTA
 *
 * Los casos escritos a mano solo cubren lo que se me ocurrio. Esto genera
 * historias AL AZAR —altas, ediciones, borrados, entrelazados entre dos
 * telefonos— y exige que los dos lados acaben con el libro identico, sin
 * importar quien vio que ni en que orden.
 *
 * Es la unica forma honesta de afirmar "converge": probarlo contra secuencias
 * que nadie diseno.
 * ─────────────────────────────────────────────────────────────────────
 */
describe('convergencia (historias generadas)', () => {
  /** Generador reproducible: un fallo tiene que poder repetirse. */
  function rng(seed: number) {
    let s = seed
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  }

  function historia(seed: number) {
    const rand = rng(seed)
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
    const autores = ['ana', 'beto']
    const relojes: Record<string, number> = { ana: 0, beto: 0 }
    const log: OpEnvelope[] = []
    const txIds: string[] = []
    let n = 0

    // Una cuenta comun, que los dos conocen desde el principio.
    relojes.ana = 1
    log.push({ id: 'op_base', author: 'ana', lamport: 1, at: '', op: { kind: 'account.add', account: ACC } })

    for (let i = 0; i < 40; i++) {
      const author = pick(autores)
      relojes[author] = Math.max(relojes[author], Math.floor(rand() * 40)) + 1
      const lamport = relojes[author]
      const id = `g${seed}_${++n}`
      const r = rand()

      if (r < 0.5 || txIds.length === 0) {
        const txId = `tx${seed}_${n}`
        txIds.push(txId)
        log.push({ id, author, lamport, at: '', op: { kind: 'tx.add', tx: tx(txId, Math.floor(rand() * 5_000) + 1) } })
      } else if (r < 0.8) {
        log.push({ id, author, lamport, at: '', op: { kind: 'tx.update', id: pick(txIds), fields: { amount: Math.floor(rand() * 9_000) + 1 } } })
      } else {
        log.push({ id, author, lamport, at: '', op: { kind: 'tx.delete', id: pick(txIds) } })
      }
    }
    return { log, rand }
  }

  it('200 historias al azar convergen al mismo libro', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { log, rand } = historia(seed)

      // Cada telefono ve un subconjunto distinto, ademas del hecho base.
      const deAna: OpEnvelope[] = [], deBeto: OpEnvelope[] = []
      for (const o of log) {
        const r = rand()
        if (r < 0.45) deAna.push(o)
        else if (r < 0.9) deBeto.push(o)
        else { deAna.push(o); deBeto.push(o) }   // algunos los vieron los dos
      }

      const libroDeAna  = replay(mergeOps(deAna, deBeto))
      const libroDeBeto = replay(mergeOps(deBeto, deAna))

      expect(libroDeAna, `semilla ${seed}`).toEqual(libroDeBeto)
    }
  })

  /** Sincronizar dos veces seguidas no puede cambiar nada la segunda vez. */
  it('una segunda sincronizacion no mueve nada', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { log } = historia(seed)
      const mitad = Math.floor(log.length / 2)
      const primera = mergeOps(log.slice(0, mitad), log.slice(mitad))
      expect(replay(mergeOps(primera, log))).toEqual(replay(primera))
    }
  })

  /** El saldo siempre es apertura + movimientos. Sin excepciones. */
  it('la invariante del saldo se sostiene en todas las historias', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const { log } = historia(seed)
      const libro = replay(log)
      const cuenta = libro.accounts[0]
      const esperado = withDerivedBalances([ACC], libro.transactions)[0].balance
      expect(cuenta.balance, `semilla ${seed}`).toBeCloseTo(esperado, 2)
    }
  })
})
