import { describe, expect, it } from 'vitest'
import { REMINDER_KINDS, isReminderKindOn } from './reminderKinds'

describe('tipos de aviso', () => {
  /*
   * AUSENTE = ENCENDIDO. Quien ya tiene la app instalada nunca ha tocado este
   * ajuste: si "sin valor" significara apagado, perderia todos sus avisos al
   * actualizar sin haber pedido nada.
   */
  it('sin ajuste guardado, todos estan encendidos', () => {
    for (const kind of REMINDER_KINDS) {
      expect(isReminderKindOn({}, kind), kind).toBe(true)
    }
  })

  it('solo se apaga el que se apaga', () => {
    const kinds = { weekly: false }
    expect(isReminderKindOn(kinds, 'weekly')).toBe(false)
    expect(isReminderKindOn(kinds, 'budget')).toBe(true)
    expect(isReminderKindOn(kinds, 'recurring')).toBe(true)
  })

  it('volver a encenderlo funciona', () => {
    expect(isReminderKindOn({ weekly: true }, 'weekly')).toBe(true)
  })

  /** Los siete tipos son distintos: un duplicado dejaria uno sin interruptor. */
  it('no hay tipos repetidos', () => {
    expect(new Set(REMINDER_KINDS).size).toBe(REMINDER_KINDS.length)
  })
})
