import { expect, test, type Page } from '@playwright/test'

// ── Helpers ─────────────────────────────────────────────────────────────────
// La app es mobile-first: se arranca inyectando el estado por localStorage
// (onboarding saltado + datos deterministas) y se navega el shell móvil real.
// Antes esta suite apuntaba a una UI desktop que ya no existe y no corría.

const ERROR_BOUNDARY = /No pudimos cargar/

/** Estado de finance determinista: una cuenta, muchas categorías (para llenar
 *  el grid) y 3 gastos idénticos → deriveQuickAdds genera un "Rápido". */
function demoFinanceState() {
  const account = { id: 'a1', name: 'Efectivo', short: 'Efe', type: 'cash', color: '#35d0a2', balance: 10000, last4: null }
  const catNames = ['Casa', 'Compra', 'Comida', 'Transporte', 'Servicios', 'Entretenimiento',
    'Salud', 'Online', 'Educación', 'Juegos', 'Universidad', 'Recargas', 'Regalos', 'Streaming',
    'Bancos', 'Herramientas', 'Mascotas', 'Viajes', 'Ropa', 'Hogar']
  const categories = catNames.map((name, i) => ({ id: `c${i}`, name, type: 'expense', color: '#8b8bff', budget: 0, icon: 'wallet' }))
  const transactions = [1, 2, 3].map(i => ({
    id: `t${i}`, type: 'expense', amount: 180, date: `2026-07-0${i}`,
    note: 'Café', categoryId: 'c2', accountId: 'a1',
  }))
  return { accounts: [account], categories, goals: [], transactions, goalContributions: [], currency: 'DOP' }
}

/** Arranca la app móvil con el onboarding saltado y (opcionalmente) datos. */
async function bootMobile(page: Page, opts: { finance?: unknown } = {}) {
  const finance = opts.finance
  await page.addInitScript((financeState) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({
      state: { hasSeenOnboarding: true, languageAutoDetected: true, language: 'es' },
      version: 0,
    }))
    if (financeState) {
      localStorage.setItem('sharky-finance-v2', JSON.stringify({ state: financeState, version: 0 }))
    }
  }, finance)
  await page.setViewportSize({ width: 390, height: 840 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  // El shell aparece tras el splash; la barra inferior es la señal de que cargó.
  await expect(page.getByRole('navigation', { name: /Navegaci/ })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('arranca y recorre las 4 pestañas sin caer en el error boundary', async ({ page }) => {
  await bootMobile(page, { finance: demoFinanceState() })

  for (const tab of ['Movimientos', 'Análisis', 'Cuentas', 'Perfil']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    // La app no debe romperse en ninguna pestaña.
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
  }
})

test('el flujo de crear (móvil) renderiza con Rápidos, sin solapes ni error', async ({ page }) => {
  // NOTA honesta: el bug original del solapamiento (colapso de filas del CSS
  // grid) solo se veía en el WebView de Android; en Chromium de escritorio no se
  // reproduce, así que la parte de solape es un chequeo best-effort. Lo que SÍ se
  // reproduce y guarda de verdad es que el swipe de Rápidos no cambie de pestaña.
  await bootMobile(page, { finance: demoFinanceState() })

  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.locator('.mobile-create-flow')).toBeVisible()
  await expect(page.locator('.mobile-quickadd').first()).toBeVisible()

  // Los chips de Rápidos no deben invadir el encabezado de Categoría.
  const verdict = await page.evaluate(() => {
    const chips = [...document.querySelectorAll('.mobile-quickadd')]
    const header = document.querySelector('.mobile-create-section-header')
    if (!chips.length || !header) return 'setup-incompleto'
    const headerTop = header.getBoundingClientRect().top
    const maxChipBottom = Math.max(...chips.map(c => c.getBoundingClientRect().bottom))
    return maxChipBottom <= headerTop + 1 ? 'ok' : 'los chips invaden Categoría'
  })
  expect(verdict).toBe('ok')

  // Deslizar los Rápidos NO debe cambiar de pestaña (Gasto→Ingreso).
  const gasto = page.getByRole('tab', { name: 'Gasto' })
  await expect(gasto).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(() => {
    const el = document.querySelector('.mobile-quickadd') as HTMLElement
    const r = el.getBoundingClientRect()
    const t = (x: number) => new Touch({ identifier: 1, target: el, clientX: x, clientY: r.top + 10 })
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t(r.left + 20)], changedTouches: [t(r.left + 20)] }))
    el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [t(r.left - 140)] }))
  })
  await expect(gasto).toHaveAttribute('aria-selected', 'true')

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
})

test('arranca vacío (sin datos) y muestra la app sin romperse', async ({ page }) => {
  // Sin inyectar finance: arranca con los datos demo por defecto del store, pero
  // con el onboarding saltado. Comprueba que el primer arranque real no crashea.
  await bootMobile(page)
  for (const tab of ['Análisis', 'Cuentas', 'Perfil', 'Movimientos']) {
    await page.getByRole('button', { name: tab, exact: true }).click()
    await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
  }
})
