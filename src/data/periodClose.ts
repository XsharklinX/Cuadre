import type { Account, Transaction } from '@/types'

/**
 * EMPEZAR DE NUEVO DESDE HOY, SIN BORRAR NADA.
 *
 * Para el libro que ya derivó demasiado como para reconciliarlo cuenta por
 * cuenta. Hoy las únicas salidas son cuadrar a mano una por una, o borrar todo
 * y perder el historial.
 *
 * ── POR QUÉ SE ARCHIVA EN VEZ DE PONER UNA FECHA DE CORTE ─────────────
 * Lo primero que se piensa es «que los saldos solo cuenten los movimientos
 * posteriores al corte». Eso obligaría a que TODOS los sitios que calculan un
 * saldo respetaran la fecha: el recálculo, el segundo libro de las tarjetas,
 * Salud de datos, los aportes a metas. Olvidar uno parte la igualdad
 * `saldo = apertura + movimientos` en dos verdades, y ahí el libro deja de
 * significar nada.
 *
 * Así que lo viejo SALE de `transactions` y se guarda en un archivo aparte, de
 * solo lectura. La apertura de cada cuenta pasa a ser su saldo real de hoy, y
 * entonces la igualdad se cumple exacta sin cambiar una línea del cálculo. Cero
 * riesgo sobre lo que ya funciona.
 *
 * Lo que se pierde, dicho claro: los informes de los meses archivados se quedan
 * sin datos, porque sus movimientos ya no están en el libro. Es inherente a
 * «empezar de nuevo», y por eso esto es la salida de emergencia y no un botón
 * cualquiera. El historial se puede mirar; no cuenta.
 */

export interface ClosePlan {
  /** Fecha de corte, `YYYY-MM-DD`. Lo anterior se archiva. */
  cutoff: string
  /** Los movimientos que salen del libro. */
  archive: Transaction[]
  /** Los que se quedan: los del día del corte en adelante. */
  keep: Transaction[]
  /** Apertura nueva por cuenta, de forma que el saldo real cuadre exacto. */
  openings: Record<string, number>
  /** Aperturas del segundo libro, para las tarjetas con divisa extranjera. */
  secondaryOpenings: Record<string, number>
  /** Cuentas que cambian de saldo y en cuánto, para poder enseñarlo antes. */
  changes: Array<{ accountId: string; name: string; before: number; after: number; diff: number }>
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

/** Lo que un movimiento mueve en una cuenta, en su libro principal. */
function effect(tx: Transaction, accountId: string): number {
  if (tx.onSecondaryBalance) return 0
  if (tx.type === 'transfer') {
    if (tx.fromAccount === accountId) return -tx.amount
    if (tx.toAccount === accountId) return tx.toSecondary ? 0 : (tx.toAmount ?? tx.amount)
    return 0
  }
  if (tx.accountId !== accountId) return 0
  return tx.type === 'income' ? tx.amount : -tx.amount
}

/** Lo que mueve en el segundo libro de una tarjeta. */
function secondaryEffect(tx: Transaction, accountId: string): number {
  if (tx.type === 'transfer') {
    return tx.toSecondary && tx.toAccount === accountId ? (tx.toAmount ?? tx.amount) : 0
  }
  if (!tx.onSecondaryBalance || tx.accountId !== accountId) return 0
  return tx.type === 'income' ? tx.amount : -tx.amount
}

/**
 * Arma el cierre sin aplicar nada.
 *
 * @param accounts      las cuentas actuales.
 * @param realBalances  el saldo real de hoy por cuenta; si falta una, se queda
 *                      con el que ya tiene (no se inventa).
 * @param transactions  el libro entero.
 * @param cutoff        `YYYY-MM-DD`: lo ANTERIOR a esta fecha se archiva.
 */
export function closePlan(
  accounts: Account[],
  realBalances: Record<string, number>,
  transactions: Transaction[],
  cutoff: string,
): ClosePlan {
  const archive = transactions.filter(t => t.date < cutoff)
  const keep = transactions.filter(t => t.date >= cutoff)

  const openings: Record<string, number> = {}
  const secondaryOpenings: Record<string, number> = {}
  const changes: ClosePlan['changes'] = []

  for (const account of accounts) {
    const pedido = realBalances[account.id]
    const destino = Number.isFinite(pedido) ? cents(pedido) : account.balance

    /*
     * La apertura se calcula HACIA ATRÁS desde el saldo que debe quedar.
     *
     * Los movimientos que se conservan siguen contando, así que la apertura es
     * `destino − lo que mueven los conservados`. Poner la apertura igual al
     * destino sería el error obvio: sumaría dos veces los movimientos de este
     * mes y el saldo quedaría mal justo después de cuadrarlo.
     */
    const mueven = keep.reduce((sum, t) => sum + effect(t, account.id), 0)
    openings[account.id] = cents(destino - mueven)

    if (account.type === 'credit' && account.secondaryCurrency) {
      const mueven2 = keep.reduce((sum, t) => sum + secondaryEffect(t, account.id), 0)
      const destino2 = account.secondaryBalance ?? 0
      secondaryOpenings[account.id] = cents(destino2 - mueven2)
    }

    if (Math.abs(destino - account.balance) >= 0.005) {
      changes.push({
        accountId: account.id,
        name: account.name,
        before: account.balance,
        after: destino,
        diff: cents(destino - account.balance),
      })
    }
  }

  return { cutoff, archive, keep, openings, secondaryOpenings, changes }
}

/** Las cuentas con su apertura y su saldo nuevos, listas para guardar. */
export function applyClose(accounts: Account[], plan: ClosePlan): Account[] {
  return accounts.map(account => {
    const opening = plan.openings[account.id]
    if (opening === undefined) return account
    const mueven = plan.keep.reduce((sum, t) => sum + effect(t, account.id), 0)
    const next: Account = { ...account, openingBalance: opening, balance: cents(opening + mueven) }
    const opening2 = plan.secondaryOpenings[account.id]
    if (opening2 !== undefined) {
      const mueven2 = plan.keep.reduce((sum, t) => sum + secondaryEffect(t, account.id), 0)
      next.secondaryOpeningBalance = opening2
      next.secondaryBalance = cents(opening2 + mueven2)
    }
    return next
  })
}
