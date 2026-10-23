/**
 * INSISTIR DE VERDAD CON LA COPIA DE SEGURIDAD.
 *
 * La copia existe y funciona desde hace versiones: está en Ajustes → Datos,
 * esperando a que entres a buscarla. Nadie entra a Ajustes a hacer una copia.
 * Se descubre que hacía falta el día que se cambia de teléfono o se pierde, y
 * ese día ya no hay nada que hacer: estos datos viven SOLO en ese aparato —
 * no hay servidor, no hay cuenta, no hay nube.
 *
 * Así que la copia tiene que pedirse donde la gente está, no donde la copia
 * vive. Esto decide cuándo hacerlo sin volverse ruido.
 *
 * TRES FRENOS PARA QUE NO CANSE:
 *
 * · Hace falta tener algo que perder. Con cuatro movimientos de prueba no se
 *   molesta a nadie: la primera semana de uso es justo cuando un aviso así
 *   hace que la app parezca pesada.
 *
 * · Se espera un tiempo largo. Un mes, no tres días. Quien acaba de empezar
 *   no tiene nada en riesgo todavía, y un aviso que aparece demasiado pronto
 *   enseña a ignorar los avisos siguientes.
 *
 * · Se puede descartar, y entonces se calla otro mes. No para siempre: el
 *   riesgo no desaparece porque lo tapes, solo deja de ser urgente hoy.
 */

/** Días sin copia a partir de los cuales se pide. */
export const NUDGE_AFTER_DAYS = 30

/** Movimientos mínimos para que haya algo que perder. */
export const NUDGE_MIN_TX = 15

/** Cuánto se calla tras descartarlo. */
export const NUDGE_SNOOZE_DAYS = 30

const DIA = 86_400_000

export interface BackupNudgeInput {
  /** La más reciente de las copias (manual o programada), en ISO. */
  lastBackupAt: string | null
  /** Cuántos movimientos hay en el libro. */
  txCount: number
  /** Cuándo se descartó el aviso por última vez, en ms. 0 = nunca. */
  dismissedAt: number
  now: number
}

export interface BackupNudge {
  /** Días desde la última copia, o `null` si nunca se hizo ninguna. */
  daysSince: number | null
  /** Si toca enseñar la tarjeta. */
  show: boolean
}

/** Lee una fecha ISO sin reventar si viene corrupta de una versión vieja. */
function parseIso(value: string | null): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

export function backupNudge(input: BackupNudgeInput): BackupNudge {
  const { lastBackupAt, txCount, dismissedAt, now } = input
  const ultima = parseIso(lastBackupAt)
  const daysSince = ultima === null ? null : Math.max(0, Math.floor((now - ultima) / DIA))

  // Sin nada que perder, no se molesta.
  if (txCount < NUDGE_MIN_TX) return { daysSince, show: false }

  // Descartado hace poco: se respeta el silencio pedido.
  if (dismissedAt > 0 && now - dismissedAt < NUDGE_SNOOZE_DAYS * DIA) {
    return { daysSince, show: false }
  }

  // Nunca hubo copia y ya hay libro de verdad: ése es el caso más grave.
  if (daysSince === null) return { daysSince, show: true }

  return { daysSince, show: daysSince >= NUDGE_AFTER_DAYS }
}
