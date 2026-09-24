import { afterEach, describe, expect, it } from 'vitest'
import { MONEY_MASK, fmt, isPrivacyMasked, setPrivacyMasked } from './helpers'

afterEach(() => setPrivacyMasked(false))

describe('modo privado', () => {
  it('apagado, el dinero se ve', () => {
    expect(fmt(12_345.67, 'DOP')).toContain('12,345.67')
  })

  /*
   * EL FALLO QUE HABIA: el enmascarado vivia en el hook `useFmt`, y CATORCE
   * archivos llaman a `fmt()` directamente. En Movimientos —entre otros— los
   * montos seguian a la vista con el modo privado encendido.
   */
  it('encendido, tapa venga de donde venga la llamada', () => {
    setPrivacyMasked(true)
    expect(fmt(12_345.67, 'DOP')).toBe(MONEY_MASK)
    expect(fmt(-500, 'USD')).toBe(MONEY_MASK)
    expect(fmt(0, 'DOP')).toBe(MONEY_MASK)
  })

  /** Ni el signo se escapa: un "−" delator seguiria diciendo que estas en rojo. */
  it('la mascara no delata el signo ni la magnitud', () => {
    setPrivacyMasked(true)
    expect(fmt(-9_999_999, 'DOP')).toBe(fmt(1, 'DOP'))
  })

  /*
   * El modo privado protege LA PANTALLA, no los datos. Un respaldo o un Excel
   * con los montos como bolitas no le sirve a nadie.
   */
  it('las exportaciones piden no enmascarar y se respeta', () => {
    setPrivacyMasked(true)
    expect(fmt(2_500, 'DOP', { neverMask: true })).toContain('2,500')
  })

  it('el interruptor es consultable', () => {
    setPrivacyMasked(true)
    expect(isPrivacyMasked()).toBe(true)
    setPrivacyMasked(false)
    expect(isPrivacyMasked()).toBe(false)
  })
})
