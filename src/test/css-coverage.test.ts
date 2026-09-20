import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE REGRESIÓN: clases usadas en el código que no tienen CSS.
 *
 * Al reescribir `mobile-accounts.css` para el rediseño de la lista se
 * perdieron los estilos que la FICHA de cuenta seguía usando: veinte clases
 * quedaron sin definir. El resultado en el teléfono fue la cabecera con el
 * tipo y el saldo pegados, el gráfico de seis meses convertido en texto
 * suelto, y la leyenda leyéndose "EntradasSalidas".
 *
 * Nada de eso lo ve un test de comportamiento, y el typechecker tampoco: una
 * clase inexistente es una cadena de texto válida. Por eso este test escanea
 * el código, igual que el de la divisa base.
 */

const SRC = join(__dirname, '..')
const sep = process.platform === 'win32' ? '\\' : '/'

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full, match)
    return match.test(entry) ? [full] : []
  })
}

/** Todas las clases definidas en las hojas de estilo. */
function definedClasses(): Set<string> {
  const out = new Set<string>()
  for (const file of walk(join(SRC, 'styles'), /\.css$/)) {
    const css = readFileSync(file, 'utf8')
    for (const m of css.matchAll(/\.([a-zA-Z][\w-]*)/g)) out.add(m[1])
  }
  return out
}

/**
 * Prefijos de pantalla que este test vigila. Se limita a los propios de la
 * app para no perseguir utilidades globales ni clases de librerías.
 */
const WATCHED = /^(sacc|macc|man|mnc|mnews|mhealth|mbank|mrate|mnum|mob-onboard|txf)-/

describe('toda clase de pantalla propia tiene CSS', () => {
  it('ninguna clase usada en el código queda sin definir', () => {
    const defined = definedClasses()
    const missing = new Map<string, string[]>()

    for (const file of walk(SRC, /\.tsx?$/)) {
      if (/\.test\.tsx?$/.test(file)) continue
      const code = readFileSync(file, 'utf8')
      // `className="a b"` y `className={`a${x ? ' b' : ''}`}`
      for (const m of code.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const raw = (m[1] ?? m[2] ?? '')
          .replace(/\$\{[^}]*\}/g, ' ')
          .split(/\s+/)
          .filter(Boolean)
        for (const cls of raw) {
          if (!WATCHED.test(cls) || defined.has(cls)) continue
          const where = file.slice(SRC.length + 1).split(sep).join('/')
          missing.set(cls, [...(missing.get(cls) ?? []), where])
        }
      }
    }

    const report = [...missing.entries()]
      .map(([cls, files]) => `  .${cls}  ← ${[...new Set(files)].join(', ')}`)
      .join('\n')

    expect(missing.size, `Clases sin CSS:\n${report}`).toBe(0)
  })
})
