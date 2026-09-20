/**
 * Integración con la app nativa de Tauri.
 * Cuando corre en el browser normal, todas las funciones caen al
 * equivalente web (download/upload por archivo).
 */

import { localToday } from '@/data/helpers'

/** True cuando la app corre dentro de Tauri (no en el browser). */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)

// ── Import dinámico para no romper el bundle web ──────────
async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

async function tauriSaveDialog(opts: { defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog')
  return save(opts)
}

async function tauriOpenDialog(opts: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const result = await open(opts)
  return Array.isArray(result) ? result[0] ?? null : result
}

// ── API pública ────────────────────────────────────────────

/**
 * Guarda un archivo de forma unificada (JSON, PDF, Excel).
 * - Tauri desktop: diálogo nativo de guardado
 * - Chrome/Android Chrome/WebView: showSaveFilePicker (selector de carpeta real)
 * - Fallback: Web Share API → el usuario elige la app destino (Descargas, Drive…)
 * - Último recurso: descarga automática del navegador
 */
export async function saveFile(blob: Blob, filename: string, title: string, extensions: string[]): Promise<boolean> {
  const isAndroid = /android/i.test(navigator.userAgent)

  // Tauri Android: Simular diálogo Guardar usando confirm y guardado directo
  if (isAndroid && isTauri()) {
    const { confirm, message } = await import('@tauri-apps/plugin-dialog')
    const yes = await confirm(`¿Guardar "${filename}" en tu carpeta pública de Descargas?`, { title: 'Guardar archivo', kind: 'info' })
    if (!yes) return false

    const buffer = await blob.arrayBuffer()
    const savedPath = await tauriInvoke<string>('save_to_downloads', { filename, contents: new Uint8Array(buffer) })

    // Saber dónde quedó el archivo no sirve de mucho si hay que salir a buscarlo
    // con un explorador: el aviso ofrece abrirlo ahí mismo. "Listo" es el botón
    // de cancelar del diálogo nativo, así que cerrarlo por fuera equivale a no
    // abrir nada — el archivo ya está guardado en cualquier caso.
    const open = await confirm(`Guardado en:\n${savedPath}`, {
      title: 'Exportación completada',
      kind: 'info',
      okLabel: 'Abrir',
      cancelLabel: 'Listo',
    })
    if (open) {
      const opened = await tauriInvoke<{ resolved: boolean }>('plugin:local-reminders|open_file', {
        path: savedPath,
        mimeType: blob.type || undefined,
      }).catch(() => ({ resolved: false }))
      if (!opened?.resolved) {
        await message('No hay ninguna app instalada que pueda abrir este archivo.', { title: 'No se pudo abrir', kind: 'warning' })
      }
    }
    return true
  }

  // Tauri desktop: diálogo nativo
  if (isTauri() && !isAndroid) {
    const path = await tauriSaveDialog({
      defaultPath: filename,
      filters: [{ name: title, extensions }],
    })
    if (!path) return false
    const buffer = await blob.arrayBuffer()
    await tauriInvoke('write_file', { path, contents: new Uint8Array(buffer) })
    return true
  }

  // File System Access API: selector de carpeta nativo (Chrome 86+, Android Chrome, WebView)
  type SaveFilePickerFn = (opts: {
    suggestedName: string
    types: Array<{ description: string; accept: Record<string, string[]> }>
  }) => Promise<{ createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }> }>
  const showSaveFilePicker = (window as unknown as { showSaveFilePicker?: SaveFilePickerFn }).showSaveFilePicker
  if (typeof showSaveFilePicker === 'function') {
    try {
      const accept: Record<string, string[]> = {}
      if (blob.type) accept[blob.type] = extensions.map(e => `.${e}`)
      const handle = await showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: title, accept }],
      })
      const writable = await handle.createWritable()
      await writable.write(blob)
      await writable.close()
      return true
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return false
      throw err
    }
  }

  // Android PWA fallback: share sheet nativo
  if (isAndroid && typeof navigator.share === 'function') {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title })
        return true
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return false
        throw err
      }
    }
  }

  // Último recurso: descarga programática del navegador
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
  return true
}

/**
 * Guarda un archivo en la carpeta "Sharky Finance" (Descargas en Android,
 * Documentos en desktop) o, si se pasa `folder`, en esa carpeta exacta
 * (ruta absoluta elegida por el usuario). Sin diálogo, sobrescribe si ya
 * existe. Solo disponible en Tauri.
 */
export async function saveToAppFolder(blob: Blob, filename: string, folder?: string | null): Promise<string> {
  const buffer = await blob.arrayBuffer()
  return tauriInvoke<string>('save_to_app_folder', { filename, contents: new Uint8Array(buffer), folder: folder ?? null })
}

/**
 * Abre el selector nativo de carpetas (solo tiene sentido en desktop: en
 * Android este mismo diálogo devuelve una URI SAF que no es una ruta de
 * archivo real, así que no se usa para escoger destino ahí). Devuelve la
 * ruta absoluta elegida, o `null` si el usuario canceló.
 */
