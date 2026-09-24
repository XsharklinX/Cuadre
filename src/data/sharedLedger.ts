import type { Account, Category, Transaction } from '@/types'

/**
 * EL LIBRO COMPARTIDO — motor de fusión.
 *
 * ────────────────────────────────────────────────────────────────────────
 * EL PROBLEMA
 *
 * Dos teléfonos, un mismo dinero, ningún servidor. Ella apunta el súper
 * mientras él paga la luz, cada uno sin señal del otro. Cuando se encuentran,
 * los dos libros tienen que quedar idénticos — sin preguntarle a nadie cuál
 * versión vale.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE SINCRONIZA EL ESTADO
 *
 * La tentación es mandar "mi lista de movimientos" y fusionarla con la otra.
 * Eso es lo que hacía el sync viejo (con servidor) y es una trampa: dos listas
 * que divergieron no se pueden reconciliar sin adivinar, y adivinar con dinero
 * significa duplicar un gasto o perderlo.
 *
 * Aquí se sincronizan OPERACIONES, no estado. Cada cambio es un hecho
 * inmutable con identidad propia ("el 3 de octubre se añadió el movimiento
 * X"). Fusionar dos libros es entonces una UNIÓN DE CONJUNTOS — la operación
 * matemática más aburrida que existe, y por eso mismo la que no se equivoca.
 * Un hecho que los dos tienen se cuenta una vez; uno que solo tiene ella se
 * suma. No hay nada que decidir.
 *
 * ────────────────────────────────────────────────────────────────────────
 * POR QUÉ LOS SALDOS NO VIAJAN
 *
 * Los saldos NUNCA se transmiten: se recalculan al reproducir el registro.
 * Un número que no se transmite no puede desincronizarse. Esto elimina de
 * raíz la clase de fallo que nos ha perseguido toda la semana —un saldo que
 * dice una cosa y unos movimientos que dicen otra—, porque en el libro
 * compartido el saldo no es un dato: es el resultado de una suma.
 */

// ── Identidad y reloj ───────────────────────────────────────────────

/**
 * RELOJ LÓGICO (Lamport), no la hora del teléfono.
 *
 * El reloj de un teléfono miente: zonas horarias, ajuste manual, arranque sin
 * red. Ordenar dinero por una hora que puede ir hacia atrás es pedir que dos
 * teléfonos lleguen a resultados distintos con los mismos hechos.
 *
 * El contador lógico solo sabe "esto pasó después de lo que yo había visto",
 * que es exactamente lo que hace falta y lo único que se puede garantizar sin
 * un reloj común. La hora de pared viaja también, pero SOLO para enseñársela
 * al usuario — nunca para decidir.
 */
export interface OpEnvelope {
  /** Identidad del hecho. Es la clave de deduplicación: recibirlo dos veces es inofensivo. */
  id: string
  /** Quién lo hizo. Desempata cuando dos relojes lógicos coinciden. */
  author: string
  /** Reloj lógico del autor al emitirlo. */
  lamport: number
  /** Hora de pared del autor, ISO. Para MOSTRAR, jamás para ordenar. */
  at: string
  op: SharedOp
}

export type SharedOp =
  | { kind: 'account.add'; account: Account }
  | { kind: 'account.update'; id: string; fields: Partial<Omit<Account, 'id'>> }
  | { kind: 'category.add'; category: Category }
  | { kind: 'category.update'; id: string; fields: Partial<Omit<Category, 'id'>> }
  | { kind: 'tx.add'; tx: Transaction }
  | { kind: 'tx.update'; id: string; fields: Partial<Omit<Transaction, 'id'>> }
  | { kind: 'tx.delete'; id: string }

export interface SharedLedgerState {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
  /**
   * Lo borrado, recordado.
   *
   * Sin esta lista, un teléfono que estuvo desconectado y trae una edición de
   * un movimiento ya borrado lo RESUCITARÍA: su edición llega después, no
   * encuentra el movimiento, y lo vuelve a crear. Un gasto que reaparece solo
   * después de haberlo borrado es de las cosas que hacen desinstalar una app.
   */
  deleted: string[]
}

export const EMPTY_SHARED_LEDGER: SharedLedgerState = {
  accounts: [], categories: [], transactions: [], deleted: [],
}

// ── Orden total ─────────────────────────────────────────────────────

/**
 * El orden en que se aplican los hechos. Tiene que dar EXACTAMENTE lo mismo
 * en los dos teléfonos, pase lo que pase.
 *
 * Primero el reloj lógico; si empata (dos cambios genuinamente simultáneos,
 * sin que ninguno supiera del otro), desempata el autor por orden alfabético
 * y, si hasta eso empata, el id del hecho. No es "justo" — es DETERMINISTA,
 * que es lo único que importa: cualquier regla sirve mientras los dos lados
 * apliquen la misma.
 */
export function compareOps(a: OpEnvelope, b: OpEnvelope): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport
  if (a.author !== b.author) return a.author < b.author ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Fusiona dos registros de operaciones.
 *
 * Unión por id y reordenado. Es idempotente y conmutativa por construcción:
 * fusionar A con B da lo mismo que fusionar B con A, y fusionar dos veces da
 * lo mismo que fusionar una. De ahí sale la convergencia, sin preguntarle
 * nada al usuario.
 */
