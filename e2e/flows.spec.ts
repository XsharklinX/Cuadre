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

/**
 * Abre Perfil.
 *
 * Dejo de ser una pestaña de la barra inferior —ese sitio lo ocupa ahora
 * Negocio— y vive en la cabecera, junto al engranaje. Perfil no es un destino:
 * es una pantalla de ajustes a la que se entra de vez en cuando, y tenia uno de
 * los cuatro sitios fijos.
 */
/*
 * Perfil ya no es un boton de la barra: vive en el panel del avatar.
 *
 * Perfil, avisos y ajustes eran tres iconos de una barra que llevaba ocho
 * controles, y los tres se visitan en el mismo momento. Dos toques en vez de
 * uno, y la barra respira.
 */
const goProfile = async (page: Page) => {
  await page.getByRole('button', { name: 'Mis cosas' }).first().click()
  await page.locator('.mav').waitFor()
  await page.locator('.mav-row', { hasText: 'Perfil' }).first().click()
}

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

  /*
   * Hay que esperar a que la hoja TERMINE de subir, y por eso este clic NO
   * lleva `force`.
   *
   * Las hojas entran desde fuera de la pantalla, como una hoja de verdad.
   * `force: true` se salta las comprobaciones de accionabilidad, y entre ellas
   * esta la de ESTABILIDAD: con force, Playwright calcula el punto del boton
   * mientras la hoja todavia se mueve, hace clic en esas coordenadas, y el
   * boton ya no esta ahi — el clic aterriza en el fondo oscuro, que cierra la
   * hoja. El test acababa de vuelta en Movimientos sin nada abierto, y fallaba
   * una vez de cada dos segun lo cargada que estuviera la maquina.
   *
   * `toBeInViewport` no protegia de eso: pasa en cuanto el boton asoma por el
   * borde, con la hoja a medio camino. Sin `force`, el clic espera a que el
   * boton deje de moverse, que es exactamente lo que hacia falta.
   */
  const editar = page.locator('.mobile-transaction-sheet').getByRole('button', { name: /Editar/ })
  await expect(editar).toBeInViewport()
  await editar.click()

  const catRow = page.locator('.mpr-form-row').filter({ hasText: 'Categoría' })
  await expect(catRow).toContainText('Comida')
  await expect(catRow).not.toContainText('Seleccionar')
})

