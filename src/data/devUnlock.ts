/**
 * El gesto secreto que abre el modo desarrollador.
 *
 * Seis toques sobre la fila de la versión en "Acerca de". Es el mismo gesto
 * que Android usa para su propio modo desarrollador, y eso importa: un gesto
 * que la gente ya conoce no hay que documentarlo, y nadie lo descubre por
 * accidente.
 *
 * La lógica vive aquí, separada de la pantalla, porque la parte delicada es el
 * conteo —la ventana de tiempo, el reinicio, el aviso previo— y eso se prueba
 * sin montar nada.
 */

/** Toques necesarios para abrir el modo desarrollador. */
export const TAPS_TO_UNLOCK = 6

/**
 * Tiempo máximo entre dos toques para que cuenten como seguidos.
 *
 * Sin ventana, tocar la versión tres veces hoy y tres mañana abriría el modo
 * sin querer. 1,5 s es cómodo para tocar rápido y corto para que dos toques
 * casuales con días de diferencia no se sumen.
 */
export const TAP_WINDOW_MS = 1500

/**
 * Desde cuántos toques restantes se avisa.
 *
 * Los tres primeros no dicen NADA: el usuario pidió expresamente que tocar no
 * diera señal. A partir del cuarto se cuenta atrás, porque alguien que ya
 * lleva cuatro toques seguidos lo está haciendo a propósito y quedarse mudo
 * lo único que logra es que se rinda a mitad de camino.
 */
export const HINT_FROM_REMAINING = 3

export interface TapState {
  /** Toques seguidos acumulados. */
  count: number
  /** Momento del último toque (ms epoch). */
  lastAt: number
}

export interface TapResult {
  state: TapState
  /** true solo en el toque que abre el modo. */
  unlocked: boolean
  /** Toques que faltan; null cuando todavía no toca avisar o ya se abrió. */
  remaining: number | null
}

export const initialTapState: TapState = { count: 0, lastAt: 0 }

/**
 * Procesa un toque. Función pura: recibe el estado y devuelve el siguiente.
 *
 * @param alreadyUnlocked Con el modo ya abierto, tocar no hace nada — ni
 *   cuenta ni avisa. Volver a "desbloquear" algo abierto no significa nada.
 */
export function registerTap(
  state: TapState,
  now: number,
  alreadyUnlocked = false,
): TapResult {
  if (alreadyUnlocked) {
    return { state: initialTapState, unlocked: false, remaining: null }
  }

  // Fuera de la ventana, la racha empieza de cero con ESTE toque (no se
  // descarta: sería perder el primero de la serie nueva).
  const continues = state.lastAt > 0 && now - state.lastAt <= TAP_WINDOW_MS
  const count = continues ? state.count + 1 : 1

  if (count >= TAPS_TO_UNLOCK) {
    return { state: initialTapState, unlocked: true, remaining: 0 }
  }

  const remaining = TAPS_TO_UNLOCK - count
  return {
    state: { count, lastAt: now },
    unlocked: false,
    remaining: remaining <= HINT_FROM_REMAINING ? remaining : null,
  }
}
