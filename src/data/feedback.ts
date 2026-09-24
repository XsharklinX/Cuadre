import { useSettings } from '@/store/settings'
import { isTauri } from '@/hooks/useTauri'
import { APP_NAME, APP_VERSION } from '@/data/release'
import { log } from '@/lib/logger'

/**
 * COMENTARIOS DE USUARIOS, sin servidor.
 *
 * Antes esto insertaba el texto en una tabla de Supabase y una función del
 * servidor lo reenviaba por correo. Todo ese camino existía para conseguir
 * algo que el teléfono ya sabe hacer solo: mandar un correo.
 *
 * Ahora el botón abre la app de correo del usuario con el mensaje YA ESCRITO
 * y el contexto técnico (versión, plataforma, idioma) añadido al final. Lo
 * único que le queda por hacer es darle a enviar.
 *
 * Lo que se gana no es solo quitar una dependencia: el comentario sale desde
 * SU correo, así que se le puede responder. Con la tabla, el mensaje llegaba
 * sin remitente al que contestar salvo que hubiera iniciado sesión — y la
 * sesión ya no existe.
 *
 * Lo que se pierde: no hay envío silencioso ni cola offline. A cambio, el
 * usuario ve su mensaje antes de mandarlo y tiene copia en enviados, que es
 * más honesto que un "gracias por tu comentario" sobre una petición de red que
 * pudo fallar.
 */

/** A dónde van los comentarios. Mismo buzón que "Escríbenos". */
export const FEEDBACK_EMAIL = 'contactosharklin@gmail.com'

const MAX_LENGTH = 4000

function detectPlatform(): string {
  if (isTauri()) return /android/i.test(navigator.userAgent) ? 'android' : 'windows'
  return 'web'
}

/**
 * El pie técnico. Sin esto, la mitad de los comentarios obligan a escribir de
 * vuelta preguntando "¿qué versión tienes?", y ahí se pierde a la persona.
 */
function contextFooter(): string {
  const s = useSettings.getState()
  return [
    '',
    '---',
    `${APP_NAME} ${APP_VERSION} · ${detectPlatform()} · ${s.language}`,
  ].join('\n')
}

export function buildFeedbackMailto(message: string): string {
  const subject = `${APP_NAME} · comentario`
  const body = message.trim().slice(0, MAX_LENGTH) + contextFooter()
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

/**
 * Abre el correo del sistema con el comentario dentro.
 *
 * Nunca un `<a href="mailto:">` ni `location.href`: en el WebView de Android
 * eso intenta NAVEGAR a una url que el WebView no entiende y la app se queda
 * en una pantalla en blanco. Tiene que salir por el sistema operativo.
 */
export async function submitFeedback(message: string): Promise<'opened' | 'failed'> {
  if (!message.trim()) return 'failed'
  const url = buildFeedbackMailto(message)
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(url)
    return 'opened'
  } catch (error) {
    log.warn('feedback: no se pudo abrir el correo por el sistema', error)
    // Navegador, o plugin ausente: el camino de toda la vida.
    const opened = window.open(url, '_blank', 'noopener')
    return opened ? 'opened' : 'failed'
  }
}
