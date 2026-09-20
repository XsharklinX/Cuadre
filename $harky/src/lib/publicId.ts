/**
 * Deriva un ID público de 9 dígitos (primer dígito 1-9) de forma determinista
 * a partir del UUID de Supabase: siempre el mismo para cada cuenta, distinto
 * entre cuentas (el UUID de origen es único), sin necesitar un contador en BD.
 */
export function deriveNumericId(uuid: string): string {
  let h = 5381n
  for (let i = 0; i < uuid.length; i++) {
    h = (h * 33n + BigInt(uuid.charCodeAt(i))) & 0xffffffffffffffn
  }
  return ((h % 900000000n) + 100000000n).toString()
}
