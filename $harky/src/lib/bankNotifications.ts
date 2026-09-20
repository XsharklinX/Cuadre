import { isTauri } from '@/hooks/useTauri'

/** Notificación cruda capturada por el plugin nativo (Android). */
export interface RawBankNotification {
  package: string
  title: string
  text: string
  postTime: number
}

export interface NotificationAccessStatus {
  /** El usuario concedió el acceso especial a notificaciones. */
  granted: boolean
  /**
   * El sistema tiene el servicio de escucha VINCULADO ahora mismo. No es lo
   * mismo que `granted`: al actualizar el APK, Android desvincula el listener y
   * no lo revincula solo, así que quedaba permiso concedido pero cero
   * detecciones. Consultar este estado pide además el re-vínculo al sistema.
   */
  connected: boolean
}

/**
 * Estado real de la captura de notificaciones. Como efecto secundario, si el
 * permiso está concedido pero el servicio quedó desvinculado, el lado nativo
 * pide el re-vínculo — así se repara solo con solo abrir Ajustes.
 */
export async function getNotificationAccessStatus(): Promise<NotificationAccessStatus> {
  if (!isTauri()) return { granted: false, connected: false }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const res = await invoke<{ granted: boolean; connected?: boolean }>('plugin:bank-notifications|has_access')
    return { granted: res.granted, connected: res.connected ?? false }
  } catch {
    return { granted: false, connected: false }
  }
}

/** True si la app tiene concedido el acceso especial de notificaciones. */
export async function hasNotificationAccess(): Promise<boolean> {
  return (await getNotificationAccessStatus()).granted
}

/** Abre los ajustes del sistema donde el usuario concede el acceso a notificaciones. */
export async function openNotificationAccessSettings(): Promise<void> {
  if (!isTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:bank-notifications|open_settings')
  } catch {
    // no-op: en desktop o si el plugin no está disponible
  }
}

/**
 * Escucha las notificaciones del sistema reenviadas por el plugin nativo.
 * Devuelve una función para des-suscribirse. No hace nada en web/PWA.
 *
 * Con la app abierta, el servicio nativo "despierta" a JS con este evento; el
 * dato real se lee siempre de la cola persistida (`takePendingBankNotifications`),
 * así que el callback normalmente solo dispara un drenaje.
 */
export async function listenBankNotifications(
  onEvent: (event: RawBankNotification) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  try {
    const { addPluginListener } = await import('@tauri-apps/api/core')
    const handle = await addPluginListener('bank-notifications', 'notification', onEvent)
    return () => { handle.unregister() }
  } catch {
    return () => {}
  }
}

/**
 * Drena la cola de avisos capturados por el servicio nativo — incluidos los que
 * llegaron con la app CERRADA — y la vacía. Es la fuente de verdad: el evento en
 * vivo solo sirve para gatillar un drenaje inmediato cuando la app está abierta.
 */
export async function takePendingBankNotifications(): Promise<RawBankNotification[]> {
  if (!isTauri()) return []
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const res = await invoke<{ items: RawBankNotification[] }>('plugin:bank-notifications|take_pending')
    return res.items ?? []
  } catch {
    return []
  }
}
