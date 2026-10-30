import { log } from '@/lib/logger'

/**
 * Abre un enlace FUERA de la app (WhatsApp, el navegador).
 *
 * En el WebView de Android un `location.href` o un `<a>` intenta navegar
 * dentro de la app y la deja en blanco: tiene que salir por el sistema, con el
 * plugin `opener`. Fuera de Tauri, el navegador se encarga.
 */
export async function openExternal(url: string): Promise<boolean> {
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return true
  } catch (error) {
    log.warn('openExternal: el sistema no abrió el enlace', error)
    try {
      return !!window.open(url, '_blank', 'noopener')
    } catch {
      return false
    }
  }
}
