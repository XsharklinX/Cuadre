import { beforeEach, describe, expect, it } from 'vitest'
import { shouldTapFeedback } from './tapFeedback'

function render(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

/** El primer elemento que case el selector, ya tipado. */
function pick(sel: string): Element {
  const el = document.querySelector(sel)
  if (!el) throw new Error(`No hay ningún "${sel}" en el DOM de prueba`)
  return el
}

describe('shouldTapFeedback', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('un botón vibra', () => {
    render('<button id="b">Guardar</button>')
    expect(shouldTapFeedback(pick('#b'))).toBe(true)
  })

  it('tocar el texto DENTRO de un botón también vibra', () => {
    // Es el caso normal: el dedo cae sobre el <b> o el icono, no sobre el
    // <button>. Si no subiéramos por el árbol, casi nada vibraría.
    render('<button><b id="t">Guardar</b></button>')
    expect(shouldTapFeedback(pick('#t'))).toBe(true)
  })

  it('el fondo de la pantalla no vibra', () => {
    render('<div id="d">texto suelto</div>')
    expect(shouldTapFeedback(pick('#d'))).toBe(false)
  })

  it('un botón apagado no finge que responde', () => {
    render('<button id="b" disabled>Guardar</button>')
    expect(shouldTapFeedback(pick('#b'))).toBe(false)
  })

  it('aria-disabled cuenta igual que disabled', () => {
    render('<div role="button" id="b" aria-disabled="true">Guardar</div>')
    expect(shouldTapFeedback(pick('#b'))).toBe(false)
  })

  it('los roles de interfaz vibran', () => {
    render(`
      <div role="button" id="r1">a</div>
      <div role="tab" id="r2">b</div>
      <div role="switch" id="r3">c</div>
    `)
    expect(shouldTapFeedback(pick('#r1'))).toBe(true)
    expect(shouldTapFeedback(pick('#r2'))).toBe(true)
    expect(shouldTapFeedback(pick('#r3'))).toBe(true)
  })

  it('un enlace vibra; un ancla sin destino no', () => {
    render('<a id="a1" href="#x">ir</a><a id="a2">nada</a>')
    expect(shouldTapFeedback(pick('#a1'))).toBe(true)
    expect(shouldTapFeedback(pick('#a2'))).toBe(false)
  })

  it('escribir en un campo de texto no vibra en cada toque', () => {
    render('<input id="i" type="text">')
    expect(shouldTapFeedback(pick('#i'))).toBe(false)
  })

  it('una casilla sí vibra: es un interruptor, no un campo', () => {
    render('<input id="i" type="checkbox">')
    expect(shouldTapFeedback(pick('#i'))).toBe(true)
  })

  describe('teclados que ya vibran solos', () => {
    // Si además les llegara el háptico global, cada tecla vibraría dos veces.
    const teclados = [
      ['hoja de monto', 'mamt-keypad'],
      ['crear movimiento', 'mobile-keypad-row'],
      ['conversor', 'mconv-numpad'],
      ['aportes a metas', 'mgl-numpad-grid'],
      ['PIN', 'mpin-keypad'],
      ['patrón', 'mpat-pad'],
    ]

    for (const [nombre, clase] of teclados) {
      it(`el teclado de ${nombre} queda fuera`, () => {
        render(`<div class="${clase}"><button id="k">5</button></div>`)
        expect(shouldTapFeedback(pick('#k'))).toBe(false)
      })
    }

    it('data-no-tap es la escotilla para casos sueltos', () => {
      render('<div data-no-tap><button id="k">5</button></div>')
      expect(shouldTapFeedback(pick('#k'))).toBe(false)
      render('<button data-no-tap id="k">5</button>')
      expect(shouldTapFeedback(pick('#k'))).toBe(false)
    })

    it('un botón normal fuera del teclado sigue vibrando', () => {
      render('<div class="mamt-keypad"><button>5</button></div><button id="ok">Listo</button>')
      expect(shouldTapFeedback(pick('#ok'))).toBe(true)
    })
  })

  it('un objetivo que no es un elemento no rompe nada', () => {
    expect(shouldTapFeedback(null)).toBe(false)
    expect(shouldTapFeedback(document.createTextNode('x') as unknown as EventTarget)).toBe(false)
  })
})
