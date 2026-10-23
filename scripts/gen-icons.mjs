import { chromium } from 'playwright-core'
import { writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))
const root  = join(__dir, '..')
const svgSrc = readFileSync(join(root, 'public', 'icon.svg'), 'utf8')

/*
 * SVG sin el rect de fondo — es la capa FRONTAL del icono adaptativo.
 *
 * Se quita POR ID. La version anterior usaba `/<rect[^/]\/>/m`, que exige un
 * solo caracter entre `<rect` y `/>`: nunca casaba con el rect real, asi que
 * la capa frontal se generaba CON el fondo oscuro dentro. Android la escala al
 * 66% de la zona segura, de modo que quedaba un cuadrado opaco encajado dentro
 * del icono en vez de las tarjetas flotando sobre el fondo de verdad.
 *
 * No fallaba nada: solo salia un icono peor, y nadie relaciona eso con una
 * expresion regular de un script de build.
 */
const svgFg = svgSrc.replace(/<g\s+id="bg"[\s\S]*?<\/g>/m, '')
if (svgFg === svgSrc) {
  throw new Error('No se pudo quitar el fondo: public/icon.svg necesita un <g id="bg"> … </g>')
}

function makeHtml(svg, bg, size) {
  return `<!DOCTYPE html><html><head><style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { width:${size}px; height:${size}px; background:${bg}; display:flex; align-items:center; justify-content:center; }
  svg  { width:${size}px; height:${size}px; }
</style></head><body>${svg}</body></html>`
}

/**
 * Renderiza el SVG a PNG.
 *
 * `omitBackground` NO es opcional para la capa frontal del icono adaptativo:
 * sin el, Playwright APLANA la transparencia contra BLANCO. El `background:
 * transparent` del HTML no basta — hay que pedirlo tambien en la captura.
 *
 * Esto estuvo roto desde siempre y no se veia, porque la capa frontal todavia
 * llevaba dentro el fondo oscuro (la expresion que debia quitarlo no casaba).
 * Al arreglar aquello, el blanco quedo a la vista: un cuadrado palido detras
 * del logo en el splash y tapando el fondo verde del icono adaptativo.
 */
async function renderAt(page, html, size, omitBackground = false) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(html, { waitUntil: 'load' })
  return page.screenshot({
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground,
  })
}

// PWA / desktop sizes
const PWA_SIZES = [16, 32, 48, 180, 192, 512]

// Android mipmap densities
const ANDROID_DENSITIES = [
  { density: 'mipmap-mdpi',    launcher: 48,  foreground: 108 },
  { density: 'mipmap-hdpi',    launcher: 72,  foreground: 162 },
  { density: 'mipmap-xhdpi',   launcher: 96,  foreground: 216 },
  { density: 'mipmap-xxhdpi',  launcher: 144, foreground: 324 },
  { density: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
]

// Android output roots
const ANDROID_ROOTS = [
  join(root, 'src-tauri', 'icons', 'android'),
  join(root, 'src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res'),
]

const browser = await chromium.launch()
const page    = await browser.newPage()

// ── PWA icons ────────────────────────────────────────────────────────────────
const htmlFull = makeHtml(svgSrc, '#080F1E', 512)
await page.setContent(htmlFull, { waitUntil: 'load' })

for (const size of PWA_SIZES) {
  const html = makeHtml(svgSrc, '#080F1E', size)
  const buf  = await renderAt(page, html, size)
  const out  = join(root, 'public', 'icons', `icon-${size}.png`)
  writeFileSync(out, buf)
  console.log(`✓ icon-${size}.png`)
}

// Also copy 192 and 512 to public root for PWA manifest
for (const size of [192, 512]) {
  const src = join(root, 'public', 'icons', `icon-${size}.png`)
  const dst = join(root, 'public', `icon-${size}.png`)
  writeFileSync(dst, readFileSync(src))
  console.log(`✓ public/icon-${size}.png`)
}

// ── Android icons ─────────────────────────────────────────────────────────────
for (const androidRoot of ANDROID_ROOTS) {
  for (const { density, launcher, foreground } of ANDROID_DENSITIES) {
    const dir = join(androidRoot, density)
    mkdirSync(dir, { recursive: true })

    // ic_launcher.png — full icon with background
    const launcherBuf = await renderAt(page, makeHtml(svgSrc, '#080F1E', launcher), launcher)
    writeFileSync(join(dir, 'ic_launcher.png'), launcherBuf)
    writeFileSync(join(dir, 'ic_launcher_round.png'), launcherBuf)

    // ic_launcher_foreground.png — no background, at foreground canvas size
    // The design is centred in the foreground layer; background is provided by ic_launcher_background.xml
    const fgBuf = await renderAt(page, makeHtml(svgFg, 'transparent', foreground), foreground, true)
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), fgBuf)

    console.log(`✓ android/${density} (${launcher}px launcher, ${foreground}px foreground)`)
  }
}

await browser.close()
console.log('Done.')
