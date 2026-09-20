import { useEffect } from 'react'
import { createBackup } from '@/data/backup'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { isTauri, saveToAppFolder } from './useTauri'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/**
 * Backup automático semanal en formato JSON, guardado en la carpeta
 * "Sharky Finance" con un nombre fijo: cada ejecución sobrescribe la
 * anterior, sin acumular archivos. Se ejecuta al abrir la app si han
 * pasado ≥7 días desde el último backup automático exitoso.
 *
 * Solo para desktop: en Android lo hace el worker nativo (WorkManager, ver
 * `useScheduledBackup`), que corre aunque la app esté cerrada. Si ambos
 * corrieran, el mismo backup se escribiría dos veces en cada apertura.
 */
export function useWeeklyAutoBackup() {
  useEffect(() => {
    if (!isTauri() || isAndroidTauri()) return
    const {
      lastWeeklyBackupAt,
      setLastWeeklyBackupAt,
      weeklyAutoBackupEnabled,
      weeklyAutoBackupDay,
      weeklyAutoBackupHour,
      weeklyBackupFolder,
    } = useSettings.getState()
    if (!weeklyAutoBackupEnabled) return

    const now = new Date()
    if (now.getDay() !== weeklyAutoBackupDay) return
    if (now.getHours() < weeklyAutoBackupHour) return

    const last = lastWeeklyBackupAt ? Date.parse(lastWeeklyBackupAt) : 0
    if (Date.now() - last < WEEK_MS) return

    void (async () => {
      try {
        const json = JSON.stringify(createBackup(useFinance.getState()))
        const blob = new Blob([json], { type: 'application/json' })
        await saveToAppFolder(blob, 'sharky-backup-semanal.json', weeklyBackupFolder)
        setLastWeeklyBackupAt(new Date().toISOString())
      } catch {
        // Se reintenta en el próximo arranque
      }
    })()
  }, [])
}
