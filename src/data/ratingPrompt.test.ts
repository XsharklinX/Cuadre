import { describe, expect, it } from 'vitest'
import {
  EMPTY_RATING_STATE, playStoreUrls, ratingVerdict, recordLaunch,
  recordRated, recordSnooze, shouldAskForRating, type RatingState,
} from './ratingPrompt'

const DAY = 86_400_000
const NOW = new Date(2026, 8, 20).getTime()

/** Un usuario que ya cumple las tres condiciones de entrada. */
const veteran = (over: Partial<RatingState> = {}): RatingState => ({
  ...EMPTY_RATING_STATE,
  firstSeenAt: NOW - 30 * DAY,
  launches: 25,
  ...over,
})

const ask = (state: RatingState, transactionCount = 50) =>
  ratingVerdict({ state, transactionCount, now: NOW })

describe('nunca preguntar demasiado pronto', () => {
  it('no pregunta en una instalación nueva', () => {
    // El error clásico: interrumpir al tercer uso y cobrar estrellas bajas de
    // gente que todavía no conoce la app.
    expect(ask(EMPTY_RATING_STATE, 0)).toBe('too-new')
  })

  it('no pregunta antes de una semana de uso', () => {
    expect(ask(veteran({ firstSeenAt: NOW - 3 * DAY }))).toBe('too-new')
  })

  it('no pregunta a quien abrió poco, aunque lleve meses instalada', () => {
    expect(ask(veteran({ launches: 4 }))).toBe('too-few-launches')
  })

  it('no pregunta a quien no ha registrado movimientos', () => {
    // Ocho arranques en una tarde sin registrar nada es curiosidad, no una
    // opinión sobre la app.
    expect(ask(veteran(), 2)).toBe('too-few-transactions')
  })

  it('las tres condiciones son Y, no O', () => {
    expect(ask(veteran({ firstSeenAt: NOW - 2 * DAY, launches: 99 }), 999)).toBe('too-new')
    expect(ask(veteran({ launches: 1 }), 999)).toBe('too-few-launches')
  })
})

describe('cuando sí toca', () => {
  it('pregunta a un usuario asentado', () => {
    expect(ask(veteran())).toBe('ask')
    expect(shouldAskForRating({ state: veteran(), transactionCount: 50, now: NOW })).toBe(true)
  })

  it('justo en el umbral ya pregunta', () => {
    const state = veteran({ firstSeenAt: NOW - 7 * DAY, launches: 8 })
    expect(ratingVerdict({ state, transactionCount: 15, now: NOW })).toBe('ask')
  })
})

describe('respetar la respuesta del usuario', () => {
  it('quien ya valoró no vuelve a ver el diálogo jamás', () => {
    expect(ask(recordRated(veteran()))).toBe('already-rated')
  })

  it('tras "ahora no" espera de verdad antes de volver', () => {
    // Volver a preguntar a los pocos días convierte una duda en un rechazo.
    const snoozed = recordSnooze(veteran(), NOW - 10 * DAY)
    expect(ratingVerdict({ state: snoozed, transactionCount: 50, now: NOW })).toBe('snoozed')
  })

  it('pasada la espera vuelve a preguntar', () => {
    const snoozed = recordSnooze(veteran(), NOW - 60 * DAY)
    expect(ratingVerdict({ state: snoozed, transactionCount: 50, now: NOW })).toBe('ask')
  })

  it('después de tres rechazos no insiste más', () => {
    let state = veteran()
    for (let i = 0; i < 3; i++) state = recordSnooze(state, NOW - (200 - i * 60) * DAY)
    expect(ratingVerdict({ state, transactionCount: 50, now: NOW })).toBe('asked-enough')
  })

  it('haber valorado gana sobre cualquier otra condición', () => {
    const rated = recordRated(recordSnooze(veteran(), NOW))
    expect(ratingVerdict({ state: rated, transactionCount: 0, now: NOW })).toBe('already-rated')
  })
})

describe('conteo de arranques', () => {
  it('el primer arranque fija la fecha de instalación', () => {
    const after = recordLaunch(EMPTY_RATING_STATE, NOW)
    expect(after.firstSeenAt).toBe(NOW)
    expect(after.launches).toBe(1)
  })

  it('los siguientes no mueven la fecha de instalación', () => {
    const first = recordLaunch(EMPTY_RATING_STATE, NOW - 10 * DAY)
    const second = recordLaunch(first, NOW)
    expect(second.firstSeenAt).toBe(NOW - 10 * DAY)
    expect(second.launches).toBe(2)
  })
})

describe('enlaces a Play Store', () => {
  it('el enlace de app abre Play directamente en las valoraciones', () => {
    const { app } = playStoreUrls('com.sharky.miapp')
    expect(app).toBe('market://details?id=com.sharky.miapp&showAllReviews=true')
  })

  it('hay respaldo web para dispositivos sin Play', () => {
    const { web } = playStoreUrls('com.sharky.miapp')
    expect(web).toContain('https://play.google.com/store/apps/details?id=com.sharky.miapp')
  })
})
