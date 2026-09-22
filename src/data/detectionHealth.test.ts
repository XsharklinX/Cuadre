import { describe, expect, it } from 'vitest'
import { detectionHealth, SILENT_DAYS, WARMUP_DAYS, type DetectionInput } from './detectionHealth'

const DAY = 86_400_000
const NOW = new Date('2026-09-20T12:00:00Z').getTime()

const input = (over: Partial<DetectionInput> = {}): DetectionInput => ({
  enabled: true, granted: true, connected: true,
  lastCapturedAt: NOW - DAY, enabledSince: NOW - 90 * DAY, now: NOW, ...over,
})

describe('salud de la deteccion de transacciones', () => {
  it('desactivada no opina', () => {
    const h = detectionHealth(input({ enabled: false, granted: false, connected: false }))
    expect(h.state).toBe('off')
    expect(h.alert).toBe(false)
  })

  it('sin permiso, avisa', () => {
    expect(detectionHealth(input({ granted: false, connected: false }))).toMatchObject({
      state: 'no-access', alert: true,
    })
  })

  /**
   * EL fallo. Permiso concedido y servicio desvinculado: Ajustes decia
   * "concedido" y la app no capturaba nada. Meses.
   */
  it('con permiso pero sin vincular, avisa aunque acabe de capturar', () => {
    expect(detectionHealth(input({ connected: false, lastCapturedAt: NOW - 1000 }))).toMatchObject({
      state: 'unbound', alert: true,
    })
  })

  it('recien activada y sin capturas todavia, NO avisa', () => {
    const h = detectionHealth(input({
      lastCapturedAt: 0, enabledSince: NOW - (WARMUP_DAYS - 1) * DAY,
    }))
    expect(h.state).toBe('warming-up')
    expect(h.alert).toBe(false)
  })

  it('activada hace tiempo y sin una sola captura, avisa', () => {
    expect(detectionHealth(input({ lastCapturedAt: 0, enabledSince: NOW - 30 * DAY }))).toMatchObject({
      state: 'silent', alert: true,
    })
  })

  it('sin fecha de activacion no acusa (instalaciones viejas)', () => {
    expect(detectionHealth(input({ lastCapturedAt: 0, enabledSince: 0 }))).toMatchObject({
      state: 'warming-up', alert: false,
    })
  })

  it('una semana sin capturar es normal: no avisa', () => {
    const h = detectionHealth(input({ lastCapturedAt: NOW - 7 * DAY }))
    expect(h.state).toBe('ok')
    expect(h.alert).toBe(false)
    expect(h.daysSilent).toBe(7)
  })

  it(`a los ${SILENT_DAYS} dias en silencio, avisa`, () => {
    const h = detectionHealth(input({ lastCapturedAt: NOW - SILENT_DAYS * DAY }))
    expect(h.state).toBe('silent')
    expect(h.alert).toBe(true)
    expect(h.daysSilent).toBe(SILENT_DAYS)
  })

  it('el dia justo antes del umbral todavia no avisa', () => {
    expect(detectionHealth(input({ lastCapturedAt: NOW - (SILENT_DAYS - 1) * DAY }))).toMatchObject({
      state: 'ok', alert: false,
    })
  })

  it('capturando con normalidad esta bien', () => {
    expect(detectionHealth(input())).toMatchObject({ state: 'ok', alert: false, daysSilent: 1 })
  })
})
