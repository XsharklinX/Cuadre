import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA: LAS HOJAS SE PUEDEN DESPLAZAR CON EL DEDO.
 *
 * El `touch-action` de un contenedor se suma al de todo lo que lleva dentro.
 * El fondo de las hojas tenía `none`, y eso dejó clavadas las de Negocio —que
 * se desplazan en un cuerpo interior—: no se podía bajar al editar un cliente
 * ni al elegir el día de pago. En un navegador de escritorio no se nota,
 * porque la rueda del ratón no mira `touch-action`; por eso va una guardia.
 */
const css = (f: string) => readFileSync(join(__dirname, '..', 'styles', f), 'utf8')

/** El cuerpo de la primera regla que empieza exactamente con ese selector. */
function regla(texto: string, selector: string): string {
  const i = texto.search(new RegExp(`(^|\\n)\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`))
  expect(i, `no se encontró ${selector}`).toBeGreaterThanOrEqual(0)
  const ini = texto.indexOf('{', i)
  return texto.slice(ini, texto.indexOf('}', ini))
}

describe('el scroll táctil de las hojas', () => {
  it('el fondo de las hojas no prohíbe el gesto', () => {
    expect(regla(css('mobile-shell.css'), '.mobile-detail-sheet')).not.toMatch(/touch-action:\s*none/)
  })

  it('las hojas de Negocio se deslizan ENTERAS, como el resto de la app', () => {
    // La caja interior era lo único distinto de las hojas que sí deslizan.
    const c = css('mobile-business.css')
    const hoja = regla(c, '.mobile-detail-sheet .mbizs')
    expect(hoja).toMatch(/overflow-y:\s*auto/)
    expect(hoja).toMatch(/touch-action:\s*pan-y/)
    expect(regla(c, '.mobile-detail-sheet .mbizs > .mbizs-body')).toMatch(/overflow:\s*visible/)
    expect(regla(c, '.mobile-detail-sheet .mbizs > .mbizs-head')).toMatch(/position:\s*sticky/)
    expect(regla(c, '.mobile-detail-sheet .mbizs > .mbizs-actions')).toMatch(/position:\s*sticky/)
  })

  it('el fondo de la hoja de cuentas tampoco', () => {
    expect(regla(css('mobile-accounts.css'), '.saed-overlay')).not.toMatch(/touch-action:\s*none/)
  })

  it('al ordenar negocios, la fila deja desplazar y solo el asa arrastra', () => {
    const c = css('mobile-business.css')
    expect(regla(c, '.morg-row')).toMatch(/touch-action:\s*pan-y/)
    expect(regla(c, '.morg-grip')).toMatch(/touch-action:\s*none/)
  })
})
