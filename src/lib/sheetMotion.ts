/**
 * LAS HOJAS SE VAN, NO DESAPARECEN. Y SE PUEDEN BAJAR CON EL DEDO.
 *
 * Hay casi cuarenta hojas en la app (`.mobile-detail-sheet`), cada una con su
 * propio estado. Animar la salida en cada una habría sido tocar cuarenta
 * componentes para retrasar su desmontaje. Este módulo lo resuelve una vez,
 * desde fuera de React:
 *
 * · SALIDA: cuando React quita una hoja del DOM, se pone en su lugar una
 *   COPIA quieta (sin eventos, oculta a lectores de pantalla) que baja y se
 *   funde en ~220 ms y luego se borra. La hoja de verdad ya no existe: nada
 *   queda pendiente ni se puede tocar dos veces.
 *
 * · ARRASTRE: tocar la franja de arriba de una hoja (el asa) y bajar el dedo
 *   la mueve con él. Si pasa de un tercio de su alto, o se suelta rápido, se
 *   cierra por el mismo camino que Escape o su X, así cada hoja sigue
 *   decidiendo qué es cerrar (un formulario con cambios pregunta). Si no, vuelve
 *   a su sitio con un rebote corto.
 *
 * · MODO LIGERO: en móviles modestos el desenfoque del velo es lo que más
 *   tironea al abrir y cerrar. Con 4 GB de RAM o menos, o 4 núcleos o menos,
 *   se marca `lite-motion` en <html> y el CSS cambia el desenfoque por un
 *   velo más opaco (que sigue tapando los montos en modo privado).
 *
 * · PRESIÓN: todo lo que se toca se encoge un 3 % al apoyar el dedo y vuelve
 *   con un rebote. Va por Web Animations sobre la propiedad `scale`, que no
 *   pisa ni el `transform` ni el `transition` que cada botón ya tenga.
 */

const SHEET = 'mobile-detail-sheet'
const GRAB_ZONE = 56
const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** ¿Es un móvil modesto? Exportada para probarla. */
export function isLowEndDevice(nav: { deviceMemory?: number; hardwareConcurrency?: number } | undefined): boolean {
  if (!nav) return false
  const mem = nav.deviceMemory
  const cores = nav.hardwareConcurrency
  return (typeof mem === 'number' && mem <= 4) || (typeof cores === 'number' && cores > 0 && cores <= 4)
}

function isSheet(node: Node): node is HTMLElement {
  return node instanceof HTMLElement && node.classList.contains(SHEET) && !node.classList.contains('sheet-ghost')
}

function playExit(root: HTMLElement, removed: HTMLElement, before: Node | null) {
  if (reduceMotion() || !removed.querySelector('section')) return
  const ghost = removed.cloneNode(true) as HTMLElement
  ghost.classList.add('sheet-ghost')
  ghost.setAttribute('aria-hidden', 'true')
  ghost.removeAttribute('role')
  ghost.style.pointerEvents = 'none'
  // Que no repita su animación de entrada al reinsertarse.
  ghost.style.animation = 'none'
  ghost.querySelectorAll<HTMLElement>('section').forEach(el => { el.style.animation = 'none' })
  // Las copias no compiten por el foco ni por ids.
  ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'))
  ghost.querySelectorAll<HTMLElement>('button, input, select, textarea, a').forEach(el => el.setAttribute('tabindex', '-1'))
  // Debajo de lo que haya abierto ahora (si la hoja dejó paso a otra).
  root.insertBefore(ghost, before && before.parentNode === root ? before : root.firstChild)
  if (typeof ghost.animate !== 'function') { ghost.remove(); return }
  const section = ghost.querySelector<HTMLElement>(':scope > section') ?? ghost.querySelector<HTMLElement>('section')
  // Si salió arrastrada, la copia parte de donde la soltó el dedo.
  const from = removed.querySelector<HTMLElement>(':scope > section')?.style.getPropertyValue('--m-drag') || '0px'
  section?.classList.remove('m-dragging')
  const veil = ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-out', fill: 'forwards' })
  section?.animate(
    [{ transform: `translateY(${from})` }, { transform: 'translateY(105%)' }],
    { duration: 220, easing: 'cubic-bezier(.4, 0, .9, .5)', fill: 'forwards' },
  )
  const done = () => ghost.remove()
  veil.onfinish = done
  setTimeout(done, 400)
}

/** Cierra la hoja por su propio camino: Escape primero, luego su botón de cerrar. */
function requestClose(sheet: HTMLElement): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  // Se da tiempo a React para quitarla; solo si sigue ahí se usa su botón.
  setTimeout(() => {
    if (!sheet.isConnected) return
    const closeBtn = sheet.querySelector<HTMLButtonElement>(
      ':scope > section header button[aria-label], :scope > section .mgn-sheet-x, :scope > section header button:last-child',
    )
    if (closeBtn) { closeBtn.click(); return }
    // Hojas que se cierran tocando el velo.
    sheet.click()
  }, 120)
}

