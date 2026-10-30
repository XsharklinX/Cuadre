/**
 * NO PERDER LO QUE ESCRIBISTE.
 *
 * El formulario de movimiento se cierra desde dos sitios: su propia X y el
 * botón atrás, que maneja `App` (la pila de atrás registra primero a los hijos,
 * así que el formulario no puede ponerse delante). Este guardián une los dos:
 * el formulario dice si tiene cambios y `App` le pregunta antes de cerrar.
 *
 * `guard()` devuelve `true` si se encargó él (por ejemplo, mostró el aviso de
 * descartar) y el cierre NO debe hacerse todavía.
 */
let guard: (() => boolean) | null = null

export function setCloseGuard(fn: (() => boolean) | null): void {
  guard = fn
}

/**
 * Cierra salvo que el guardián diga que se ocupa él. Devuelve `false` en ese
 * caso, que es lo que `useMobileBackDismiss` entiende como «sigo abierto».
 */
export function guardedClose(close: () => void): boolean {
  if (guard && guard()) return false
  close()
  return true
}
