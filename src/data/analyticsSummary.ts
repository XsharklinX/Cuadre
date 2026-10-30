import { categoryParts } from './helpers'
import type { Business } from './business'
import type { Category, Transaction } from '@/types'

/**
 * LO QUE ANÁLISIS NO SABÍA MIRAR.
 *
 * La pantalla resumía el libro como si solo hubiera gastos de comida: no
 * sabía que existían negocios, ni cuánto de lo que entra viene de ellos, ni
 * a dónde se va el mes en una sola mirada. Todo lo de aquí son cifras que la
 * app ya tenía; lo único que faltaba era que esta pantalla las calculara.
 */

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

export interface Share {
  /** `null` es «Lo demás»: todo lo que no entra en las primeras. */
  category: Category | null
  amount: number
  /** Porcentaje entero. Los de una lista suman exactamente 100. */
  pct: number
}

/**
 * A DÓNDE SE FUE EL MES: las categorías que más pesan, y el resto junto.
 *
 * ── POR QUÉ LOS PORCENTAJES SUMAN 100 EXACTO ──────────────────────────
 * Redondear cada uno por su cuenta da 99 o 101 a menudo, y una barra que dice
 * 47 + 22 + 15 + 10 + 7 = 101 hace dudar de todo lo demás de la pantalla.
 * Se reparte el redondeo con el método del mayor resto: los que más perdieron
 * al redondear hacia abajo reciben el punto que falta.
 */
export function spendShares(txns: Transaction[], categories: Category[], top = 5): Share[] {
  const porCat = new Map<string, number>()
  for (const tx of txns) {
    if (tx.type !== 'expense') continue
    for (const parte of categoryParts(tx)) {
      if (!parte.categoryId) continue
      porCat.set(parte.categoryId, (porCat.get(parte.categoryId) ?? 0) + parte.amount)
    }
  }

  const total = [...porCat.values()].reduce((a, b) => a + b, 0)
  if (!(total > 0)) return []

  const ordenadas = [...porCat.entries()]
    .map(([id, amount]) => ({ category: categories.find(c => c.id === id) ?? null, amount }))
    .filter(x => x.category !== null)
    .sort((a, b) => b.amount - a.amount)

  const primeras = ordenadas.slice(0, top)
  const resto = ordenadas.slice(top).reduce((sum, x) => sum + x.amount, 0)
  const filas: Array<{ category: Category | null; amount: number }> = [...primeras]
  // «Lo demás» solo si existe: una fila a cero no dice nada.
  if (resto > 0) filas.push({ category: null, amount: resto })

  // Mayor resto, para que la suma sea exactamente 100.
  const brutos = filas.map(f => (f.amount / total) * 100)
  const enteros = brutos.map(Math.floor)
  let falta = 100 - enteros.reduce((a, b) => a + b, 0)
  const porResto = brutos
    .map((b, i) => ({ i, resto: b - Math.floor(b) }))
    .sort((a, b) => b.resto - a.resto)
  for (const { i } of porResto) {
    if (falta <= 0) break
    enteros[i] += 1
    falta -= 1
  }

  return filas.map((f, i) => ({ category: f.category, amount: cents(f.amount), pct: enteros[i] }))
}

export interface BusinessIncome {
  /** Lo que entró en el período por categorías de algún negocio. */
  fromBusiness: number
  /** Todo lo que entró en el período. */
  total: number
  /** Porcentaje entero. `null` si no entró nada: no hay de qué sacar parte. */
  pct: number | null
}

/**
 * CUÁNTO DE LO QUE ENTRA VIENE DEL NEGOCIO.
 *
 * Por las categorías que el usuario ya declaró en cada negocio: la misma
 * definición que usa la ganancia y el filtro de Negocio o Personal. Una sola
 * frontera, para que las tres pantallas no se contradigan.
 */
export function businessIncome(
  txns: Transaction[],
  businesses: Business[],
  /** De quién es cada movimiento: con él, la misma frontera que Ganancia. */
  owner?: (tx: Transaction) => { businessId: string } | null,
): BusinessIncome {
  const deNegocio = new Set(businesses.flatMap(b => b.incomeCategoryIds))
  const vivos = new Set(businesses.map(b => b.id))
  let fromBusiness = 0, total = 0
  for (const tx of txns) {
    if (tx.type !== 'income') continue
    total += tx.amount
    const es = owner
      ? (() => { const o = owner(tx); return !!o && vivos.has(o.businessId) })()
      : !!tx.categoryId && deNegocio.has(tx.categoryId)
    if (es) fromBusiness += tx.amount
  }
  return {
    fromBusiness: cents(fromBusiness),
    total: cents(total),
    pct: total > 0 ? Math.round((fromBusiness / total) * 100) : null,
  }
}

/**
 * EL ORDEN DE LOS ACORDEONES: los que más abres, arriba.
 *
 * Estaban siempre en el mismo orden, así que daba igual cuál usaras: el tuyo
 * podía quedarse el cuarto para siempre. Se ordena por las veces que lo has
 * abierto, que es un dato que se mide, en vez de por una idea de qué es
 * «importante» que no sabe nada de ti.
 *
 * A igualdad se respeta el orden de diseño: sin uso todavía, la pantalla es la
 * de siempre, y no se baraja sola el primer día.
 */
export function foldOrder<T extends string>(ids: T[], opens: Partial<Record<T, number>>): T[] {
  return ids
    .map((id, i) => ({ id, i, n: opens[id] ?? 0 }))
    .sort((a, b) => (b.n - a.n) || (a.i - b.i))
    .map(x => x.id)
}
