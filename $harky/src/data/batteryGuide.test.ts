import { describe, expect, it } from 'vitest'
import {
  EMPTY_BATTERY_STATE, allGuides, detectVendor, guideFor, shouldAskBattery,
} from './batteryGuide'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 20).getTime()

describe('detectar el fabricante', () => {
  it('reconoce la familia Xiaomi completa', () => {
    for (const ua of ['Mozilla/5.0 (Linux; Android 14; Redmi Note 12)', 'POCO X5', 'MIUI/V14']) {
      expect(detectVendor(ua), ua).toBe('xiaomi')
    }
  })

  it('reconoce Samsung por el prefijo de modelo', () => {
    // Los Galaxy se identifican como "SM-A546B", no como "Samsung".
    expect(detectVendor('Android 14; SM-A546B')).toBe('samsung')
  })

  it('agrupa realme y OnePlus con OPPO', () => {
    // Comparten ColorOS, así que comparten los mismos ajustes.
    expect(detectVendor('realme GT')).toBe('oppo')
    expect(detectVendor('OnePlus 11')).toBe('oppo')
  })

  it('reconoce Honor como Huawei', () => {
    expect(detectVendor('HONOR X8')).toBe('huawei')
  })

  it('cae a genérico cuando no reconoce', () => {
    expect(detectVendor('Pixel 8')).toBe('other')
    expect(detectVendor('')).toBe('other')
  })
})

describe('guías', () => {
  it('cada fabricante tiene pasos', () => {
    for (const guide of allGuides()) {
      expect(guide.stepKeys.length, guide.vendor).toBeGreaterThan(0)
      expect(guide.label.trim().length, guide.vendor).toBeGreaterThan(0)
    }
  })

  it('los fabricantes agresivos necesitan un paso propio además del estándar', () => {
    // En estos teléfonos conceder la exención de Android NO basta: el gestor
    // del fabricante sigue matando procesos.
    for (const v of ['xiaomi', 'huawei', 'samsung', 'oppo', 'vivo'] as const) {
      expect(guideFor(v).needsExtraStep, v).toBe(true)
    }
    expect(guideFor('other').needsExtraStep).toBe(false)
  })
})

describe('cuándo pedirlo', () => {
  const base = { state: EMPTY_BATTERY_STATE, hasBackgroundWork: true, alreadyExempt: false, now: NOW }

  it('lo pide cuando hay trabajo de fondo y no hay exención', () => {
    expect(shouldAskBattery(base)).toBe(true)
  })

  it('NO lo pide si no hay nada de fondo encendido', () => {
    // Pedirlo a quien tiene recordatorios y backup apagados es gastar el
    // permiso cuando no hay nada que proteger — y cuando haga falta, el
    // usuario ya dijo que no.
    expect(shouldAskBattery({ ...base, hasBackgroundWork: false })).toBe(false)
  })

  it('NO lo pide si Android ya concedió la exención', () => {
    expect(shouldAskBattery({ ...base, alreadyExempt: true })).toBe(false)
  })

  it('NO lo repite si el usuario ya lo hizo', () => {
    expect(shouldAskBattery({ ...base, state: { ...EMPTY_BATTERY_STATE, done: true } })).toBe(false)
  })

  it('respeta la espera tras un "ahora no"', () => {
    const snoozed = { ...EMPTY_BATTERY_STATE, lastAskedAt: NOW - 3 * DAY, timesAsked: 1 }
    expect(shouldAskBattery({ ...base, state: snoozed })).toBe(false)
  })

  it('vuelve a pedirlo pasada la espera', () => {
    const snoozed = { ...EMPTY_BATTERY_STATE, lastAskedAt: NOW - 20 * DAY, timesAsked: 1 }
    expect(shouldAskBattery({ ...base, state: snoozed })).toBe(true)
  })

  it('después de tres rechazos deja de insistir', () => {
    const tired = { ...EMPTY_BATTERY_STATE, lastAskedAt: NOW - 90 * DAY, timesAsked: 3 }
    expect(shouldAskBattery({ ...base, state: tired })).toBe(false)
  })
})
