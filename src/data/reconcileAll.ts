import { accountCurrency } from './helpers'
import type { Account, CurrencyCode } from '@/types'

/**
 * CUADRE GENERAL: TODAS LAS CUENTAS DE UNA PASADA.
 *
 * Conciliar ya existía y ya hacía lo difícil bien (`reconcileAccount`): nunca
 * escribe el saldo, anota un movimiento de ajuste. Eso importa porque el libro
 * se apoya en `saldo = apertura + movimientos`; si se escribiera el saldo a
 * mano, «Recalcular» —que recompone el saldo desde los movimientos— desharía el
 * arreglo la próxima vez que se tocara. Habrías cuadrado para que se
 * descuadrara solo otra vez.
 *
 * Lo que faltaba era alrededor: iba de una cuenta en una, enterrado en la ficha
 * de cada cuenta, sin ninguna vista del total. Con cuatro cuentas son cuatro
 * viajes y ninguna idea de cuánto falta en conjunto.
 *
 * Esto es la parte que se puede calcular sin tocar nada: el plan. Qué cuentas
 * hay, qué cree la app que tienes, qué has escrito tú, y cuánto baila. Nada se
 * escribe hasta que quien llama confirma — el plan es solo aritmética.
 */

/** Por debajo de un centavo no hay descuadre que arreglar. */
const EPSILON = 0.005

export interface ReconcileEntry {
  accountId: string
  name: string
  currency: CurrencyCode
  /** Lo que la app cree que hay. */
  expected: number
  /** Lo que el usuario dice que hay de verdad. `null` = todavía no lo escribió. */
  actual: number | null
  /** `actual − expected`, o `null` si no hay nada escrito. */
  diff: number | null
  /** Si esta cuenta necesita ajuste. */
  needsFix: boolean
}

export interface ReconcilePlan {
  entries: ReconcileEntry[]
  /** Cuántas cuentas bailan. */
  toFix: number
  /** Cuántas ha revisado el usuario (escritas, cuadren o no). */
  reviewed: number
  /**
   * Suma de las diferencias, SOLO de las cuentas en la divisa base.
   *
   * Una cuenta en dólares no se suma a un total en pesos: hacerlo daría una
   * cifra que no significa nada. Las que quedan fuera se cuentan aparte, para
   * poder decirlo en vez de callarlo.
   */
  totalDiff: number
  /** Cuántas cuentas con descuadre quedaron fuera del total por su divisa. */
  otherCurrencies: number
}

/** Redondea a centavos, que es la precisión del libro. */
function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Arma el plan a partir de lo que el usuario ha escrito.
 *
 * @param accounts las cuentas a revisar, en el orden en que se enseñan.
 * @param typed    lo escrito por cuenta; una cuenta sin entrada está sin revisar.
 * @param base     divisa base de la app.
 */
export function reconcilePlan(
  accounts: Account[],
  typed: Record<string, number | null>,
  base: CurrencyCode,
): ReconcilePlan {
  const entries: ReconcileEntry[] = accounts.map(account => {
    const actual = typed[account.id]
    const tiene = actual !== undefined && actual !== null && Number.isFinite(actual)
    const diff = tiene ? cents(actual - account.balance) : null
    return {
      accountId: account.id,
      name: account.name,
      currency: accountCurrency(account, base),
      expected: account.balance,
      actual: tiene ? actual : null,
      diff,
      needsFix: diff !== null && Math.abs(diff) >= EPSILON,
    }
  })

  const conDescuadre = entries.filter(e => e.needsFix)
  const enBase = conDescuadre.filter(e => e.currency === base)

  return {
    entries,
    toFix: conDescuadre.length,
    reviewed: entries.filter(e => e.actual !== null).length,
    totalDiff: cents(enBase.reduce((sum, e) => sum + (e.diff ?? 0), 0)),
    otherCurrencies: conDescuadre.length - enBase.length,
  }
}

/**
 * Las cuentas que hay que ajustar, con el saldo a aplicar.
 *
 * Quien llama recorre esto llamando a `reconcileAccount`. Devuelve solo lo que
 * de verdad cambia: aplicar un ajuste de cero ensuciaría el libro con un
 * movimiento que no dice nada.
 */
export function pendingFixes(plan: ReconcilePlan): Array<{ accountId: string; balance: number }> {
  return plan.entries
    .filter(e => e.needsFix && e.actual !== null)
    .map(e => ({ accountId: e.accountId, balance: e.actual as number }))
}
