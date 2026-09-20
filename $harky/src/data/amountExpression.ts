/**
 * Calculadora del campo de monto: convierte lo que el usuario teclea (con
 * operadores +−×÷) en un número. Pura y testeable — es donde un bug afecta
 * DIRECTAMENTE el dinero registrado, así que vale la pena tenerla aparte y
 * cubierta con tests, no enterrada en el componente.
 */

/** Operadores de la calculadora. `−` es U+2212, `×` U+00D7, `÷` U+00F7. */
export const OPERATORS = ['+', '−', '×', '÷'] as const
export type Operator = (typeof OPERATORS)[number]

/** Normaliza un segmento numérico: coma→punto, máx 2 decimales, sin ceros a la izquierda. */
export function cleanAmount(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [integer = '', ...rest] = normalized.split('.')
  const decimal = rest.join('').slice(0, 2)
  const safeInteger = integer.replace(/^0+(?=\d)/, '')
  return rest.length ? `${safeInteger || '0'}.${decimal}` : safeInteger
}

/** Índice del último operador en la expresión, o -1 si no hay ninguno. */
export function lastOperatorIndex(expr: string): number {
  return Math.max(...OPERATORS.map(op => expr.lastIndexOf(op)))
}

/** El último segmento numérico (lo que va después del último operador). */
export function lastSegment(expr: string): string {
  const cut = lastOperatorIndex(expr)
  return cut === -1 ? expr : expr.slice(cut + 1)
}

/** Evalúa una expresión de izquierda a derecha con precedencia de ×/÷ sobre +/−. */
export function evaluateExpression(expr: string): number {
  const raw = expr.match(/[+−×÷]|[\d.]+/g)
  if (!raw?.length) return 0
  const tokens = (OPERATORS as readonly string[]).includes(raw[raw.length - 1]) ? raw.slice(0, -1) : raw
  if (!tokens.length) return 0

  const terms: number[] = []
  const signs: ('+' | '−')[] = []
  let acc = Number(tokens[0]) || 0
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as Operator
    const val = Number(tokens[i + 1]) || 0
    if (op === '×') acc *= val
    else if (op === '÷') acc = val !== 0 ? acc / val : acc
    else {
      terms.push(acc)
      signs.push(op)
      acc = val
    }
  }
  terms.push(acc)

  return terms.reduce((sum, term, idx) => idx === 0 ? term : sum + (signs[idx - 1] === '−' ? -term : term), 0)
}
