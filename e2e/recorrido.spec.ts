import { expect, test, type Page } from '@playwright/test'

// ── Recorrido completo de la 2.6 ───────────────────────────────────────────
// Con datos de verdad (movimientos de cinco meses, metas, un negocio con
// clientes, cobros y servicios) recorre TODAS las pantallas nuevas en un móvil
// pequeño y en uno grande, con la letra normal y grande. Falla si:
//  · salta la pantalla de error («No pudimos cargar…»),
//  · hay un error de JavaScript en la consola de la página,
//  · un control queda fuera de la pantalla por los lados.
// Con CAPTURAS=1 además guarda una foto de cada paso para revisarlas a ojo.

const ERROR_BOUNDARY = /No pudimos cargar/
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const today = new Date()
const daysAgo = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return iso(d) }
const monthDay = (monthsAgo: number, day: number) => iso(new Date(today.getFullYear(), today.getMonth() - monthsAgo, day))

let seed = 3
const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
const cats = [['c0', 'Comida', '#ff6b8a', 'food'], ['c1', 'Transporte', '#5bc0ff', 'car'], ['c2', 'Casa', '#a78bfa', 'home'], ['c3', 'Ocio', '#ffdd3d', 'play']] as const
const transactions: unknown[] = [
  { id: 'rec1', type: 'expense', amount: 900, date: monthDay(4, 3), note: 'Netflix', categoryId: 'c3', accountId: 'a1', recurring: 'monthly', recurringStart: monthDay(4, 3) },
]
for (let m = 0; m < 5; m++) {
  transactions.push({ id: `sal${m}`, type: 'income', amount: 65000, date: monthDay(m, 1), note: 'Salario', categoryId: 'c9', accountId: 'a1' })
  for (let i = 0; i < 20; i++) {
    const c = cats[Math.floor(rnd() * cats.length)]
    const d = new Date(today.getFullYear(), today.getMonth() - m, 1 + Math.floor(rnd() * 27))
    if (d > today) continue
    transactions.push({ id: `t${m}-${i}`, type: 'expense', amount: Math.round(200 + rnd() * 3000), date: iso(d), note: i % 3 ? 'Supermercado Nacional' : c[1], categoryId: c[0], accountId: i % 2 ? 'a1' : 'a2' })
  }
}
const finance = {
  currency: 'DOP',
  accounts: [
    { id: 'a1', name: 'Banreservas Cuenta de Ahorro', short: 'BR', type: 'savings', balance: 84200, color: '#c8102e', last4: null, includeInTotal: true },
    { id: 'a2', name: 'Efectivo', short: 'Ef', type: 'cash', balance: 6800, color: '#35d0a2', last4: null, includeInTotal: true },
  ],
  categories: [
    ...cats.map(([id, name, color, icon]) => ({ id, name, type: 'expense', color, budget: 9000, icon })),
    { id: 'c9', name: 'Salario', type: 'income', color: '#35d0a2', budget: 0, icon: 'briefcase' },
    { id: 'cb', name: 'Ventas', type: 'income', color: '#5bc0ff', budget: 0, icon: 'briefcase' },
  ],
  transactions,
  goals: [
    { id: 'g0', name: 'Fondo de emergencias', target: 50000, saved: 36000, openingSaved: 0, color: '#ffd60a', icon: 'shield', deadline: monthDay(-5, 1) },
    { id: 'g1', name: 'Vacaciones en Samaná', target: 100000, saved: 30000, openingSaved: 0, color: '#30d158', icon: 'plane' },
  ],
  goalContributions: [
    { id: 'k1', goalId: 'g0', amount: 12000, fromAccountId: 'a1', date: monthDay(2, 10) },
    { id: 'k2', goalId: 'g0', amount: 12000, fromAccountId: 'a1', date: monthDay(1, 10) },
    { id: 'k3', goalId: 'g0', amount: 12000, fromAccountId: 'a1', date: monthDay(0, 1) },
    { id: 'k4', goalId: 'g1', amount: 15000, fromAccountId: 'a1', date: monthDay(1, 20) },
    { id: 'k5', goalId: 'g1', amount: 15000, fromAccountId: 'a1', date: monthDay(0, 2) },
  ],
  budgets: [],
}
const client = (id: string, name: string, dueDay: number, phone?: string) => ({
  id, name, phone, concept: 'Netflix', amount: 350, cycle: 'monthly', dueDay, accountId: 'a1', categoryId: 'cb',
  businessId: 'b1', serviceId: 's1', active: true, createdAt: Date.now() - 200 * 86_400_000,
})
const business = {
  businesses: [{ id: 'b1', name: 'Pantallas', color: '#5bc0ff', icon: 'tv', incomeCategoryIds: ['cb'], expenseCategoryIds: [], createdAt: 0, monthlyGoal: 3000 }],
  services: [{ id: 's1', businessId: 'b1', name: 'Netflix', cost: 600, costCycle: 'monthly', accounts: [{ id: 'acc1', label: '1', cost: 600, capacity: 5 }], createdAt: 0 }],
  clients: [client('ana', 'Ana Lugo', today.getDate(), '8095551234'), client('jose', 'José Rosario', 3, '8095550000'), client('luis', 'Luis Pérez', 15), client('rosa', 'Rosa Díaz', 20)],
  charges: [
    { id: 'p1', clientId: 'jose', dueDate: monthDay(2, 3), amount: 350, paid: 350, txIds: [], paidAt: new Date(monthDay(2, 3)).getTime() + 9 * 86_400_000 },
    { id: 'p2', clientId: 'jose', dueDate: monthDay(1, 3), amount: 350, paid: 350, txIds: [], paidAt: new Date(monthDay(1, 3)).getTime() + 11 * 86_400_000 },
    { id: 'l1', clientId: 'jose', dueDate: daysAgo(26), amount: 350, paid: 0, txIds: [], paidAt: 0 },
  ],
}

