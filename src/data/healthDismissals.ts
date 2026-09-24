/**
 * DESCUADRES QUE EL USUARIO YA REVISÓ.
 *
 * Salud de datos avisa cuando el saldo guardado no coincide con
 * `apertura + movimientos`. Casi siempre es un problema de verdad, pero no
 * siempre: tras arreglar a mano una tarjeta, o al importar un histórico
 * incompleto, queda una diferencia que el usuario YA revisó y da por buena.
 *
 * Hasta ahora no había forma de decírselo a la app, así que el aviso se
 * quedaba encendido para siempre. Un aviso permanente que no se puede
 * atender es peor que ninguno: se aprende a ignorar la pantalla entera, y
 * con ella el descuadre de mañana, que sí importa.
 *
 * ────────────────────────────────────────────────────────────────────
 * LA REGLA QUE HACE QUE ESTO SEA SEGURO
 *
 * Se omite ESE descuadre, no esa cuenta. La huella incluye el IMPORTE, así
 * que si la diferencia cambia —porque apareció un problema nuevo— vuelve a
 * avisar. Silenciar la cuenta entera convertiría esto en una forma de
 * perderse dinero sin enterarse.
 */

export interface DriftFingerprint {
  accountId: string
  /** Diferencia en el libro principal. */
  primary: number
  /** Diferencia en el libro en divisa extranjera de una tarjeta. */
  secondary: number
}

/** Céntimos: por debajo de esto no hay descuadre que omitir. */
const CENT = 0.005

/**
 * La huella de un descuadre concreto.
 *
 * Los importes se redondean a céntimos antes de entrar: sin eso, un
 * recálculo que mueva la diferencia una milésima generaría una huella nueva
 * y el aviso reaparecería solo, pareciendo un fallo.
 */
export function driftKey(d: DriftFingerprint): string {
  const cents = (n: number) => Math.round(n * 100)
  return `${d.accountId}|${cents(d.primary)}|${cents(d.secondary)}`
}

/** ¿Se omitió exactamente este descuadre? */
export function isDriftDismissed(dismissed: string[], d: DriftFingerprint): boolean {
  return dismissed.includes(driftKey(d))
}

/** Los descuadres que todavía hay que enseñar. */
export function pendingDrifts<T extends DriftFingerprint>(dismissed: string[], drifts: T[]): T[] {
  return drifts.filter(d => !isDriftDismissed(dismissed, d))
}

/**
 * Limpia las huellas que ya no corresponden a ningún descuadre vivo.
 *
 * Sin esto la lista crece sin fin: cada vez que un saldo cambia se guarda una
 * huella nueva y la vieja se queda ahí para siempre. Además evita que una
 * huella antigua vuelva a coincidir por casualidad con un descuadre futuro
 * del mismo importe — que es justo el que no queremos silenciar.
 */
export function pruneDismissed(dismissed: string[], drifts: DriftFingerprint[]): string[] {
  const vivos = new Set(drifts.map(driftKey))
  return dismissed.filter(k => vivos.has(k))
}

/** ¿Hay diferencia que merezca aviso? Por debajo del céntimo, no. */
export function hasDrift(d: DriftFingerprint): boolean {
  return Math.abs(d.primary) > CENT || Math.abs(d.secondary) > CENT
}
