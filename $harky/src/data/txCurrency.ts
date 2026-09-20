import { entryInAccountCurrency } from './currencies'
import { accountCurrency } from './helpers'
import { hasSecondaryBalance } from './creditCard'
import type { Account, CurrencyCode, Transaction } from '@/types'

/**
 * A QUE LIBRO Y EN QUE DIVISA va un movimiento.
 *
 * Vive aquí, fuera de los formularios, porque CREAR y EDITAR tienen que tomar
 * exactamente la misma decisión. Cuando cada formulario la resolvía por su
 * cuenta, editar un gasto en dólares lo devolvía a pesos en silencio.
 */

export interface TxRouting {
  /** Divisa en la que se teclea el monto. */
  typedCurrency: CurrencyCode
  /** Divisa del libro que recibe el movimiento. */
  targetCurrency: CurrencyCode
  /** true si va al segundo libro de una tarjeta. */
  toSecondary: boolean
}

/**
 * Resuelve el enrutado a partir de la cuenta y la divisa elegida.
 * `chosen` null = seguir a la cuenta.
 */
export function routeTx(
  account: Account | null | undefined,
  chosen: CurrencyCode | null,
  base: CurrencyCode,
): TxRouting {
  const accountCur = account ? accountCurrency(account, base) : base
  const typedCurrency = chosen ?? accountCur
  const toSecondary = !!account
    && hasSecondaryBalance(account)
    && typedCurrency === account.secondaryCurrency
  return {
    typedCurrency,
    targetCurrency: toSecondary ? account!.secondaryCurrency! : accountCur,
    toSecondary,
  }
}

/**
 * En qué divisa se TECLEÓ un movimiento existente, y con qué monto.
 *
 * Al editar hay que devolverle al usuario lo que él escribió, no el monto
 * convertido: quien registró "US$ 25" espera ver 25 y poder cambiarlo a 30, no
 * ver 1,540 pesos y tener que hacer la división mental.
 */
export function readTxEntry(
  tx: Transaction,
  account: Account | null | undefined,
  base: CurrencyCode,
): { amount: number; currency: CurrencyCode } {
  // Movimiento del segundo libro: su `amount` YA está en la divisa secundaria.
  if (tx.onSecondaryBalance && account?.secondaryCurrency) {
    return { amount: tx.amount, currency: account.secondaryCurrency }
  }
  // Movimiento convertido: se devuelve el original tecleado, no el convertido.
  if (tx.originalAmount !== undefined && tx.originalCurrency) {
    return { amount: tx.originalAmount, currency: tx.originalCurrency }
  }
  return { amount: tx.amount, currency: account ? accountCurrency(account, base) : base }
}

/**
 * Los campos que hay que guardar para un movimiento, dada la divisa tecleada.
 *
 * Devuelve SIEMPRE las tres claves FX y `onSecondaryBalance`, con `undefined`
 * cuando no aplican. Eso importa al editar: si se omitieran, `updateTx` haría
 * merge con los valores viejos y un movimiento que dejó de ser en dólares
 * conservaría su `fxRate` antiguo, dejando el desglose mintiendo.
 */
export function buildTxEntry(
  typedAmount: number,
  routing: TxRouting,
): {
  amount: number
  originalAmount: number | undefined
  originalCurrency: CurrencyCode | undefined
  fxRate: number | undefined
  onSecondaryBalance: true | undefined
} {
  const converted = entryInAccountCurrency(typedAmount, routing.typedCurrency, routing.targetCurrency)
  return {
    amount: converted.amount,
    originalAmount: converted.originalAmount,
    originalCurrency: converted.originalCurrency,
    fxRate: converted.fxRate,
    onSecondaryBalance: routing.toSecondary ? true : undefined,
  }
}
