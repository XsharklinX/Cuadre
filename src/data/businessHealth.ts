import { outstanding, type Charge, type Client } from './clients'
import type { Caprice } from './caprices'
import type { Business, Service } from './business'
import type { Account, Category, Transaction } from '@/types'

/**
 * SALUD DE LOS DATOS DE NEGOCIO.
 *
 * ── POR QUÉ HACÍA FALTA ───────────────────────────────────────────────
 * «Salud de datos» es la pantalla que el usuario abre cuando algo le huele mal,
 * y la que detecta los saldos derivados antes de que se conviertan en un
 * descuadre. No sabía que existieran clientes ni cobros: diría «todo correcto»
 * con cobros apuntando a movimientos borrados.
 *
 * La mitad nueva de la app no tenía las redes que tiene la mitad vieja. Esto
 * son esas redes.
 *
 * ── CADA PROBLEMA SE PUEDE ARREGLAR ───────────────────────────────────
 * Detectar sin poder arreglar solo sirve para preocupar, así que cada caso
 * trae lo que hace falta para resolverlo: los ids concretos, no un recuento.
 */

export type BusinessIssueKind =
  /** Cobros marcados pagados cuyo movimiento ya no está en el libro. */
  | 'charge-no-tx'
  /** Cobros cuyo cliente ya no existe. */
  | 'charge-no-client'
  /** Clientes que depositan en una cuenta borrada: no se pueden cobrar. */
  | 'client-no-account'
  /** Clientes cuya categoría de ingreso ya no existe. */
  | 'client-no-category'
  /** Caprichos cuyo gasto ya no está en el libro. */
  | 'caprice-no-tx'
  /** Aportes a caprichos cuyo movimiento ya no está. */
  | 'caprice-payment-no-tx'
  /** Servicios cuyo negocio desapareció. */
  | 'service-no-business'
  /** Negocios sin categorías: su ganancia siempre será cero. */
  | 'business-no-categories'

export interface BusinessIssue {
  kind: BusinessIssueKind
  /** Los ids afectados, para poder arreglarlos uno a uno. */
  ids: string[]
}

export interface BusinessHealthInput {
  clients: Client[]
  businesses: Business[]
  services: Service[]
  charges: Charge[]
  caprices: Caprice[]
  transactions: Transaction[]
  accounts: Account[]
  categories: Category[]
}

export interface BusinessHealth {
  clients: number
  charges: number
  /** Lo que falta por cobrar, para tenerlo a la vista aquí también. */
  outstanding: number
  businesses: number
  caprices: number
  issues: BusinessIssue[]
}

export function businessHealth(input: BusinessHealthInput): BusinessHealth {
  const {
    clients, businesses, services, charges, caprices,
    transactions, accounts, categories,
  } = input

  const txIds = new Set(transactions.map(t => t.id))
  const clientIds = new Set(clients.map(c => c.id))
  const businessIds = new Set(businesses.map(b => b.id))
  const accountIds = new Set(accounts.map(a => a.id))
  const categoryIds = new Set(categories.map(c => c.id))

  const issues: BusinessIssue[] = []
  const push = (kind: BusinessIssueKind, ids: string[]) => {
    if (ids.length) issues.push({ kind, ids })
  }

  /*
   * El peor de todos, y el que motivó esta pantalla: un cobro que dice estar
   * pagado y cuyo movimiento no está. El libro dice una cosa y la lista de
   * clientes otra, y nadie sabe cuál creer.
   */
  push('charge-no-tx', charges
    .filter(c => c.txIds.length > 0 && c.txIds.some(id => !txIds.has(id)))
    .map(c => c.id))

  push('charge-no-client', charges.filter(c => !clientIds.has(c.clientId)).map(c => c.id))

  /*
   * Un cliente sin cuenta no se puede cobrar, y hasta ahora el botón se
   * quedaba apagado sin decir por qué: el peor tipo de fallo, porque la app no
   * está rota pero se comporta como si lo estuviera.
   */
  push('client-no-account', clients
    .filter(c => c.active && (!c.accountId || !accountIds.has(c.accountId)))
    .map(c => c.id))

  push('client-no-category', clients
    .filter(c => c.active && (!c.categoryId || !categoryIds.has(c.categoryId)))
    .map(c => c.id))

  push('caprice-no-tx', caprices.filter(c => !txIds.has(c.txId)).map(c => c.id))

  push('caprice-payment-no-tx', caprices
    .filter(c => c.payments.some(p => !txIds.has(p.txId)))
    .map(c => c.id))

  push('service-no-business', services.filter(s => !businessIds.has(s.businessId)).map(s => s.id))

  /*
   * Un negocio sin categorías no es un error del sistema, pero su ganancia
   * será cero para siempre y el usuario no tiene forma de adivinar por qué.
   * Vale más decírselo que dejarlo mirando un cero.
   */
  push('business-no-categories', businesses
    .filter(b => b.incomeCategoryIds.length === 0 && b.expenseCategoryIds.length === 0)
    .map(b => b.id))

  return {
    clients: clients.length,
    charges: charges.length,
    outstanding: Math.round(charges
      .filter(c => !c.waived)
      .reduce((sum, c) => sum + outstanding(c), 0) * 100) / 100,
    businesses: businesses.length,
    caprices: caprices.length,
    issues,
  }
}

/** La clave de traducción de cada problema. */
export const BUSINESS_ISSUE_KEY: Record<BusinessIssueKind, string> = {
  'charge-no-tx':           'bhChargeNoTx',
  'charge-no-client':       'bhChargeNoClient',
  'client-no-account':      'bhClientNoAccount',
  'client-no-category':     'bhClientNoCategory',
  'caprice-no-tx':          'bhCapriceNoTx',
  'caprice-payment-no-tx':  'bhCapricePaymentNoTx',
  'service-no-business':    'bhServiceNoBusiness',
  'business-no-categories': 'bhBusinessNoCategories',
}

/**
 * Los problemas que se pueden arreglar SOLOS, sin pedir nada al usuario.
 *
 * Los demás necesitan una decisión —a qué cuenta mueves ese cliente, qué
 * categoría le pones— y arreglarlos por él sería elegir en su nombre algo que
 * afecta a su dinero.
 */
export const AUTO_FIXABLE: BusinessIssueKind[] = [
  'charge-no-tx',
  'charge-no-client',
  'caprice-no-tx',
  'caprice-payment-no-tx',
  'service-no-business',
]

export function isAutoFixable(kind: BusinessIssueKind): boolean {
  return AUTO_FIXABLE.includes(kind)
}
