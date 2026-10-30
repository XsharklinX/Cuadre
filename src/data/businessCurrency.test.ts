import { describe, expect, it } from 'vitest'
import { alsoIn, toView, viewOptions } from './businessCurrency'

describe('toView', () => {
  it('la misma divisa no se toca', () => {
    // Ni se convierte ni se redondea: un monto que ya está en su divisa tiene
    // que salir idéntico, o los totales dejan de cuadrar por los céntimos.
    expect(toView(1_234.567, 'DOP', 'DOP')).toBe(1_234.567)
  })

  it('convierte y redondea a céntimos', () => {
    const r = toView(100, 'USD', 'DOP')
    expect(r).toBeGreaterThan(100)
    expect(Math.round(r * 100) / 100).toBe(r)
  })

  it('ida y vuelta vuelve a lo mismo, con el redondeo de los céntimos', () => {
    const ida = toView(14.99, 'USD', 'DOP')
    expect(toView(ida, 'DOP', 'USD')).toBeCloseTo(14.99, 1)
  })
})

describe('viewOptions · solo las que están en juego', () => {
  it('siempre la base primero', () => {
    expect(viewOptions('DOP', [])).toEqual(['DOP'])
  })

  it('añade las de los servicios y los clientes', () => {
    expect(viewOptions('DOP', ['USD', 'USD', undefined, 'EUR'])).toEqual(['DOP', 'USD', 'EUR'])
  })

  it('no repite la base', () => {
    expect(viewOptions('DOP', ['DOP', 'USD'])).toEqual(['DOP', 'USD'])
  })

  it('NO ofrece las treinta del conversor', () => {
    // Un selector con treinta opciones para elegir entre dos es peor que no
    // tener selector.
    expect(viewOptions('DOP', ['USD']).length).toBe(2)
  })
})

describe('alsoIn · el equivalente de la línea pequeña', () => {
  it('da la otra divisa', () => {
    const r = alsoIn(1_000, 'DOP', ['DOP', 'USD'])
    expect(r?.currency).toBe('USD')
    expect(r!.amount).toBeLessThan(1_000)
  })

  it('CON UNA SOLA divisa no dice nada', () => {
    // Repetir el mismo número en la línea pequeña no informa de nada.
    expect(alsoIn(1_000, 'DOP', ['DOP'])).toBeNull()
  })

  it('mirando en dólares, el equivalente es en pesos', () => {
    const r = alsoIn(100, 'USD', ['DOP', 'USD'])
    expect(r?.currency).toBe('DOP')
    expect(r!.amount).toBeGreaterThan(100)
  })
})