export function mergeOps(mine: OpEnvelope[], theirs: OpEnvelope[]): OpEnvelope[] {
  const byId = new Map<string, OpEnvelope>()
  for (const op of mine) byId.set(op.id, op)
  // Los ajenos NO pisan a los propios con el mismo id: un id repetido es el
  // mismo hecho, y el hecho ya lo tenemos. Pisarlo solo abriría la puerta a
  // que un registro manipulado reescribiera nuestra historia.
  for (const op of theirs) if (!byId.has(op.id)) byId.set(op.id, op)
  return [...byId.values()].sort(compareOps)
}

/** El siguiente valor del reloj propio tras ver este registro. */
export function nextLamport(log: OpEnvelope[], own = 0): number {
  return Math.max(own, ...log.map(o => o.lamport), 0) + 1
}

// ── Reproducción ────────────────────────────────────────────────────

/**
 * Reconstruye el libro aplicando los hechos en orden.
 *
 * Reproducir desde cero en cada fusión es más lento que aplicar solo lo nuevo,
 * y es a propósito: un estado que se construye siempre igual a partir de los
 * mismos hechos no puede quedarse a medias. Con los tamaños reales de un libro
 * doméstico (miles de movimientos, no millones) el coste es irrelevante frente
 * a la garantía.
 */
export function replay(log: OpEnvelope[]): SharedLedgerState {
  const accounts = new Map<string, Account>()
  const categories = new Map<string, Category>()
  const transactions = new Map<string, Transaction>()
  const deleted = new Set<string>()

  for (const { op } of [...log].sort(compareOps)) {
    switch (op.kind) {
      case 'account.add':
        // Un alta repetida no duplica: el id manda. Dos personas creando "BHD"
        // a la vez crean dos cuentas distintas (ids distintos) y eso es
        // correcto — fusionarlas sería inventar.
        if (!accounts.has(op.account.id)) accounts.set(op.account.id, op.account)
        break
      case 'account.update': {
        const current = accounts.get(op.id)
        if (current) accounts.set(op.id, { ...current, ...op.fields })
        break
      }
      case 'category.add':
        if (!categories.has(op.category.id)) categories.set(op.category.id, op.category)
        break
      case 'category.update': {
        const current = categories.get(op.id)
        if (current) categories.set(op.id, { ...current, ...op.fields })
        break
      }
      case 'tx.add':
        // La lápida gana SIEMPRE, llegue antes o después. Borrar un movimiento
        // es una decisión explícita de una persona; que reaparezca porque el
        // otro teléfono traía el alta con retraso sería inexplicable.
        if (!deleted.has(op.tx.id) && !transactions.has(op.tx.id)) {
          transactions.set(op.tx.id, op.tx)
        }
        break
      case 'tx.update': {
        const current = transactions.get(op.id)
        if (current && !deleted.has(op.id)) transactions.set(op.id, { ...current, ...op.fields })
        break
      }
      case 'tx.delete':
        deleted.add(op.id)
        transactions.delete(op.id)
        break
    }
  }

  return {
    accounts: withDerivedBalances([...accounts.values()], [...transactions.values()]),
    categories: [...categories.values()],
    transactions: [...transactions.values()].sort((a, b) => b.date.localeCompare(a.date)),
    deleted: [...deleted].sort(),
  }
}

/**
 * LOS SALDOS SE CALCULAN, NO SE RECIBEN.
 *
 * `saldo = apertura + movimientos`, la misma invariante del libro personal,
 * pero aquí es estructural: no existe ninguna operación que fije un saldo, así
 * que no hay forma de que dos teléfonos discrepen. La única manera de mover el
 * saldo compartido es registrar un movimiento — que es exactamente la regla
 * que acabamos de imponer a mano en las tarjetas de crédito, aquí gratis.
 */
export function withDerivedBalances(accounts: Account[], transactions: Transaction[]): Account[] {
  return accounts.map(account => {
    const opening = account.openingBalance ?? 0
    const movements = transactions.reduce((sum, tx) => {
      if (tx.type === 'transfer') {
        if (tx.fromAccount === account.id) return sum - tx.amount
        if (tx.toAccount === account.id) return sum + (tx.toAmount ?? tx.amount)
        return sum
      }
      if (tx.accountId !== account.id) return sum
      return tx.type === 'income' ? sum + tx.amount : sum - tx.amount
    }, 0)
    return { ...account, balance: Math.round((opening + movements) * 100) / 100 }
  })
}

// ── Emisión ─────────────────────────────────────────────────────────

/** Envuelve un cambio propio como hecho, listo para guardar y compartir. */
export function emit(op: SharedOp, author: string, lamport: number, now = new Date()): OpEnvelope {
  return { id: crypto.randomUUID(), author, lamport, at: now.toISOString(), op }
}

/**
 * Lo que le falta al otro.
 *
 * Se manda la diferencia, no el registro entero: al reencontrarse tras un mes,
 * el intercambio es de unas decenas de operaciones y no del libro completo.
 * Comparar por id y no por fecha es deliberado — una fecha puede repetirse o
 * ir hacia atrás; un id, no.
 */
export function opsMissingFrom(mine: OpEnvelope[], theirIds: Iterable<string>): OpEnvelope[] {
  const known = new Set(theirIds)
  return mine.filter(op => !known.has(op.id)).sort(compareOps)
}
