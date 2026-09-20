import { localToday } from '@/data/helpers'
import { saveFile } from '@/hooks/useTauri'

const COLOR_PROPS = [
  'color', 'background-color', 'background-image',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'box-shadow', 'fill', 'stroke', 'text-decoration-color', 'caret-color',
  'text-shadow', '-webkit-text-fill-color', 'column-rule-color',
] as const

// Detecta funciones de color modernas que html2canvas 1.x no sabe parsear
// (color-mix, oklch, oklab, lab, lch, color()) — usadas en toda la paleta.
const MODERN_COLOR_RE = /color-mix|oklch|oklab|lab\(|lch\(|color\(/i
const COLOR_FN_RE = /(?:color-mix|oklch|oklab|lab|lch|color)\((?:[^()]|\([^()]*\))*\)/gi

let resolveCtx: CanvasRenderingContext2D | null | undefined

/**
 * Resuelve color-mix()/oklch()/oklab()/lab()/lch()/color() a rgb()/rgba().
 *
 * Ojo: NO basta con `ctx.fillStyle = token; return ctx.fillStyle`, porque
 * Chromium re-serializa un color-mix en espacio oklab COMO `oklab(...)` — que
 * html2canvas 1.x tampoco entiende, así que el export seguía fallando con
 * "unsupported color function oklab". La única salida fiable es rasterizar el
 * color a un píxel y leer sus bytes sRGB de vuelta: eso siempre da rgb()/rgba().
 */
function resolveColorFunctions(value: string): string {
  if (!value || !MODERN_COLOR_RE.test(value)) return value
  if (resolveCtx === undefined) {
    resolveCtx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  }
  if (!resolveCtx) return value
  const ctx = resolveCtx
  return value.replace(COLOR_FN_RE, (token) => {
    // Si el navegador no acepta el token, fillStyle no cambia: lo detectamos
    // con un sentinela y devolvemos el token original (mejor eso que romper).
    const sentinel = '#102030'
    ctx.fillStyle = sentinel
    ctx.fillStyle = token
    if (ctx.fillStyle === sentinel && token.toLowerCase() !== sentinel) return token
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillRect(0, 0, 1, 1)
    try {
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
    } catch {
      return token
    }
  })
}

/**
 * Neutraliza TODOS los colores modernos del subárbol EN EL DOCUMENTO VIVO,
 * justo antes de capturar, y devuelve una función que lo restaura tal cual.
 *
 * Por qué en el documento vivo y no en el clon de html2canvas (`onclone`):
 * mutar el clon no se reflejaba a tiempo en el getComputedStyle que html2canvas
 * usa para parsear, así que el export seguía muriendo con "unsupported color
 * function oklab". Mutar el documento real —variables CSS, colores literales y
 * pseudo-elementos— fuerza a que TODO compute a rgb ANTES de que html2canvas
 * clone; entonces clona algo que ya entiende. Se restaura siempre en `finally`.
 */
function neutralizeModernColors(element: HTMLElement): () => void {
  const restore: Array<() => void> = []

  const setInline = (el: HTMLElement, prop: string, value: string) => {
    const prev = el.style.getPropertyValue(prop)
    const prio = el.style.getPropertyPriority(prop)
    restore.push(() => { if (prev) el.style.setProperty(prop, prev, prio); else el.style.removeProperty(prop) })
    el.style.setProperty(prop, value, 'important')
  }

  // 1) Variables de color moderno (--m-border, --bg-glow…) en las raíces de
  //    tema. Casi todos los bordes/fondos/sombras derivan de ellas vía var(),
  //    así que resolverlas de una vez cubre la mayoría sin enumerar propiedades.
  const roots = [
    document.documentElement,
    document.querySelector<HTMLElement>('.mobile-app'),
    document.querySelector<HTMLElement>('.app'),
  ].filter((el): el is HTMLElement => !!el)
  const varProps = new Set<string>()
  for (const root of roots) {
    const cs = window.getComputedStyle(root)
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i]
      if (prop.startsWith('--') && MODERN_COLOR_RE.test(cs.getPropertyValue(prop))) varProps.add(prop)
    }
  }
  for (const root of roots) {
    for (const prop of varProps) {
      const resolved = resolveColorFunctions(window.getComputedStyle(root).getPropertyValue(prop))
      if (resolved) setInline(root, prop, resolved)
    }
  }

  // 2) Colores literales por nodo + pseudo-elementos. Tras el paso (1) casi todo
  //    ya es rgb; esto barre lo que quede (gradientes con oklab literal, etc.).
  const nodes = [element, ...Array.from(element.querySelectorAll<HTMLElement>('*'))]
  const pseudoRules: string[] = []
  nodes.forEach((node, idx) => {
    const cs = window.getComputedStyle(node)
    for (const prop of COLOR_PROPS) {
      const value = cs.getPropertyValue(prop)
      if (!value || !MODERN_COLOR_RE.test(value)) continue
      const resolved = resolveColorFunctions(value)
      if (resolved !== value) setInline(node, prop, resolved)
    }
    for (const pseudo of ['::before', '::after'] as const) {
      const pcs = window.getComputedStyle(node, pseudo)
      if (pcs.content === 'none') continue
      const decls: string[] = []
      for (const prop of COLOR_PROPS) {
        const value = pcs.getPropertyValue(prop)
        if (!value || !MODERN_COLOR_RE.test(value)) continue
        const resolved = resolveColorFunctions(value)
        if (resolved !== value) decls.push(`${prop}: ${resolved} !important;`)
      }
      if (!decls.length) continue
      const attr = `data-export-ps-${idx}-${pseudo === '::before' ? 'b' : 'a'}`
      node.setAttribute(attr, '1')
      restore.push(() => node.removeAttribute(attr))
      pseudoRules.push(`[${attr}]${pseudo} { ${decls.join(' ')} }`)
    }
  })

  if (pseudoRules.length) {
    const style = document.createElement('style')
    style.textContent = pseudoRules.join('\n')
    document.head.appendChild(style)
    restore.push(() => style.remove())
  }

  // Fuerza un reflow para que los overrides estén computados antes de capturar.
  void element.offsetHeight

  return () => { for (let i = restore.length - 1; i >= 0; i--) restore[i]() }
}

export async function exportElementPng(element: HTMLElement, name: string): Promise<void> {
  const { default: html2canvas } = await import('html2canvas')

  // Fondo real (no transparente): un PNG transparente de una pantalla en tema
  // oscuro se ve "roto" al abrirlo sobre fondo blanco. Usamos el fondo de la app.
  const rawBackground = window.getComputedStyle(element).getPropertyValue('--m-bg').trim()
    || window.getComputedStyle(element).backgroundColor
    || '#0a0e16'
  const background = resolveColorFunctions(rawBackground)

  const restore = neutralizeModernColors(element)

  const renderBlob = async (scale: number): Promise<Blob | null> => {
    const canvas = await html2canvas(element, { backgroundColor: background, scale, useCORS: true })
    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  }

  try {
    // En pantallas altas, el WebView de Android tiene un límite de área de
    // canvas: a escala 2 `toBlob` puede devolver null. Reintentamos bajando la
    // escala antes de rendirnos, para que el export funcione en gama baja.
    let blob = await renderBlob(2)
    if (!blob) blob = await renderBlob(1.5)
    if (!blob) blob = await renderBlob(1)
    if (!blob) throw new Error('No se pudo generar la imagen')
    const filename = `${name}-${localToday()}.png`
    await saveFile(blob, filename, 'Imagen de $harky', ['png'])
  } finally {
    restore()
  }
}
