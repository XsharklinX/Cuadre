import { expect, test, type Page } from '@playwright/test'

// ── Guardia de desbordamiento horizontal ────────────────────────────────────
// Regresión del bug "se me sale de la pantalla" (RD/Brasil, Samsung A53, etc.):
// un `display:grid` con columna `auto`/`1fr` cuyo min-content empujaba controles
// (teclado, pestañas, botón de cerrar, mosaicos) fuera del viewport. Se veía a
// fontScale 1 y empeoraba con fuente grande (1.35). Este test recorre las
// pantallas clave a varios anchos y escalas de fuente y FALLA si algún control
// interactivo (botón/input/select) queda fuera de la pantalla — imposible de
// reintroducir sin que salte aquí.

const finance = {
  currency: 'BRL',
  accounts: [
    { id: 'a1', name: 'Nubank Cuenta Corriente', short: 'Nu', type: 'debit', balance: 52340.5, color: '#c765ff', last4: null, includeInTotal: true },
    { id: 'a2', name: 'Efectivo', short: 'Efe', type: 'cash', balance: 1200, color: '#35d0a2', last4: null, includeInTotal: true },
    { id: 'a3', name: 'Tarjeta de Crédito Itaú', short: 'Itaú', type: 'credit', balance: -8900, color: '#ff6b35', last4: '1234', includeInTotal: true },
  ],
  categories: ['Casa', 'Compra', 'Comida', 'Transporte', 'Servicios', 'Salud', 'Online', 'Educación']
    .map((name, i) => ({ id: `c${i}`, name, type: 'expense', color: '#8b8bff', budget: i < 4 ? 5000 : 0, icon: 'wallet' })),
  transactions: Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`, type: i % 4 === 0 ? 'income' : 'expense', amount: 100 + i * 137,
    date: `2026-07-${String((i % 27) + 1).padStart(2, '0')}`, note: 'Movimiento de prueba largo',
    categoryId: `c${i % 8}`, accountId: i % 2 ? 'a1' : 'a2',
  })),
  goals: [{
    id: 'g1', name: 'Fondo de emergencia grande', target: 500000, saved: 210000, color: '#ffd60a', icon: 'shield',
    autoContribute: { amount: 15000, frequency: 'monthly', fromAccountId: 'a1', nextDate: '2026-08-05', monthDays: [5, 20] },
  }],
  goalContributions: [], budgets: [],
}

/** Controles interactivos visibles cuyo borde se sale del viewport (no tocables). */
async function offscreenControls(page: Page) {
  return page.evaluate(() => {
    const tol = 2, W = window.innerWidth, bad: { el: string; cutR: number; cutL: number }[] = []
    const sel = '.mobile-app button, .mobile-app input, .mobile-app select, .mobile-app textarea, .mobile-app [role="button"], .mobile-app a[href]'
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none') continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      const cutR = Math.round(r.right - W), cutL = Math.round(-r.left)
      if (cutR > tol || cutL > tol) {
        const cls = (el.className && (el.className as { toString(): string }).toString ? el.className.toString() : '').slice(0, 40)
        const txt = (el.textContent || '').trim().slice(0, 18)
        bad.push({ el: `${el.tagName.toLowerCase()}.${cls} "${txt}"`, cutR, cutL })
      }
    }
    return bad
  })
}

async function boot(page: Page, w: number, h: number, fontScale: number) {
  await page.addInitScript(([f, scale]) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({
      state: { hasSeenOnboarding: true, language: 'es', currency: 'BRL', fontScale: scale }, version: 0,
    }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({ state: f, version: 0 }))
  }, [finance, fontScale] as const)
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try { await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 12_000 }) } catch { await page.waitForTimeout(3500) }
  await expect(page.getByLabel(/Navegaci/)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(250)
}

// Anchos/escala que revelaban el bug: normal (360/1) y estrecho + fuente grande (320/1.35).
const MATRIX = [
  { w: 360, h: 820, fs: 1, label: 'normal 360/100%' },
  { w: 320, h: 820, fs: 1.35, label: 'estrecho+fuente grande 320/135%' },
]

for (const cfg of MATRIX) {
  test(`sin controles fuera de pantalla — ${cfg.label}`, async ({ page }) => {
    await boot(page, cfg.w, cfg.h, cfg.fs)
    const problems: string[] = []
    const check = async (where: string) => {
      const off = await offscreenControls(page)
      if (off.length) problems.push(`[${where}] ` + off.map(o => `${o.el} (cutR=${o.cutR} cutL=${o.cutL})`).join(' · '))
    }
    const navTap = async (name: string) => {
      try { await page.getByLabel(/Navegaci/).getByRole('button', { name, exact: true }).click({ timeout: 3000 }); await page.waitForTimeout(400); return true } catch { return false }
    }
    const closeSheets = async () => {
      for (let i = 0; i < 3; i++) {
        try { await page.locator('.mobile-detail-sheet, .mpr-editor-overlay, .mgl-form').first().click({ timeout: 400, position: { x: 5, y: 5 } }) } catch { /* noop */ }
        try { await page.keyboard.press('Escape') } catch { /* noop */ }
        await page.waitForTimeout(120)
      }
    }

    await check('movimientos')
    for (const tab of ['Análisis', 'Cuentas', 'Perfil']) { if (await navTap(tab)) await check('tab:' + tab) }

    // Editor de cuenta (botón cerrar + fila de sobregiro)
    await navTap('Cuentas')
    try { await page.locator('.mpr-add-btn').first().click({ timeout: 2500 }); await page.waitForTimeout(500); await check('editor-cuenta') } catch { /* noop */ }
    await closeSheets()

    // Metas → formulario (selectores de día del aporte mensual)
    try { await page.getByRole('button', { name: 'Metas' }).first().click({ timeout: 2500 }); await page.waitForTimeout(400) } catch { /* noop */ }
    try {
      await page.locator('.mgl-card').first().click({ timeout: 2500 }); await page.waitForTimeout(300)
      await page.getByRole('button', { name: /Editar/ }).first().click({ timeout: 2500 }); await page.waitForTimeout(500)
      await check('meta-form')
    } catch { /* noop */ }
    await closeSheets()

    // Crear: los 3 modos (el teclado + acciones no deben salirse)
    if (await navTap('Agregar')) {
      await check('crear:gasto')
      for (const m of ['Ingreso', 'Transferencia']) {
        try { await page.getByRole('tab', { name: m }).click({ timeout: 1500 }) } catch {
          try { await page.getByRole('button', { name: m, exact: true }).click({ timeout: 1500 }) } catch { /* noop */ }
        }
        await page.waitForTimeout(300); await check('crear:' + m)
      }
    }

    expect(problems, `Controles fuera de pantalla:\n${problems.join('\n')}`).toEqual([])
  })
}
