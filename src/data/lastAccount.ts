import type { Account, Transaction } from '@/types'

/**
 * DE QUÉ CUENTA SALE EL DINERO, SIN VOLVER A PREGUNTARLO.
 *
 * Anotar un gasto son tres decisiones: monto, categoría y cuenta. Las dos
 * primeras cambian de verdad. La tercera casi nunca: la gente paga con la
 * misma tarjeta o el mismo efectivo una y otra vez. Aun así el formulario
 * arrancaba con «Seleccionar…» y obligaba a elegirla cada vez.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ SE DEDUCE DEL LIBRO Y NO SE GUARDA EN AJUSTES
 *
 * Guardar «la última cuenta usada» en los ajustes crea un dato más que
 * mantener: hay que migrarlo, hay que limpiarlo cuando esa cuenta se borra, y
 * puede desincronizarse del libro al restaurar una copia.
 *
 * El libro ya sabe la respuesta. El último movimiento de ese tipo dice de qué
 * cuenta salió, y esa respuesta sobrevive a una reinstalación, a restaurar una
 * copia y a cambiar de teléfono, sin nada que migrar.
 *
 * Es una SUGERENCIA, no una decisión: queda seleccionada y el usuario puede
 * cambiarla antes de guardar, igual que antes.
 */

/**
 * La cuenta que conviene preseleccionar para un movimiento nuevo.
 *
 * Devuelve `null` cuando no hay nada en qué basarse, y entonces el formulario
 * se comporta como siempre: pidiendo que se elija.
 */
export function suggestAccount(
  transactions: Transaction[],
  accounts: Account[],
  type: 'expense' | 'income',
): string | null {
  const existe = (id: string | undefined): id is string =>
    !!id && accounts.some(a => a.id === id)

  /*
   * El movimiento MÁS RECIENTE de ese tipo, por fecha. No el primero del array:
   * el orden interno del libro no es garantía, y un import de CSV puede dejar
   * movimientos viejos arriba.
   *
   * Por tipo y no en general porque no son el mismo bolsillo: un gasto sale de
   * la tarjeta y un sueldo entra a la cuenta de banco. Sugerir la del gasto
   * para un ingreso sería peor que no sugerir nada.
   */
  let mejor: Transaction | null = null
  for (const tx of transactions) {
    if (tx.type !== type || !existe(tx.accountId)) continue
    if (!mejor || tx.date > mejor.date) mejor = tx
  }
  if (mejor) return mejor.accountId!

  /*
   * Sin historial, si solo hay UNA cuenta no hay nada que elegir. Pedir que se
   * seleccione la única opción posible es trabajo que la app puede ahorrarse —
   * y es justo el caso de quien acaba de instalar.
   */
  if (accounts.length === 1) return accounts[0].id

  return null
}
