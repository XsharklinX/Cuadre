/**
 * Lógica pura para ingerir un movimiento detectado en un aviso bancario:
 * deduplicar (llegan 2-3 notificaciones del mismo consumo) y resolver a qué
 * cuenta pertenece. Sin React ni stores — testeable en aislamiento.
 */
import type { Account, Transaction } from '@/types'

/** Ventana en la que dos avisos con la misma firma se consideran EL MISMO
 *  movimiento. Los correos duplicados llegan en segundos/1-2 min; dos consumos
 *  distintos del mismo monto suelen estar más separados. */
export const DEDUP_WINDOW_MS = 4 * 60_000

export interface ProcessedMovement {
  key: string
  postTime: number
}

/**
 * Firma de identidad de un movimiento para deduplicar: tipo + monto + tarjeta.
 * Si no hay tarjeta, cae al paquete de la app (dos correos del mismo banco).
 * Incluir la tarjeta evita fusionar dos recargas iguales en tarjetas distintas,
 * pero permite unir el mismo consumo reenviado a varias bandejas de correo.
 */
export function movementDedupKey(
  type: 'income' | 'expense',
  amount: number,
  cardLast4: string | undefined,
  pkg: string,
): string {
  return `${type}:${Math.round(amount)}:${cardLast4 ?? pkg}`
}

/** true si ya se procesó un movimiento con la misma firma dentro de la ventana. */
export function isDuplicateMovement(
  processed: ProcessedMovement[],
  key: string,
  postTime: number,
  windowMs: number = DEDUP_WINDOW_MS,
): boolean {
  return processed.some(p => p.key === key && Math.abs(p.postTime - postTime) < windowMs)
}

/**
 * A qué cuenta pertenece un movimiento detectado. Los últimos 4 dígitos mandan
 * (señal más fiable y la que pidió el usuario); si no resuelven, se usa el mapeo
 * por app bancaria que el usuario confirmó antes. `undefined` si no se puede
 * decidir sin ambigüedad — ahí conviene preguntar en vez de adivinar.
 */
export function resolveDetectedAccount(
  accounts: Account[],
  packageAccountMap: Record<string, string>,
  cardLast4: string | undefined,
  pkg: string,
): Account | undefined {
  if (cardLast4) {
    const byCard = accounts.filter(a => a.last4 === cardLast4)
    if (byCard.length === 1) return byCard[0]
  }
  const mappedId = packageAccountMap[pkg]
  if (!mappedId) return undefined
  return accounts.find(a => a.id === mappedId)
}

/**
 * ¿Es posible que este movimiento detectado YA lo hubiera tecleado el usuario?
 *
 * El caso real: pagas en el supermercado, sacas el teléfono y lo registras a
 * mano; segundos después llega el aviso del banco por la misma compra. Sin
 * esto, el gasto queda dos veces y el saldo miente.
 *
 * NO se compara la nota. El aviso trae el nombre del comercio
 * ("SUPERMERCADO NACIONAL") y el usuario escribe lo que le da la gana
 * ("Super", "compra"). Exigir que coincidan es lo que hacía que
 * `isDuplicateTransaction` no sirviera para este caso: la señal de verdad es
 * MISMO MONTO + MISMA CUENTA + MISMO DÍA.
 *
 * Que sea "posible" y no "seguro" importa: dos cafés del mismo precio el
 * mismo día en la misma tarjeta son dos gastos legítimos, y no hay forma de
 * distinguirlos desde aquí. Por eso quien llama NO debe borrar nada — debe
 * dejar de auto-crear y preguntar.
 */
export function looksAlreadyRecorded(
  existing: Transaction[],
  candidate: { amount: number; accountId: string; date: string; type: 'income' | 'expense' },
): Transaction | null {
  const amount = Math.abs(candidate.amount).toFixed(2)
  return existing.find(tx =>
    tx.type === candidate.type
    && tx.accountId === candidate.accountId
    && Math.abs(tx.amount).toFixed(2) === amount
    && tx.date === candidate.date
    // Un movimiento que YA vino de un aviso no cuenta: si se contara, dos
    // avisos legítimos del mismo monto se bloquearían entre sí.
    && tx.detectedFrom !== 'notification') ?? null
}