async function boot(page: Page, w: number, h: number, fs: number, errors: string[]) {
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript(([f, b, scale]) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({ state: { hasSeenOnboarding: true, language: 'es', currency: 'DOP', fontScale: scale }, version: 0 }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({ state: f, version: 0 }))
    localStorage.setItem('cuadre-business-v1', JSON.stringify({ state: b, version: 0 }))
  }, [finance, business, fs] as const)
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try { await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 12_000 }) } catch { await page.waitForTimeout(3500) }
  await expect(page.getByLabel(/Navegaci/)).toBeVisible({ timeout: 10_000 })
  await page.waitForTimeout(300)
}

async function offscreen(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const W = window.innerWidth, bad: string[] = []
    const enCarrusel = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 2) return true
      }
      return false
    }
    for (const el of Array.from(document.querySelectorAll('.mobile-app button, .mobile-app input, .mobile-app [role="button"]'))) {
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.pointerEvents === 'none' || el.closest('.sheet-ghost')) continue
      if (enCarrusel(el)) continue
      const r = el.getBoundingClientRect()
      if (r.width < 1 || r.height < 1) continue
      if (r.right - W > 2 || -r.left > 2) bad.push(`${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 40)} "${(el.textContent || '').trim().slice(0, 20)}"`)
    }
    return bad
  })
}

const SIZES = [
  { w: 360, h: 640, fs: 1.35, label: '360×640 letra 135 %' },
  { w: 412, h: 915, fs: 1, label: '412×915 letra 100 %' },
  // Teléfonos pequeños y viejos que siguen en uso, y la tablet (que gira libre).
  { w: 320, h: 568, fs: 1.15, label: '320×568 letra 115 %' },
  { w: 768, h: 1024, fs: 1, label: '768×1024 tablet' },
]

