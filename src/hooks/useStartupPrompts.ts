import { useEffect, useState } from 'react'
import { rescueCandidates, type RescueCandidate } from '@/data/cardRescue'
import { shouldAskBattery } from '@/data/batteryGuide'
import { isBatteryExempt } from '@/lib/localReminders'
import { isTauri } from '@/hooks/useTauri'
import { useBankSuggestions } from '@/store/bankSuggestions'
import { useBattery } from '@/store/battery'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'

/** Espera antes de mirar nada: primero que la app se pinte. */
const SETTLE_MS = 1800

export interface StartupPrompts {
  /** Tarjeta con el disponible guardado como saldo a favor; `null` si no hay. */
  rescue: RescueCandidate | null
  /** ¿Toca ofrecer la guía de batería? */
  battery: boolean
  dismissRescue: () => void
  dismissBattery: () => void
}

/**
 * LOS DOS AVISOS DE ARRANQUE, en un solo sitio y en ORDEN.
 *
 * Nunca se muestran a la vez. Apilar diálogos al abrir la app es cómo se
 * consigue que el usuario los cierre todos sin leer ninguno — y estos dos
 * existen precisamente porque hay algo que sí necesita que lea.
 *
 * El orden no es arbitrario: primero la TARJETA, porque es un número mal en
 * su dinero y se arregla en un toque; después la BATERÍA, que es una tarea de
 * varios pasos fuera de la app. Al revés, quien se cansa a mitad de la guía de
 * batería nunca llega a ver que su patrimonio está mal.
 *
 * Los dos se evalúan UNA vez por sesión, con retraso: preguntar mientras la
 * app todavía está montando es preguntar encima de una pantalla a medias.
 */
export function useStartupPrompts(suppressed: boolean): StartupPrompts {
  const accounts = useFinance(s => s.accounts)
  const dismissedAlerts = useSettings(s => s.dismissedAlerts)
  const batteryState = useBattery()
  const detectionOn = useBankSuggestions(s => s.enabled)
  const weeklyBackup = useSettings(s => s.weeklyAutoBackupEnabled)
  const remindersOn = useSettings(s => s.remindersEnabled)

  const [rescue, setRescue] = useState<RescueCandidate | null>(null)
  const [battery, setBattery] = useState(false)
  const [rescueDone, setRescueDone] = useState(false)
  const [batteryDone, setBatteryDone] = useState(false)

  useEffect(() => {
    if (suppressed) return
    let cancelled = false

    const id = setTimeout(() => {
      void (async () => {
        // 1) La tarjeta. Sólo la primera pendiente: si hay tres mal, se
        //    preguntan en arranques distintos en vez de encadenar diálogos.
        const pending = rescueCandidates(accounts)
          .find(c => !dismissedAlerts.includes(`card-rescue:${c.accountId}`))
        if (!cancelled && pending && !rescueDone) { setRescue(pending); return }

        // 2) La batería, sólo si hay algo de fondo que proteger.
        if (!isTauri() || batteryDone) return
        const exempt = await isBatteryExempt()
        if (cancelled || exempt === null) return
        const ask = shouldAskBattery({
          state: batteryState,
          hasBackgroundWork: Boolean(detectionOn || weeklyBackup || remindersOn),
          alreadyExempt: exempt,
          now: Date.now(),
        })
        if (!cancelled && ask) setBattery(true)
      })()
    }, SETTLE_MS)

    return () => { cancelled = true; clearTimeout(id) }
    // Una sola evaluación por sesión: si dependiera de `accounts`, editar una
    // cuenta reabriría el diálogo en mitad del trabajo del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed])

  return {
    rescue,
    battery,
    dismissRescue: () => { setRescue(null); setRescueDone(true) },
    dismissBattery: () => { setBattery(false); setBatteryDone(true) },
  }
}
