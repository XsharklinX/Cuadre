import type { Account, OverdraftPolicy } from '@/types'

/**
 * GASTAR MÁS DE LO QUE HAY.
 *
 * La app tenía un ajuste de tres opciones —bloquear, advertir, permitir— y
 * **"advertir" no hacía nada en el móvil**: el aviso estaba implementado solo
 * en el modal de escritorio, y el flujo real de añadir un gasto llamaba a
 * `addTx` sin consultar nada. Como "advertir" es además el valor de fábrica,
 * para todo el mundo el ajuste era decorativo. De ahí que nadie supiera
 * explicar qué hacía: no hacía nada observable.
 *
 * Esto es la comprobación, sin React y sin estado, para poder probarla.
 *
 * El ajuste tampoco se llama ya "sobregiro". Es una palabra de banco; quien
 * abre una app de gastos no piensa en términos de sobregiros, piensa en
 * "me pasé". La clave interna se mantiene para no romper los ajustes
 * guardados de quien ya tiene la app.
 */

export type OverdraftVerdict = 'ok' | 'warn' | 'block'

export interface OverdraftCheck {
  verdict: OverdraftVerdict
  /** Cómo queda la cuenta si el gasto se registra. Negativo = se pasó. */
  resultingBalance: number
}

/**
 * ¿Este gasto deja la cuenta en rojo, y qué hacemos?
 *
 * Las TARJETAS DE CRÉDITO quedan fuera: su saldo negativo no es un descuido,
 * es literalmente para lo que sirven. Avisar de que una tarjeta se pone en
 * negativo al comprar con ella sería avisar de que el sol sale por el este.
 * Su tope es el límite, y de eso ya se ocupa `assertAvailableBalance`.
 */
export function checkOverdraft(
  account: Account | undefined,
  amount: number,
  policy: OverdraftPolicy,
): OverdraftCheck {
  if (!account || !Number.isFinite(amount) || amount <= 0) {
    return { verdict: 'ok', resultingBalance: account?.balance ?? 0 }
  }

  if (account.type === 'credit') {
    // El único tope real de una tarjeta es su cupo, y ese no es negociable por
    // ajuste: lo comprueba `assertAvailableBalance` en el libro.
    return { verdict: 'ok', resultingBalance: account.balance - amount }
  }

  const resultingBalance = Math.round((account.balance - amount) * 100) / 100
  // Cero exacto no es pasarse: gastar lo último que te queda es válido.
  if (resultingBalance >= 0) return { verdict: 'ok', resultingBalance }

  // La política de la CUENTA manda sobre la general: un usuario puede querer
  // que su efectivo nunca quede en rojo y su cuenta de banco sí.
  const effective = account.overdraftPolicy ?? policy
  if (effective === 'block') return { verdict: 'block', resultingBalance }
  if (effective === 'warn') return { verdict: 'warn', resultingBalance }
  return { verdict: 'ok', resultingBalance }
}
