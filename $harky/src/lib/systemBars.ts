import { isTauri } from '@/hooks/useTauri'

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Ajusta el color de los iconos de las barras del sistema (estado + navegación)
 * para que sigan el TEMA de la app, no el del sistema. `enableEdgeToEdge` en
 * MainActivity los deja fijos en "claros" (buenos sobre fondo oscuro); en tema
 * claro eso los volvía ilegibles. Best-effort: si el plugin no está o falla, se
 * queda el default nativo (correcto para el tema oscuro, que es el dominante).
 */
export async function setSystemBarsAppearance(scheme: 'dark' | 'light'): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    // light=true → barra de fondo CLARO → iconos OSCUROS (para el tema claro).
    await invoke('plugin:local-reminders|set_system_bars', { light: scheme === 'light' })
  } catch {
    // Plugin no disponible o versión sin el comando — no pasa nada.
  }
}
