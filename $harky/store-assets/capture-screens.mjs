// One-off script: captures Play Store screenshots (phone + tablet 7"/10")
// from a running dev server (npm run dev -- --port 5173), seeded with the
// app's demo dataset (src/data/seed.ts).
// Usage: node store-assets/capture-screens.mjs
// If src/data/seed.ts changes, regenerate _seed.cjs first:
//   node_modules/.bin/esbuild src/data/seed.ts --bundle --format=cjs --platform=node --outfile=store-assets/_seed.cjs
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeDemo } from './_seed.cjs'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const OUT = ROOT
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:5173'

const DEMO = makeDemo()

// Viewport is identical across targets (so layout/content matches); only the
// device pixel ratio changes, producing larger output images at the same
// 9:16 aspect ratio for tablet listings.
const TARGETS = [
  { dir: 'phone',     scale: 3 },  // 1080 x 1920
  { dir: 'tablet-7',  scale: 5 },  // 1800 x 3200
  { dir: 'tablet-10', scale: 6 },  // 2160 x 3840
]

async function seedDemoState(page) {
  await page.addInitScript((demo) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({
      state: { hasSeenOnboarding: true, displayName: 'Alex', language: 'es' },
      version: 0,
    }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({
      state: { ...demo, goalContributions: [], currency: 'DOP' },
      version: 0,
    }))
  }, DEMO)
}

async function capture(browser, { dir, scale }) {
  const page = await browser.newPage({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: scale,
  })
  await seedDemoState(page)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })

  // Wait out the splash animation
  await page.waitForTimeout(2500)
  await page.getByRole('heading', { name: /^(Inicio|Mis finanzas)$/ }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, dir, '01-inicio.png') })

  const nav = page.locator('.mobile-bottom-nav > button')

  await nav.nth(1).click() // Análisis
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, dir, '02-analisis.png') })

  await nav.nth(2).click() // Cuentas
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, dir, '03-cuentas.png') })

  await page.getByRole('tab', { name: 'Metas' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, dir, '04-metas.png') })

  await nav.nth(3).click() // Perfil
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, dir, '05-perfil.png') })

  await page.close()
}

async function captureFeatureGraphic(browser) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } })
  const html = path.join(OUT, 'feature-graphic', 'feature-graphic.html')
  await page.goto('file://' + html.replace(/\\/g, '/'))
  await page.screenshot({ path: path.join(OUT, 'feature-graphic', 'feature-graphic.png') })
  await page.close()
}

const browser = await chromium.launch()
await captureFeatureGraphic(browser)
for (const target of TARGETS) {
  console.log('Capturing', target.dir)
  await capture(browser, target)
}
await browser.close()
console.log('Done.')
