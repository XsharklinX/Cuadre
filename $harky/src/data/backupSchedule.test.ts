import { describe, expect, it } from 'vitest'
import { backupDecision, backupNeedsAttention, daysSinceBackup, OVERDUE_MS } from './backupSchedule'

const DAY = 24 * 60 * 60 * 1000
// Lunes 2026-09-14, 10:00. getDay() === 1.
const MONDAY_10AM = new Date(2026, 8, 14, 10, 0, 0)
const WEDNESDAY_10AM = new Date(2026, 8, 16, 10, 0, 0)

const input = (over: Partial<Parameters<typeof backupDecision>[0]> = {}) => ({
  hasFolder: true,
  lastSuccessAt: MONDAY_10AM.getTime() - 7 * DAY,
  preferredDay: 1,
  preferredHour: 3,
  now: MONDAY_10AM,
  ...over,
})

describe('cuándo toca una copia', () => {
  it('sin carpeta elegida no hay nada que copiar', () => {
    expect(backupDecision(input({ hasFolder: false }))).toEqual({ due: false, reason: 'no-folder' })
  })

  it('copia en la ventana preferida', () => {
    const d = backupDecision(input())
    expect(d.due).toBe(true)
    expect(d.reason).toBe('preferred-window')
  })

  it('no copia dos veces en la misma semana', () => {
    const d = backupDecision(input({ lastSuccessAt: MONDAY_10AM.getTime() - 2 * DAY }))
    expect(d).toEqual({ due: false, reason: 'too-soon' })
  })

  it('espera a la hora preferida dentro del día correcto', () => {
    const d = backupDecision(input({ now: new Date(2026, 8, 14, 1, 0, 0) }))
    expect(d).toEqual({ due: false, reason: 'waiting-for-hour' })
  })

  it('si nunca hubo copia, copia de inmediato', () => {
    // Una instalación nueva no debería esperar hasta el próximo lunes para
    // tener su primera copia.
    const d = backupDecision(input({ lastSuccessAt: 0, now: WEDNESDAY_10AM }))
    expect(d).toEqual({ due: true, reason: 'overdue' })
  })
})

/**
 * EL ARREGLO. Antes, el día elegido era una CONDICIÓN: si el worker no
 * despertaba justo ese día (deriva de WorkManager + agrupamiento de Doze), se
 * saltaba la semana entera en silencio y la próxima oportunidad era 7 días
 * después. Con datos financieros eso es pérdida real.
 */
describe('recuperación cuando se perdió el día elegido', () => {
  it('copia un miércoles si la última fue hace más de 8 días', () => {
    const d = backupDecision(input({
      lastSuccessAt: WEDNESDAY_10AM.getTime() - 9 * DAY,
      now: WEDNESDAY_10AM,
      preferredDay: 1,
    }))
    expect(d.due).toBe(true)
    expect(d.reason).toBe('overdue')
  })

  it('el vencimiento ignora también la hora preferida', () => {
    // A la 1am de un martes, con la copia vencida: se copia igual. Esperar a
    // las 3am del próximo lunes es exactamente el bug.
    const d = backupDecision(input({
      lastSuccessAt: new Date(2026, 8, 15, 1, 0, 0).getTime() - 10 * DAY,
      now: new Date(2026, 8, 15, 1, 0, 0),
      preferredDay: 1,
      preferredHour: 3,
    }))
    expect(d.due).toBe(true)
  })

  it('no se salta ninguna semana: cualquier día pasado el vencimiento copia', () => {
    // Recorre los 7 días de la semana con una copia vencida. Antes, 6 de los 7
    // devolvían "no toca" y el usuario se quedaba sin backup.
    for (let offset = 0; offset < 7; offset++) {
      const now = new Date(2026, 8, 14 + offset, 12, 0, 0)
      const d = backupDecision({
        hasFolder: true,
        lastSuccessAt: now.getTime() - OVERDUE_MS - DAY,
        preferredDay: 1,
        preferredHour: 3,
        now,
      })
      expect(d.due, `día ${now.getDay()}`).toBe(true)
    }
  })

  it('entre 6 y 8 días sigue esperando su día: no se adelanta sin motivo', () => {
    // La ventana normal se respeta mientras no haya vencimiento real.
    const d = backupDecision(input({
      lastSuccessAt: WEDNESDAY_10AM.getTime() - 7 * DAY,
      now: WEDNESDAY_10AM,
      preferredDay: 1,
    }))
    expect(d.due).toBe(false)
    expect(d.reason).toBe('waiting-for-day')
  })
})

describe('días desde la última copia', () => {
  it('devuelve null si nunca hubo copia', () => {
    expect(daysSinceBackup(0)).toBeNull()
  })

  it('cuenta los días completos', () => {
    const now = new Date(2026, 8, 20, 12, 0, 0)
    expect(daysSinceBackup(now.getTime() - 3 * DAY, now)).toBe(3)
  })
})

describe('cuándo avisarle al usuario', () => {
  const now = new Date(2026, 8, 20, 12, 0, 0)

  it('avisa si no hay carpeta elegida', () => {
    // El fallo más peligroso: sin carpeta no se copia NADA, y antes fallaba en
    // silencio sin que el usuario lo supiera.
    expect(backupNeedsAttention({ hasFolder: false, folderWritable: false, lastSuccessAt: 0, now })).toBe(true)
  })

  it('avisa si la carpeta ya no es escribible', () => {
    // El usuario la borró o revocó el permiso: las copias fallan calladas.
    expect(backupNeedsAttention({
      hasFolder: true, folderWritable: false, lastSuccessAt: now.getTime() - DAY, now,
    })).toBe(true)
  })

  it('avisa si la copia está vieja', () => {
    expect(backupNeedsAttention({
      hasFolder: true, folderWritable: true, lastSuccessAt: now.getTime() - 9 * DAY, now,
    })).toBe(true)
  })

  it('no avisa cuando todo está bien', () => {
    expect(backupNeedsAttention({
      hasFolder: true, folderWritable: true, lastSuccessAt: now.getTime() - 2 * DAY, now,
    })).toBe(false)
  })
})
