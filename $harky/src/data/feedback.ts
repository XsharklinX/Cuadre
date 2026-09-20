import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useSettings } from '@/store/settings'
import { isTauri } from '@/hooks/useTauri'
import { APP_VERSION } from '@/data/release'
import { log } from '@/lib/logger'

/**
 * Comentarios de usuarios (Configuración → Comentarios).
 *
 * El texto se inserta en la tabla `feedback` de Supabase (RLS: solo INSERT,
 * nadie puede leerla desde el cliente) y la Edge Function `notify-feedback`
 * lo reenvía por correo al desarrollador. El correo destino vive como secret
 * del servidor — nunca en el cliente.
 *
 * Si no hay conexión (la app es offline-first), el comentario se encola en
 * localStorage y se reintenta al abrir la app o al enviar el siguiente.
 */

const QUEUE_KEY = 'sharky-feedback-queue-v1'
const MAX_QUEUE = 20
const MAX_LENGTH = 4000

interface QueuedFeedback {
  message: string
  app_version: string
  platform: string
  language: string
  user_email: string | null
  queued_at: string
}

function readQueue(): QueuedFeedback[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedFeedback[]
  } catch {
    return []
  }
}

function writeQueue(queue: QueuedFeedback[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(0, MAX_QUEUE)))
}

function detectPlatform(): string {
  if (isTauri()) return /android/i.test(navigator.userAgent) ? 'android' : 'windows'
  return 'web'
}

function buildEntry(message: string): QueuedFeedback {
  return {
    message: message.trim().slice(0, MAX_LENGTH),
    app_version: APP_VERSION,
    platform: detectPlatform(),
    language: useSettings.getState().language,
    user_email: useAuth.getState().user?.email ?? null,
    queued_at: new Date().toISOString(),
  }
}

async function insertFeedback(entry: QueuedFeedback): Promise<void> {
  if (!supabase) throw new Error('cloud-not-configured')
  const { queued_at: _queuedAt, ...row } = entry
  const { error } = await supabase.from('feedback').insert({
    ...row,
    user_id: useAuth.getState().user?.mode === 'cloud' ? useAuth.getState().user?.id : null,
  })
  if (error) throw new Error(error.message)
}

/** Reintenta enviar comentarios encolados. Silencioso: los fallos se re-encolan. */
export async function flushPendingFeedback(): Promise<void> {
  if (!supabase || !navigator.onLine) return
  const queue = readQueue()
  if (queue.length === 0) return
  const remaining: QueuedFeedback[] = []
  for (const entry of queue) {
    try {
      await insertFeedback(entry)
    } catch (error) {
      log.error('No se pudo reenviar un comentario encolado', error)
      remaining.push(entry)
    }
  }
  writeQueue(remaining)
}

/**
 * Envía un comentario. Devuelve `'sent'` si llegó a la nube, `'queued'` si se
 * guardó localmente para reintentar (sin conexión o error transitorio).
 */
export async function submitFeedback(message: string): Promise<'sent' | 'queued'> {
  const entry = buildEntry(message)
  if (!entry.message) throw new Error('empty')

  // Aprovecha el envío para drenar la cola pendiente
  void flushPendingFeedback()

  if (!supabase) {
    writeQueue([...readQueue(), entry])
    return 'queued'
  }

  try {
    await insertFeedback(entry)
    return 'sent'
  } catch (error) {
    log.error('No se pudo enviar el comentario, se encola', error)
    writeQueue([...readQueue(), entry])
    return 'queued'
  }
}