test('crear una meta y aportarle refleja el saldo', async ({ page }) => {
  await boot(page)
  /*
   * Metas vive en el menu de herramientas (☰), no en una pestaña de Cuentas.
   * Esta prueba seguia buscando `role=tab name=Metas` de cuando si lo era, y
   * por eso agotaba los 45s esperando un control que ya no existe. Se navega
   * por el TEXTO de la fila, no por su posicion: añadir una herramienta
   * mañana no debe volver a romper esto.
   */
  await page.locator('.mobile-topbar-menu').click()
  await page.locator('.mobile-tools-row', { hasText: 'Metas' }).first().click()
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
  //
  // Se busca POR TEXTO, no por posición. Antes era `.first()`, y al añadir una
  // herramienta nueva al menú el test empezó a abrir otra pantalla y a fallar
  // por un cambio que no tenía nada que ver con los presupuestos.
  await page.locator('.mobile-topbar-menu').click()
  await page.locator('.mobile-tools-row', { hasText: /Presupuestos|Budgets/ }).first().click()
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

/*
 * EL CAMINO CRITICO DE NEGOCIO, DE EXTREMO A EXTREMO.
 *
 * Cubre lo unico que no se puede equivocar en todo el modulo: que «Me pago»
 * cree un MOVIMIENTO DE VERDAD en el libro. Todo lo demas de Negocio son
 * expectativas que no mueven dinero; este paso si, y es la frontera entre las
 * dos mitades.
 *
 * Si esto se rompiera, un cobro quedaria marcado como pagado sin ingreso
 * detras: el libro diria una cosa y la lista de clientes otra, y nadie sabria
 * cual creer. Por eso se comprueba el saldo al final, no solo la pantalla.
 */
test('registrar un cliente y cobrarle crea el ingreso en el libro', async ({ page }) => {
  await boot(page)

  // Negocio es la cuarta pestaña de la barra: dejo de estar en el menu ☰
  // cuando ocupo el sitio que tenia Perfil.
  await nav(page, 'Negocio')
  await expect(page.locator('.mbiz-screen')).toBeVisible()

  // Sin clientes, la pantalla ofrece crear el primero.
  await page.locator('.mbiz-empty button').first().click()
  await expect(page.locator('.mbizs')).toBeVisible()

  await page.locator('.mbizs-input').first().fill('Juan Perez')
  // El monto es el cuarto campo de texto (nombre, concepto, telefono, monto).
  await page.locator('.mbizs-input[type="number"]').first().fill('250')
  await page.locator('.mbizs-save').click()
  await expect(page.locator('.mbizs')).toHaveCount(0)

  // El cliente aparece, y con el su cobro del ciclo en curso.
  await expect(page.locator('.mbiz-client', { hasText: 'Juan Perez' })).toHaveCount(1)
  const cobro = page.locator('.mbiz-charge').first()
  await expect(cobro).toBeVisible()

  await cobro.click()
  await expect(page.locator('.mbizs-hero')).toBeVisible()
  await page.locator('.mbizs-save').click()
  await expect(page.locator('.mbizs')).toHaveCount(0)

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)

  /*
   * LA COMPROBACION QUE IMPORTA: el ingreso esta en el libro de verdad.
   *
   * Se lee del almacen persistido y no de la pantalla: una pantalla puede
   * pintar un numero correcto por casualidad, pero si el movimiento no esta
   * guardado, al reabrir la app el dinero no existe.
   */
  const libro = await page.evaluate(() => {
    const raw = localStorage.getItem('sharky-finance-v2')
    return raw ? JSON.parse(raw).state : null
  })
  expect(libro).not.toBeNull()
  const ingresos = (libro.transactions as Array<{ type: string; amount: number }>)
    .filter(t => t.type === 'income')
  expect(ingresos).toHaveLength(1)
  expect(ingresos[0].amount).toBe(250)
  // Y el saldo de la cuenta subio con el: 5000 + 250.
  expect((libro.accounts as Array<{ balance: number }>)[0].balance).toBe(5250)
})

/*
 * MARCAR UN CAPRICHO Y VERLO EN EL BOTE.
 *
 * La version anterior traia toda la logica del bote, su almacen y sus pruebas,
 * y NINGUNA forma de crear uno: la pantalla solo podia estar vacia. Este test
 * existe para que eso no pueda repetirse — recorre el camino entero desde el
 * gasto hasta el bote.
 */
test('marcar un gasto como capricho lo lleva al bote', async ({ page }) => {
  await boot(page)

  // Un gasto cualquiera, marcado como capricho al crearlo. Mismo camino que el
  // test de crear un gasto, para no inventar otra forma de llegar.
  await nav(page, 'Agregar')
  await page.locator('.mobile-category-grid button', { hasText: 'Comida' }).first().click()
  for (const k of ['3', '2', '0', '0']) {
    await page.locator('.mobile-keypad-compact button', { hasText: new RegExp(`^${k}$`) }).first().click()
  }
  await page.locator('.mobile-create-pad-account').first().click()
  await page.locator('.mobile-picker-row').first().click()
  await page.locator('.mobile-create-caprice').click()
  await expect(page.locator('.mobile-create-caprice.on')).toBeVisible()
  await page.locator('.mobile-done-button').click()
  await page.waitForTimeout(400)

  /*
   * El bote existe y lleva el monto del gasto.
   *
   * La herramienta se llama Caprichos desde la 2.2.0 — «El bote» y
   * «Caprichos» eran dos nombres para una cosa — y el bote es una de sus tres
   * pestañas, que ahora abren en Antojos.
   */
  await page.locator('.mobile-topbar-menu').click()
  await page.locator('.mobile-tools-row', { hasText: /Caprichos|Splurges/ }).first().click()
  await page.locator('.mcap-tabs button', { hasText: /El bote|The jar/ }).click()
  await expect(page.locator('.mcap-hero')).toBeVisible()
  await expect(page.locator('.mcap-hero strong')).toContainText('3,200')

  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)

  // Y esta guardado de verdad, no solo pintado.
  const botes = await page.evaluate(() => {
    const raw = localStorage.getItem('cuadre-caprices-v1')
    return raw ? JSON.parse(raw).state.items : []
  })
  expect(botes).toHaveLength(1)
  expect(botes[0].amount).toBe(3200)
})

test('las tarjetas Explorar del Perfil abren sin caer en el error boundary', async ({ page }) => {
  await boot(page)
  await goProfile(page)
  await expect(page.locator('.mpr-explore-tile').first()).toBeVisible({ timeout: 8000 })
  const tiles = await page.locator('.mpr-explore-tile').count()
  expect(tiles).toBeGreaterThan(0)

  // Suscripciones, Reporte anual, Calendario. Cada tarjeta abre una sub-vista;
  // se vuelve tocando Perfil en la cabecera.
  for (let i = 0; i < tiles; i++) {
    await goProfile(page)
    await expect(page.locator('.mpr-explore-tile').nth(i)).toBeVisible()
    await page.locator('.mpr-explore-tile').nth(i).click()
    await page.waitForTimeout(350)
    await expect(page.getByText(ERROR_BOUNDARY), `explore #${i}`).toHaveCount(0)
  }
})

test('Deudas y Flujo de caja (KPI del Perfil) abren sin caer en el error boundary', async ({ page }) => {
  await boot(page)
  await goProfile(page)
  await expect(page.locator('.mpr-kpi-card').first()).toBeVisible({ timeout: 8000 })
  const cards = await page.locator('.mpr-kpi-card').count()
  expect(cards).toBeGreaterThanOrEqual(2)

  // Las dos primeras tarjetas KPI abren Deudas y Flujo de caja (vistas lazy).
  for (let i = 0; i < 2; i++) {
    await goProfile(page)
    await expect(page.locator('.mpr-kpi-card').nth(i)).toBeVisible()
    await page.locator('.mpr-kpi-card').nth(i).click()
    await page.waitForTimeout(400)
    await expect(page.getByText(ERROR_BOUNDARY), `kpi #${i}`).toHaveCount(0)
  }
})