for (const size of SIZES) {
  test(`recorrido 2.6 sin errores — ${size.label}`, async ({ page }) => {
    test.setTimeout(240_000)
    const errors: string[] = []
    const problems: string[] = []
    let n = 0
    const check = async (step: string) => {
      await page.waitForTimeout(450)
      if (await page.getByText(ERROR_BOUNDARY).count()) problems.push(`${step}: pantalla de error`)
      for (const o of await offscreen(page)) problems.push(`${step}: fuera de pantalla ${o}`)
      if (process.env.CAPTURAS) await page.screenshot({ path: `test-results/recorrido/${size.w}-${String(++n).padStart(2, '0')}-${step}.png` })
    }
    const back = async () => { for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) } }
    const nav = (name: string) => page.getByLabel(/Navegaci/).getByRole('button', { name, exact: true }).click()

    await boot(page, size.w, size.h, size.fs, errors)
    await check('movimientos')

    // Menú rápido de un movimiento y el formulario de editar.
    await page.locator('.mobile-tx-row').first().dispatchEvent('pointerdown')
    await page.waitForTimeout(700)
    await check('menu-rapido')
    await page.locator('.mtq-sheet .mgn-menu-row', { hasText: 'Editar todo' }).click()
    await check('editar')
    await page.locator('.mpr-editor-close').click()
    await page.waitForTimeout(300)

    // Análisis 2.8: la tarjeta del mes, sus filas, una categoría, comparar y el año.
    await nav('Análisis')
    await page.waitForTimeout(800)
    await check('analisis')
    const bar = page.locator('.man-bar:not([disabled])').first()
    if (await bar.count()) { await bar.click(); await check('analisis-dia'); await back() }
    await page.locator('.mobile-content').evaluate(el => el.scrollTo(0, 700))
    await check('analisis-filas')
    await page.locator('.an28-row-btn', { hasText: /gastas más/ }).first().click().catch(() => {})
    await check('analisis-dias')
    await back()
    await page.locator('.an28-row-btn', { hasText: /Fijos/ }).first().click().catch(() => {})
    await check('analisis-fijos')
    await back()
    await page.locator('.an28-cat').first().click()
    await check('analisis-categoria-hoja')
    await back()
    await page.locator('.mobile-content').evaluate(el => el.scrollTo(0, 0))
    await page.locator('.an28-pills button', { hasText: /vs / }).click()
    await check('comparar-con')
    await page.locator('.an28-pick', { hasText: 'tu media' }).or(page.locator('.an28-pick', { hasText: 'Tu media' })).first().click()
    await check('analisis-vs-media')
    await page.locator('.an28-share').click()
    await check('compartir')
    await back()
    for (const p of ['Semana', 'Año']) {
      await page.locator('.an28-pills button', { hasText: p }).click()
      await check(`analisis-${p}`)
    }
    await page.locator('.an28-questions button').first().click().catch(() => {})
    await check('pregunta')
    await back()

    // Negocio: Hoy, recordar, meta, Clientes, Cobros en agenda y Ganancia.
    await nav('Negocio')
    await page.waitForTimeout(800)
    await page.locator('.mbiz-tabs button', { hasText: 'Hoy' }).click()
    await check('negocio-hoy')
    await page.locator('.mbt-goal-btn').click().catch(() => {})
    await check('negocio-meta')
    await back()
    for (const tab of ['Clientes', 'Cobros', 'Ganancia']) {
      await page.locator('.mbiz-tabs button', { hasText: tab }).click()
      await check(`negocio-${tab}`)
      if (tab === 'Cobros') {
        await page.locator('.mcol-view button', { hasText: 'Agenda' }).click()
        await check('negocio-agenda')
        await page.locator('.mcol-view button', { hasText: 'Lista' }).click()
      }
    }

    // Menú ☰, su buscador y Metas.
    await nav('Movimientos')
    await page.waitForTimeout(400)
    await page.locator('.mobile-topbar-menu').click()
    await check('menu')
    // S3 (2.8): el campo del menú abre el buscador global, que encuentra
    // ajustes, herramientas, comercios y clientes.
    await page.locator('#tools-search').click()
    await page.locator('#global-search').fill('letra')
    await check('buscar-ajuste')
    await page.locator('#global-search').fill('super')
    await check('buscar-comercio')
    await page.locator('.srch28-lead-actions button').first().click().catch(() => {})
    await check('buscar-comercio-todos')
    await page.locator('#global-search').fill('')
    await check('buscar-vacio')
    await page.locator('.mobile-search-head button').first().click()
    await page.waitForTimeout(300)
    await page.locator('.mobile-topbar-menu').click()
    await page.waitForTimeout(400)
    await page.locator('.mtm-edit-toggle').click()
    await check('menu-ordenar')
    await page.locator('.mtm-edit-toggle').click()
    await page.locator('.mtm-tile-main', { hasText: 'Metas' }).click()
    await page.waitForTimeout(900)
    await check('metas')
    await page.locator('.mgn-card').first().click()
    await page.waitForTimeout(700)
    await check('meta-detalle')
    await back()

    expect(errors, `Errores de JavaScript:\n${errors.join('\n')}`).toEqual([])
    expect(problems, problems.join('\n')).toEqual([])
  })
}

