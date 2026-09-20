import { isTauri } from '@/hooks/useTauri'

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Abre un archivo ya guardado (PDF, Excel, CSV, imagen…) con la app que el
 * usuario elija. Solo tiene sentido en Android+Tauri, donde los exports caen
 * en una ruta real del disco: en web/PWA el archivo lo gestiona el navegador
 * y nunca sabemos dónde acabó.
 *
 * Devuelve `false` si no se pudo abrir (no hay app capaz de ese tipo, el
 * archivo se movió, o no estamos en Android). El llamador NO debe tratar eso
 * como un fallo del export — el archivo está guardado igual.
 */
export async function openSavedFile(path: string, mimeType?: string): Promise<boolean> {
  if (!isAndroidTauri()) return false
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const res = await invoke<{ resolved: boolean }>('plugin:local-reminders|open_file', { path, mimeType })
    return res?.resolved !== false
  } catch {
    return false
  }
}

/**
 * Selector de imagen nativo. Se usa en lugar de `<input type="file">` en
 * Android porque el selector que levanta el WebView (ACTION_GET_CONTENT) en
 * muchos teléfonos abre la galería del fabricante, que solo lista los álbumes
 * indexados por MediaStore — Cámara, Descargas y poco más.
 *
 * En su lugar sale el menú de Android con todas las galerías instaladas, más
 * una entrada de "explorar archivos" para las fotos que ninguna galería indexa.
 * Las etiquetas se pasan traducidas desde aquí porque el plugin nativo no tiene
 * acceso al idioma elegido en la app.
 *
 * Devuelve el data URL de la imagen (ya reducida en el lado nativo), o `null`
 * si el usuario canceló o si no estamos en Android — en ese caso el llamador
 * debe caer al `<input type="file">` de siempre.
 */
export async function pickImageNative(
  labels: { chooserTitle: string; browseLabel: string },
  maxSize = 1600,
): Promise<string | null> {
  if (!isAndroidTauri()) return null
  const { invoke } = await import('@tauri-apps/api/core')
  const res = await invoke<{ cancelled: boolean; dataUrl?: string }>(
    'plugin:local-reminders|pick_image',
    { maxSize, chooserTitle: labels.chooserTitle, browseLabel: labels.browseLabel },
  )
  if (res?.cancelled || !res?.dataUrl) return null
  return res.dataUrl
}

/** True cuando `pickImageNative` está disponible (Android + Tauri). */
export function canPickImageNative(): boolean {
  return isAndroidTauri()
}
