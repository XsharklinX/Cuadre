import { describe, expect, it } from 'vitest'
import {
  driftKey, hasDrift, isDriftDismissed, pendingDrifts, pruneDismissed,
  type DriftFingerprint,
} from './healthDismissals'

const d = (over: Partial<DriftFingerprint> = {}): DriftFingerprint => ({
  accountId: 'acc_1', primary: 0, secondary: 0, ...over,
})

describe('omitir un descuadre', () => {
  it('omitido, deja de salir', () => {
    const uno = d({ primary: 250 })
    expect(pendingDrifts([driftKey(uno)], [uno])).toEqual([])
  })

  it('sin omitir, sale', () => {
    const uno = d({ primary: 250 })
    expect(pendingDrifts([], [uno])).toEqual([uno])
  })

  /*
   * LA REGLA QUE HACE QUE ESTO SEA SEGURO: se omite ESE descuadre, no esa
   * cuenta. Si la diferencia cambia —porque aparecio un problema nuevo—
   * vuelve a avisar. Silenciar la cuenta entera seria una forma de perderse
   * dinero sin enterarse.
   */
  it('si la diferencia CAMBIA, vuelve a avisar', () => {
    const revisado = d({ primary: 250 })
    const nuevo = d({ primary: 900 })
    expect(pendingDrifts([driftKey(revisado)], [nuevo])).toEqual([nuevo])
  })

  it('omitir una cuenta no silencia a otra', () => {
    const a = d({ accountId: 'acc_1', primary: 250 })
    const b = d({ accountId: 'acc_2', primary: 250 })
    expect(pendingDrifts([driftKey(a)], [a, b])).toEqual([b])
  })

  /** El segundo libro de una tarjeta cuenta en la huella. */
  it('un cambio solo en la divisa extranjera tambien reabre el aviso', () => {
    const antes = d({ primary: 250, secondary: 0 })
    const ahora = d({ primary: 250, secondary: -39.80 })
    expect(isDriftDismissed([driftKey(antes)], ahora)).toBe(false)
  })

  /*
   * Los importes se redondean a centimos: sin eso, un recalculo que mueva la
   * diferencia una milesima generaria una huella nueva y el aviso reapareceria
   * solo, pareciendo un fallo.
   */
  it('una milesima no reabre el aviso', () => {
    const antes = d({ primary: 250.001 })
    const ahora = d({ primary: 250.004 })
    expect(isDriftDismissed([driftKey(antes)], ahora)).toBe(true)
  })

  it('un centimo de diferencia SI lo reabre', () => {
    const antes = d({ primary: 250.00 })
    const ahora = d({ primary: 250.01 })
    expect(isDriftDismissed([driftKey(antes)], ahora)).toBe(false)
  })
})

describe('limpieza de huellas', () => {
  /*
   * Sin limpiar, la lista crece sin fin y una huella vieja podria volver a
   * coincidir por casualidad con un descuadre futuro del mismo importe — que
   * es justo el que no queremos silenciar.
   */
  it('quita las huellas de descuadres que ya no existen', () => {
    const vivo = d({ primary: 250 })
    const viejo = d({ accountId: 'acc_9', primary: 12 })
    const r = pruneDismissed([driftKey(vivo), driftKey(viejo)], [vivo])
    expect(r).toEqual([driftKey(vivo)])
  })

  it('sin descuadres vivos, no queda ninguna', () => {
    expect(pruneDismissed([driftKey(d({ primary: 1 }))], [])).toEqual([])
  })
})

describe('el umbral', () => {
  it('por debajo del centimo no hay descuadre', () => {
    expect(hasDrift(d({ primary: 0.004 }))).toBe(false)
    expect(hasDrift(d())).toBe(false)
  })

  it('un centimo si cuenta, en cualquiera de los dos libros', () => {
    expect(hasDrift(d({ primary: 0.01 }))).toBe(true)
    expect(hasDrift(d({ secondary: -0.01 }))).toBe(true)
  })
})
