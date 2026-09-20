import { isTauri } from '@/hooks/useTauri'

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Muestra u oculta la notificación PERSISTENTE de "agregar rápido" (gasto/ingreso
 * de un toque). Se llama al cambiar el ajuste y al arrancar la app (para
 * re-postearla tras cerrar la app o reiniciar el teléfono). Best-effort: no-op
 * fuera de Android o si el plugin no está.
 */
export async function setQuickAddNotification(enabled: boolean): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:local-reminders|set_quick_add_notification', { enabled })
  } catch {
    // Plugin no disponible / permiso de notificaciones no concedido.
  }
}
