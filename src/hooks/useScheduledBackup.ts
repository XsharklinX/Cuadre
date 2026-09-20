import { useEffect, useRef } from 'react'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import {
  cancelWeeklyBackup, getScheduledBackupStatus, runBackupNow,
  scheduleWeeklyBackup, syncBackupSnapshot,
} from '@/lib/scheduledBackup'

/** Pasado esto sin backup exitoso, se considera vencido y se corre al abrir la app. */
const OVERDUE_MS = 8 * 24 * 60 * 60 * 1000

/**
 * Contraparte Android de `useWeeklyAutoBackup`: mantiene al día el snapshot que
 * el worker nativo (WorkManager) copia a la carpeta elegida, programa ese
 * worker, y —sobre todo— actúa como RED DE SEGURIDAD cuando el worker no corre.
 *
 * Por qué hace falta la red: WorkManager periódico no garantiza horario, y en
 * Xiaomi / Huawei / Samsung / Realme el gestor de batería lo mata salvo que el
 * usuario ponga la app en "sin restricciones". Si el worker no despierta, en
 * Android no había NINGÚN otro camino: `useWeeklyAutoBackup` sale temprano en
 * Android a propósito, así que el backup simplemente no ocurría y nadie se
 * enteraba hasta necesitarlo.
 *
 * Ahora, si al abrir la app el backup está vencido, se copia en ese momento. La
 * app está abierta: no hay excusa para no escribirlo.
 */
export function useScheduledBackup(): void {
  const transactions = useFinance(s => s.transactions)
  const accounts = useFinance(s => s.accounts)
  const categories = useFinance(s => s.categories)
  const goals = useFinance(s => s.goals)
  const currency = useFinance(s => s.currency)
  const enabled = useSettings(s => s.weeklyAutoBackupEnabled)
  const day = useSettings(s => s.weeklyAutoBackupDay)
  const hour = useSettings(s => s.weeklyAutoBackupHour)
  const isFirstSync = useRef(true)
  const caughtUp = useRef(false)

  // (Re)programa o cancela el worker cuando cambia la preferencia. Se vuelve a
  // encolar en cada arranque a propósito: al actualizar el APK, Android puede
  // descartar el trabajo programado y no lo repone solo.
  useEffect(() => {
    if (enabled) {
      void scheduleWeeklyBackup(day, hour)
    } else {
      void cancelWeeklyBackup()
    }
  }, [enabled, day, hour])

  // Mantiene el archivo del snapshot al día: si está viejo, el backup semanal
  // saldría viejo. Se debounce para no reescribir en cada tecla.
  useEffect(() => {
    if (!enabled) return
    const delay = isFirstSync.current ? 0 : 1500
    isFirstSync.current = false
    const id = setTimeout(() => { void syncBackupSnapshot() }, delay)
    return () => clearTimeout(id)
  }, [transactions, accounts, categories, goals, currency, enabled])

  /**
   * El snapshot se escribe con 1.5s de retraso. Si el usuario agrega un gasto y
   * cierra la app de inmediato, ese cambio no llegaba al archivo y el backup de
   * la semana salía sin él. Al irse a segundo plano se fuerza la escritura.
   */
  useEffect(() => {
    if (!enabled) return
    const flush = () => {
      if (document.visibilityState === 'hidden') void syncBackupSnapshot()
    }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
    }
  }, [enabled])

  // RED DE SEGURIDAD: backup vencido al abrir la app → se copia ahora.
  useEffect(() => {
    if (!enabled || caughtUp.current) return
    caughtUp.current = true

    void (async () => {
      const status = await getScheduledBackupStatus()
      // Fuera de Android, o sin carpeta elegida, no hay nada que hacer aquí.
      // La falta de carpeta se avisa en Salud de datos, que es donde el usuario
      // puede resolverla.
      if (!status?.hasFolder) return

      const last = status.lastSuccessAt?.getTime() ?? 0
      if (Date.now() - last < OVERDUE_MS) return

      // `runBackupNow` sincroniza el snapshot y ejecuta el MISMO camino que el
      // worker, así que un éxito aquí es un éxito real, no una simulación.
      await runBackupNow()
    })()
  }, [enabled])
}
