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

async function seedDemoState(page, lang) {
  await page.addInitScript(({ demo, lang }) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({
      state: { hasSeenOnboarding: true, displayName: 'Alex', language: lang },
      version: 0,
    }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({
      state: { ...demo, goalContributions: [], currency: 'DOP' },
      version: 0,
    }))
  }, { demo: DEMO, lang })
}

/**
 * Banderas en la captura.
 *
 * Windows NO dibuja los emoji de bandera (las secuencias de indicadores
 * regionales), asi que el navegador que toma las capturas pinta las dos
 * letras sueltas: "DO DOP", "US USD". En el telefono se ven bien — es una
 * limitacion del equipo que captura, no de la app — pero la tienda vería el
 * fallo. Se carga Noto Color Emoji solo para los elementos que llevan
 * bandera, sin tocar la tipografia del resto de la interfaz.
 */
async function useFlagFont(page) {
  await page.addStyleTag({ url: 'https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap' })
  await page.addStyleTag({
    content: `.sacc-bal-label, .mcur-flag, .mobile-currency-flag, .sacc-field-value {
      font-family: 'Noto Color Emoji', system-ui, sans-serif;
    }`,
  })
  await page.waitForTimeout(400)
}

async function capture(browser, { dir, scale }, lang = 'es') {
  const page = await browser.newPage({
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: scale,
  })
  await seedDemoState(page, lang)
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await useFlagFont(page)

  // Ya no hay splash propio (se elimino: eran 2s encima del de Android), asi
  // que solo se espera a que la primera pantalla tenga contenido.
  await page.waitForTimeout(600)
  // Se espera a la BARRA DE NAVEGACION, no a un titulo concreto: los titulos
  // cambian con cada rediseno y rompen la captura en silencio. La barra es lo
  // ultimo que monta y existe en todas las versiones.
  await page.locator('.mobile-bottom-nav > button').first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(900)
  // El aviso de "ponle un PIN" es un empujon de una sola vez, no producto: en
  // la tienda robaria el sitio a lo que la pantalla tiene que ensenar.
  const nudge = page.locator('.mhome-alert-standalone > button:not(.mhome-alert-action)')
  if (await nudge.count()) {
    await nudge.first().click()
    await page.waitForTimeout(400)
  }
  await page.screenshot({ path: path.join(OUT, dir, '01-inicio.png') })

  const nav = page.locator('.mobile-bottom-nav > button')

  await nav.nth(1).click() // Análisis
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, dir, '02-analisis.png') })

  await nav.nth(2).click() // Cuentas
  await page.waitForTimeout(500)
  // El titular de esta captura habla del carrusel de tarjetas, asi que el
  // carrusel tiene que VERSE: por defecto queda debajo del pliegue y la
  // captura mostraba solo la lista de cuentas, contradiciendo su propio texto.
  const carousel = page.locator('.sacc-carousel')
  if (await carousel.count()) {
    await carousel.evaluate(el => el.closest('.sacc-block').scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: path.join(OUT, dir, '03-cuentas.png') })

  // La ficha de una tarjeta: doble saldo, ciclo y aviso de interes. Es lo
  // que de verdad diferencia a la app y no estaba en las capturas.
  const card = page.locator('.sacc-plastic').first()
  if (await card.count()) {
    await card.click()
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(OUT, dir, '04-tarjeta.png') })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
  }

  // El nombre de la pestana cambia con el idioma ("Metas" / "Goals"), asi que
  // se toma por posicion: es la segunda del par.
  await page.getByRole('tab').nth(1).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, dir, '05-metas.png') })

  await page.close()
}

/**
 * Titulares de cada captura.
 *
 * El usuario que hojea la tienda lee el TITULAR, no la pantalla: a ese tamano
 * la interfaz es una mancha de color. Por eso cada captura dice una cosa, en
 * el idioma de quien la lee, y no "Pantalla de inicio".
 */
