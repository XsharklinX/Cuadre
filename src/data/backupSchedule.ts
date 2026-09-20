/**
 * Cuándo toca una copia de seguridad.
 *
 * Esta lógica vive aquí, en TypeScript puro y probada, porque es la MISMA
 * decisión que toma el worker de Android (`BackupWorker.doWork`). Tenerla en
 * un solo sitio verificable evita que las dos implementaciones se separen sin
 * que nadie lo note — que es justo cómo se pierde un backup.
 */

/** Nunca dos copias dentro de la misma ventana semanal. */
export const MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000

/**
 * Pasado esto, la copia se hace en la PRIMERA oportunidad, sin esperar al día
 * elegido.
 *
 * El día y la hora del usuario son una PREFERENCIA, no una condición. Cuando
 * eran una condición, el worker solo copiaba si ese día exacto llegaba a
 * despertar; con la deriva de WorkManager y el agrupamiento de Doze, perder
 * todas las ventanas de ese día significaba saltarse la SEMANA ENTERA en
 * silencio. Un backup un día tarde es infinitamente mejor que ninguno.
 */
export const OVERDUE_MS = 8 * 24 * 60 * 60 * 1000

export interface BackupDecision {
  due: boolean
  /** Por qué toca (o no), para poder explicarlo y depurarlo. */
  reason: 'no-folder' | 'too-soon' | 'overdue' | 'preferred-window' | 'waiting-for-day' | 'waiting-for-hour'
}

export interface BackupScheduleInput {
  hasFolder: boolean
  /** Epoch ms del último backup exitoso; 0 = nunca. */
  lastSuccessAt: number
  /** 0 = domingo … 6 = sábado. */
  preferredDay: number
  preferredHour: number
  now: Date
}

export function backupDecision(input: BackupScheduleInput): BackupDecision {
  if (!input.hasFolder) return { due: false, reason: 'no-folder' }

  const elapsed = input.now.getTime() - input.lastSuccessAt
  if (input.lastSuccessAt > 0 && elapsed < MIN_INTERVAL_MS) {
    return { due: false, reason: 'too-soon' }
  }

  // Vencido (o nunca): se copia ya, caiga el día que caiga.
  if (input.lastSuccessAt === 0 || elapsed >= OVERDUE_MS) {
    return { due: true, reason: 'overdue' }
  }

  // Camino normal: el día y la hora que el usuario prefiere.
  if (input.now.getDay() !== input.preferredDay) {
    return { due: false, reason: 'waiting-for-day' }
  }
  if (input.now.getHours() < input.preferredHour) {
    return { due: false, reason: 'waiting-for-hour' }
  }
  return { due: true, reason: 'preferred-window' }
}

/** Días transcurridos desde la última copia. `null` si nunca hubo una. */
export function daysSinceBackup(lastSuccessAt: number, now = new Date()): number | null {
  if (lastSuccessAt <= 0) return null
  return Math.floor((now.getTime() - lastSuccessAt) / 86_400_000)
}

/** true si el backup está en un estado que el usuario debería ver y resolver. */
export function backupNeedsAttention(input: {
  hasFolder: boolean
  folderWritable: boolean
  lastSuccessAt: number
  now?: Date
}): boolean {
  if (!input.hasFolder || !input.folderWritable) return true
  const days = daysSinceBackup(input.lastSuccessAt, input.now ?? new Date())
  return days === null || days >= 8
}
