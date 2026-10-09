import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NetworkMark } from '@/components/ui/NetworkMark'
import { networkMeta } from '@/data/cardNetwork'

/**
 * EL DISTINTIVO DE LA RED, Y POR QUÉ SU COLOR DEPENDE DE DÓNDE VA.
 *
 * El color de marca de Visa es #1a1f71 —azul marino— y el de Amex un azul
 * medio. Las tarjetas de esta app se pintan siempre sobre un fondo oscurecido,
 * así que esos tonos desaparecen contra el plástico: la marca queda puesta
 * pero no se ve, que es lo mismo que no ponerla.
 *
 * Sobre el plástico va en BLANCO, como los logotipos impresos en las tarjetas
 * oscuras de verdad. Fuera del plástico —el selector de red, la ficha de
 * ajustes— el fondo es claro y ahí manda el color de marca, que es justo lo
 * que la hace reconocible.
 *
 * Es una decisión fácil de deshacer sin querer: alguien unifica el estilo, le
 * devuelve el color de marca a todo, y la Visa se vuelve invisible sobre su
 * propia tarjeta sin que falle nada.
 */

describe('color del distintivo', () => {
  it('fuera del plastico lleva el color de la marca', () => {
    render(<NetworkMark network="visa" />)
    const marca = screen.getByRole('img', { name: 'Visa' })
    // El color de marca de Visa, tal cual lo declara `cardNetwork.ts`.
    expect(marca.style.color).not.toBe('')
    expect(networkMeta('visa')!.color).toBe('#1a1f71')
  })

  it('sobre el plastico NO lleva el color de marca', () => {
    render(<NetworkMark network="visa" onCard />)
    const marca = screen.getByRole('img', { name: 'Visa' })
    // Sin color en linea: lo pone el CSS en blanco. Si alguien devolviera el
    // color de marca aqui, la Visa se perderia contra la tarjeta.
    expect(marca.style.color).toBe('')
    expect(marca.className).toContain('on-card')
  })

  /*
   * Mastercard es la excepcion y tiene que seguir siendolo: se reconoce por la
   * FORMA, y sus dos circulos rojo y naranja se leen sobre cualquier fondo.
   * Por eso conserva su color tambien sobre el plastico.
   */
  it('mastercard se dibuja con sus circulos, dentro y fuera del plastico', () => {
    const { container, rerender } = render(<NetworkMark network="mastercard" />)
    expect(container.querySelectorAll('circle')).toHaveLength(2)
    rerender(<NetworkMark network="mastercard" onCard />)
    expect(container.querySelectorAll('circle')).toHaveLength(2)
  })
})

describe('que se dibuja', () => {
  it('cada red conocida se identifica por su nombre', () => {
    for (const red of ['visa', 'amex', 'discover'] as const) {
      const { unmount } = render(<NetworkMark network={red} />)
      expect(screen.getByRole('img', { name: networkMeta(red)!.name })).toBeTruthy()
      unmount()
    }
  })

  /* "Otra" no tiene marca que enseñar: unos puntos, no la palabra "Otra"
     escrita donde iria un logotipo. */
  it('una red generica no escribe su nombre en la tarjeta', () => {
    render(<NetworkMark network="other" onCard />)
    expect(screen.getByRole('img', { name: 'Otra' }).textContent).toBe('••••')
  })

  /*
   * Una cuenta sin red no debe dejar hueco ni marco vacio en la esquina: la
   * tarjeta se pinta igual que si nunca hubiera habido marca.
   */
  it('sin red no se dibuja nada', () => {
    // @ts-expect-error -- a proposito: asi llega desde una cuenta sin `network`.
    const { container } = render(<NetworkMark network={undefined} />)
    expect(container.innerHTML).toBe('')
  })
})
