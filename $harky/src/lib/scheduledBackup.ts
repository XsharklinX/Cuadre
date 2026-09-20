import { createBackup } from '@/data/backup'
import { isTauri } from '@/hooks/useTauri'
import { useFinance } from '@/store/finance'

/**
 * Backup semanal automatico real (Android): lo ejecuta WorkManager aunque el
 * usuario no abra la app. Antes dependia de abrirla justo el dia/hora elegidos,
 * asi que si no la abrias no habia backup.
 *
 * El worker nativo no puede leer el estado de la app (vive en el localStorage
 * del WebView), asi que aqui dejamos el JSON del backup en un archivo que el
 * worker copia a la carpeta que el usuario eligio por SAF.
 */

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

export interface ScheduledBackupStatus {
  /** El usuario ya eligio una carpeta destino. */
  hasFolder: boolean
  /** Nombre legible de la carpeta (ej. "Backups"), o null si no hay. */
  folderLabel: string | null
  /**
   * La carpeta sigue siendo escribible AHORA. Puede ser false aunque
   * `hasFolder` sea true: el usuario pudo borrarla o revocar el permiso, y en
   * ese caso el backup de fondo fallaria en silencio.
   */
  folderWritable: boolean
  /** 0 = domingo … 6 = sabado. */
  day: number
  hour: number
  lastSuccessAt: Date | null
  lastAttemptAt: Date | null
  /** Codigo corto del ultimo error ('no-permission', 'no-snapshot'…), o null. */
  lastError: string | null
  /** Hay datos para respaldar; si es false el worker no tiene que copiar. */
  hasSnapshot: boolean
}

/**
 * Deja el backup actual donde el worker nativo pueda leerlo. Hay que llamarlo
 * cuando los datos cambian: el worker copia este archivo tal cual, asi que si
 * esta viejo, el backup semanal sale viejo.
 */
export async function syncBackupSnapshot(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const snapshot = JSON.stringify(createBackup(useFinance.getState()))
    await invoke('plugin:local-reminders|sync_backup_snapshot', { snapshot })
  } catch {
    // plugin no disponible — el backup al abrir la app sigue funcionando
  }
}

/**
 * Abre el selector de carpetas de Android y conserva el permiso sobre la
 * elegida (sin eso, el backup de fondo perderia acceso al reiniciar).
 */
export async function pickBackupFolder(): Promise<{ cancelled: boolean; label: string | null }> {
  if (!isAndroidTauri()) return { cancelled: true, label: null }
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ cancelled: boolean; label?: string | null }>('plugin:local-reminders|pick_backup_folder')
    return { cancelled: result.cancelled, label: result.label ?? null }
  } catch {
    return { cancelled: true, label: null }
  }
}

/** Programa (o reprograma) el backup semanal. `day`: 0 = domingo … 6 = sabado. */
export async function scheduleWeeklyBackup(day: number, hour: number): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:local-reminders|schedule_weekly_backup', { day, hour })
  } catch {
    // plugin no disponible
  }
}

export async function cancelWeeklyBackup(): Promise<void> {
  if (!isAndroidTauri()) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:local-reminders|cancel_weekly_backup')
  } catch {
    // plugin no disponible
  }
}

/**
 * "Probar backup ahora": ejecuta el mismo camino que el worker semanal
 * (escribe, relee y valida el archivo), para que el usuario sepa si de verdad
 * funciona sin esperar una semana.
 */
export async function runBackupNow(): Promise<{ ok: boolean; error: string | null }> {
  if (!isAndroidTauri()) return { ok: false, error: 'unavailable' }
  try {
    await syncBackupSnapshot()
    const { invoke } = await import('@tauri-apps/api/core')
    const result = await invoke<{ ok: boolean; error?: string | null }>('plugin:local-reminders|run_backup_now')
    return { ok: result.ok, error: result.error ?? null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'unknown-error' }
  }
}

/** Estado real del backup programado segun Android. `null` fuera de Android+Tauri. */
export async function getScheduledBackupStatus(): Promise<ScheduledBackupStatus | null> {
  if (!isAndroidTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const raw = await invoke<{
      hasFolder: boolean
      folderLabel: string | null
      folderWritable: boolean
      day: number
      hour: number
      lastSuccessAt: number
      lastAttemptAt: number
      lastError: string | null
      hasSnapshot: boolean
    }>('plugin:local-reminders|get_backup_status')
    return {
      hasFolder: raw.hasFolder,
      folderLabel: raw.folderLabel ?? null,
      folderWritable: raw.folderWritable,
      day: raw.day,
      hour: raw.hour,
      lastSuccessAt: raw.lastSuccessAt > 0 ? new Date(raw.lastSuccessAt) : null,
      lastAttemptAt: raw.lastAttemptAt > 0 ? new Date(raw.lastAttemptAt) : null,
      lastError: raw.lastError ?? null,
      hasSnapshot: raw.hasSnapshot,
    }
  } catch {
    return null
  }
}
