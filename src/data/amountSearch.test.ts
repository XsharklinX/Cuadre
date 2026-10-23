import { describe, expect, it } from 'vitest'
import { amountDistance, matchesNearAmount, parseNearAmount } from './amountSearch'

describe('parseNearAmount', () => {
  it('una cifra pelada se lee como monto', () => {
    const r = parseNearAmount('2450')!
    expect(r.value).toBe(2450)
    expect(r.min).toBe(2401)
    expect(r.max).toBe(2499)
  })

  it('acepta el símbolo de moneda y los espacios', () => {
    expect(parseNearAmount('$ 2450')!.value).toBe(2450)
    expect(parseNearAmount('  2450  ')!.value).toBe(2450)
  })

  describe('las dos convenciones de miles que conviven en RD', () => {
    it('coma de miles y punto decimal', () => {
      expect(parseNearAmount('1,234.50')!.value).toBe(1234.5)
    })
    it('punto de miles y coma decimal', () => {
      expect(parseNearAmount('1.234,50')!.value).toBe(1234.5)
    })
    it('coma sola de miles', () => {
      expect(parseNearAmount('2,450')!.value).toBe(2450)
    })
    it('punto solo de miles', () => {
      expect(parseNearAmount('2.450')!.value).toBe(2450)
    })
    it('coma sola decimal', () => {
      expect(parseNearAmount('2,45')!.value).toBe(2.45)
    })
    it('punto solo decimal', () => {
      expect(parseNearAmount('2.45')!.value).toBe(2.45)
    })
  })

  it('un texto con un número dentro NO es una búsqueda por monto', () => {
    // «super 2450» es una búsqueda de texto; convertirla en rango ignoraría
    // la mitad de lo que el usuario escribió.
    expect(parseNearAmount('super 2450')).toBeNull()
    expect(parseNearAmount('2450 super')).toBeNull()
    expect(parseNearAmount('mas de 1000')).toBeNull()
  })

  it('no hay monto donde no hay cifra', () => {
    expect(parseNearAmount('')).toBeNull()
    expect(parseNearAmount('   ')).toBeNull()
    expect(parseNearAmount('super')).toBeNull()
    expect(parseNearAmount('$')).toBeNull()
  })

  it('el cero no acota nada, así que no es una búsqueda', () => {
    expect(parseNearAmount('0')).toBeNull()
    expect(parseNearAmount('0.00')).toBeNull()
  })

  it('en cifras pequeñas el margen nunca se queda en nada', () => {
    // El 2 % de 20 son 40 centavos: sin suelo, el rango sería inútil.
    const r = parseNearAmount('20')!
    expect(r.min).toBe(19)
    expect(r.max).toBe(21)
  })

  it('el margen nunca baja de cero', () => {
    expect(parseNearAmount('1')!.min).toBe(0)
  })

  it('el margen acompaña a la magnitud', () => {
    const chico = parseNearAmount('100')!
    const grande = parseNearAmount('100000')!
    expect(grande.max - grande.value).toBeGreaterThan(chico.max - chico.value)
  })
})

describe('matchesNearAmount', () => {
  const near = parseNearAmount('2450')!   // 2401 … 2499

  it('encuentra lo que la búsqueda de texto no encontraba', () => {
    // Éste es el caso entero: «2448» y «2450» no se parecen como texto.
    expect(matchesNearAmount(2448, near)).toBe(true)
    expect(matchesNearAmount(2460, near)).toBe(true)
  })

  it('la cifra exacta entra, claro', () => {
    expect(matchesNearAmount(2450, near)).toBe(true)
  })

  it('los extremos del margen entran', () => {
    expect(matchesNearAmount(2401, near)).toBe(true)
    expect(matchesNearAmount(2499, near)).toBe(true)
  })

  it('fuera del margen, fuera', () => {
    expect(matchesNearAmount(2400, near)).toBe(false)
    expect(matchesNearAmount(2500, near)).toBe(false)
  })

  it('no arrastra lo que la subcadena sí arrastraba', () => {
    // «2450» como texto casaba con 12,450 y con 24,500. Como monto, no.
    expect(matchesNearAmount(12_450, near)).toBe(false)
    expect(matchesNearAmount(24_500, near)).toBe(false)
    expect(matchesNearAmount(245, near)).toBe(false)
  })
})

describe('amountDistance', () => {
  const near = parseNearAmount('2500')!

  it('ordena por cercanía a lo tecleado', () => {
    const montos = [2550, 2498, 2520]
    const ordenados = [...montos].sort((a, b) => amountDistance(a, near) - amountDistance(b, near))
    expect(ordenados).toEqual([2498, 2520, 2550])
  })

  it('la distancia no tiene signo: da igual por arriba o por abajo', () => {
    expect(amountDistance(2450, near)).toBe(amountDistance(2550, near))
  })
})