test('Negocio sin clientes enseña el ejemplo', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(String(e)))
  await page.addInitScript((f) => {
    localStorage.setItem('sharky-settings-v2', JSON.stringify({ state: { hasSeenOnboarding: true, language: 'es', currency: 'DOP', fontScale: 1 }, version: 0 }))
    localStorage.setItem('sharky-finance-v2', JSON.stringify({ state: f, version: 0 }))
  }, finance)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  try { await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 12_000 }) } catch { await page.waitForTimeout(3500) }
  await page.getByLabel(/Navegaci/).getByRole('button', { name: 'Negocio', exact: true }).click()
  await page.locator('.mbiz-example-btn').click()
  await expect(page.locator('.mbt-example-band')).toBeVisible()
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0)
  expect(errors).toEqual([])
})

// ── Recorrido de la 2.7 ─────────────────────────────────────────────────────
// La ficha-recibo de un movimiento y las seis pantallas rehechas: Presupuestos,
// Caprichos, Listas, Deudas y Flujo de caja, con sus hojas en frase.
const DAY = 86_400_000
const debtsState = {
  debts: [
    { id: 'd1', name: 'Préstamo Banreservas', balance: 48000, originalBalance: 80000, rate: 18, minPayment: 3500, color: '#6366f1', direction: 'owed', kind: 'loan', counterparty: 'Banreservas', dueDay: 5, payments: [{ id: 'q1', amount: 3500, date: monthDay(1, 5) }, { id: 'q2', amount: 3500, date: monthDay(0, 5) }] },
    { id: 'd2', name: 'Tarjeta tienda La Sirena', balance: 9200, rate: 60, minPayment: 1200, color: '#ff6b8a', direction: 'owed', kind: 'store', dueDay: today.getDate(), payments: [] },
    { id: 'd3', name: 'Préstamo a Carlos', balance: 6000, rate: 0, minPayment: 0, color: '#35d0a2', direction: 'lent', kind: 'personal', counterparty: 'Carlos', payments: [] },
  ],
  extraPayment: 1500,
}
const capricesState = {
  items: [
    { id: 'k1', txId: 't0-1', amount: 4200, note: 'Audífonos', createdAt: Date.now() - 20 * DAY, payments: [{ txId: 't0-2', amount: 1500, at: Date.now() - 5 * DAY }] },
    { id: 'k2', txId: 't1-1', amount: 1800, note: 'Cena fuera', createdAt: Date.now() - 60 * DAY, payments: [{ txId: 't1-2', amount: 1800, at: Date.now() - 30 * DAY }] },
  ],
}
const wishesState = {
  items: [
    { id: 'w1', name: 'Tenis Nike', amount: 6500, createdAt: Date.now() - 3 * DAY, decideAt: Date.now() + 4 * DAY, resolvedAt: 0 },
    { id: 'w2', name: 'Teclado mecánico', amount: 4800, createdAt: Date.now() - 9 * DAY, decideAt: Date.now() - DAY, resolvedAt: 0 },
  ],
}
const notesState = {
  notes: [
    { id: 'n1', title: 'Súper del sábado', type: 'shopping', items: [
      { id: 'i1', text: 'Pollo', done: false, price: 380, qty: 3 },
      { id: 'i2', text: 'Arroz', done: true, price: 1250 },
      { id: 'i3', text: 'Aguacates', done: false, price: 60, qty: 4 },
    ], color: '#22c55e', icon: 'cart', budget: 3000, pinned: true, createdAt: Date.now() - DAY, updatedAt: Date.now() },
    { id: 'n2', title: 'Pendientes', type: 'checklist', items: [{ id: 'i4', text: 'Pagar luz', done: false }], color: '#5bc0ff', icon: 'clipboard', createdAt: Date.now() - 2 * DAY, updatedAt: Date.now() - DAY },
  ],
}

