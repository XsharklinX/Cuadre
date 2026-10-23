import { daysLate, outstanding, type Charge } from './clients'

/**
 * CUÁNDO RECORDAR UN COBRO.
 *
 * ── EL PROBLEMA ───────────────────────────────────────────────────────
 * El aviso salía TODOS los días mientras el cobro siguiera pendiente. Un
 * cliente que lleva cuarenta días sin pagar generaba cuarenta notificaciones
 * idénticas, y con tres clientes así son ciento veinte.
 *
 * Un aviso que llega todos los días deja de ser un aviso: se aprende a
 * descartarlo sin leerlo, y el día que aparece uno que sí importaba —otro
 * cliente, otro monto— ya se descartó con los demás.
 *
 * ── LA ESCALERA ───────────────────────────────────────────────────────
 * El día que vence, a los 3 días y a los 7. Tres momentos con un significado
 * distinto cada uno: «hoy te toca», «se le pasó», «esto ya no es un olvido».
 * Después, silencio: a los cuarenta días el usuario ya sabe que le deben, y
 * recordárselo otra vez no le dice nada que no sepa.
 *
 * Lo que no se avisa no se pierde: sigue en la lista, en rojo y el primero.
 * La lista es el registro; la notificación es solo el toque en el hombro.
 */

/** Los días de atraso en que se avisa. El `0` es el día del vencimiento. */
export const REMINDER_STEPS = [0, 3, 7] as const

/** Si hoy toca recordar este cobro. */
export function remindToday(charge: Charge, today: string): boolean {
  if (charge.waived || outstanding(charge) <= 0) return false
  if (charge.dueDate > today) return false
  return (REMINDER_STEPS as readonly number[]).includes(daysLate(charge, today))
}

/**
 * Los cobros que toca recordar hoy, lo más atrasado primero.
 *
 * El orden importa porque el aviso se corta en los primeros: si se llenara con
 * los que vencen hoy, el que lleva una semana sin pagar nunca saldría.
 */
export function chargesToRemind(charges: Charge[], today: string, max = 10): Charge[] {
  return charges
    .filter(c => remindToday(c, today))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, max)
}
