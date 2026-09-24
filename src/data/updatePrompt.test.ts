import { describe, expect, it } from 'vitest'
import {
  EMPTY_SNOOZE, FORCE_AFTER_DAYS, MAX_SNOOZES, SNOOZE_DAYS,
  decideUpdatePrompt, snoozed,
} from './updatePrompt'
import type { UpdateStatus } from '@/lib/inAppUpdate'

const NOW = Date.UTC(2026, 9, 3)
const DAY = 86_400_000

const status = (over: Partial<UpdateStatus> = {}): UpdateStatus => ({
  available: true, versionCode: 1009008, stalenessDays: 1,
  flexibleAllowed: true, immediateAllowed: true, downloaded: false, ...over,
})

describe('cuando NO se pregunta', () => {
  it('si Play dice que no hay nada', () => {
    expect(decideUpdatePrompt(status({ available: false }), EMPTY_SNOOZE, NOW)).toEqual({ show: false })
  })

  /** Ni de fondo ni a pantalla completa: no hay forma de actualizar desde aqui. */
  it('si Play no permite ningun modo', () => {
    const s = status({ flexibleAllowed: false, immediateAllowed: false })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: false })
  })
})

describe('el ofrecimiento normal', () => {
  it('recien publicada: descarga de fondo', () => {
    expect(decideUpdatePrompt(status(), EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'flexible' })
  })

  /**
   * Ya esta en el telefono: volver a ofrecer "descargar" desperdiciaria los
   * datos que la persona ya gasto y la dejaria creyendo que no avanzo nada.
   */
  it('ya descargada: solo falta reiniciar', () => {
    const s = status({ downloaded: true })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'install' })
  })

  it('lo descargado se ofrece aunque se hubiera pospuesto muchas veces', () => {
    const s = status({ downloaded: true })
    const harto = { version: s.versionCode, lastAskedAt: NOW, times: 99 }
    expect(decideUpdatePrompt(s, harto, NOW)).toEqual({ show: true, mode: 'install' })
  })

  /** Sin descarga de fondo disponible, la pantalla completa es la unica via. */
  it('cae a pantalla completa si no hay modo de fondo', () => {
    const s = status({ flexibleAllowed: false })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'immediate' })
  })
})

describe('insistir lo justo', () => {
  it('tras un "ahora no" se calla unos dias', () => {
    const s = status()
    const tras = snoozed(s, EMPTY_SNOOZE, NOW)
    expect(decideUpdatePrompt(s, tras, NOW + DAY)).toEqual({ show: false })
  })

  it('y vuelve a ofrecerse pasado el plazo', () => {
    const s = status()
    const tras = snoozed(s, EMPTY_SNOOZE, NOW)
    const despues = NOW + SNOOZE_DAYS * DAY + 1
    expect(decideUpdatePrompt(s, tras, despues)).toEqual({ show: true, mode: 'flexible' })
  })

  /**
   * Quien dijo que no cuatro veces ya contesto. Seguir preguntando por LA MISMA
   * version solo enseña a cerrar el aviso sin leerlo, y entonces deja de servir
   * para el dia en que de verdad importa.
   */
  it('deja de insistir tras varios rechazos de la misma version', () => {
    const s = status()
    let estado = EMPTY_SNOOZE
    for (let i = 0; i < MAX_SNOOZES; i++) estado = snoozed(s, estado, NOW + i * SNOOZE_DAYS * DAY)
    const muchoDespues = NOW + 365 * DAY
    expect(decideUpdatePrompt(s, estado, muchoDespues)).toEqual({ show: false })
  })

  /** Una version NUEVA es una oferta nueva: el contador vuelve a cero. */
  it('una version nueva reinicia la cuenta de rechazos', () => {
    const vieja = status({ versionCode: 1009008 })
    let estado = EMPTY_SNOOZE
    for (let i = 0; i < MAX_SNOOZES; i++) estado = snoozed(vieja, estado, NOW)
    const nueva = status({ versionCode: 1009009 })
    expect(decideUpdatePrompt(nueva, estado, NOW)).toEqual({ show: true, mode: 'flexible' })
  })
})

describe('cuando la copia ya esta muy vieja', () => {
  /*
   * Dos semanas de retraso significa perderse arreglos que afectan al dinero
   * —en esta app, saldos que desaparecian—. Ahi el corte de pantalla se
   * justifica y el "ahora no" deja de contar.
   */
  it('pasa a pantalla completa', () => {
    const s = status({ stalenessDays: FORCE_AFTER_DAYS })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'immediate' })
  })

  it('e ignora los rechazos anteriores', () => {
    const s = status({ stalenessDays: 30 })
    const harto = { version: s.versionCode, lastAskedAt: NOW, times: 99 }
    expect(decideUpdatePrompt(s, harto, NOW)).toEqual({ show: true, mode: 'immediate' })
  })

  /** Un dia antes del umbral sigue siendo el modo respetuoso. */
  it('justo antes del umbral sigue siendo de fondo', () => {
    const s = status({ stalenessDays: FORCE_AFTER_DAYS - 1 })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'flexible' })
  })

  /** Si Play no permite el modo inmediato, no se puede forzar: se ofrece el otro. */
  it('no fuerza lo que Play no permite', () => {
    const s = status({ stalenessDays: 60, immediateAllowed: false })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'flexible' })
  })

  /** Play no siempre informa la antiguedad: ausente se trata como recien salida. */
  it('sin dato de antiguedad no se fuerza nada', () => {
    const s = status({ stalenessDays: undefined })
    expect(decideUpdatePrompt(s, EMPTY_SNOOZE, NOW)).toEqual({ show: true, mode: 'flexible' })
  })
})
