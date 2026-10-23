import { describe, expect, it } from 'vitest'
import { matchBrand } from './brandMatch'

describe('matchBrand · reconocer la marca por su nombre', () => {
  it('reconoce el nombre tal cual', () => {
    expect(matchBrand('Netflix')?.id).toBe('netflix')
    expect(matchBrand('Spotify')?.id).toBe('spotify')
  })

  it('da igual cómo lo escriba la gente', () => {
    // «netflix», «Netflix 4K», «NETFLIX cuenta 2»: comparar exacto no
    // reconocería ninguno.
    expect(matchBrand('netflix')?.id).toBe('netflix')
    expect(matchBrand('Netflix 4K')?.id).toBe('netflix')
    expect(matchBrand('NETFLIX cuenta 2')?.id).toBe('netflix')
    expect(matchBrand('  Netflix  ')?.id).toBe('netflix')
  })

  it('ignora tildes', () => {
    expect(matchBrand('Crúnchyroll')?.id).toBe('crunchyroll')
  })

  it('LA MÁS LARGA GANA', () => {
    // Si no, «YouTube Premium» se reconocería como YouTube a secas.
    expect(matchBrand('YouTube Premium')?.id).toBe('youtube')
    expect(matchBrand('Apple Music')?.id).toBe('applemusic')
  })

  it('lo que no es una marca se queda sin logo, y está bien', () => {
    // La mayoría de los servicios de un negocio pequeño no son marcas de
    // catálogo, y un logo inventado sería peor que su inicial.
    expect(matchBrand('Local de la esquina')).toBeNull()
    expect(matchBrand('Alquiler apto 3B')).toBeNull()
    expect(matchBrand('Clases de inglés')).toBeNull()
  })

  it('un nombre de dos letras no reconoce nada', () => {
    expect(matchBrand('TV')).toBeNull()
    expect(matchBrand('')).toBeNull()
  })

  it('NO reconoce marcas de tres letras dentro de otra palabra', () => {
    // «hbo» dentro de cualquier palabra daría un falso positivo, y un logo
    // equivocado es peor que ninguno porque afirma algo que no es.
    expect(matchBrand('Trabajos')).toBeNull()
    expect(matchBrand('Hobbies')).toBeNull()
  })

  it('la marca que devuelve trae su color y su logo', () => {
    const m = matchBrand('Netflix')!
    expect(m.color).toMatch(/^#/)
    expect(m.logoSlug).toBe('netflix')
  })
})
