import { describe, expect, it } from 'vitest'
import { BANKS, findBank, guessBank, searchBanks } from './banks'
import { findBankProfile, hasFeeProfile } from './bankFees'

describe('catálogo', () => {
  it('cubre los bancos múltiples de RD', () => {
    for (const id of ['banreservas', 'popular', 'bhd', 'scotiabank-do', 'santa-cruz', 'banco-caribe', 'promerica']) {
      expect(findBank(id), id).not.toBeNull()
    }
  })

  it('incluye asociaciones de ahorros y préstamos', () => {
    for (const id of ['apap', 'cibao', 'la-nacional', 'alaver']) {
      expect(findBank(id), id).not.toBeNull()
    }
  })

  it('incluye internacionales frecuentes', () => {
    for (const id of ['bofa', 'chase', 'wise', 'paypal']) {
      expect(findBank(id), id).not.toBeNull()
    }
  })

  it('ningún id se repite', () => {
    const ids = BANKS.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('todos tienen nombre y país', () => {
    for (const bank of BANKS) {
      expect(bank.name.trim().length, bank.id).toBeGreaterThan(0)
      expect(['do', 'intl']).toContain(bank.country)
    }
  })
})

describe('buscador', () => {
  it('sin consulta devuelve todo', () => {
    expect(searchBanks('')).toHaveLength(BANKS.length)
    expect(searchBanks('   ')).toHaveLength(BANKS.length)
  })

  it('encuentra por nombre', () => {
    expect(searchBanks('reservas').map(b => b.id)).toContain('banreservas')
  })

  it('ignora acentos en los dos sentidos', () => {
    // "Promérica" tiene que encontrarse escribiendo "promerica".
    expect(searchBanks('promerica').map(b => b.id)).toContain('promerica')
    expect(searchBanks('Promérica').map(b => b.id)).toContain('promerica')
  })

  it('encuentra por alias y siglas', () => {
    expect(searchBanks('bpd').map(b => b.id)).toContain('popular')
    expect(searchBanks('asociacion popular').map(b => b.id)).toContain('apap')
    expect(searchBanks('transferwise').map(b => b.id)).toContain('wise')
  })

  it('devuelve vacío cuando no hay coincidencia', () => {
    expect(searchBanks('zzzzzz')).toHaveLength(0)
  })
})

describe('adivinar el banco por el nombre de la cuenta', () => {
  it('reconoce el banco', () => {
    expect(guessBank('Visa Banreservas')?.id).toBe('banreservas')
    expect(guessBank('Tarjeta APAP')?.id).toBe('apap')
  })

  it('el término más largo gana', () => {
    // "banco caribe" debe ganarle a "caribe".
    expect(guessBank('Banco Caribe Visa')?.id).toBe('banco-caribe')
  })

  it('no adivina con términos demasiado cortos', () => {
    // "br" dentro de cualquier palabra generaría falsos positivos.
    expect(guessBank('Cuenta de Abril')).toBeNull()
  })

  it('no adivina cuando no hay señal', () => {
    // Sugerir el banco equivocado haría que el usuario acepte comisiones
    // que no son las suyas.
    expect(guessBank('Mi tarjeta')).toBeNull()
    expect(guessBank('')).toBeNull()
  })
})

/**
 * El catálogo identifica ~60 entidades; las tarifas solo existen para las
 * pocas cuyo tarifario conocemos. Inventar un recargo para las demás haría
 * que la app cobre montos que el banco real no cobra.
 */
describe('identidad y tarifas son cosas distintas', () => {
  it('los bancos con tarifario están en el catálogo', () => {
    for (const id of ['banreservas', 'popular', 'bhd', 'scotiabank-do', 'apap', 'banco-caribe', 'promerica', 'santa-cruz']) {
      expect(findBank(id), `${id} falta en el catalogo`).not.toBeNull()
      expect(hasFeeProfile(id), `${id} sin tarifario`).toBe(true)
    }
  })

  it('la mayoría del catálogo NO tiene tarifario, y eso es correcto', () => {
    const withFees = BANKS.filter(b => hasFeeProfile(b.id))
    expect(withFees.length).toBeLessThan(BANKS.length / 2)
  })

  it('un banco sin tarifario no genera reglas fantasma', () => {
    expect(findBankProfile('wise')).toBeNull()
    expect(hasFeeProfile('wise')).toBe(false)
  })
})
