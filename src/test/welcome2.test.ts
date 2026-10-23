import { describe, expect, it } from 'vitest'
import { isMajorUpgrade } from '@/mobile/MobileWelcome2'
import { APP_VERSION } from '@/data/release'

/**
 * EL CARTEL DE LA 2.0 SE VE UNA VEZ, Y SOLO CUANDO TOCA.
 *
 * Esto es lo primero que ve todo el mundo al actualizar, así que los dos
 * fallos posibles son caros y opuestos:
 *
 * · Que NO aparezca tras el salto de versión: una versión que mueve de sitio
 *   media app dejaría a la gente sin saber dónde está lo nuevo.
 * · Que aparezca cuando no debe —en una instalación nueva, o por un parche—:
 *   un cartel a pantalla completa por tres arreglos es ruido, y en una
 *   instalación nueva le roba a alguien su primer momento con la app.
 */
describe('isMajorUpgrade', () => {
  it('un salto de mayor SÍ lo merece', () => {
    expect(isMajorUpgrade('1.9.12', '2.0.0')).toBe(true)
    expect(isMajorUpgrade('1.0.0', '2.0.0')).toBe(true)
    expect(isMajorUpgrade('1.9.12', '3.0.0')).toBe(true)
  })

  it('un parche o una menor NO: para eso está el historial de siempre', () => {
    expect(isMajorUpgrade('1.9.11', '1.9.12')).toBe(false)
    expect(isMajorUpgrade('1.8.0', '1.9.0')).toBe(false)
    expect(isMajorUpgrade('2.0.0', '2.1.0')).toBe(false)
    expect(isMajorUpgrade('2.0.0', '2.0.1')).toBe(false)
  })

  it('una INSTALACIÓN NUEVA no es una actualización', () => {
    // Sin versión previa no hay de dónde se venga, y un cartel de novedades
    // sobre cosas que nunca viste no dice nada.
    expect(isMajorUpgrade(null, '2.0.0')).toBe(false)
  })

  it('la misma versión no reaparece', () => {
    expect(isMajorUpgrade('2.0.0', '2.0.0')).toBe(false)
  })

  it('bajar de versión tampoco lo dispara', () => {
    expect(isMajorUpgrade('3.0.0', '2.0.0')).toBe(false)
  })

  it('una versión guardada corrupta no revienta ni dispara el cartel', () => {
    // Puede venir de una version vieja o de `localStorage` manipulado.
    expect(isMajorUpgrade('', '2.0.0')).toBe(false)
    expect(isMajorUpgrade('vieja', '2.0.0')).toBe(true)
    expect(() => isMajorUpgrade('1.x.y', '2.0.0')).not.toThrow()
  })

  it('con la versión REAL de la app, quien viene de la 1.9 lo ve', () => {
    // Ata el test a la version que se publica: si alguien bajara la mayor por
    // error, esto lo cazaría.
    expect(isMajorUpgrade('1.9.12', APP_VERSION)).toBe(true)
  })
})
