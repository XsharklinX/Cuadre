import { describe, expect, it } from 'vitest'
import {
  RECEIPT_MAX_BYTES, RECEIPT_MAX_DIM,
  dataUrlBytes, isStorableReceipt, receiptKey, scaledDimensions,
} from './receiptImage'

/** Un data URL de imagen con `bytes` de contenido aproximado. */
function imagen(bytes: number, mime = 'image/jpeg'): string {
  const base64 = 'A'.repeat(Math.ceil((bytes * 4) / 3))
  return `data:${mime};base64,${base64}`
}

describe('scaledDimensions', () => {
  it('encoge al lado mayor conservando la proporción', () => {
    const r = scaledDimensions(4000, 3000)
    expect(Math.max(r.width, r.height)).toBe(RECEIPT_MAX_DIM)
    expect(r.width / r.height).toBeCloseTo(4000 / 3000, 2)
  })

  it('funciona igual en vertical, que es como se fotografía un recibo', () => {
    const r = scaledDimensions(3000, 4000)
    expect(r.height).toBe(RECEIPT_MAX_DIM)
    expect(r.width).toBe(1050)
  })

  it('una foto que ya es pequeña NO se agranda', () => {
    // Reescalar hacia arriba no añade detalle, solo peso y borrosidad.
    expect(scaledDimensions(800, 600)).toEqual({ width: 800, height: 600 })
  })

  it('justo en el límite se deja como está', () => {
    expect(scaledDimensions(RECEIPT_MAX_DIM, 700)).toEqual({ width: RECEIPT_MAX_DIM, height: 700 })
  })

  it('una foto larguísima y estrecha no deja un lado en cero', () => {
    // Un lienzo de 0 px de ancho no se puede dibujar: reventaría al comprimir.
    const r = scaledDimensions(20_000, 3)
    expect(r.width).toBe(RECEIPT_MAX_DIM)
    expect(r.height).toBeGreaterThanOrEqual(1)
  })

  it('unas medidas imposibles no revientan', () => {
    expect(scaledDimensions(0, 0)).toEqual({ width: 0, height: 0 })
    expect(scaledDimensions(-5, 100)).toEqual({ width: 0, height: 0 })
    expect(scaledDimensions(Number.NaN, 100)).toEqual({ width: 0, height: 0 })
  })

  it('acepta otro tope', () => {
    expect(Math.max(...Object.values(scaledDimensions(4000, 3000, 400)))).toBe(400)
  })
})

describe('dataUrlBytes', () => {
  it('cuenta los bytes reales, no los caracteres', () => {
    // 4 caracteres base64 = 3 bytes.
    expect(dataUrlBytes('data:image/png;base64,AAAA')).toBe(3)
  })

  it('descuenta el relleno', () => {
    expect(dataUrlBytes('data:image/png;base64,AAA=')).toBe(2)
    expect(dataUrlBytes('data:image/png;base64,AA==')).toBe(1)
  })

  it('lo que no es un data URL pesa cero', () => {
    expect(dataUrlBytes('vacío')).toBe(0)
    expect(dataUrlBytes('')).toBe(0)
  })
})

describe('isStorableReceipt', () => {
  it('una imagen normal se guarda', () => {
    expect(isStorableReceipt(imagen(200_000))).toBe(true)
  })

  it('lo que no es imagen, no', () => {
    expect(isStorableReceipt('data:application/pdf;base64,AAAA')).toBe(false)
    expect(isStorableReceipt('data:text/plain;base64,AAAA')).toBe(false)
    expect(isStorableReceipt('https://ejemplo.com/foto.jpg')).toBe(false)
    expect(isStorableReceipt('')).toBe(false)
  })

  it('una imagen vacía no es una imagen', () => {
    expect(isStorableReceipt('data:image/jpeg;base64,')).toBe(false)
  })

  it('pasado el tope, mejor sin recibo que llenando el disco', () => {
    expect(isStorableReceipt(imagen(RECEIPT_MAX_BYTES + 10_000))).toBe(false)
  })

  it('acepta cualquier formato de imagen, no solo JPEG', () => {
    expect(isStorableReceipt(imagen(100_000, 'image/png'))).toBe(true)
    expect(isStorableReceipt(imagen(100_000, 'image/webp'))).toBe(true)
  })
})

describe('receiptKey', () => {
  it('cada movimiento tiene la suya', () => {
    expect(receiptKey('tx_1')).toBe('receipt_tx_1')
    expect(receiptKey('tx_1')).not.toBe(receiptKey('tx_2'))
  })
})
