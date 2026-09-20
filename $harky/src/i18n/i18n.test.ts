import { describe, expect, it } from 'vitest'
import { I18N_DICTS } from './index'

/**
 * Auditoría i18n sobre los diccionarios REALES (no regex sobre el archivo).
 * TypeScript ya fuerza que `es` tenga las mismas claves que `en`; lo que no
 * puede validar es el contenido: placeholders desparejos, textos vacíos o
 * caracteres corruptos. Eso se audita aquí y queda como regresión.
 */

const { en, es } = I18N_DICTS

function placeholders(value: string): string[] {
  return (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort()
}

describe('auditoría i18n (EN ↔ ES)', () => {
  it('ambos diccionarios tienen exactamente las mismas claves', () => {
    const enKeys = Object.keys(en).sort()
    const esKeys = Object.keys(es).sort()
    expect(esKeys).toEqual(enKeys)
  })

  it('ningún texto está vacío o es solo espacios', () => {
    const empties: string[] = []
    for (const [key, value] of Object.entries(en)) if (!String(value).trim()) empties.push(`en.${key}`)
    for (const [key, value] of Object.entries(es)) if (!String(value).trim()) empties.push(`es.${key}`)
    expect(empties).toEqual([])
  })

  it('los placeholders {así} coinciden entre EN y ES en cada clave', () => {
    const mismatches: string[] = []
    for (const key of Object.keys(en) as Array<keyof typeof en>) {
      const a = placeholders(String(en[key]))
      const b = placeholders(String(es[key]))
      if (a.join(',') !== b.join(',')) {
        mismatches.push(`${String(key)}: en=[${a.join(' ')}] es=[${b.join(' ')}]`)
      }
    }
    expect(mismatches).toEqual([])
  })

  it('sin mojibake ni caracteres de reemplazo en ningún texto', () => {
    const bad: string[] = []
    const badRe = /Ã.|Â.|�/
    for (const [lang, dict] of Object.entries(I18N_DICTS)) {
      for (const [key, value] of Object.entries(dict)) {
        if (badRe.test(String(value))) bad.push(`${lang}.${key}: "${value}"`)
      }
    }
    expect(bad).toEqual([])
  })
})
