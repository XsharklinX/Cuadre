import { monthKey } from './helpers'
import type { Transaction } from '@/types'

/**
 * POR QUÉ SE DESCUADRÓ, NO SOLO CUÁNTO.
 *
 * Arreglar el síntoma cada mes no es arreglarlo. Si la app te deja aplicar un
 * ajuste de −380 sin decir nada más, el mes que viene vuelves a estar igual y
 * sigues sin saber qué se cuela.
 *
 * La app tiene los datos para sospechar. Esto los mira y propone la causa más
 * probable, con los movimientos concretos señalados para que arregles la CAUSA
 * en vez del número.
 *
 * ── LA REGLA QUE HACE ESTO ÚTIL EN VEZ DE MOLESTO ─────────────────────
 * Si no encuentra nada que explique la diferencia, **lo dice**. Una app que
 * siempre tiene una teoría enseña a desconfiar de sus teorías; un «no sé de
 * dónde salió» honesto deja al usuario decidir. Por eso cada sospecha exige que
 * los montos CUADREN con la diferencia, no que se parezcan.
 */

/** Margen al comparar montos: céntimos de redondeo, no «parecidos». */
const TOL = 0.02

/** Días hacia atrás que se miran. Más allá, la pista ya no es accionable. */
const VENTANA_DIAS = 45

export type DriftCauseKind =
  /** Dos movimientos iguales el mismo día: uno detectado y uno a mano. */
  | 'duplicate'
  /** Un movimiento detectado por notificación cuyo monto cuadra con la diferencia. */
  | 'detected-wrong'
  /** La diferencia cuadra con los cargos bancarios de un movimiento. */
  | 'fees'
  /** La diferencia cuadra con un movimiento en divisa extranjera. */
  | 'fx'
  /** Falta dinero y hace mucho que no se anota nada en esta cuenta. */
  | 'unlogged-cash'

export interface DriftCause {
  kind: DriftCauseKind
  /** Movimientos señalados, para poder abrirlos desde el aviso. */
  txIds: string[]
  /** Lo que esta sospecha explicaría de la diferencia. */
  amount: number
}

export interface DriftInput {
  /** La diferencia a explicar: `real − calculado`. Negativa = falta dinero. */
  diff: number
  /** Movimientos de ESTA cuenta, cualquier orden. */
  accountTx: Transaction[]
  today: string
}

function dentroDeVentana(date: string, today: string): boolean {
  const d = Date.parse(`${date}T00:00:00`)
  const t = Date.parse(`${today}T00:00:00`)
  if (!Number.isFinite(d) || !Number.isFinite(t)) return false
  const dias = (t - d) / 86_400_000
  return dias >= 0 && dias <= VENTANA_DIAS
}

function igual(a: number, b: number): boolean {
  return Math.abs(a - b) <= TOL
}

function totalFees(tx: Transaction): number {
  return (tx.fees ?? []).reduce((sum, f) => sum + f.amount, 0)
}

/**
 * Las causas probables, de la más concreta a la más vaga.
 *
 * Se devuelven en orden de utilidad: un duplicado señalado con nombre y
 * apellidos es accionable; «puede que gastaras efectivo sin anotar» es lo
 * último que se dice, y solo cuando no hay nada mejor.
 */
export function driftCauses(input: DriftInput): DriftCause[] {
  const { diff, accountTx, today } = input
  if (Math.abs(diff) < TOL) return []

  const recientes = accountTx.filter(t => dentroDeVentana(t.date, today))
  const falta = Math.abs(diff)
  const causas: DriftCause[] = []

  /*
   * 1. DUPLICADO. El caso más común y el más fácil de arreglar.
   *
   * Falta dinero y hay dos gastos del mismo monto, el mismo día, uno detectado
   * y otro a mano: casi seguro el mismo cobro contado dos veces. Se exige que
   * uno sea detectado — dos compras iguales el mismo día pasan de verdad
   * (dos cafés), y acusar de duplicado a eso sería peor que callarse.
   */
  for (const tx of recientes) {
    if (tx.type === 'transfer') continue
    if (!igual(tx.amount, falta)) continue
    const gemelo = recientes.find(o =>
      o.id !== tx.id
      && o.date === tx.date
      && o.type === tx.type
      && igual(o.amount, tx.amount)
      && (!!o.detectedFrom !== !!tx.detectedFrom))
    if (gemelo) {
      causas.push({ kind: 'duplicate', txIds: [tx.id, gemelo.id], amount: tx.amount })
      break
    }
  }

  /*
   * 2. CARGOS DEL BANCO. La diferencia cuadra justo con los cargos de un
   * movimiento — señal de que el banco cobró algo distinto a lo que se calculó.
   */
  if (!causas.length) {
    const conCargos = recientes.find(t => totalFees(t) > 0 && igual(totalFees(t), falta))
    if (conCargos) {
      causas.push({ kind: 'fees', txIds: [conCargos.id], amount: totalFees(conCargos) })
    }
  }

  /*
   * 3. DIVISA. Una compra en dólares se guardó con la tasa de aquel momento, y
   * el banco la liquidó con otra. La diferencia suele ser pequeña y recurrente.
   */
  if (!causas.length) {
    const enFx = recientes.filter(t => !!t.originalCurrency)
    const sospechoso = enFx.find(t => igual(t.amount * 0.03, falta) || igual(falta, Math.abs(t.amount - (t.originalAmount ?? 0) * (t.fxRate ?? 0))))
    if (sospechoso) {
      causas.push({ kind: 'fx', txIds: [sospechoso.id], amount: falta })
    }
  }

  /*
   * 4. UN MOVIMIENTO DETECTADO CON EL MONTO MAL. Si la diferencia cuadra con
   * un movimiento que entró solo, lo más probable es que se leyera mal el aviso.
   */
  if (!causas.length) {
    const detectado = recientes.find(t => t.detectedFrom === 'notification' && igual(t.amount, falta))
    if (detectado) {
      causas.push({ kind: 'detected-wrong', txIds: [detectado.id], amount: detectado.amount })
    }
  }

  /*
   * 5. EFECTIVO SIN ANOTAR. La explicación más probable cuando no hay ninguna
   * pista: falta dinero y no hay un movimiento que lo explique. Se dice solo si
   * falta (no si sobra) y sin señalar a nadie.
   */
  if (!causas.length && diff < 0) {
    causas.push({ kind: 'unlogged-cash', txIds: [], amount: falta })
  }

  return causas
}

/** La clave de traducción del aviso de cada causa. */
export const DRIFT_CAUSE_KEY: Record<DriftCauseKind, string> = {
  duplicate:       'driftDuplicate',
  'detected-wrong': 'driftDetectedWrong',
  fees:            'driftFees',
  fx:              'driftFx',
  'unlogged-cash': 'driftUnloggedCash',
}

/** Cuántas veces se cuadró esta cuenta en un mes, para notar el patrón. */
export function adjustmentsInMonth(adjustments: Transaction[], mkey: string): { count: number; net: number } {
  const delMes = adjustments.filter(t => monthKey(t.date) === mkey)
  const net = delMes.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0)
  return { count: delMes.length, net: Math.round(net * 100) / 100 }
}
