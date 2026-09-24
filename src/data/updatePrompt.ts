import type { UpdateStatus } from '@/lib/inAppUpdate'

/**
 * CUÁNDO Y CÓMO SE PIDE ACTUALIZAR.
 *
 * Separado del plugin a propósito: aquí no hay Android ni Play, solo la
 * decisión. Así se puede probar el caso que importa —insistir lo justo— sin un
 * teléfono delante.
 *
 * El equilibrio que busca: quien abrió la app venía a apuntar un gasto. Un
 * aviso que bloquea la pantalla el primer día es un aviso que se aprende a
 * cerrar sin leer, y entonces ya no sirve para el día en que de verdad importa.
 */

/** A partir de aquí la copia instalada ya se está perdiendo arreglos de dinero. */
export const FORCE_AFTER_DAYS = 14

/** Cada cuánto se vuelve a ofrecer lo que se pospuso. */
export const SNOOZE_DAYS = 3

/** Veces que se acepta un "ahora no" antes de dejar de preguntar por esa versión. */
export const MAX_SNOOZES = 4

export type UpdateDecision =
  /** Ni preguntar. */
  | { show: false }
  /** Ya descargada: solo falta reiniciar para instalarla. */
  | { show: true; mode: 'install' }
  /** Ofrecer descarga de fondo; la persona puede seguir usando la app. */
  | { show: true; mode: 'flexible' }
  /** Pantalla completa de Google. Solo cuando la copia está muy vieja. */
  | { show: true; mode: 'immediate' }

export interface SnoozeState {
  /** Versión que se pospuso. Al salir otra, el contador vuelve a cero. */
  version?: number
  /** Cuándo fue el último "ahora no", en milisegundos. */
  lastAskedAt?: number
  times?: number
}

export const EMPTY_SNOOZE: SnoozeState = {}

export function decideUpdatePrompt(
  status: UpdateStatus,
  snooze: SnoozeState,
  now: number,
): UpdateDecision {
  if (!status.available) return { show: false }

  /*
   * DESCARGADA GANA SOBRE TODO.
   *
   * Si ya está en el teléfono, volver a ofrecer "descargar" desperdiciaría los
   * datos que la persona ya gastó y la dejaría creyendo que no avanzó nada.
   * Aquí solo falta un reinicio, y eso se pide siempre — sin posponer: el
   * trabajo ya está hecho y no cuesta nada aceptarlo.
   */
  if (status.downloaded) return { show: true, mode: 'install' }

  const stale = status.stalenessDays ?? 0

  /*
   * Lo viejo se impone al "ahora no".
   *
   * Dos semanas de retraso significa perderse arreglos que afectan al dinero
   * —en esta app, saldos que desaparecían—. Ahí el corte de pantalla se
   * justifica y el aplazamiento deja de contar.
   */
  if (stale >= FORCE_AFTER_DAYS && status.immediateAllowed) {
    return { show: true, mode: 'immediate' }
  }

  // Versión distinta a la pospuesta: es una oferta nueva, contador a cero.
  const sameVersion = snooze.version !== undefined && snooze.version === status.versionCode
  if (sameVersion) {
    if ((snooze.times ?? 0) >= MAX_SNOOZES) return { show: false }
    const since = now - (snooze.lastAskedAt ?? 0)
    if (since < SNOOZE_DAYS * 86_400_000) return { show: false }
  }

  if (status.flexibleAllowed) return { show: true, mode: 'flexible' }
  // Sin descarga de fondo disponible, la pantalla completa es la única vía.
  if (status.immediateAllowed) return { show: true, mode: 'immediate' }
  return { show: false }
}

/** El estado tras un "ahora no". */
export function snoozed(status: UpdateStatus, snooze: SnoozeState, now: number): SnoozeState {
  const sameVersion = snooze.version === status.versionCode
  return {
    version: status.versionCode,
    lastAskedAt: now,
    times: sameVersion ? (snooze.times ?? 0) + 1 : 1,
  }
}
