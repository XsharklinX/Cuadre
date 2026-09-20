// Renderiza cada tarjeta de playstore-*.html a un PNG de alta resolución.
// Capturas de teléfono: 1080×2160 (dsf 3 sobre un diseño de 360px).
// Feature graphic: 1024×500 exacto (requisito de Play Store).
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import pngjs from 'pngjs'
const { PNG } = pngjs

const dir = path.dirname(fileURLToPath(import.meta.url))
const toUrl = (f) => 'file:///' + path.join(dir, f).replace(/\\/g, '/')

/** Recorta un PNG a exactamente w×h (esquina superior izquierda). El render
 *  a veces sobra 1-3 px por redondeo de subpíxel; esto clava la dimensión. */
function cropExact(file, w, h) {
  const src = PNG.sync.read(fs.readFileSync(file))
  if (src.width === w && src.height === h) return
  const dst = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (src.width * y + x) << 2
      const d = (w * y + x) << 2
      dst.data[d] = src.data[s]; dst.data[d + 1] = src.data[s + 1]
      dst.data[d + 2] = src.data[s + 2]; dst.data[d + 3] = src.data[s + 3]
    }
  }
  fs.writeFileSync(file, PNG.sync.write(dst))
}

const langs = [
  { code: 'es', file: 'playstore-es.html' },
  { code: 'en', file: 'playstore-en.html' },
]
const shotNames = ['01-home', '02-analysis', '03-subscriptions', '04-goals', '05-accounts']

const browser = await chromium.launch()

for (const { code, file } of langs) {
  const outDir = path.join(dir, 'output', code)
  fs.mkdirSync(outDir, { recursive: true })
  const url = toUrl(file)

  // — Capturas de teléfono a 3× (1080×2160) —
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: 3 })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'load' })
  // Tamaño fijo, sin aspect-ratio (evita el redondeo a 721px) → 360×720 CSS
  // = 1080×2160 px a dsf 3 (relación 2:1 exacta, el máximo de Play Store).
  await page.addStyleTag({ content: '.shot{border-radius:0!important;aspect-ratio:auto!important;width:360px!important;height:720px!important;margin:0!important;overflow:hidden!important}' })
  await page.waitForTimeout(500)
  const shots = await page.$$('.shot')
  for (let i = 0; i < shots.length; i++) {
    const f = path.join(outDir, `${shotNames[i]}.png`)
    await shots[i].screenshot({ path: f })
    cropExact(f, 1080, 2160)
  }
  await ctx.close()

  // — Feature graphic 1024×500 exacto (1×) —
  const ctx2 = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 })
  const page2 = await ctx2.newPage()
  await page2.goto(url, { waitUntil: 'load' })
  await page2.addStyleTag({ content: '.feature{width:1024px!important;height:500px!important;aspect-ratio:auto!important;max-width:none!important;border-radius:0!important;margin:0!important;overflow:hidden!important}' })
  await page2.waitForTimeout(500)
  const feat = await page2.$('.feature')
  const featFile = path.join(outDir, '06-feature.png')
  await feat.screenshot({ path: featFile })
  cropExact(featFile, 1024, 500)
  await ctx2.close()

  console.log(`✓ ${code}: 5 capturas + feature en output/${code}/`)
}

await browser.close()
