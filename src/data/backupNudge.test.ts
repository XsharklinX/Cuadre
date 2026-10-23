import { describe, expect, it } from 'vitest'
import { NUDGE_AFTER_DAYS, NUDGE_MIN_TX, NUDGE_SNOOZE_DAYS, backupNudge, type BackupNudgeInput } from './backupNudge'

const DIA = 86_400_000
const AHORA = Date.UTC(2026, 9, 18, 12, 0, 0)

function caso(over: Partial<BackupNudgeInput> = {}): BackupNudgeInput {
  return {
    lastBackupAt: new Date(AHORA - 2 * DIA).toISOString(),
    txCount: 80,
    dismissedAt: 0,
    now: AHORA,
    ...over,
  }
}

function hace(dias: number): string {
  return new Date(AHORA - dias * DIA).toISOString()
}

describe('backupNudge', () => {
  it('con copia reciente no dice nada', () => {
    const r = backupNudge(caso({ lastBackupAt: hace(2) }))
    expect(r.show).toBe(false)
    expect(r.daysSince).toBe(2)
  })

  it('pasado el plazo, pide la copia', () => {
    expect(backupNudge(caso({ lastBackupAt: hace(NUDGE_AFTER_DAYS) })).show).toBe(true)
    expect(backupNudge(caso({ lastBackupAt: hace(47) })).show).toBe(true)
  })

  it('un día antes del plazo todavía se calla', () => {
    expect(backupNudge(caso({ lastBackupAt: hace(NUDGE_AFTER_DAYS - 1) })).show).toBe(false)
  })

  it('no haber hecho NUNCA una copia es el caso grave', () => {
    const r = backupNudge(caso({ lastBackupAt: null }))
    expect(r.show).toBe(true)
    expect(r.daysSince).toBeNull()
  })

  describe('frenos para que no canse', () => {
    it('con un libro de prueba no se molesta a nadie', () => {
      expect(backupNudge(caso({ lastBackupAt: null, txCount: NUDGE_MIN_TX - 1 })).show).toBe(false)
    })

    it('justo en el mínimo ya hay algo que perder', () => {
      expect(backupNudge(caso({ lastBackupAt: null, txCount: NUDGE_MIN_TX })).show).toBe(true)
    })

    it('descartarlo lo calla un mes', () => {
      const recien = backupNudge(caso({ lastBackupAt: null, dismissedAt: AHORA - 5 * DIA }))
      expect(recien.show).toBe(false)
    })

    it('pasado el mes vuelve: el riesgo no se fue porque lo taparas', () => {
      const r = backupNudge(caso({ lastBackupAt: null, dismissedAt: AHORA - (NUDGE_SNOOZE_DAYS + 1) * DIA }))
      expect(r.show).toBe(true)
    })

    it('justo al cumplirse el silencio ya puede volver', () => {
      const r = backupNudge(caso({ lastBackupAt: null, dismissedAt: AHORA - NUDGE_SNOOZE_DAYS * DIA }))
      expect(r.show).toBe(true)
    })
  })

  describe('la cuenta de días', () => {
    it('cuenta días completos, no fracciones', () => {
      expect(backupNudge(caso({ lastBackupAt: hace(0.5) })).daysSince).toBe(0)
      expect(backupNudge(caso({ lastBackupAt: hace(1.9) })).daysSince).toBe(1)
    })

    it('una copia con fecha futura no da días negativos', () => {
      // Pasa de verdad: reloj mal puesto, o restaurar en otra zona horaria.
      expect(backupNudge(caso({ lastBackupAt: new Date(AHORA + 3 * DIA).toISOString() })).daysSince).toBe(0)
    })

    it('una fecha corrupta se trata como «nunca», no revienta', () => {
      const r = backupNudge(caso({ lastBackupAt: 'el martes pasado' }))
      expect(r.daysSince).toBeNull()
      expect(r.show).toBe(true)
    })
  })
})
