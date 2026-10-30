/**
 * Lo que el menú rápido de un movimiento quiere que el formulario abra ya
 * hecho: «Dividir» enciende la división y «Hacer recurrente» la repetición,
 * con «Más detalles» desplegado. Se lee una vez al montar el formulario.
 */
export type TxFormIntent = 'split' | 'recurring'

let intent: TxFormIntent | null = null

export function setTxFormIntent(next: TxFormIntent | null): void {
  intent = next
}

/** Devuelve la intención pendiente y la borra. */
export function takeTxFormIntent(): TxFormIntent | null {
  const current = intent
  intent = null
  return current
}
