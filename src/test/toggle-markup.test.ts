import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE REGRESIÓN: interruptores sin su contenedor.
 *
 * El interruptor de la app son tres piezas acopladas:
 *
 *   .mset-toggle-wrap  →  el contenedor: `position: relative`, 52x30
 *     .mset-toggle-input  →  el checkbox real, invisible
 *     .mset-toggle        →  lo que se ve, `position: absolute; inset: 0`
 *
 * `.mset-toggle` se dibuja contra el ancestro POSICIONADO más cercano. Dentro
 * de su contenedor eso son 52x30 y todo va bien. Sin el contenedor, sube
 * buscando y encuentra `.mobile-settings-screen`, que es `position: fixed` a
 * pantalla completa — así que el interruptor se estira sobre TODA la pantalla,
 * pintado de `var(--accent)` cuando está activo.
 *
 * Eso fue exactamente lo que pasó al añadir los tipos de recordatorio en
 * Ajustes › Notificaciones: la pantalla entera se cubrió de azul y no se veía
 * nada debajo.
 *
 * Ni el typechecker ni un test de comportamiento ven esto: las tres clases
 * existen, el CSS existe, y el componente monta sin quejarse. Lo único que
 * falla es dónde acaba pintándose un rectángulo. Por eso se vigila el markup.
 */

const MOBILE = join(__dirname, '..', 'mobile')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return entry.endsWith('.tsx') ? [full] : []
  })
}

/**
 * Cuánto se mira hacia atrás buscando el contenedor.
 *
 * Suficiente para abarcar la etiqueta que lo envuelve con sus props, y corto
 * para no tropezar con el interruptor ANTERIOR de la misma pantalla, que
 * daría un falso aprobado.
 */
const VENTANA = 700

/**
 * Fuera los comentarios antes de mirar.
 *
 * La primera version de este test se dejo engañar por el comentario que
 * explica la regla: mencionaba `.mset-toggle-wrap` en prosa, caia dentro de
 * la ventana, y el interruptor roto pasaba como bueno. Un guardia que aprueba
 * el fallo que existe para cazar es peor que no tenerlo, porque encima
 * tranquiliza.
 */
function sinComentarios(source: string): string {
  // Se sustituyen por espacios, no se borran: asi las posiciones y los
  // numeros de linea que se reportan siguen siendo los del archivo real.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, m => ' '.repeat(m.length))
}

describe('markup de los interruptores', () => {
  it('todo .mset-toggle-input está dentro de un .mset-toggle-wrap', () => {
    const huerfanos: string[] = []

    for (const file of walk(MOBILE)) {
      const source = sinComentarios(readFileSync(file, 'utf8'))
      for (const match of source.matchAll(/mset-toggle-input/g)) {
        const antes = source.slice(Math.max(0, match.index - VENTANA), match.index)
        if (!antes.includes('mset-toggle-wrap')) {
          const linea = source.slice(0, match.index).split('\n').length
          huerfanos.push(`${file.split(/[\\/]/).slice(-2).join('/')}:${linea}`)
        }
      }
    }

    expect(
      huerfanos,
      `Interruptores sin .mset-toggle-wrap (se pintarán sobre toda la pantalla):\n  ${huerfanos.join('\n  ')}`,
    ).toEqual([])
  })
})
