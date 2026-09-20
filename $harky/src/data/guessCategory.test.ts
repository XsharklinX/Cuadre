import { beforeEach, describe, expect, it } from 'vitest'
import { guessCategoryId } from './bankCsv'
import type { Category } from '@/types'

const cat = (id: string, name: string, icon: string, type: 'income' | 'expense' = 'expense'): Category =>
  ({ id, name, icon: icon as Category['icon'], type, color: '#888', budget: 0 })

// Con el seed intacto (IDs cat_*).
const seed: Category[] = [
  cat('cat_super', 'Supermercado', 'cart'),
  cat('cat_trans', 'Transporte', 'car'),
  cat('cat_serv', 'Servicios', 'bolt'),
  cat('cat_rest', 'Restaurantes', 'food'),
  cat('cat_salario', 'Salario', 'wallet', 'income'),
]

// Usuario que recreó sus categorías con OTROS IDs pero los mismos iconos.
const custom: Category[] = [
  cat('c_a', 'Mercado', 'cart'),
  cat('c_b', 'Movilidad', 'car'),
  cat('c_c', 'Recargas', 'bolt'),
  cat('c_d', 'Comida', 'food'),
]

beforeEach(() => localStorage.clear())

describe('guessCategoryId: diccionario de comercios dominicano', () => {
  it('CLARO/recargas → Servicios', () => {
    expect(guessCategoryId('CLARO RECAR 8494016889 SANTO DOMINGO', seed, 'expense', false)).toBe('cat_serv')
  })
  it('PriceSmart / Jumbo → Supermercado', () => {
    expect(guessCategoryId('PRICESMART ARROYO HONDO', seed, 'expense', false)).toBe('cat_super')
    expect(guessCategoryId('JUMBO LUPERON', seed, 'expense', false)).toBe('cat_super')
  })
  it('Uber / gasolina → Transporte', () => {
    expect(guessCategoryId('UBER TRIP', seed, 'expense', false)).toBe('cat_trans')
    expect(guessCategoryId('GASOLINA TEXACO', seed, 'expense', false)).toBe('cat_trans')
  })
  it('nómina → Salario (ingreso)', () => {
    expect(guessCategoryId('PAGO DE NOMINA', seed, 'income', false)).toBe('cat_salario')
  })
})

describe('resiliencia: funciona con categorías propias (por icono, no por ID)', () => {
  it('CLARO → la categoría del usuario con icono "bolt", aunque su ID no sea cat_serv', () => {
    expect(guessCategoryId('CLARO RECAR SANTO DOMINGO', custom, 'expense', false)).toBe('c_c')
  })
  it('Uber → la categoría "Movilidad" (icono car) del usuario', () => {
    expect(guessCategoryId('UBER EATS', custom, 'expense', false)).toBe('c_d') // uber eats = restaurante (food)
    expect(guessCategoryId('UBER TRIP CENTRO', custom, 'expense', false)).toBe('c_b')
  })
  it('si el usuario no tiene una categoría equivalente y no hay fallback → undefined', () => {
    const onlyFood = [cat('x', 'Comida', 'food')]
    expect(guessCategoryId('UBER TRIP', onlyFood, 'expense', false)).toBeUndefined()
  })
})

describe('CLARO / recargas → categoría "Recargas" del usuario, fallback Servicios', () => {
  // Usuario con una categoría propia "Recargas" (como en la app real).
  const conRecargas: Category[] = [
    cat('r', 'Recargas', 'phone'),
    cat('s', 'Servicios', 'bolt'),
  ]
  it('CLARO RECAR va a "Recargas" cuando el usuario la tiene', () => {
    expect(guessCategoryId('CLARO RECAR 8494016889 SANTO DOMINGO', conRecargas, 'expense', false)).toBe('r')
  })
  it('una recarga genérica también', () => {
    expect(guessCategoryId('RECARGA ALTICE', conRecargas, 'expense', false)).toBe('r')
  })
  it('sin categoría "Recargas", CLARO RECAR cae a Servicios', () => {
    expect(guessCategoryId('CLARO RECAR SANTO DOMINGO', seed, 'expense', false)).toBe('cat_serv')
  })
  it('un consumo de CLARO que NO es recarga (internet) va a Servicios', () => {
    expect(guessCategoryId('CLARO INTERNET HOGAR', conRecargas, 'expense', false)).toBe('s')
  })
})

describe('prioridad de reglas aprendidas', () => {
  it('una regla aprendida (ID real del usuario) manda sobre el diccionario', () => {
    localStorage.setItem('sharky-bank-rules-v1', JSON.stringify({ 'claro recar santo domingo': 'c_a' }))
    // El diccionario diría bolt→c_c, pero lo aprendido apunta a c_a.
    expect(guessCategoryId('CLARO RECAR SANTO DOMINGO', custom, 'expense', false)).toBe('c_a')
  })
})
