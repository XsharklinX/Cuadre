import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA DE REGRESIÓN: dos componentes peleándose por el mismo nombre.
 *
 * En el rediseño de Cuentas, la barrita de cupo de la tarjeta de crédito se
 * llamó `.sacc-util`. Ese nombre YA existía: era el bloque de cupo de la
 * ficha de cuenta —etiqueta, porcentaje y barra, un grid con su alto
 * natural—. Como la regla nueva iba después, ganaba, y le imponía
 * `height: 4px; overflow: hidden` a aquel bloque.
 *
 * En el teléfono se veía así: el cupo de la ficha aplastado a una tira de
 * cuatro píxeles, con el texto cortado por la mitad. Dos tiras, porque esa
 * tarjeta tiene cupo en pesos y en dólares.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ NO LO VIO NADIE
 *
 * El typechecker no mira CSS. El test de cobertura comprueba que una clase
 * TENGA estilos, y las dos los tenían — de sobra. Los tests de comportamiento
 * no miden píxeles. No hay ninguna capa que note que dos cosas distintas
 * comparten nombre, porque en CSS eso es legal: es la cascada haciendo su
 * trabajo.
 *
 * ────────────────────────────────────────────────────────────────────
 * QUÉ SE VIGILA, EXACTAMENTE
 *
 * Solo el caso que rompe: la misma clase, sola, definida dos veces en el
 * mismo archivo, fuera de cualquier `@media`, con valores DISTINTOS en una
 * propiedad de maquetación.
 *
 * Lo que NO se marca, porque es legítimo y frecuente:
 *   · overrides responsive dentro de `@media`
 *   · selectores más específicos (`.a.b`, `.a .b`, `.a:hover`)
 *   · una segunda regla que solo toque color, tipografía o espaciado
 *
 * Si esto falla, casi siempre la respuesta es renombrar la clase NUEVA con el
 * prefijo de su componente, no retocar la vieja: quien llegó después es quien
 * se metió en casa ajena.
 */

const ESTILOS = join(__dirname, '..', 'styles')

/** Las que deciden la FORMA de una caja: si dos rules discrepan aquí, se ve. */
const MAQUETACION = ['display', 'position', 'height', 'overflow'] as const

interface Regla { linea: number; props: Record<string, string> }

/**
 * Las reglas `.foo { … }` que NO están dentro de un `@media`/`@supports`.
 *
 * El anidamiento se cuenta con las llaves, no con sangría ni expresiones
 * regulares sueltas: la sangría de estos archivos es decorativa y una regex
 * sobre el texto plano confundiría el interior de una media query con el
 * nivel superior, que es justo la distinción que da sentido al test.
 */
function reglasDeNivelSuperior(fuente: string): Map<string, Regla[]> {
  /*
   * Fuera los comentarios primero.
   *
   * Sin esto, el texto que precede a una regla comentada entra en el selector
   * («/* … *​/ .sacc-util» en vez de «.sacc-util») y la regla se descarta en
   * silencio. La primera version del test hacia justo eso: no marcaba nada
   * porque no llegaba a VER las reglas comentadas, que en este proyecto son
   * casi todas. Se sustituyen por espacios para no mover los numeros de linea
   * que luego se reportan.
   */
  const css = fuente.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  const out = new Map<string, Regla[]>()
  let profundidad = 0
  let profundidadAt: number | null = null
  let cursor = 0

  for (const m of css.matchAll(/@[a-z-]+[^{;]*\{|\{|\}/g)) {
    const tok = m[0]
    if (tok.startsWith('@')) {
      if (profundidadAt === null) profundidadAt = profundidad
      profundidad++
    } else if (tok === '{') {
      if (profundidad === (profundidadAt ?? 0)) {
        const selector = css.slice(cursor, m.index).split('}').pop()!.split('{').pop()!.trim()
        // Solo una clase suelta: `.foo`. Nada de `.foo.bar`, `.foo .bar` ni pseudos.
        if (/^\.[A-Za-z][\w-]*$/.test(selector)) {
          const cuerpo = css.slice(m.index! + 1, css.indexOf('}', m.index))
          const props: Record<string, string> = {}
          for (const d of cuerpo.matchAll(/([a-z-]+)\s*:\s*([^;]+);/g)) {
            if ((MAQUETACION as readonly string[]).includes(d[1])) props[d[1]] = d[2].trim()
          }
          if (Object.keys(props).length > 0) {
            const linea = css.slice(0, m.index).split('\n').length
            out.set(selector, [...(out.get(selector) ?? []), { linea, props }])
          }
        }
      }
      profundidad++
    } else {
      profundidad--
      if (profundidadAt !== null && profundidad === profundidadAt) profundidadAt = null
    }
    cursor = m.index! + tok.length
  }
  return out
}

describe('nombres de clase que se pisan', () => {
  it('ninguna clase tiene dos reglas con maquetacion contradictoria', () => {
    const choques: string[] = []

    for (const archivo of readdirSync(ESTILOS).filter(f => f.endsWith('.css'))) {
      const css = readFileSync(join(ESTILOS, archivo), 'utf8')

      for (const [selector, reglas] of reglasDeNivelSuperior(css)) {
        if (reglas.length < 2) continue

        const choca = MAQUETACION.some(prop => {
          const valores = reglas.map(r => r.props[prop]).filter(Boolean)
          return new Set(valores).size > 1
        })

        if (choca) {
          choques.push(`  ${selector}  ->  ${archivo}:${reglas.map(r => r.linea).join(', :')}`)
        }
      }
    }

    expect(
      choques,
      `Dos componentes usando el mismo nombre de clase (el segundo aplasta al primero):\n${choques.join('\n')}`,
    ).toEqual([])
  })
})
