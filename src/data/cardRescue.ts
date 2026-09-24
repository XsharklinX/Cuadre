import type { Account } from '@/types'

/**
 * TARJETAS CON EL DISPONIBLE ESCRITO DONDE VA LA DEUDA.
 *
 * La app pedía *cuánto debes*. El banco muestra *cuánto te queda*. Mucha gente
 * escribió lo segundo donde se pedía lo primero, y el libro lo leyó como saldo
 * A FAVOR: la tarjeta quedaba "sin usar", con el cupo entero libre, el botón
 * de pagar ofreciendo cero, y el patrimonio neto sin la deuda.
 *
 * Se vio en un teléfono real: la pantalla de inicio decía "Pasivos RD$ 0.00"
 * con una tarjeta que debía casi diez mil.
 *
 * Desde 1.9.5 se puede escribir cualquiera de las dos, pero **sólo sirve si el
 * usuario vuelve a meter el dato**, y nadie se lo está pidiendo. Esto lo pide.
 *
 * REGLA DE ORO: esto PREGUNTA, no corrige. Un saldo a favor es legítimo —
 * pagaste de más, te devolvieron algo— y arreglarle a alguien un dato que
 * estaba bien es peor que dejar el que estaba mal.
 */

export interface RescueCandidate {
  accountId: string
  name: string
  /** Lo que hay guardado, en positivo. */
  amount: number
  /** La deuda que resultaría si ese número era el disponible. */
  impliedDebt: number
  limit: number
}

/**
 * Saldo mínimo para molestar.
 *
 * Una tarjeta con RD$ 12.50 a favor casi seguro es un redondeo real, no un
 * dato mal metido. Preguntar por eso gasta la atención del usuario en lo que
 * no importa, y la próxima vez que preguntemos no nos va a hacer caso.
 */
export const MIN_AMOUNT = 100

export function rescueCandidates(accounts: Account[]): RescueCandidate[] {
  return accounts.flatMap(account => {
    if (account.type !== 'credit') return []
    // Sin límite no hay nada que deducir: "disponible" no significa nada si no
    // se sabe de cuánto.
    const limit = account.limit
    if (!limit || limit <= 0) return []
    // Saldo POSITIVO en una tarjeta = la app cree que el banco te debe a ti.
    if (account.balance <= MIN_AMOUNT) return []
    // Si lo escrito supera el cupo, no puede ser el disponible: es otra cosa
    // (un límite mal puesto, un saldo a favor de verdad). No se toca.
    if (account.balance > limit) return []

    return [{
      accountId: account.id,
      name: account.name,
      amount: account.balance,
      impliedDebt: limit - account.balance,
      limit,
    }]
  })
}

/** El saldo que hay que guardar si el usuario confirma que era el disponible. */
export function balanceIfAvailable(candidate: RescueCandidate): number {
  return candidate.impliedDebt > 0 ? -candidate.impliedDebt : 0
}
