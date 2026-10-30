import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA: la app tiene SEIS temas y uno de ellos es claro.
 *
 * Un color literal escrito a mano funciona en el tema en el que se probó y
 * desaparece en los otros. El caso que duele: un dorado de aviso como
 * `#ffd166` se lee perfecto sobre el fondo oscuro y es invisible sobre blanco —
 * y ese es el color de «este cliente lleva nueve días sin pagarte», justo la
 * información que menos puede perderse.
 *
 * Nada de esto lo ve TypeScript ni los tests de comportamiento: el CSS es la
 * única capa del proyecto sin red, y un color mal elegido no falla, solo se
 * vuelve ilegible para quien use otro tema.
 *
 * ── QUÉ SE VIGILA, EXACTAMENTE ────────────────────────────────────────
 * Solo las hojas NUEVAS (las de la 2.0). Las viejas llevan colores literales
 * de antes y auditarlas enteras aquí convertiría este guardia en una lista de
 * deuda histórica que nadie lee — y entonces no protegería nada.
 *
 * Y solo en las propiedades donde el contraste decide si algo se lee: `color`,
 * `background` y `border-color` a secas. Un literal dentro de `color-mix`,
 * `rgba` con transparencia o un degradado se mezcla con el fondo del tema, así
 * que sobrevive al cambio.
 */

const ESTILOS = join(__dirname, '..', 'styles')

/** Las hojas que esta regla cubre. Las viejas quedan fuera a propósito. */
const VIGILADAS = ['mobile-business.css', 'mobile-juice.css', 'mobile-tacto.css']

/**
 * Colores que se permiten aunque sean literales.
 *
 * Son los dos extremos usados como texto SOBRE un fondo de color fuerte que la
 * app controla (el verde de guardar, el rojo del borrado): ahí el contraste no
 * depende del tema porque el fondo tampoco.
 */
const PERMITIDOS = new Set(['#0b2b22', '#06231b', '#2a0a12', '#30240a', '#fff', '#ffffff'])

interface Hallazgo { archivo: string; linea: number; texto: string }

/**
 * Declaraciones con un color literal en una propiedad que decide el contraste.
 *
 * Se mira línea a línea porque estas hojas se escriben con una declaración por
 * línea; una declaración partida en dos líneas se le escaparía, y es un precio
 * aceptable por no escribir un intérprete de CSS en un test.
 */
function literales(fuente: string, archivo: string): Hallazgo[] {
  const fuera: Hallazgo[] = []
  fuente.split('\n').forEach((linea, i) => {
    const limpia = linea.trim()
    // Los comentarios nombran colores para explicarlos; no los aplican.
    if (limpia.startsWith('*') || limpia.startsWith('/*') || limpia.startsWith('//')) return

    const m = limpia.match(/^(color|background|background-color|border-color)\s*:\s*([^;]+);?$/)
    if (!m) return
    // Un literal DENTRO de `var(--token, #hex)` es el valor de reserva, no el
    // color aplicado: manda el token, que sí cambia con el tema, y la reserva
    // solo salta si el token no existiera. Se quitan antes de buscar.
    const valor = m[2].replace(/var\([^)]*\)/g, '')
    // `color-mix`, `rgba` y los degradados se mezclan con el fondo del tema.
    if (/color-mix|gradient|rgba?\s*\(/.test(valor)) return

    const hex = valor.match(/#[0-9a-fA-F]{3,8}/g) ?? []
    const sueltos = hex.filter(h => !PERMITIDOS.has(h.toLowerCase()))
    if (sueltos.length) fuera.push({ archivo, linea: i + 1, texto: limpia })
  })
  return fuera
}

describe('los temas no rompen las hojas nuevas', () => {
  it('las hojas vigiladas existen', () => {
    // Si alguien las renombra, este guardia dejaría de mirar nada y pasaría
    // en verde para siempre.
    const hay = readdirSync(ESTILOS)
    for (const nombre of VIGILADAS) {
      expect(hay, `falta ${nombre}: el guardia se quedaría sin vigilar nada`).toContain(nombre)
    }
  })

  it('ningún color de contraste está escrito a mano', () => {
    const hallazgos = VIGILADAS.flatMap(nombre =>
      literales(readFileSync(join(ESTILOS, nombre), 'utf-8'), nombre))
    const informe = hallazgos.map(h => `  ${h.archivo}:${h.linea}  ${h.texto}`).join('\n')
    expect(hallazgos, `Estos colores no cambian con el tema:\n${informe}`).toEqual([])
  })

  it('la hoja de Negocio define sus tonos semánticos para el tema claro', () => {
    // `--m-warn` y `--m-info` son los dos que la app usaba a pelo. Si solo se
    // definieran una vez, el tema claro heredaría el tono oscuro.
    const css = readFileSync(join(ESTILOS, 'mobile-business.css'), 'utf-8')
    expect(css).toContain('--m-warn')
    expect(css).toContain('--m-info')
    expect(css, 'sin la variante clara, el aviso es invisible en el tema claro')
      .toContain('[data-theme="light"]')
  })
})

describe('las hojas nuevas respetan quien pide menos movimiento', () => {
  for (const nombre of VIGILADAS) {
    it(`${nombre} apaga sus animaciones`, () => {
      const css = readFileSync(join(ESTILOS, nombre), 'utf-8')
      // Solo se exige si la hoja anima algo.
      if (!/@keyframes|animation:|transition:/.test(css)) return
      expect(css, `${nombre} anima sin dar salida a prefers-reduced-motion`)
        .toContain('@media (prefers-reduced-motion: reduce)')
    })
  }
})