for (const size of SIZES) {
  test(`recorrido 2.7 sin errores — ${size.label}`, async ({ page }) => {
    test.setTimeout(240_000)
    const errors: string[] = []
    const problems: string[] = []
    let n = 0
    const check = async (step: string) => {
      await page.waitForTimeout(450)
      if (await page.getByText(ERROR_BOUNDARY).count()) problems.push(`${step}: pantalla de error`)
      for (const o of await offscreen(page)) problems.push(`${step}: fuera de pantalla ${o}`)
      if (process.env.CAPTURAS) await page.screenshot({ path: `test-results/recorrido/27-${size.w}-${String(++n).padStart(2, '0')}-${step}.png` })
    }
    const back = async () => { for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) } }
    const menu = async (label: string) => {
      await page.getByLabel(/Navegaci/).getByRole('button', { name: 'Movimientos', exact: true }).click()
      await page.waitForTimeout(300)
      await page.locator('.mobile-topbar-menu').click()
      await page.waitForTimeout(400)
      await page.getByRole('button', { name: new RegExp(`^${label}`) }).first().click()
      await page.waitForTimeout(900)
    }

    await page.addInitScript(([d, c, w, nt]) => {
      localStorage.setItem('sharky-debts-v1', JSON.stringify({ state: d, version: 0 }))
      localStorage.setItem('cuadre-caprices-v1', JSON.stringify({ state: c, version: 0 }))
      localStorage.setItem('cuadre-wishes-v1', JSON.stringify({ state: w, version: 0 }))
      localStorage.setItem('sharky-notes-v1', JSON.stringify({ state: nt, version: 0 }))
    }, [debtsState, capricesState, wishesState, notesState] as const)
    await boot(page, size.w, size.h, size.fs, errors)

    // T1 · la ficha de un movimiento como recibo.
    await page.locator('.mobile-tx-row').first().click()
    await page.waitForTimeout(700)
    await check('recibo')
    await back()

    // P1/P2 · Presupuestos y la hoja de cambiar uno.
    await menu('Presupuestos')
    await check('presupuestos')
    await page.locator('.nxb-row').first().click().catch(() => {})
    await check('presupuesto-hoja')
    await back()

    // C1 · Caprichos en una pantalla.
    await menu('Caprichos')
    await check('caprichos')
    await page.locator('.nxk-row').first().click().catch(() => {})
    await check('capricho-abierto')

    // L1/L2 · Listas.
    await menu('Listas')
    await check('listas')
    await page.locator('.nxl-card').first().click().catch(() => {})
    await check('lista-detalle')
    await back()

    // D1/D2 · Deudas, su ficha y la frase de una nueva.
    await menu('Deudas')
    await check('deudas')
    await page.locator('.nxd-row-main').first().click()
    await check('deuda-ficha')
    await back()
    await page.locator('.nx-label button', { hasText: 'Deuda' }).click()
    await check('deuda-nueva')
    await back()

    // F1/F3 · Flujo y probar un gasto.
    await menu('Flujo de caja')
    await check('flujo')
    await page.getByRole('button', { name: /Probar un gasto/ }).first().click().catch(() => {})
    await check('flujo-probar')
    await back()

    expect(errors, `Errores de JavaScript:\n${errors.join('\n')}`).toEqual([])
    expect(problems, problems.join('\n')).toEqual([])
  })
}

// ── Recorrido de la 2.8 ─────────────────────────────────────────────────────
// Cuentas con Patrimonio, Suscripciones (ficha, repaso, agregar), Ganancia,
// la ficha del servicio, pagar un servicio, los formularios en hoja corta y
// los cobros por persona.
const subsTx = [
  { id: 'rs1', type: 'expense', amount: 375, date: monthDay(4, 8), note: 'Spotify', categoryId: 'c3', accountId: 'a1', recurring: 'monthly', recurringStart: monthDay(4, 8), recurringNext: monthDay(-1, 8) },
  { id: 'rs2', type: 'expense', amount: 2490, date: monthDay(4, 12), note: 'Claro Internet', categoryId: 'c2', accountId: 'a2', recurring: 'monthly', recurringStart: monthDay(4, 12), recurringNext: monthDay(-1, 12) },
  ...[3, 2, 1, 0].map(m => ({ id: `nf${m}`, type: 'expense', amount: m > 1 ? 750 : 900, date: monthDay(m, 3), note: 'Netflix', categoryId: 'c3', accountId: 'a1' })),
]