const FRAMES = [
  {
    slug: '01-inicio',
    es: ['Todo tu dinero, de un vistazo', 'Efectivo, cuentas y tarjetas en una sola pantalla.'],
    en: ['All your money at a glance', 'Cash, accounts and cards on one screen.'],
  },
  {
    slug: '02-analisis',
    es: ['Te dice como vas', 'Sin graficas que hay que interpretar: una frase y una cifra.'],
    en: ['It tells you how you are doing', 'No charts to decode: one sentence and one number.'],
  },
  {
    slug: '03-cuentas',
    es: ['Tus tarjetas, como se ven de verdad', 'Desliza entre ellas. Cada una con su saldo y su cupo.'],
    en: ['Your cards, as they really look', 'Swipe through them. Each with its balance and limit.'],
  },
  {
    slug: '04-tarjeta',
    es: ['Pesos y dolares, por separado', 'Tu tarjeta lleva dos deudas. Aqui las ves y las pagas aparte.'],
    en: ['Local and dollars, kept apart', 'Your card carries two debts. See and pay each one.'],
  },
  {
    slug: '05-metas',
    es: ['Ahorra sin pensarlo', 'Aportes automaticos hacia lo que quieres lograr.'],
    en: ['Save without thinking about it', 'Automatic contributions toward what you want.'],
  },
]

/**
 * Compone cada captura REAL dentro del marco de marca, con su titular.
 *
 * Nunca se dibuja la app a mano: la maqueta HTML que habia antes dejo de
 * parecerse a la app en cuanto la app cambio, y publicar capturas que no son
 * tu producto es la forma mas rapida de que alguien instale y desinstale.
 */
async function composeFrames(browser, dirFor) {
  const frameUrl = 'file:///' + path.join(ROOT, 'frame.html').split(path.sep).join('/')
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })

  for (const lang of ['es', 'en']) {
    const outDir = path.join(OUT, 'store', lang)
    fs.mkdirSync(outDir, { recursive: true })

    for (const [i, frame] of FRAMES.entries()) {
      const shot = path.join(OUT, dirFor(lang), `${frame.slug}.png`)
      if (!fs.existsSync(shot)) {
        console.warn('  falta', frame.slug, '- se omite')
        continue
      }
      const [title, sub] = frame[lang]
      const src = 'file:///' + shot.split(path.sep).join('/')
      const url = `${frameUrl}?tone=${i + 1}`
        + `&shot=${encodeURIComponent(src)}`
        + `&title=${encodeURIComponent(title)}`
        + `&sub=${encodeURIComponent(sub)}`
      await page.goto(url, { waitUntil: 'networkidle' })
      await page.waitForTimeout(250)
      await page.screenshot({ path: path.join(outDir, `${frame.slug}.png`) })
    }
    console.log('  marcos', lang, '->', path.join('store', lang))
  }
  await page.close()
}

/**
 * Icono de la ficha: 512x512 PNG, que es lo que pide Play Console (no acepta
 * SVG). Se renderiza del MISMO `public/icon.svg` que usa la app, para que el
 * icono de la tienda y el del telefono no puedan divergir.
 *
 * Dos detalles que Play Console exige y que aqui se resuelven:
 * · El SVG se pega EN LINEA, no con <img src="file://...">: la pagina que
 *   crea `setContent` es `about:blank` y no puede cargar ficheros locales —
 *   el icono salia en blanco.
 * · `rx: 0` cuadra las esquinas. El icono de la app las lleva redondeadas,
 *   pero la tienda aplica su propia mascara: si se le entrega con las
 *   esquinas ya recortadas (y por tanto transparentes), quedan cuatro
 *   muescas.
 */
async function captureStoreIcon(browser) {
  const svg = fs.readFileSync(path.join(ROOT, '..', 'public', 'icon.svg'), 'utf8')
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } })
  await page.setContent(
    `<style>
       html, body { margin: 0; overflow: hidden; padding: 0; }
       svg { display: block; height: 512px; width: 512px; }
       svg > rect:first-of-type { rx: 0; ry: 0; }
     </style>` + svg,
  )
  fs.mkdirSync(path.join(OUT, 'icon'), { recursive: true })
  await page.screenshot({ path: path.join(OUT, 'icon', 'icon-512.png') })
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
await captureStoreIcon(browser)
await captureFeatureGraphic(browser)
for (const target of TARGETS) {
  console.log('Capturing', target.dir)
  await capture(browser, target)
}
// Segunda tanda de telefono con la INTERFAZ en ingles. La ficha en-US no puede
// ensenar la app en espanol: quien la hojea no lee lo que ve, y traducir solo
// el titular deja la mentira a la vista.
console.log('Capturing phone-en')
await capture(browser, { dir: 'phone-en', scale: 3 }, 'en')
console.log('Composing store frames')
await composeFrames(browser, lang => (lang === 'en' ? 'phone-en' : 'phone'))
await browser.close()
console.log('Done.')
