import { expect, test, type Page } from '@playwright/test'

// ── Flujos críticos de extremo a extremo ─────────────────────────────────────
// Cubre las travesías reales del usuario que antes no tenían prueba de UI: crear
// un gasto, crear una meta y aportarle, y crear un presupuesto. Más un smoke que
// abre cada pantalla de herramientas y comprueba que ninguna cae en el error
// boundary con datos reales. Complementa app.spec.ts (que recorre las 4 tabs).

const ERROR_BOUNDARY = /No pudimos cargar/

function demoFinance() {
  return {
    currency: 'BRL',
    accounts: [{ id: 'a1', name: 'Nubank', short: 'Nu', type: 'debit', balance: 5000, color: '#c765ff', last4: null, includeInTotal: true }],
    categories: [
      { id: 'c0', name: 'Comida', type: 'expense', color: '#8b8bff', budget: 0, icon: 'wallet' },
      { id: 'c1', name: 'Salario', type: 'income', color: '#35d0a2', budget: 0, icon: 'wallet' },
    ],
    transactions: [], goals: [], goalContributions: [], budgets: [],
  }
}

async function boot(page: Page, finance: unknown = demoFinance()) {
  await page.addInitScript((f) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({
      state: { hasSeenOnboarding: true, language: 'es', currency: 'BRL', fontScale: 1 }, version: 0,
    }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({ state: f, version: 0 }))
  }, finance)
  await page.setViewportSize({ width: 390, height: 840 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try { await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 12_000 }) } catch { await page.waitForTimeout(3500) }
  await expect(page.getByLabel(/Navegaci/)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(250)
}

const nav = (page: Page, name: string) => page.getByLabel(/Navegaci/).getByRole('button', { name, exact: true }).click()

test('crear un gasto de extremo a extremo lo guarda', async ({ page }) => {
  await boot(page)
  await nav(page, 'Agregar')
  await page.locator('.mobile-category-grid button', { hasText: 'Comida' }).first().click()
  for (const k of ['5', '0', '0']) await page.locator('.mobile-keypad-compact button', { hasText: new RegExp(`^${k}$`) }).first().click()
  await page.locator('.mobile-create-pad-account').first().click()
  await page.locator('.mobile-picker-row').first().click()
  await page.locator('.mobile-done-button').click()

  await expect(page.locator('.toast-msg').filter({ hasText: 'Movimiento guardado' })).toBeVisible({ timeout: 5000 })
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
})

test('editar un movimiento conserva su categoría', async ({ page }) => {
  // Regresión: al abrir el editor, un efecto pisaba con '' la categoría recién
  // cargada y había que volver a elegirla. La fecha va en el mes actual para que
  // el movimiento aparezca en la lista.
  const today = new Date()
  const mkey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const finance = {
    currency: 'BRL',
    accounts: [{ id: 'a1', name: 'Nubank', short: 'Nu', type: 'debit', balance: 5000, color: '#c765ff', last4: null, includeInTotal: true }],
    categories: [{ id: 'c0', name: 'Comida', type: 'expense', color: '#8b8bff', budget: 0, icon: 'wallet' }],
    transactions: [{ id: 't1', type: 'expense', amount: 500, date: `${mkey}-10`, note: 'Almuerzo', categoryId: 'c0', accountId: 'a1' }],
    goals: [], goalContributions: [], budgets: [],
  }
  await boot(page, finance)

  await page.locator('.mobile-tx-row', { hasText: 'Almuerzo' }).first().click({ force: true })
  await page.locator('.mobile-transaction-sheet').getByRole('button', { name: /Editar/ }).click({ force: true })

  const catRow = page.locator('.mpr-form-row').filter({ hasText: 'Categoría' })
  await expect(catRow).toContainText('Comida')
  await expect(catRow).not.toContainText('Seleccionar')
})

test('crear una meta y aportarle refleja el saldo', async ({ page }) => {
  await boot(page)
  await nav(page, 'Cuentas')
  await page.getByRole('tab', { name: 'Metas' }).first().click()
  // MobileGoals se carga bajo demanda (lazy): esperar a que la vista aparezca.
  await expect(page.locator('.mgl-root').first()).toBeVisible({ timeout: 10_000 })

  // Abrir el flujo de nueva meta (vacío = "Crear primera meta").
  for (const label of ['Crear primera meta', 'Nueva meta']) {
    if (await page.getByRole('button', { name: label }).first().isVisible().catch(() => false)) {
      await page.getByRole('button', { name: label }).first().click(); break
    }
  }
  await page.locator('.mgl-preset-card').first().click()
  await page.locator('.mgl-input').first().fill('Meta test')
  await page.locator('.mgl-amount-tap').first().click()
  for (const k of ['1', '0', '0', '0', '0']) await page.locator('.mgl-numpad-key', { hasText: new RegExp(`^${k}$`) }).first().click()
  await page.locator('.mgl-numpad-done').click()
  await page.locator('.mgl-btn-save').click()

  const card = page.locator('.mgl-card', { hasText: 'Meta test' })
  await expect(card).toHaveCount(1)

  // Aportar 200 y verificar que el saldo de la meta lo refleja.
  await page.locator('.mgl-action-btn', { hasText: 'Aportar' }).first().click()
  for (const k of ['2', '0', '0']) await page.locator('.mamt-keypad .mobile-keypad-compact button', { hasText: new RegExp(`^${k}$`) }).first().click()
  await page.locator('.mamt-keypad .mobile-done-button').click()
  await page.locator('.mgl-btn-save', { hasText: 'Aportar' }).first().click()

  await expect(card.locator('.mgl-card-amounts')).toContainText('200')
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
})