for (const size of SIZES) {
  test(`recorrido 2.8 sin errores — ${size.label}`, async ({ page }) => {
    test.setTimeout(300_000)
    const errors: string[] = []
    const problems: string[] = []
    let n = 0
    const check = async (step: string) => {
      await page.waitForTimeout(450)
      if (await page.getByText(ERROR_BOUNDARY).count()) problems.push(`${step}: pantalla de error`)
      for (const o of await offscreen(page)) problems.push(`${step}: fuera de pantalla ${o}`)
      if (process.env.CAPTURAS) await page.screenshot({ path: `test-results/recorrido/28-${size.w}-${String(++n).padStart(2, '0')}-${step}.png` })
    }
    const back = async () => { for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(150) } }
    const nav = (name: string) => page.getByLabel(/Navegaci/).getByRole('button', { name, exact: true }).click()

    await boot(page, size.w, size.h, size.fs, errors)
    // Las suscripciones se suman después de los datos base (si no, los pisan).
    await page.evaluate(extra => {
      const raw = JSON.parse(localStorage.getItem('sharky-finance-v2') ?? '{"state":{}}')
      raw.state.transactions = [...(raw.state.transactions ?? []), ...extra]
      localStorage.setItem('sharky-finance-v2', JSON.stringify(raw))
    }, subsTx)
    await page.reload({ waitUntil: 'domcontentloaded' })
    try { await page.waitForSelector('.splash-screen', { state: 'detached', timeout: 12_000 }) } catch { await page.waitForTimeout(3500) }
    await expect(page.getByLabel(/Navegaci/)).toBeVisible({ timeout: 10_000 })

    // A7 · Patrimonio en Cuentas.
    await nav('Cuentas')
    await page.waitForTimeout(900)
    await check('cuentas-patrimonio')

    // U1–U7 · Suscripciones.
    await nav('Movimientos')
    await page.waitForTimeout(300)
    await page.locator('.mobile-topbar-menu').click()
    await page.locator('.mtm-tile-main', { hasText: 'Suscripciones' }).click()
    await page.waitForTimeout(900)
    await check('suscripciones')
    await page.locator('.u28-row', { hasText: 'Netflix' }).first().click({ timeout: 4000 }).catch(async () => { await page.locator('.u28-row').first().click() })
    await check('suscripcion-ficha')
    await back()
    await page.locator('.u28-review, .u28-link').first().click({ timeout: 4000 }).catch(() => {})
    await check('repaso')
    await page.locator('.u28-ask-acts button').first().click({ timeout: 4000 }).catch(() => {})
    await check('repaso-paso')
    await back()
    await page.locator('.u28-add').click()
    await check('agregar-logos')
    await page.locator('.msub-catalog-item').first().click()
    await check('agregar-hoja')
    await page.locator('.mpr-form-row', { hasText: /Cada/ }).click({ timeout: 4000 }).catch(() => {})
    await check('agregar-cada')
    await back()

    // N1 · Ganancia, la ficha del servicio y pagar.
    await nav('Negocio')
    await page.waitForTimeout(800)
    await page.locator('.mbiz-tabs button', { hasText: 'Ganancia' }).click()
    await check('ganancia')
    await page.locator('.n28-row', { hasText: /año/ }).first().click({ timeout: 4000 }).catch(() => {})
    await check('ganancia-anio')
    await back()
    await page.locator('.n28-svc-main').first().click()
    await page.waitForTimeout(700)
    await check('servicio-ficha')
    await back()
    await page.locator('.n28-pay').first().click()
    await check('pagar-servicio')
    await back()

    // N2–N5 · Los formularios en hoja corta, desde el + de Negocio.
    for (const [k, txt] of [['cliente', /Cliente/], ['cobro', /Cobro/], ['servicio', /Servicio/], ['negocio', /Negocio/]] as const) {
      await page.locator('.mobile-add-fab').click()
      await page.waitForTimeout(500)
      const row = page.locator('.mcreate-row', { hasText: txt }).first()
      if (await row.count()) { await row.click(); await page.waitForTimeout(600); await check(`form-${k}`) }
      await back()
    }

    // N7 · Cobros por persona.
    await page.locator('.mbiz-tabs button', { hasText: 'Cobros' }).click()
    await check('cobros')
    await page.locator('.n28-person .n28-row').first().click({ timeout: 4000 }).catch(() => {})
    await check('cobros-persona')
    await back()

    expect(errors, `Errores de JavaScript:\n${errors.join('\n')}`).toEqual([])
    expect(problems, problems.join('\n')).toEqual([])
  })
}
