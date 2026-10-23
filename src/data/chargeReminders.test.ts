import { describe, expect, it } from 'vitest'
import { REMINDER_STEPS, chargesToRemind, remindToday } from './chargeReminders'
import type { Charge } from './clients'

const HOY = '2026-10-18'

let n = 0
function cobro(over: Partial<Charge> = {}): Charge {
  n += 1
  return { id: `ch${n}`, clientId: 'cli1', dueDate: HOY, amount: 250, paid: 0, txIds: [], paidAt: 0, ...over }
}

/** Un cobro que vence hace `dias` días. */
function atrasado(dias: number, over: Partial<Charge> = {}): Charge {
  const d = new Date(`${HOY}T12:00:00`)
  d.setDate(d.getDate() - dias)
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return cobro({ dueDate: iso, ...over })
}

describe('remindToday · la escalera 0/3/7', () => {
  it('avisa el día que vence', () => {
    expect(remindToday(atrasado(0), HOY)).toBe(true)
  })

  it('avisa a los 3 y a los 7 días', () => {
    expect(remindToday(atrasado(3), HOY)).toBe(true)
    expect(remindToday(atrasado(7), HOY)).toBe(true)
  })

  it('CALLA los días de en medio', () => {
    // Es la razón de existir de este módulo: antes avisaba todos los días, y
    // un aviso diario se aprende a descartar sin leerlo.
    for (const dias of [1, 2, 4, 5, 6]) {
      expect(remindToday(atrasado(dias), HOY), `día ${dias}`).toBe(false)
    }
  })

  it('CALLA para siempre después del séptimo', () => {
    // A los cuarenta días el usuario ya sabe que le deben; repetirlo no le
    // dice nada que no sepa. Sigue en la lista, en rojo y el primero.
    for (const dias of [8, 15, 30, 90, 400]) {
      expect(remindToday(atrasado(dias), HOY), `día ${dias}`).toBe(false)
    }
  })

  it('no avisa de lo que todavía no vence', () => {
    expect(remindToday(cobro({ dueDate: '2026-10-25' }), HOY)).toBe(false)
  })

  it('no avisa de lo cobrado ni de lo dado por perdido', () => {
    expect(remindToday(atrasado(3, { paid: 250, paidAt: 1 }), HOY)).toBe(false)
    expect(remindToday(atrasado(3, { waived: true }), HOY)).toBe(false)
  })

  it('un cobro a medias sigue avisando por lo que falta', () => {
    expect(remindToday(atrasado(3, { amount: 250, paid: 100 }), HOY)).toBe(true)
  })
})

describe('chargesToRemind', () => {
  it('devuelve solo los de hoy en la escalera', () => {
    const lista = chargesToRemind([
      atrasado(0, { id: 'hoy' }),
      atrasado(1, { id: 'ayer' }),
      atrasado(3, { id: 'tres' }),
      atrasado(5, { id: 'cinco' }),
      atrasado(7, { id: 'siete' }),
    ], HOY)
    expect(lista.map(c => c.id)).toEqual(['siete', 'tres', 'hoy'])
  })

  it('LO MÁS ATRASADO PRIMERO, porque el aviso se corta', () => {
    // Si se llenara con los que vencen hoy, el que lleva una semana sin pagar
    // no saldría nunca.
    const lista = chargesToRemind(
      [atrasado(0, { id: 'a' }), atrasado(0, { id: 'b' }), atrasado(7, { id: 'viejo' })],
      HOY, 1,
    )
    expect(lista.map(c => c.id)).toEqual(['viejo'])
  })

  it('respeta el tope', () => {
    const muchos = Array.from({ length: 30 }, () => atrasado(0))
    expect(chargesToRemind(muchos, HOY)).toHaveLength(10)
    expect(chargesToRemind(muchos, HOY, 3)).toHaveLength(3)
  })

  it('sin nada que recordar, lista vacía', () => {
    expect(chargesToRemind([atrasado(2), atrasado(20)], HOY)).toEqual([])
  })
})

describe('la escalera está bien definida', () => {
  it('empieza en el día del vencimiento y va a más', () => {
    expect(REMINDER_STEPS[0]).toBe(0)
    expect([...REMINDER_STEPS]).toEqual([...REMINDER_STEPS].sort((a, b) => a - b))
  })

  it('no se repite ningún escalón', () => {
    // Un escalón duplicado no haría nada hoy, pero delataría una edición
    // descuidada de la lista.
    expect(new Set(REMINDER_STEPS).size).toBe(REMINDER_STEPS.length)
  })
})