export async function pickBackupFolder(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog')
  const result = await open({ directory: true })
  return Array.isArray(result) ? result[0] ?? null : result
}

/**
 * Guarda un backup JSON.
 * - Tauri: se guarda directo en la carpeta destino configurada (o
 *   "Sharky Finance" por defecto), sin diálogo.
 * - Web/PWA: el usuario elige la ubicación (selector de archivos / share sheet).
 */
export async function saveBackup(json: string, folder?: string | null): Promise<boolean> {
  const filename = `sharky-backup-${localToday()}.json`
  const blob = new Blob([json], { type: 'application/json' })
  if (isTauri()) {
    await saveToAppFolder(blob, filename, folder)
    return true
  }
  return saveFile(blob, filename, 'Backup de $harky', ['json'])
}


/**
 * Envía una notificación nativa del sistema operativo (Android/desktop).
 * Pide permiso la primera vez si hace falta. No hace nada en web/PWA
 * (ahí los avisos viven como tarjetas in-app en Inicio).
 */
export async function sendNativeNotification(
  title: string,
  body: string,
  opts?: { actionTypeId?: string; extra?: Record<string, unknown> },
): Promise<void> {
  if (!isTauri()) return
  const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
  let granted = await isPermissionGranted()
  if (!granted) granted = (await requestPermission()) === 'granted'
  if (!granted) return
  // icon/iconColor (Android): sin esto, cae al ícono de la app a todo color,
  // que el sistema aplana y tiñe según el tema del usuario — mismo drawable
  // monocromo y mismo azul que usa el plugin de recordatorios locales, para
  // que todas las notificaciones de $harky se vean iguales.
  sendNotification({
    title, body, actionTypeId: opts?.actionTypeId, extra: opts?.extra,
    icon: 'ic_stat_sharky', iconColor: '#4D82FF',
  })
}

const NOTIFICATION_ACTION_TYPE_ID = 'budget-alert'

/**
 * Registra los botones de acción que pueden aparecer en notificaciones nativas
 * (ej. "Ver" / "Descartar" en alertas de presupuesto). Llamar una sola vez al
 * iniciar la app — no hace nada en web/PWA.
 */
export async function initNotificationActionTypes(): Promise<void> {
  if (!isTauri()) return
  const { registerActionTypes } = await import('@tauri-apps/plugin-notification')
  await registerActionTypes([{
    id: NOTIFICATION_ACTION_TYPE_ID,
    actions: [
      { id: 'view',    title: 'Ver',       foreground: true },
      { id: 'dismiss', title: 'Descartar', foreground: false },
    ],
  }])
}

export { NOTIFICATION_ACTION_TYPE_ID as notificationActionTypeId }

/**
 * Escucha los botones presionados en notificaciones nativas.
 * Devuelve una función para des-suscribirse. No hace nada en web/PWA.
 */
export async function onNotificationAction(
  handler: (actionId: string, extra: Record<string, unknown>) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {}
  const { onAction } = await import('@tauri-apps/plugin-notification')
  const listener = await onAction(notification => {
    const actionId = (notification as { actionId?: string }).actionId
    const extra = (notification as { extra?: Record<string, unknown> }).extra ?? {}
    if (actionId) handler(actionId, extra)
  })
  return () => { void listener.unregister() }
}

/** Recibo (foto/PDF) recibido vía "Compartir" desde otra app — referencia visual temporal. */
export interface SharedReceipt {
  dataUrl: string
  mimeType: string
  name: string
}

/**
 * Revisa si el usuario compartió una o varias fotos/PDFs hacia $harky (ej.
 * desde Galería o WhatsApp — compartir varias a la vez habilita el flujo de
 * recibos por lotes). Consume los archivos pendientes una sola vez —
 * llamadas siguientes devuelven `[]` hasta que se comparta algo nuevo.
 * No hace nada en web/PWA.
 */
export async function checkSharedFiles(): Promise<SharedReceipt[]> {
  if (!isTauri()) return []
  return tauriInvoke<SharedReceipt[]>('take_pending_shared_files')
}

/**
 * Carga un backup JSON.
 * - En Tauri desktop: abre diálogo de archivo nativo → lee el contenido
 * - En Android (Tauri o PWA): usa input[type=file] (tauriOpenDialog no funciona en Android)
 * - En browser desktop: usa input[type=file]
 */
export function openBackup(): Promise<string | null> {
  const isAndroid = /android/i.test(navigator.userAgent)
  if (isTauri() && !isAndroid) {
    return tauriOpenDialog({ filters: [{ name: 'JSON', extensions: ['json'] }] })
      .then(path => path ? tauriInvoke<string>('read_backup', { path }) : null)
  }

  return new Promise(resolve => {
    const input    = document.createElement('input')
    input.type     = 'file'
    input.accept   = '.json,application/json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) { resolve(null); return }
      resolve(await file.text())
    }
    input.oncancel = () => resolve(null)
    input.click()
  })
}