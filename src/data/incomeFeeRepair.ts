import { totalFees } from './bankFees'
import type { Transaction } from '@/types'

/**
 * INGRESOS A LOS QUE SE LES COBRÓ UN IMPUESTO QUE NO EXISTE.
 *
 * Desde que se añadió el cálculo de cargos bancarios, `computeFees` se llamaba
 * igual para un gasto que para un ingreso. Y el formulario guarda
 * `monto + cargos`, así que en un ingreso el 0,15 % de la Ley 288-04 se SUMABA
 * al dinero recibido: un sueldo de RD$ 10,000 entraba al libro como
 * RD$ 10,015.
 *
 * El error de fondo es conceptual — la Ley 288-04 grava DÉBITOS electrónicos, y
 * en un ingreso no hay débito —, pero el efecto práctico es peor que una línea
 * mal etiquetada: son pesos inventados, en cada ingreso, que se arrastran al
 * saldo de la cuenta y a todos los totales del mes.
 *
 * ────────────────────────────────────────────────────────────────────
 * POR QUÉ SE PUEDE REPARAR SIN ADIVINAR
 *
 * El desglose se guardó. Un ingreso dañado lleva su lista `fees` al lado, así
 * que el monto verdadero es exactamente `amount − totalFees(fees)`. No hay
 * estimación: se deshace la suma que no debió hacerse.
 *
 * Esto NO lo detecta Salud de datos, y es importante entender por qué: el
 * saldo de la cuenta se calculó con el monto inflado, así que el libro cuadra
 * consigo mismo. Está coherentemente equivocado, que es la clase de error que
 * ninguna invariante interna puede ver — solo se nota comparando contra el
 * estado de cuenta del banco.
 */

/** Un ingreso dañado, con lo que hay que devolverle. */
export interface IncomeFeeFix {
  id: string
  /** Lo que dice el libro hoy. */
  stored: number
  /** Lo que de verdad entró. */
  real: number
  /** Los pesos inventados. */
  inflated: number
}

/**
 * Un ingreso está dañado si lleva cargos.
 *
 * Un ingreso nunca debió tener ninguno, así que la sola presencia de la lista
 * es la firma del fallo. No hace falta mirar fechas ni versiones.
 */
function isDamaged(tx: Transaction): boolean {
  return tx.type === 'income' && Array.isArray(tx.fees) && tx.fees.length > 0
}

/** Los ingresos a los que se les sumó un cargo que no correspondía. */
export function findInflatedIncome(transactions: Transaction[]): IncomeFeeFix[] {
  const out: IncomeFeeFix[] = []
  for (const tx of transactions) {
    if (!isDamaged(tx)) continue
    const inflated = totalFees(tx.fees!)
    // Un cargo de cero no inflo nada: no hay nada que devolver y abrirle una
    // fila al usuario solo seria ruido.
    if (inflated <= 0) continue
    out.push({
      id: tx.id,
      stored: tx.amount,
      real: Math.round((tx.amount - inflated) * 100) / 100,
      inflated,
    })
  }
  return out
}

/** Cuánto dinero inventado hay en total. */
export function totalInflated(fixes: IncomeFeeFix[]): number {
  return Math.round(fixes.reduce((sum, f) => sum + f.inflated, 0) * 100) / 100
}

/**
 * Devuelve el libro con los ingresos corregidos.
 *
 * Se quita la lista `fees` además de restar el monto: dejarla sería dejar la
 * prueba de un cargo que la app ya no cobra, y la ficha del movimiento la
 * seguiría mostrando como si el banco lo hubiera retenido.
 */
export function repairInflatedIncome(transactions: Transaction[]): Transaction[] {
  return transactions.map(tx => {
    if (!isDamaged(tx)) return tx
    const inflated = totalFees(tx.fees!)
    if (inflated <= 0) return tx
    const { fees: _fees, ...resto } = tx
    return { ...resto, amount: Math.round((tx.amount - inflated) * 100) / 100 } as Transaction
  })
}
