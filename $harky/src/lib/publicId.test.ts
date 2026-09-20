import { describe, expect, it } from 'vitest'
import { deriveNumericId } from './publicId'

describe('deriveNumericId (ID público de cuenta)', () => {
  it('siempre 9 dígitos y nunca empieza en 0', () => {
    const uuids = [
      'b7870606-2b3e-4a6e-9d8c-166d81dd9d89',
      '0d34522e-ae18-44a9-977e-cfdfa66df9aa',
      '30e53a72-6dda-41bf-a748-d9f71e2be879',
      '00000000-0000-0000-0000-000000000000',
      'ffffffff-ffff-ffff-ffff-ffffffffffff',
    ]
    for (const uuid of uuids) {
      const id = deriveNumericId(uuid)
      expect(id).toMatch(/^[1-9]\d{8}$/)
    }
  })

  it('es determinista: mismo UUID → mismo ID siempre', () => {
    const uuid = 'b7870606-2b3e-4a6e-9d8c-166d81dd9d89'
    expect(deriveNumericId(uuid)).toBe(deriveNumericId(uuid))
  })

  it('UUIDs distintos → IDs distintos (sin colisiones en lote)', () => {
    // 500 UUIDs sintéticos distintos: ninguna colisión esperable a esta escala
    const ids = new Set<string>()
    for (let i = 0; i < 500; i++) {
      ids.add(deriveNumericId(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`))
    }
    expect(ids.size).toBe(500)
  })

  it('sensible a cambios mínimos del UUID', () => {
    const a = deriveNumericId('b7870606-2b3e-4a6e-9d8c-166d81dd9d89')
    const b = deriveNumericId('b7870606-2b3e-4a6e-9d8c-166d81dd9d8a')
    expect(a).not.toBe(b)
  })
})
