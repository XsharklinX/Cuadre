/**
 * ¿La detección de transacciones está viva?
 *
 * El usuario tuvo la detección muerta durante MESES sin enterarse. El permiso
 * seguía concedido, la pantalla de ajustes decía "concedido", y la app no
 * capturaba nada: al actualizar el APK, Android desvincula el
 * NotificationListenerService y no lo revincula solo. Nada en la app pedía
 * atención, así que nadie miró.
 *
 * Una función que promete registrar tus gastos sola y no lo hace es peor que
 * no tenerla: confías en ella y tu libro se queda a medias sin avisarte. Por
 * eso esto existe y por eso el veredicto es explícito sobre POR QUÉ está mal —
 * "no funciona" no le dice a nadie qué tocar.
 *
 * Es una función pura sobre datos que ya recogíamos (`bankNotificationsDebug`)
 * para poder probar los umbrales sin un teléfono delante.
 */

/** Sin permiso no hay nada que reparar desde la app: hay que ir a Ajustes. */
export type DetectionState =
  | 'off'          // el usuario la tiene desactivada: no opinamos
  | 'no-access'    // falta el permiso especial de notificaciones
  | 'unbound'      // permiso dado pero el servicio NO está vinculado
  | 'silent'       // vinculado, pero lleva demasiado sin capturar nada
  | 'warming-up'   // recién activada: aún no ha tenido ocasión de capturar
  | 'ok'

export interface DetectionHealth {
  state: DetectionState
  /** true cuando merece molestar al usuario con un aviso. */
  alert: boolean
  /** Días completos desde la última captura; null si nunca capturó. */
  daysSilent: number | null
}

export interface DetectionInput {
  enabled: boolean
  granted: boolean
  connected: boolean
  /** ms epoch de la última captura, 0 = nunca. */
  lastCapturedAt: number
  /** ms epoch de la primera vez que se activó, 0 = desconocido. */
  enabledSince: number
  now: number
}

const DAY = 86_400_000

/**
 * 10 días sin una sola captura.
 *
 * No son 2 ni 3: alguien puede pasar una semana sin usar una tarjeta, y un
 * aviso falso enseña a ignorar los avisos. Diez días sin NINGÚN movimiento
 * bancario ya no es "no gasté", es que no está llegando.
 */
export const SILENT_DAYS = 10

/**
 * Margen de cortesía tras activarla. Sin esto, activar la detección disparaba
 * el aviso de "no captura nada" antes de que hubiera podido capturar nada.
 */
export const WARMUP_DAYS = 3

export function detectionHealth(input: DetectionInput): DetectionHealth {
  const { enabled, granted, connected, lastCapturedAt, enabledSince, now } = input

  const daysSilent = lastCapturedAt > 0
    ? Math.floor((now - lastCapturedAt) / DAY)
    : null

  if (!enabled) return { state: 'off', alert: false, daysSilent }
  if (!granted) return { state: 'no-access', alert: true, daysSilent }

  // El fallo silencioso: permiso sí, servicio no. Es el único reparable desde
  // la app (pidiendo el re-vínculo), así que siempre se avisa.
  if (!connected) return { state: 'unbound', alert: true, daysSilent }

  if (lastCapturedAt === 0) {
    const age = enabledSince > 0 ? now - enabledSince : 0
    // Recién activada, o sin fecha de activación conocida (instalaciones
    // viejas): no se acusa a algo que quizá nunca tuvo ocasión de funcionar.
    if (enabledSince === 0 || age < WARMUP_DAYS * DAY) {
      return { state: 'warming-up', alert: false, daysSilent }
    }
    return { state: 'silent', alert: true, daysSilent }
  }

  if (daysSilent !== null && daysSilent >= SILENT_DAYS) {
    return { state: 'silent', alert: true, daysSilent }
  }

  return { state: 'ok', alert: false, daysSilent }
}
