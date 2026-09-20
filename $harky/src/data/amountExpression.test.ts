import { describe, expect, it } from 'vitest'
import { cleanAmount, evaluateExpression, lastOperatorIndex, lastSegment } from './amountExpression'

describe('cleanAmount', () => {
  it('coma → punto y máximo 2 decimales', () => {
    expect(cleanAmount('1234,567')).toBe('1234.56')
  })
  it('quita ceros a la izquierda pero conserva el 0.', () => {
    expect(cleanAmount('007')).toBe('7')
    expect(cleanAmount('0.5')).toBe('0.5')
    expect(cleanAmount('0')).toBe('0')
  })
  it('descarta caracteres no numéricos', () => {
    expect(cleanAmount('RD$ 1.500')).toBe('1.50')
  })
})

describe('lastSegment / lastOperatorIndex', () => {
  it('devuelve el número tras el último operador', () => {
    expect(lastSegment('100+50')).toBe('50')
    expect(lastSegment('100')).toBe('100')
    expect(lastSegment('10×3÷2')).toBe('2')
  })
  it('-1 cuando no hay operador', () => {
    expect(lastOperatorIndex('100')).toBe(-1)
  })
})

describe('evaluateExpression (calculadora del monto)', () => {
  it('número simple', () => {
    expect(evaluateExpression('1500')).toBe(1500)
    expect(evaluateExpression('12.50')).toBe(12.5)
  })
  it('suma y resta de izquierda a derecha', () => {
    expect(evaluateExpression('100+50−30')).toBe(120)
  })
  it('× y ÷ tienen precedencia sobre + y −', () => {
    expect(evaluateExpression('100+2×50')).toBe(200)      // 100 + (2×50)
    expect(evaluateExpression('10+90÷3')).toBe(40)        // 10 + (90÷3)
  })
  it('cadena mixta completa', () => {
    expect(evaluateExpression('2×3+4×5')).toBe(26)        // 6 + 20
  })
  it('división entre cero se ignora (mantiene el acumulado, no NaN)', () => {
    expect(evaluateExpression('100÷0')).toBe(100)
    expect(Number.isFinite(evaluateExpression('100÷0+5'))).toBe(true)
  })
  it('operador colgando al final se ignora ("100+" → 100)', () => {
    expect(evaluateExpression('100+')).toBe(100)
    expect(evaluateExpression('50×')).toBe(50)
  })
  it('vacío o basura → 0', () => {
    expect(evaluateExpression('')).toBe(0)
    expect(evaluateExpression('+−×')).toBe(0)
  })
})
