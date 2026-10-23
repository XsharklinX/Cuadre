import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA: una regla que se aplica en diez sitios se acabará aplicando en nueve.
 *
 * `transactionsForTotals` es el embudo por el que pasan todas las pantallas que
 * suman dinero. Para que los ajustes de cuadre queden fuera de los informes hay
 * que pasarle las categorías — y es OPCIONAL, por compatibilidad, así que
 * olvidarlo no rompe el build ni falla ningún test: simplemente esa pantalla
 * vuelve a contar los ajustes como ingresos, en silencio.
 *
 * Exactamente el fallo que acabamos de arreglar, reapareciendo en la siguiente
 * pantalla que alguien añada. Esto lo impide.
 */

const SRC = join(__dirname, '..')

/** Archivos de código de la app, sin pruebas. */
function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) { archivos(ruta, salida); continue }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (entrada.name.includes('.test.')) continue
    salida.push(ruta)
  }
  return salida
}

interface Llamada { archivo: string; linea: number; texto: string }

/**
 * Las llamadas al embudo, con su lista de argumentos.
 *
 * Se cuentan las comas de nivel superior en vez de partir por coma: un
 * argumento puede llevar comas dentro (`txForMonth(a, b)`), y partir a lo bruto
 * contaría argumentos que no existen.
 */
function llamadas(): Llamada[] {
  const fuera: Llamada[] = []
  for (const ruta of archivos(SRC)) {
    // El propio helper define la función; no se llama a sí mismo.
    if (ruta.endsWith(join('data', 'helpers.ts'))) continue
    const texto = readFileSync(ruta, 'utf-8')
    const lineas = texto.split('\n')
    lineas.forEach((linea, i) => {
      // Las líneas de `import` nombran la función sin llamarla.
      if (/^\s*import\b/.test(linea)) return
      let desde = 0
      for (;;) {
        const pos = linea.indexOf('transactionsForTotals(', desde)
        if (pos < 0) break
        const args = argumentos(linea, pos + 'transactionsForTotals('.length)
        if (args !== null) fuera.push({ archivo: ruta.slice(SRC.length + 1), linea: i + 1, texto: args })
        desde = pos + 1
      }
    })
  }
  return fuera
}

/** El texto entre los paréntesis de la llamada, o `null` si no cierra en la línea. */
function argumentos(linea: string, inicio: number): string | null {
  let profundidad = 1
  for (let i = inicio; i < linea.length; i += 1) {
    const c = linea[i]
    if (c === '(') profundidad += 1
    else if (c === ')') {
      profundidad -= 1
      if (profundidad === 0) return linea.slice(inicio, i)
    }
  }
  return null
}

/** Argumentos de nivel superior: las comas dentro de paréntesis no cuentan. */
function cuantos(args: string): number {
  if (!args.trim()) return 0
  let profundidad = 0
  let n = 1
  for (const c of args) {
    if (c === '(' || c === '[' || c === '{') profundidad += 1
    else if (c === ')' || c === ']' || c === '}') profundidad -= 1
    else if (c === ',' && profundidad === 0) n += 1
  }
  return n
}

describe('todas las pantallas que suman dinero excluyen los ajustes', () => {
  const todas = llamadas()

  it('hay llamadas que vigilar', () => {
    // Si esto falla, o se renombró la función o el detector dejó de encontrarla
    // — y entonces el resto del test estaría pasando por no mirar nada.
    expect(todas.length).toBeGreaterThanOrEqual(8)
  })

  it('ninguna se queda sin el cuarto argumento (las categorías)', () => {
    const flojas = todas
      .filter(l => cuantos(l.texto) < 4)
      .map(l => `${l.archivo}:${l.linea} → transactionsForTotals(${l.texto})`)
    expect(flojas, `Sin categorías, estas pantallas cuentan los ajustes de cuadre como ingresos:\n${flojas.join('\n')}`).toEqual([])
  })
})
