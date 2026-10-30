import { expect, test, type Locator, type Page } from '@playwright/test'

// ── Guardia de ALCANCE vertical ─────────────────────────────────────────────
// Regresión de «no me aparece para cambiar la fecha»: en «Editar movimiento»
// la fecha era la última fila y, en un móvil de pantalla corta o con la letra
// grande, quedaba tapada por el pie de botones. La guardia de desbordamiento
// (overflow.spec) solo miraba a los lados y con 820 px de alto, así que no lo
// vio nunca.
//
// Esta prueba abre los formularios en tres tamaños de pantalla y dos de letra
// y FALLA si un campo importante queda fuera de la vista o detrás del pie.

const today = new Date()
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const finance = {
  currency: 'DOP',
  accounts: [
    { id: 'a1', name: 'Banreservas Cuenta de Ahorro', short: 'BR', type: 'savings', balance: 48200, color: '#c8102e', last4: null, includeInTotal: true },
    { id: 'a2', name: 'Efectivo', short: 'Ef', type: 'cash', balance: 1800, color: '#35d0a2', last4: null, includeInTotal: true },
  ],
  categories: ['Comida', 'Transporte', 'Casa', 'Salud'].map((name, i) => ({
    id: `c${i}`, name, type: 'expense', color: '#8b8bff', budget: 0, icon: 'wallet',
  })),
  transactions: [{
    id: 't1', type: 'expense', amount: 1250, date: iso(today), note: 'Supermercado Nacional de la Churchill',
    description: 'Compra de la semana', categoryId: 'c0', accountId: 'a1',
  }],
  goals: [{ id: 'g1', name: 'Vacaciones en Samaná', target: 100000, saved: 30000, openingSaved: 30000, color: '#30d158', icon: 'plane' }],
  goalContributions: [], budgets: [],
}

async function boot(page: Page, w: number, h: number, fontScale: number) {
  await page.addInitScript(([f, scale]) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({
      state: { hasSeenOnboarding: true, language: 'es', currency: 'DOP', fontScale: scale }, version: 0,
    }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({ state: f, version: 0 }))
  }, [finance, fontScale] as const)
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try { await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 12_000 }) } catch { await page.waitForTimeout(3500) }
  await expect(page.getByLabel(/Navegaci/)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(250)
}

/**
 * ¿Se ve entero SIN desplazar, por encima del pie? Es lo que falló con la
 * fecha: no basta con que exista, tiene que estar a la vista al abrir.
 */
async function visibleAtOpen(el: Locator, footer: Locator | null): Promise<string | null> {
  const r = await el.boundingBox()
  const f = footer ? await footer.boundingBox() : null
  const vh = el.page().viewportSize()!.height
  if (!r) return 'no se pinta'
  const bottomLimit = f ? f.y : vh
  if (r.y < 0) return `asoma por arriba (${Math.round(r.y)})`
  if (r.y + r.height > bottomLimit + 1) return `queda bajo el pie (${Math.round(r.y + r.height)} > ${Math.round(bottomLimit)})`
  return null
}

/** ¿Se puede llegar desplazando, y una vez ahí no lo tapa el pie? */
async function reachable(el: Locator, footer: Locator | null): Promise<string | null> {
  // Centrado a mano: `scrollIntoViewIfNeeded` no mueve nada si el campo ya
  // asoma un poco, aunque esté medio tapado por el pie.
  await el.evaluate(node => node.scrollIntoView({ block: 'center' }))
  await el.page().waitForTimeout(120)
  return visibleAtOpen(el, footer)
}

const SIZES = [
  { w: 320, h: 568, label: '320×568' },
  { w: 360, h: 640, label: '360×640' },
  { w: 412, h: 915, label: '412×915' },
]
const SCALES = [1, 1.35]

for (const size of SIZES) {
  for (const fs of SCALES) {
    const label = `${size.label} letra ${Math.round(fs * 100)} %`

    test(`editar movimiento: la fecha se ve al abrir — ${label}`, async ({ page }) => {
      await boot(page, size.w, size.h, fs)
      await page.locator('.mobile-tx-row').first().click()
      const editar = page.locator('.mobile-transaction-sheet').getByRole('button', { name: /Editar/ })
      // La ficha puede ser más alta que la pantalla: sus botones van pegados abajo.
      await expect(editar).toBeInViewport()
      await editar.click()
      const form = page.locator('.txf-overlay')
      await expect(form).toBeVisible()
      await page.waitForTimeout(300)
      const footer = form.locator('.mpr-editor-actions')

      const problems: string[] = []
      const fecha = await visibleAtOpen(form.locator('.txf-date'), footer)
      if (fecha) problems.push(`Fecha: ${fecha}`)
      const monto = await visibleAtOpen(form.locator('.txf-amount-btn'), footer)
      if (monto) problems.push(`Monto: ${monto}`)
      for (const name of ['Cuenta', 'Categoría', 'Concepto']) {
        const why = await reachable(form.locator('.mpr-form-row', { hasText: name }).first(), footer)
        if (why) problems.push(`${name}: ${why}`)
      }
      const mas = await reachable(form.locator('.txf-more-toggle'), footer)
      if (mas) problems.push(`Más detalles: ${mas}`)
      expect(problems, problems.join('\n')).toEqual([])
    })

    test(`metas: crear y aportar caben — ${label}`, async ({ page }) => {
      await boot(page, size.w, size.h, fs)
      await page.locator('.mobile-topbar-menu').click()
      await page.locator('.mtm-tile-main', { hasText: 'Metas' }).first().click()
      await expect(page.locator('.mgl-root').first()).toBeVisible({ timeout: 10_000 })

      const problems: string[] = []
      // El «+» de la tarjeta y su hoja de aporte rápido.
      await page.locator('.mgn-card-add').first().click()
      const quick = page.locator('.mgn-sheet').last()
      await expect(quick).toBeVisible()
      await page.waitForTimeout(350)
      const cta = await reachable(quick.locator('.mgn-sheet-cta'), null)
      if (cta) problems.push(`Aportar: ${cta}`)
      await page.keyboard.press('Escape')
      await page.waitForTimeout(350)

      // Paso 2 del formulario por pasos: monto y fechas a la vista.
      await page.locator('.mgn-head-add').click()
      const form = page.locator('.mgn-form')
      await expect(form).toBeVisible()
      await page.waitForTimeout(300)
      const footer = form.locator('.mgl-form-actions')
      await form.locator('.mgn-preset').first().click()
      await footer.locator('.mgl-btn-save').click()
      for (const [name, sel] of [['Monto', '.mgn-amount-big'], ['Sin fecha', '.mgn-chip:has-text("Sin fecha")']] as const) {
        const why = await reachable(form.locator(sel).first(), footer)
        if (why) problems.push(`${name}: ${why}`)
      }
      const footBox = await footer.boundingBox()
      if (!footBox || footBox.y + footBox.height > size.h + 1) problems.push('el pie del formulario se sale de la pantalla')
      expect(problems, problems.join('\n')).toEqual([])
    })
  }
}
