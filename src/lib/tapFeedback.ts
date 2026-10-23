import { playTapHaptic } from './sound'

/**
 * EL TOQUE QUE DEVUELVE ALGO.
 *
 * `playTapHaptic` llevaba escrita desde hace versiones y no se llamaba en
 * ningún sitio: la app tenía el golpe de vibración más corto que existe y no
 * lo usaba. El resultado es que casi toda la interfaz —categorías, cuentas,
 * chips, filas, pestañas— se pulsaba sin que el teléfono acusara el golpe.
 *
 * Se resuelve en UN listener delegado en vez de en doscientos `onClick`:
 * cualquier botón que se añada mañana lo hereda sin acordarse de nada, y
 * apagar la vibración sigue siendo un solo ajuste (`playTapHaptic` ya consulta
 * `hapticsEnabled`).
 *
 * Va en `pointerdown` y no en `click`: la vibración tiene que llegar cuando el
 * dedo toca, no cuando lo levanta. En `click` se siente como un retardo.
 */

/** Lo que cuenta como «algo que se pulsa». */
const INTERACTIVE = [
  'button',
  'a[href]',
  'summary',
  'select',
  'label[for]',
  '[role="button"]',
  '[role="tab"]',
  '[role="switch"]',
  '[role="option"]',
  '[role="menuitem"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="range"]',
].join(',')

/**
 * ZONAS QUE YA VIBRAN SOLAS.
 *
 * Los teclados numéricos llaman a `tapClick`, que trae su propio háptico
 * calibrado por tecla (5 ms el dígito, 7 el operador, 9 el borrado). Si además
 * les llegara el háptico global, cada tecla vibraría dos veces y teclear una
 * cifra larga se sentiría como un temblor en vez de como un teclado.
 *
 * Se excluyen por contenedor y no tecla a tecla: así una tecla nueva dentro de
 * un teclado que ya existe queda excluida sin tener que acordarse.
 */
const SILENT_ZONES = [
  '.mamt-keypad',        // hoja de monto y hoja de dígitos
  '.mobile-keypad-row',  // teclado de crear movimiento
  '.mconv-numpad',       // conversor de divisas
  '.mgl-numpad-grid',    // aportes a metas
  '.mpin-keypad',        // PIN
  '.mpat-pad',           // patrón
  '[data-no-tap]',       // escotilla para casos puntuales
].join(',')

/**
 * ¿Este toque merece vibración?
 *
 * Separada del listener para poder probarla: la decisión es lo que tiene
 * reglas, y engancharse a `document` no se puede afirmar en una prueba sin
 * montar medio navegador.
 */
export function shouldTapFeedback(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  const hit = target.closest(INTERACTIVE)
  if (!hit) return false
  // Un botón apagado no responde al toque, así que tampoco debe fingir que sí.
  if (hit.hasAttribute('disabled') || hit.getAttribute('aria-disabled') === 'true') return false
  if (hit.closest(SILENT_ZONES)) return false
  return true
}

/** Engancha el háptico global. Devuelve la función para soltarlo. */
export function installTapFeedback(root: Document | HTMLElement = document): () => void {
  const onPointerDown = (event: Event) => {
    if (shouldTapFeedback(event.target)) playTapHaptic()
  }
  // En captura: una fila que detiene la propagación del evento no debe dejar
  // sin vibración al botón que hay dentro.
  root.addEventListener('pointerdown', onPointerDown, { passive: true, capture: true })
  return () => root.removeEventListener('pointerdown', onPointerDown, true)
}
