import { accountBalanceInBase, accountCurrency } from './helpers'
import { creditUsed, creditUsedInPrimary } from './creditCard'
import type { Account, CurrencyCode } from '@/types'

/**
 * CÓMO SE ORDENA LA PANTALLA DE CUENTAS.
 *
 * Antes eran dos montones: «tu dinero» (efectivo, débito y ahorro juntos) y
 * «tus tarjetas» (solo crédito). Con cinco cuentas eso es un sancocho: una
 * cuenta de ahorro y un efectivo no se parecen en nada y estaban en la misma
 * lista, mientras que un débito y un crédito —que sí son la misma clase de
 * objeto, una tarjeta— estaban separados.
 *
 * Ahora: el EFECTIVO aparte, porque es el único dinero que no pasa por un
 * banco; y todas las TARJETAS juntas, agrupadas por tipo y cada grupo con su
 * total.
 */

export type CardGroupId = 'credit' | 'debit' | 'savings'

export const CARD_GROUP_ORDER: CardGroupId[] = ['credit', 'debit', 'savings']

export interface CardGroup {
  id: CardGroupId
  accounts: Account[]
  /**
   * El total del grupo, en la divisa base.
   *
   * En crédito es lo que DEBES (positivo), no un saldo negativo: la etiqueta
   * dice «Debes» y un número con signo al lado sería decir lo mismo dos veces
   * y en direcciones opuestas.
   */
  total: number
}

/** El efectivo. Uno solo por diseño, pero se devuelve lista por si un backup trae más. */
export function cashAccounts(accounts: Account[]): Account[] {
  return accounts.filter(a => a.type === 'cash')
}

/**
 * Las tarjetas, por tipo y sin grupos vacíos.
 *
 * Dentro de cada grupo se ordenan por lo que tienen en juego: el crédito por
 * deuda (la más comprometida primero, que es la que hay que mirar) y el resto
 * por saldo. Ordenarlas por nombre sería alfabetizar un problema.
 */
export function cardGroups(accounts: Account[], base: CurrencyCode): CardGroup[] {
  return CARD_GROUP_ORDER.flatMap(id => {
    const inGroup = accounts.filter(a => a.type === id)
    if (inGroup.length === 0) return []

    const sorted = [...inGroup].sort((a, b) => id === 'credit'
      ? creditUsedInPrimary(b, base) - creditUsedInPrimary(a, base)
      : accountBalanceInBase(b, base) - accountBalanceInBase(a, base))

    const total = inGroup
      .filter(a => a.includeInTotal !== false)
      .reduce((sum, a) => sum + (id === 'credit'
        ? creditUsedInPrimary(a, base)
        : accountBalanceInBase(a, base)), 0)

    return [{ id, accounts: sorted, total: Math.round(total * 100) / 100 }]
  })
}

/**
 * Lo que enseña la tarjeta: su deuda o su saldo, en SU divisa.
 *
 * El símbolo sale de aquí y nunca se escribe a mano. Una app que dice RD$ a
 * quien lleva su cuenta en dólares miente en cada línea.
 */
export interface CardFigures {
  /** Divisa propia de la cuenta, o la base si no tiene. */
  currency: CurrencyCode
  /** La cifra principal, siempre positiva: deuda en crédito, saldo en el resto. */
  primary: number
  /**
   * La segunda deuda de una tarjeta, en divisa extranjera. `null` si no la
   * tiene o está en cero: enseñar «US$ 0.00» hace dudar de si falta algo.
   */
  secondary: { amount: number; currency: CurrencyCode } | null
  /** Fracción del cupo consumida por la deuda en divisa LOCAL (0–1). */
  usedLocal: number | null
  /** Fracción del cupo consumida por la deuda en divisa EXTRANJERA (0–1). */
  usedForeign: number | null
  /** Cupo libre, en la divisa de la tarjeta. `null` si no hay límite. */
  free: number | null
}

export function cardFigures(account: Account, base: CurrencyCode): CardFigures {
  const currency = accountCurrency(account, base)
  const isCredit = account.type === 'credit'
  const primary = isCredit ? creditUsed(account.balance) : account.balance

  const secOwed = creditUsed(account.secondaryBalance ?? 0)
  const secondary = isCredit && account.secondaryCurrency && secOwed > 0
    ? { amount: secOwed, currency: account.secondaryCurrency }
    : null

  if (!isCredit || !account.limit || account.limit <= 0) {
    return { currency, primary, secondary, usedLocal: null, usedForeign: null, free: null }
  }

  /*
   * EL CUPO ES UNO SOLO Y LO CONSUMEN LAS DOS DEUDAS.
   *
   * Por eso la barra va en dos tramos y no en uno: con la deuda en pesos al
   * 74% y la de dólares al 7%, una sola barra al 74% diría que queda más cupo
   * del que hay.
   */
  const totalUsed = creditUsedInPrimary(account, base)
  const foreignUsed = Math.max(0, totalUsed - primary)
  const cap = (n: number) => Math.max(0, Math.min(1, n / account.limit!))

  return {
    currency,
    primary,
    secondary,
    usedLocal: cap(primary),
    usedForeign: cap(foreignUsed),
    free: Math.max(0, Math.round((account.limit - totalUsed) * 100) / 100),
  }
}