test('crear un presupuesto lo muestra en la lista', async ({ page }) => {
  await boot(page)
  // Menú de herramientas (☰) → Presupuestos
  await page.locator('.mobile-topbar-menu').click()
  await page.locator('.mobile-tools-row').first().click()
  await expect(page.locator('.mbud-root')).toBeVisible()

  await page.locator('.mbud-add-btn, .mbud-empty button').first().click()
  await page.locator('.mbud-input').first().fill('Presupuesto test')
  await page.locator('.mdebt-amount-row').click()
  for (const k of ['3', '0', '0', '0']) await page.locator('.mamt-keypad .mobile-keypad-compact button', { hasText: new RegExp(`^${k}$`) }).first().click()
  await page.locator('.mamt-keypad .mobile-done-button').click()
  await page.locator('.mbud-btn-save').click()

  await expect(page.locator('.mbud-row', { hasText: 'Presupuesto test' })).toHaveCount(1)
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
})

test('las herramientas del menú ☰ abren sin caer en el error boundary', async ({ page }) => {
  await boot(page)
  await page.locator('.mobile-topbar-menu').click()
  const rowCount = await page.locator('.mobile-tools-row').count()
  expect(rowCount).toBeGreaterThan(0)

  // Presupuestos, Metas, Listas, Conversor. Entre cada una: cerrar overlays
  // (el Conversor abre una hoja, no cambia de ruta) y volver a Movimientos.
  for (let i = 0; i < rowCount; i++) {
    for (let k = 0; k < 2; k++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(120) }
    await nav(page, 'Movimientos').catch(() => {})
    await page.waitForTimeout(200)
    await page.locator('.mobile-topbar-menu').click()
    await expect(page.locator('.mobile-tools-row').nth(i)).toBeVisible()
    await page.locator('.mobile-tools-row').nth(i).click()
    await page.waitForTimeout(350)
    await expect(page.getByText(ERROR_BOUNDARY), `herramienta #${i}`).toHaveCount(0)
  }
})

test('las tarjetas Explorar del Perfil abren sin caer en el error boundary', async ({ page }) => {
  await boot(page)
  await nav(page, 'Perfil')
  await expect(page.locator('.mpr-explore-tile').first()).toBeVisible({ timeout: 8000 })
  const tiles = await page.locator('.mpr-explore-tile').count()
  expect(tiles).toBeGreaterThan(0)

  // Suscripciones, Reporte anual, Calendario. Cada tarjeta abre una sub-vista;
  // se vuelve tocando la pestaña Perfil de la barra inferior.
  for (let i = 0; i < tiles; i++) {
    await nav(page, 'Perfil')
    await expect(page.locator('.mpr-explore-tile').nth(i)).toBeVisible()
    await page.locator('.mpr-explore-tile').nth(i).click()
    await page.waitForTimeout(350)
    await expect(page.getByText(ERROR_BOUNDARY), `explore #${i}`).toHaveCount(0)
  }
})

test('Deudas y Flujo de caja (KPI del Perfil) abren sin caer en el error boundary', async ({ page }) => {
  await boot(page)
  await nav(page, 'Perfil')
  await expect(page.locator('.mpr-kpi-card').first()).toBeVisible({ timeout: 8000 })
  const cards = await page.locator('.mpr-kpi-card').count()
  expect(cards).toBeGreaterThanOrEqual(2)

  // Las dos primeras tarjetas KPI abren Deudas y Flujo de caja (vistas lazy).
  for (let i = 0; i < 2; i++) {
    await nav(page, 'Perfil')
    await expect(page.locator('.mpr-kpi-card').nth(i)).toBeVisible()
    await page.locator('.mpr-kpi-card').nth(i).click()
    await page.waitForTimeout(400)
    await expect(page.getByText(ERROR_BOUNDARY), `kpi #${i}`).toHaveCount(0)
  }
})
