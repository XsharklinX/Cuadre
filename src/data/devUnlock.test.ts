import { describe, expect, it } from 'vitest'
import {
  HINT_FROM_REMAINING, TAPS_TO_UNLOCK, TAP_WINDOW_MS,
  initialTapState, registerTap, type TapState,
} from './devUnlock'

/** Encadena `n` toques separados por `gap` ms y devuelve el último resultado. */
function tapTimes(n: number, gap = 200, start = 1_000) {
  let state: TapState = initialTapState
  let result = registerTap(state, start)
  state = result.state
  for (let i = 1; i < n; i++) {
    result = registerTap(state, start + gap * i)
    state = result.state
  }
  return result
}

describe('gesto secreto del modo desarrollador', () => {
  it(`se abre justo al toque ${TAPS_TO_UNLOCK}`, () => {
    expect(tapTimes(TAPS_TO_UNLOCK - 1).unlocked).toBe(false)
    expect(tapTimes(TAPS_TO_UNLOCK).unlocked).toBe(true)
  })

  it('los primeros toques no dicen NADA', () => {
    for (let n = 1; n <= TAPS_TO_UNLOCK - HINT_FROM_REMAINING - 1; n++) {
      expect(tapTimes(n).remaining, `toque ${n}`).toBeNull()
    }
  })

  it('avisa solo en la recta final', () => {
    // Toque 4 de 6 -> faltan 2; toque 3 -> faltan 3 (el primero que avisa).
    expect(tapTimes(TAPS_TO_UNLOCK - HINT_FROM_REMAINING).remaining).toBe(HINT_FROM_REMAINING)
    expect(tapTimes(TAPS_TO_UNLOCK - 1).remaining).toBe(1)
  })

  /**
   * Sin ventana de tiempo, tres toques hoy y tres mañana abririan el modo sin
   * que nadie lo pidiera.
   */
  it('una pausa larga reinicia la racha', () => {
    let state = initialTapState
    for (let i = 0; i < TAPS_TO_UNLOCK - 1; i++) {
      state = registerTap(state, 1_000 + i * 200).state
    }
    const late = registerTap(state, 1_000 + TAP_WINDOW_MS + 5_000)
    expect(late.unlocked).toBe(false)
    // Y ese toque tardio cuenta como el PRIMERO de la serie nueva, no se tira.
    expect(late.state.count).toBe(1)
  })

  it('justo en el limite de la ventana todavia cuenta', () => {
    const first = registerTap(initialTapState, 1_000)
    const second = registerTap(first.state, 1_000 + TAP_WINDOW_MS)
    expect(second.state.count).toBe(2)
  })

  it('con el modo ya abierto, tocar no hace nada', () => {
    const r = registerTap({ count: 5, lastAt: 1_000 }, 1_100, true)
    expect(r.unlocked).toBe(false)
    expect(r.remaining).toBeNull()
    expect(r.state).toEqual(initialTapState)
  })

  it('tras abrirlo, el contador queda limpio', () => {
    expect(tapTimes(TAPS_TO_UNLOCK).state).toEqual(initialTapState)
  })
})
