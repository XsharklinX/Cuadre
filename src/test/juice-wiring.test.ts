import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA: el tacto de la app es CSS colgado de nombres, y los nombres se
 * renombran.
 *
 * Todo lo que hace que la app «se sienta» —la fila que aterriza al guardar, la
 * inclinación del carrusel, el tirón de la lista, las barras que se llenan—
 * vive en `mobile-juice.css` y se engancha a clases que pone otro archivo.
 * Nada de eso lo ve TypeScript: si alguien renombra `.mbud-row-fill` o quita
 * la clase `landed`, la animación deja de existir en silencio y la app vuelve
 * a sentirse plana sin que falle ni un test ni el build.
 *
 * Eso ya pasó en esta app con `.sacc-util` (ver `css-clashes.test.ts`): el CSS
 * es el único sitio del proyecto sin red.
 *
 * Aquí se comprueba lo mínimo que no puede fallar: que cada gancho del jugo
 * tenga las DOS mitades —quien lo pinta y quien lo emite—, y que la hoja esté
 * enchufada.
 */

const RAIZ = join(__dirname, '..')
const ESTILOS = join(RAIZ, 'styles')
const JUICE = readFileSync(join(ESTILOS, 'mobile-juice.css'), 'utf-8')

/** Todo el código de la app en un solo texto, para buscar los emisores. */
function fuenteCompleta(): string {
  const partes: string[] = []
  const recorrer = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name)
      if (entrada.isDirectory()) { recorrer(ruta); continue }
      if (!/\.tsx?$/.test(entrada.name)) continue
      if (entrada.name.includes('.test.')) continue
      partes.push(readFileSync(ruta, 'utf-8'))
    }
  }
  recorrer(RAIZ)
  return partes.join('\n')
}

const CODIGO = fuenteCompleta()

/**
 * ¿Aparece este nombre de clase, ENTERO?
 *
 * Con `toContain` a secas este test no servía para nada: renombrar
 * `.mbud-row-fill` a `.mbud-row-fill-nueva` seguía pasando, porque el nombre
 * viejo es un prefijo del nuevo — que es exactamente el renombrado que este
 * guardia existe para atrapar. Se comprueba con un límite: detrás del nombre
 * no puede venir otra letra, dígito, guion ni guion bajo.
 */
function tieneClase(texto: string, nombre: string): boolean {
  const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`${escapado}(?![\\w-])`).test(texto)
}
const CSS_APP = readdirSync(ESTILOS)
  .filter(f => f.endsWith('.css') && f !== 'mobile-juice.css')
  .map(f => readFileSync(join(ESTILOS, f), 'utf-8'))
  .join('\n')

describe('el jugo está enchufado', () => {
  it('globals.css importa la hoja', () => {
    const globals = readFileSync(join(ESTILOS, 'globals.css'), 'utf-8')
    expect(globals).toContain("@import './mobile-juice.css'")
  })

  it('va la ÚLTIMA, que es de donde saca su prioridad', () => {
    // Si alguien añade una hoja después, sus reglas de `transform` ganarían a
    // la inclinación del carrusel y nadie entendería por qué dejó de girar.
    const globals = readFileSync(join(ESTILOS, 'globals.css'), 'utf-8')
    const imports = [...globals.matchAll(/@import\s+'\.\/([\w-]+\.css)'/g)].map(m => m[1])
    expect(imports[imports.length - 1]).toBe('mobile-juice.css')
  })
})

describe('cada gancho tiene sus dos mitades', () => {
  /**
   * [qué es, clase que pinta el CSS, cómo la emite el código].
   *
   * El emisor se busca como texto porque la clase viaja dentro de una
   * plantilla (`${landed ? ' landed' : ''}`) y no hay forma de verla desde
   * los tipos.
   */
  const ganchos: Array<[string, string, string]> = [
    ['la fila que aterriza al guardar', '.mobile-tx-swipe.landed', "' landed'"],
    ['el mes cerrado en verde', '.mclose-card', 'mclose-card'],
    ['el indicador del tirón', '.mobile-ptr-inner', 'mobile-ptr-inner'],
    ['la tarjeta que se inclina', '.sacc-carousel.tilting .sacc-plastic', 'sacc-plastic'],
    ['el brillo que la acompaña', '.sacc-plastic-sheen', 'sacc-plastic-sheen'],
    ['la clase que enciende la inclinación', '.sacc-carousel.tilting', "'tilting'"],
  ]

  for (const [nombre, selector, emisor] of ganchos) {
    it(`${nombre}: el CSS la pinta y el código la emite`, () => {
      expect(tieneClase(JUICE, selector), `falta ${selector} en mobile-juice.css`).toBe(true)
      expect(tieneClase(CODIGO, emisor), `nadie emite "${emisor}"`).toBe(true)
    })
  }

  it('el tirón mueve el bloque que de verdad se desplaza', () => {
    // `--ptr` lo escribe el hook sobre `.mobile-content`; si el CSS dejara de
    // leerlo, el gesto seguiría funcionando y no se movería nada.
    expect(JUICE).toContain('var(--ptr, 0px)')
    expect(CODIGO).toContain("--ptr")
  })

  it('la inclinación lee la variable que escribe el hook', () => {
    expect(JUICE).toContain('var(--tilt, 0deg)')
    expect(CODIGO).toContain("'--tilt'")
  })
})

describe('nada de lo nuevo pisa un nombre que ya existía', () => {
  // Las clases PROPIAS del jugo (las que empiezan por `mstreak`, `mclose` o
  // `mobile-ptr`) no deben estar definidas también en otra hoja: ahí es donde
  // nació el fallo de `.sacc-util`.
  const propias = [...JUICE.matchAll(/\.(mclose-[\w-]+|mobile-ptr[\w-]*)/g)]
    .map(m => m[1])

  it('hay clases propias que vigilar', () => {
    expect(propias.length).toBeGreaterThan(5)
  })

  it('ninguna está definida en otra hoja', () => {
    const chocan = [...new Set(propias)].filter(clase =>
      new RegExp(`\\.${clase}\\s*[,{]`).test(CSS_APP))
    expect(chocan).toEqual([])
  })
})

describe('el movimiento se puede apagar', () => {
  it('la hoja respeta a quien pide menos animación', () => {
    // Sin esto, quien activa «reducir movimiento» en Android se come igual la
    // fila cayendo, las barras creciendo y el carrusel girando.
    expect(JUICE).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('el bloque apaga las animaciones que introduce la hoja', () => {
    const bloque = JUICE.slice(JUICE.indexOf('@media (prefers-reduced-motion: reduce)'))
    for (const clase of ['.mobile-tx-swipe.landed', '.mclose-card', '.mbud-row-fill']) {
      expect(tieneClase(bloque, clase), `${clase} sigue animándose`).toBe(true)
    }
    expect(bloque).toContain('animation: none')
  })
})
