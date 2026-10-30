import type { Business } from './business'
import type { Transaction } from '@/types'

/**
 * NEGOCIO Y PERSONAL, SEPARADOS EN LOS INFORMES.
 *
 * ── POR QUÉ HACE FALTA ────────────────────────────────────────────────
 * Los informes miraban el libro entero, y para quien cobra a clientes eso
 * mezcla dos cosas que no se comparan: lo que gana vendiendo y lo que gasta
 * viviendo. «Gastaste un 40% más que el mes pasado» no dice nada si la subida
 * fue comprar otra cuenta de Netflix para cinco clientes nuevos.
 *
 * Al revés también: una tasa de ahorro calculada sobre los ingresos del
 * negocio parece buenísima el mes que entraron todos los cobros, y el usuario
 * concluye que puede gastar más de lo que puede.
 *
 * ── CÓMO SE DECIDE QUÉ ES DE NEGOCIO ──────────────────────────────────
 * Por las CATEGORÍAS que el usuario ya declaró en cada negocio. No hay una
 * marca nueva que rellenar ni nada que adivinar: lo que hace que un cobro
 * cuente para la ganancia de un negocio es exactamente lo que lo hace de
 * negocio aquí. Una sola definición, y no dos que acabarían discrepando.
 *
 * Las transferencias no son de nadie: mover dinero entre tus cuentas no es
 * ingreso ni gasto, y los informes ya las excluyen de los totales.
 */

export type ReportScope = 'all' | 'business' | 'personal'

/** Las categorías que pertenecen a algún negocio, de ingreso o de gasto. */
export function businessCategoryIds(businesses: Business[]): Set<string> {
  const fuera = new Set<string>()
  for (const b of businesses) {
    for (const id of b.incomeCategoryIds) fuera.add(id)
    for (const id of b.expenseCategoryIds) fuera.add(id)
  }
  return fuera
}

/**
 * Filtra un libro por ámbito.
 *
 * Con `all` devuelve la MISMA lista, no una copia: así el camino de siempre
 * —que es el de casi todo el mundo— no paga nada por esta función, y lo que
 * depende de la identidad del array (los `useMemo` de la pantalla) no se
 * recalcula sin motivo.
 */
export function scopeTransactions(
  txns: Transaction[],
  businesses: Business[],
  scope: ReportScope,
  /**
   * De quién es cada movimiento (ver `attribution.ts`). Con él, un cobro de un
   * cliente o un pago de servicio son del negocio aunque su categoría no lo
   * sea: la misma frontera que usa Ganancia, para que las dos pantallas no se
   * contradigan.
   */
  owner?: (tx: Transaction) => { businessId: string } | null,
): Transaction[] {
  if (scope === 'all') return txns
  if (owner && businesses.length) {
    return txns.filter(tx => {
      if (tx.type === 'transfer') return scope === 'personal'
      const esNegocio = owner(tx) !== null
      return scope === 'business' ? esNegocio : !esNegocio
    })
  }
  const deNegocio = businessCategoryIds(businesses)
  // Sin negocios con categorías no hay frontera que trazar: «solo personal»
  // sería todo y «solo negocio» sería nada, y ninguna de las dos respuestas
  // ayuda. Se devuelve todo y la pantalla no ofrece el selector.
  if (deNegocio.size === 0) return txns

  return txns.filter(tx => {
    // Una transferencia no es de nadie: cambia de bolsillo, no de dueño.
    if (tx.type === 'transfer') return scope === 'personal'
    const esNegocio = !!tx.categoryId && deNegocio.has(tx.categoryId)
    return scope === 'business' ? esNegocio : !esNegocio
  })
}

/** Si merece la pena ofrecer el selector: hace falta una frontera real. */
export function canScope(businesses: Business[]): boolean {
  return businessCategoryIds(businesses).size > 0
}
