// Renderiza los 9 frames de store-screenshots.html a PNG 1080×1920 (9:16),
// en español e inglés, listos para subir a Google Play.
// Cada frame se AÍSLA (se ocultan barra/intro/otros frames y se fija a pantalla
// completa) para que la captura sea solo ese frame, sin solapes.
import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const dir = path.dirname(fileURLToPath(import.meta.url))
const url = 'file:///' + path.join(dir, 'store-screenshots.html').replace(/\\/g, '/')

const W = 1080, H = 1920

const slugs = [
  '01-home', '02-quick', '03-detection', '04-scan', '05-budgets',
  '06-goals', '07-calendar', '08-insights', '09-security',
]

const browser = await chromium.launch()

for (const lang of ['es', 'en']) {
  const outDir = path.join(dir, 'output', lang)
  fs.mkdirSync(outDir, { recursive: true })
  for (const f of fs.readdirSync(outDir)) if (f.endsWith('.png')) fs.unlinkSync(path.join(outDir, f))

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  await page.goto(url, { waitUntil: 'load' })
  await page.evaluate((l) => window.setLang(l), lang)

  const count = await page.evaluate(() => document.querySelectorAll('figure').length)

  for (let i = 0; i < count; i++) {
    await page.evaluate((idx) => {
      document.querySelectorAll('.bar, .intro, .footer').forEach(e => { e.style.display = 'none' })
      document.body.style.background = '#081120'
      const figs = [...document.querySelectorAll('figure')]
      figs.forEach((f, j) => { f.style.display = j === idx ? 'block' : 'none' })
      const cap = figs[idx].querySelector('.caption'); if (cap) cap.style.display = 'none'
      const fr = figs[idx].querySelector('.frame')
      fr.style.cssText += ';position:fixed;top:0;left:0;width:1080px;height:1920px;' +
        'aspect-ratio:auto;border-radius:0;box-shadow:none;margin:0;z-index:99999;'
    }, i)
    await page.waitForTimeout(150)
    await page.screenshot({ path: path.join(outDir, `${slugs[i]}.png`), clip: { x: 0, y: 0, width: W, height: H } })
  }
  await ctx.close()
  console.log(`✓ ${lang}: ${count} capturas ${W}×${H} en output/${lang}/`)
}

await browser.close()
