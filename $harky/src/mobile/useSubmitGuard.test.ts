import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSubmitGuard } from './useSubmitGuard'

describe('useSubmitGuard (evita duplicar dinero por doble toque)', () => {
  it('permite el primer beginSubmit y bloquea uno concurrente antes de endSubmit', () => {
    const { result } = renderHook(() => useSubmitGuard())

    let first = false
    let second = false
    act(() => {
      first = result.current.beginSubmit()
      second = result.current.beginSubmit() // simula el segundo tap antes de que se libere
    })

    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(result.current.submitting).toBe(true)
  })

  it('tras endSubmit, un nuevo beginSubmit vuelve a permitirse (reintento legítimo)', () => {
    const { result } = renderHook(() => useSubmitGuard())

    act(() => { result.current.beginSubmit() })
    act(() => { result.current.endSubmit() })

    expect(result.current.submitting).toBe(false)

    let third = false
    act(() => { third = result.current.beginSubmit() })
    expect(third).toBe(true)
  })

  it('simula el patrón real: dos taps rápidos sobre "guardar" solo ejecutan la mutación una vez', () => {
    const { result } = renderHook(() => useSubmitGuard())
    let mutations = 0

    const submit = () => {
      if (!result.current.beginSubmit()) return
      mutations += 1
      // la mutación real (addTx/transfer/contribute) iría aquí
    }

    act(() => {
      submit()
      submit() // doble tap
    })

    expect(mutations).toBe(1)
  })
})
