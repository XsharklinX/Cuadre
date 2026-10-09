import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE REGRESIÓN: el diccionario de idiomas.
 *
 * Vigila dos cosas que se rompen en silencio y de formas distintas.
 *
 * ────────────────────────────────────────────────────────────────────
 * 1. CLAVES DUPLICADAS
 *
 * Los diccionarios llevan varias claves por línea (`save: '…', cancel: '…'`),
 * así que una clave ya existente no salta a la vista al añadir otra al final
 * del archivo. Pasó con `openLabel`: ya estaba a mitad de una línea larga y se
 * volvió a declarar 700 líneas más abajo.
 *
 * TypeScript sí lo detecta, pero solo al compilar el proyecto entero, y el
 * mensaje —«An object literal cannot have multiple properties with the same
 * name»— no dice cuál es la clave. Este test la nombra.
 *
 * Y lo importante: en JavaScript gana la ÚLTIMA. Si las dos declaraciones
 * tuvieran textos distintos, la traducción cambiaría en toda la app sin que
 * nadie tocara el sitio donde se usa.
 *
 * ────────────────────────────────────────────────────────────────────
 * 2. IDIOMAS DESALINEADOS
 *
 * Una clave que está en español y no en inglés no rompe nada: `useT` cae al
 * diccionario español y el usuario inglés ve esa frase suelta en castellano,
 * en medio de una pantalla por lo demás traducida. Es exactamente el fallo que
 * no se nota escribiéndolo y sí se nota usándolo.
 */

const I18N = join(__dirname, '..', 'i18n')

/**
 * Las claves de un diccionario, incluidas las que comparten línea.
 *
 * Se exige que el valor abra con comilla para no confundir con propiedades
 * anidadas ni con claves de otros objetos del archivo.
 *
 * LAS TRES COMILLAS IMPORTAN. La primera versión solo aceptaba `'` y dio por
 * ausentes 58 claves inglesas que sí existían: en inglés los textos con
 * apóstrofo —«What's new», «you're»— se escriben con comillas dobles. Un
 * guardia que acusa de lo que no es se acaba ignorando igual que uno que
 * calla.
 */
function clavesDe(archivo: string): string[] {
  const src = readFileSync(join(I18N, archivo), 'utf8')
  return [...src.matchAll(/(?:^|[,{]\s*)([a-zA-Z_]\w*)\s*:\s*['"`]/gm)].map(m => m[1])
}

const IDIOMAS = ['es.ts', 'en.ts']

describe('diccionarios de idioma', () => {
  it.each(IDIOMAS)('%s no declara ninguna clave dos veces', archivo => {
    const vistas = new Set<string>()
    const duplicadas = new Set<string>()
    for (const clave of clavesDe(archivo)) {
      if (vistas.has(clave)) duplicadas.add(clave)
      vistas.add(clave)
    }

    expect(
      [...duplicadas],
      `Claves declaradas dos veces en ${archivo} (gana la última):\n  ${[...duplicadas].join('\n  ')}`,
    ).toEqual([])
  })

  it('todos los idiomas tienen exactamente las mismas claves', () => {
    const [base, ...resto] = IDIOMAS
    const claveBase = new Set(clavesDe(base))

    for (const otro of resto) {
      const claveOtro = new Set(clavesDe(otro))
      const faltan = [...claveBase].filter(k => !claveOtro.has(k))
      const sobran = [...claveOtro].filter(k => !claveBase.has(k))

      expect(faltan, `Claves de ${base} que faltan en ${otro} (se verían en español):\n  ${faltan.join('\n  ')}`).toEqual([])
      expect(sobran, `Claves de ${otro} que no existen en ${base}:\n  ${sobran.join('\n  ')}`).toEqual([])
    }
  })

  /*
   * Un valor vacío es peor que una clave ausente: no hay respaldo posible, así
   * que el usuario ve un hueco donde debería haber una frase.
   */
  it('ninguna traducción está vacía', () => {
    for (const archivo of IDIOMAS) {
      const src = readFileSync(join(I18N, archivo), 'utf8')
      const vacias = [...src.matchAll(/(?:^|[,{]\s*)([a-zA-Z_]\w*)\s*:\s*(?:''|"")/gm)].map(m => m[1])
      expect(vacias, `Traducciones vacías en ${archivo}:\n  ${vacias.join(', ')}`).toEqual([])
    }
  })
})
