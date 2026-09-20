import { isTauri } from '@/hooks/useTauri'

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Comparte texto con la hoja nativa de "compartir con...". En Android+Tauri
 * usa el plugin nativo (`Intent.ACTION_SEND`) porque el WebView de Android no
 * implementa `navigator.share()` por su cuenta — sin esto, compartir caía
 * siempre a copiar al portapapeles. Fuera de Android+Tauri usa la Web Share
 * API del navegador (PWA/desktop). Devuelve `false` si el usuario cancela o
 * si no hay ninguna vía disponible — en ese caso el llamador debe caer a
 * copiar al portapapeles como último recurso.
 */
export async function shareText(text: string, title?: string): Promise<boolean> {
  if (isAndroidTauri()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:local-reminders|share_text', { text, title })
      return true
    } catch {
      return false
    }
  }
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text, title })
      return true
    } catch {
      return false
    }
  }
  return false
}
