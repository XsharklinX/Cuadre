/**
 * ¿HAY QUE ENCENDER LA DETECCIÓN SOLA?
 *
 * Son DOS interruptores independientes: el permiso especial de Android y el de
 * la app. Conceder el de Android es la parte difícil —una pantalla del sistema
 * donde hay que buscar la app en una lista— y solo sirve para esto. Ya es el
 * consentimiento. Pedir un segundo sí después de lo difícil es una trampa, y el
 * usuario se queda con el permiso puesto y la detección apagada sin saberlo.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ ESTO VIVE AQUÍ Y NO EN LA PANTALLA DE AJUSTES
 *
 * Vivía dentro de `SettingsBankNotifications`, así que solo se ejecutaba si el
 * usuario ENTRABA a Ajustes › Notificaciones. Quien concedía el permiso desde
 * cualquier otro sitio y no volvía a pasar por esa pantalla se quedaba con la
 * detección apagada para siempre: el hook salía en su primera línea, la cola
 * nativa se llenaba hasta su tope y se descartaba. Cero detecciones, ningún
 * error, nada en los registros.
 *
 * Es el mismo fallo que ya se arregló una vez para el re-vínculo del servicio
 * —«una pantalla a la que nadie entra»— pero el encendido se quedó atrás.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ NO SE EXIGE QUE EL SERVICIO ESTÉ VINCULADO
 *
 * La condición anterior pedía también `connected`. Eso abre una carrera: al
 * volver del ajuste del sistema, Android puede tardar en vincular el servicio,
 * así que la comprobación veía `granted: true, connected: false` y no encendía
 * nada — y como solo se intentaba al abrir esa pantalla, no había segunda
 * oportunidad.
 *
 * `connected` es un estado pasajero y no debe gobernar una preferencia que se
 * guarda. Encender algo que todavía no puede trabajar no cuesta nada; no
 * encenderlo cuesta la función entera.
 */

export interface AutoEnableInput {
  /** El usuario concedió el acceso especial a notificaciones de Android. */
  granted: boolean
  /** El interruptor de la app, ahora mismo. */
  enabled: boolean
  /**
   * Cuándo se encendió por primera vez. 0 = nunca.
   *
   * Es lo que distingue «nunca se encendió» de «lo apagó a propósito»: quien
   * lo apaga deja este sello puesto, y su decisión se respeta para siempre.
   */
  enabledSince: number
}

/** ¿Procede encenderla sin preguntar? */
export function shouldAutoEnableDetection(input: AutoEnableInput): boolean {
  if (!input.granted) return false
  if (input.enabled) return false
  return input.enabledSince === 0
}