function installDrag(root: HTMLElement): () => void {
  let drag: {
    section: HTMLElement
    sheet: HTMLElement
    startY: number
    lastY: number
    lastT: number
    velocity: number
    height: number
    pointerId: number
    active: boolean
  } | null = null

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement | null
    const section = target?.closest<HTMLElement>(`.${SHEET} > section`)
    if (!section) return
    const sheet = section.parentElement as HTMLElement
    // Las hojas con `useSheetDrag` ya se arrastran solas: no se engancha dos veces.
    if (sheet.classList.contains('sheet-ghost') || sheet.dataset.noDrag !== undefined || section.dataset.sheetDrag !== undefined) return
    const rect = section.getBoundingClientRect()
    // Solo desde la franja de arriba, y con la hoja sin desplazar: más abajo el
    // dedo es para desplazar el contenido y pulsar lo que haya.
    if (e.clientY - rect.top > GRAB_ZONE || section.scrollTop > 0) return
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
    drag = {
      section, sheet, startY: e.clientY, lastY: e.clientY, lastT: performance.now(),
      velocity: 0, height: rect.height, pointerId: e.pointerId, active: false,
    }
  }

  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const dy = e.clientY - drag.startY
    if (!drag.active) {
      if (dy < 6) return
      drag.active = true
    }
    const now = performance.now()
    drag.velocity = (e.clientY - drag.lastY) / Math.max(1, now - drag.lastT)
    drag.lastY = e.clientY
    drag.lastT = now
    // Mismo mecanismo que `useSheetDrag`: el transform vive solo en la clase
    // `m-dragging` mientras dura el gesto, nunca fijo en la hoja.
    const y = Math.max(0, dy)
    drag.section.classList.add('m-dragging')
    drag.section.style.setProperty('--m-drag', `${y}px`)
    drag.sheet.style.setProperty('--sheet-drag', String(Math.min(1, y / drag.height)))
  }

  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return
    const d = drag
    drag = null
    if (!d.active) return
    const dy = Math.max(0, e.clientY - d.startY)
    const close = dy > d.height / 3 || (d.velocity > 0.7 && dy > 40)
    if (close) {
      requestClose(d.sheet)
      // Si la hoja decidió no cerrarse (aviso de descartar), vuelve a su sitio.
      setTimeout(() => { if (d.sheet.isConnected) snapBack(d) }, 260)
    } else {
      snapBack(d)
    }
    // El toque que suelta el arrastre no debe pulsar lo que haya debajo.
    const swallow = (ev: Event) => { ev.stopPropagation(); ev.preventDefault() }
    window.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', swallow, true), 50)
  }

  // Al soltar sin cerrar, la hoja vuelve a subir con su rebote de entrada.
  function snapBack(d: { section: HTMLElement; sheet: HTMLElement }) {
    d.section.classList.remove('m-dragging')
    d.section.style.removeProperty('--m-drag')
    d.sheet.style.removeProperty('--sheet-drag')
  }

  root.addEventListener('pointerdown', onDown, { passive: true })
  window.addEventListener('pointermove', onMove, { passive: true })
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
  return () => {
    root.removeEventListener('pointerdown', onDown)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
  }
}

const PRESSABLE = 'button, [role="button"], .mobile-tx-row'
const NO_PRESS = '.mamt-keypad, .mobile-keypad-row, .mconv-numpad, .mpin-keypad, .mpat-pad, .mobile-bottom-nav, [data-no-press]'

function installPress(root: HTMLElement): () => void {
  if (typeof Element === 'undefined' || !('animate' in Element.prototype)) return () => {}
  let pressed: { el: HTMLElement; anim: Animation } | null = null
  const release = () => {
    if (!pressed) return
    const { el, anim } = pressed
    pressed = null
    anim.cancel()
    el.animate([{ scale: '0.97' }, { scale: '1.012' }, { scale: '1' }], { duration: 220, easing: 'ease-out' })
  }
  const onDown = (e: PointerEvent) => {
    if (reduceMotion()) return
    const el = (e.target as HTMLElement | null)?.closest<HTMLElement>(PRESSABLE)
    if (!el || el.closest(NO_PRESS) || el.hasAttribute('disabled')) return
    // Las filas grandes (listas, tarjetas) se encogen menos: un 3 % de una fila
    // de 360 px es mucho más movimiento que en un botón pequeño.
    const big = el.offsetWidth > 240
    const anim = el.animate([{ scale: '1' }, { scale: big ? '0.985' : '0.97' }], { duration: 90, easing: 'ease-out', fill: 'forwards' })
    pressed = { el, anim }
  }
  root.addEventListener('pointerdown', onDown, { passive: true, capture: true })
  window.addEventListener('pointerup', release, { passive: true })
  window.addEventListener('pointercancel', release, { passive: true })
  // Si el dedo se va desplazando, el botón vuelve: no se está pulsando.
  const onMove = (e: PointerEvent) => { if (pressed && Math.abs(e.movementY) + Math.abs(e.movementX) > 6) release() }
  window.addEventListener('pointermove', onMove, { passive: true })
  return () => {
    root.removeEventListener('pointerdown', onDown, true)
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
    window.removeEventListener('pointermove', onMove)
  }
}

/** Engancha todo. Devuelve la función para soltarlo. */
export function installSheetMotion(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  if (isLowEndDevice(navigator as Navigator & { deviceMemory?: number })) {
    document.documentElement.classList.add('lite-motion')
  }
  const cleanups: (() => void)[] = []
  let observed: HTMLElement | null = null
  let observer: MutationObserver | null = null

  const attach = () => {
    const root = document.querySelector<HTMLElement>('.mobile-app')
    if (!root || root === observed) return
    observer?.disconnect()
    observed = root
    observer = new MutationObserver(records => {
      for (const r of records) {
        r.removedNodes.forEach(node => { if (isSheet(node)) playExit(root, node, r.nextSibling) })
      }
    })
    observer.observe(root, { childList: true })
  }
  attach()
  // `.mobile-app` aparece después de la pantalla de bloqueo o del onboarding,
  // y se vuelve a montar al desbloquear. Mirar una vez por segundo es más
  // barato que observar el árbol entero (la lista virtual muta sin parar).
  const finder = setInterval(() => { if (!observed?.isConnected) attach() }, 1000)

  cleanups.push(installDrag(document.body), installPress(document.body))
  return () => {
    observer?.disconnect()
    clearInterval(finder)
    cleanups.forEach(fn => fn())
  }
}
