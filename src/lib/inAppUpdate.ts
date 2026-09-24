import { isTauri } from '@/hooks/useTauri'
import { log } from '@/lib/logger'

/**
 * ACTUALIZAR SIN SALIR DE LA APP — lado JavaScript.
 *
 * La fuente de verdad es Google Play, no un archivo nuestro. Antes esto se
 * resolvía comparando contra un `version.json` publicado a mano en GitHub
 * Pages, y el resultado fue que se quedó clavado en 1.7.4 mientras la app iba
 * por la 1.9.6: durante nueve versiones el aviso no le apareció a nadie. Un
 * dato que hay que acordarse de actualizar a mano es un dato que algún día
 * estará mal — y este lo estuvo casi un año.
 */

export interface UpdateStatus {
  available: boolean
  versionCode?: number
  /** Días que lleva publicada la versión nueva. */
  stalenessDays?: number
  flexibleAllowed: boolean
  immediateAllowed: boolean
  /** Ya está descargada de una sesión anterior: solo falta instalarla. */
  downloaded: boolean
  /** Por qué no se pudo preguntar. Para el panel de desarrollador. */
  reason?: string
}

export interface UpdateProgress {
  status: number
  bytesDownloaded: number
  totalBytesToDownload: number
  downloaded: boolean
}

const NOT_AVAILABLE: UpdateStatus = {
  available: false, flexibleAllowed: false, immediateAllowed: false, downloaded: false,
}

/**
 * A partir de cuántos días de antigüedad se pasa al modo que bloquea la
 * pantalla.
 *
 * Quien abrió la app venía a apuntar un gasto, no a esperar una descarga: el
 * modo de fondo es el respetuoso y es el predeterminado. Pero una copia con dos
 * semanas de retraso ya se está perdiendo arreglos que le afectan al dinero, y
 * ahí el corte se justifica.
 */
export const STALENESS_FORCE_DAYS = 14

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * ¿Hay algo más nuevo en Play?
 *
 * Nunca lanza. Que no se pueda preguntar —sin red, o una copia instalada fuera
 * de Play— no es un error que deba llegarle al usuario: es simplemente "hoy no
 * hay nada que ofrecerte".
 */
export async function checkForUpdate(): Promise<UpdateStatus> {
  if (!isAndroidTauri()) return NOT_AVAILABLE
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<UpdateStatus>('plugin:in-app-update|check')
  } catch (error) {
    log.warn('in-app-update: no se pudo consultar Play', error)
    return NOT_AVAILABLE
  }
}

/**
 * Arranca la actualización.
 *
 * @param immediate `true` toma la pantalla completa hasta terminar y reinicia
 * la app solo; `false` (lo normal) descarga de fondo mientras la persona sigue
 * usando la app.
 */
export async function startUpdate(immediate = false): Promise<boolean> {
  if (!isAndroidTauri()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ started: boolean; reason?: string }>(
      'plugin:in-app-update|start', { immediate },
    )
    if (!result.started) log.warn('in-app-update: no arrancó', result.reason)
    return result.started
  } catch (error) {
    log.warn('in-app-update: fallo al arrancar', error)
    return false
  }
}

/**
 * Instala lo ya descargado. REINICIA LA APP.
 *
 * Por eso nunca se llama sola: se le pregunta antes a la persona. Reiniciar a
 * media frase mientras escribe un gasto es perderle el gasto y la confianza a
 * la vez.
 */
export async function installUpdate(): Promise<boolean> {
  if (!isAndroidTauri()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ ok: boolean; reason?: string }>('plugin:in-app-update|install')
    if (!result.ok) log.warn('in-app-update: no se pudo instalar', result.reason)
    return result.ok
  } catch (error) {
    log.warn('in-app-update: fallo al instalar', error)
    return false
  }
}

/** Progreso de la descarga de fondo. Devuelve la función para dejar de escuchar. */
export async function onUpdateProgress(fn: (p: UpdateProgress) => void): Promise<() => void> {
  if (!isAndroidTauri()) return () => {}
  try {
    const { addPluginListener } = await import('@tauri-apps/api/core')
    const handle = await addPluginListener('in-app-update', 'updateProgress', fn)
    return () => { handle.unregister() }
  } catch {
    return () => {}
  }
}
