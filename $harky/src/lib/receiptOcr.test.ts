import { describe, expect, it } from 'vitest'
import { extractAmount, extractCardLast4, extractDate, extractMerchant } from './receiptOcr'

describe('extractCardLast4', () => {
  it('"tarjeta terminada en 4821"', () => {
    expect(extractCardLast4('TARJETA TERMINADA EN 4821')).toBe('4821')
  })
  it('formato con asteriscos "****4821"', () => {
    expect(extractCardLast4('VISA ****4821')).toBe('4821')
  })
  it('"cuenta termina en 1234"', () => {
    expect(extractCardLast4('cuenta termina en 1234')).toBe('1234')
  })
  it('"TARJETA VISA 4821" (sin "terminada en")', () => {
    expect(extractCardLast4('TARJETA VISA 4821')).toBe('4821')
  })
  it('null si no hay ninguna señal de tarjeta', () => {
    expect(extractCardLast4('SUPERMERCADO NACIONAL\nTOTAL RD$500.00')).toBeNull()
  })
  // Formato real del recibo Domit: "TARJETA VISA : #:**4500  3,313.68". Debe dar
  // la tarjeta (4500), NO los dígitos del monto que van en la misma línea.
  it('recibo real con "#:**4500" y el monto en la misma línea → 4500', () => {
    expect(extractCardLast4('TARJETA VISA : #:**4500   3,313.68')).toBe('4500')
  })
  it('si el OCR pierde los asteriscos, lo toma tras el marcador (no el monto)', () => {
    expect(extractCardLast4('TARJETA VISA : #:4500 3313')).toBe('4500')
  })
})

describe('extractMerchant', () => {
  it('toma la primera línea con texto real como comercio', () => {
    const text = 'SUPERMERCADO NACIONAL\n12/07/2026\nTOTAL RD$ 1,250.00'
    expect(extractMerchant(text)).toBe('SUPERMERCADO NACIONAL')
  })
  it('salta encabezados conocidos ("RECIBO", "FACTURA"…)', () => {
    const text = 'RECIBO\nFARMACIA CAROL\nFECHA: 12/07/2026'
    expect(extractMerchant(text)).toBe('FARMACIA CAROL')
  })
  it('salta líneas dominadas por números (fechas, códigos)', () => {
    const text = '12/07/2026 14:32:09\n0004821093\nJUMBO PUNTA CANA'
    expect(extractMerchant(text)).toBe('JUMBO PUNTA CANA')
  })
  it('recorta nombres muy largos a 40 caracteres', () => {
    const long = 'A'.repeat(60)
    expect(extractMerchant(long)?.length).toBe(40)
  })
  it('null si no hay ninguna línea usable', () => {
    expect(extractMerchant('12/07/2026\n0004821093')).toBeNull()
  })
})

describe('extractAmount / extractDate (regresión — ya existían, no romper)', () => {
  it('prioriza la línea con "total"', () => {
    expect(extractAmount('Subtotal 900.00\nTOTAL RD$ 1,250.00')).toBe(1250)
  })
  it('formato de fecha DD/MM/AAAA', () => {
    expect(extractDate('12/07/2026')).toBe('2026-07-12')
  })
})

describe('extracción combinada — caso real de recibo dominicano', () => {
  it('un recibo típico da comercio + monto + fecha + tarjeta juntos', () => {
    const receipt = [
      'JUMBO PUNTA CANA',
      'RNC: 101-23456-7',
      '12/07/2026 14:32',
      'Arroz 5lb .......... 380.00',
      'Pollo x2 ............ 640.00',
      'SUBTOTAL ........... 1020.00',
      'ITBIS ................ 183.60',
      'TOTAL RD$ 1,203.60',
      'TARJETA VISA TERMINADA EN 4821',
      'APROBADA',
    ].join('\n')
    expect(extractMerchant(receipt)).toBe('JUMBO PUNTA CANA')
    expect(extractAmount(receipt)).toBe(1203.60)
    expect(extractDate(receipt)).toBe('2026-07-12')
    expect(extractCardLast4(receipt)).toBe('4821')
  })
})
