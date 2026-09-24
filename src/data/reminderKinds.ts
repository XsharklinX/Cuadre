/**
 * LOS TIPOS DE AVISO, uno por uno.
 *
 * Hasta ahora habia UN interruptor para los ocho. A quien le molestaba el
 * resumen semanal solo le quedaba apagarlo todo — y con el se iban los siete
 * utiles, incluido el aviso de que se esta pasando del presupuesto. Un
 * interruptor unico para ocho cosas distintas se acaba apagando por la mas
 * molesta.
 *
 * Apagar un tipo NO necesita tocar el codigo nativo: el worker de Android
 * dispara a partir de las listas que le manda la app, asi que basta con no
 * mandarle los datos de ese tipo (ver `buildReminderSnapshot`). Lo que no
 * existe en el snapshot no se puede notificar.
 */
export const REMINDER_KINDS = [
  'budget', 'recurring', 'lowfunds', 'goal', 'weekly', 'fx', 'anomaly',
] as const

export type ReminderKind = typeof REMINDER_KINDS[number]

/**
 * Ausente = encendido.
 *
 * Asi las instalaciones que ya existen no pierden avisos al actualizar: quien
 * nunca ha tocado esto sigue recibiendo lo mismo que antes.
 */
export function isReminderKindOn(
  kinds: Partial<Record<ReminderKind, boolean>>,
  kind: ReminderKind,
): boolean {
  return kinds[kind] !== false
}
