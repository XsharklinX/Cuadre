/**
 * CATÁLOGO DE BANCOS.
 *
 * Se elige de una lista, nunca se escribe. Si cada quien teclea "Banreservas",
 * "banreservas", "Banco de Reservas" o "BanReservas", el id no coincide y las
 * comisiones automáticas dejan de aplicarse — el usuario ve un campo relleno y
 * un comportamiento que no ocurre.
 *
 * IMPORTANTE — identidad ≠ comisiones. Este archivo solo IDENTIFICA al banco.
 * Las tarifas viven en `bankFees.ts` y existen únicamente para los bancos cuyo
 * tarifario conocemos. Inventar un recargo para los cuarenta bancos de esta
 * lista haría que la app cobre montos que el banco real no cobra, que es peor
 * que no calcular nada: `hasFeeProfile()` dice cuáles tienen datos.
 */

export type BankCountry = 'do' | 'intl'

export interface Bank {
  id: string
  name: string
  country: BankCountry
  /** Categoría, para agrupar la lista. */
  kind: 'bank' | 'savings' | 'coop' | 'wallet'
  /** Nombres alternativos y siglas, para que el buscador los encuentre. */
  aka?: string[]
}

/**
 * República Dominicana. Ordenado por uso real, no alfabéticamente: quien
 * abre la lista casi siempre busca uno de los primeros cinco.
 */
const DO_BANKS: Bank[] = [
  // ── Bancos múltiples ──
  { id: 'banreservas',   name: 'Banreservas',              country: 'do', kind: 'bank', aka: ['banco de reservas', 'reservas', 'br'] },
  { id: 'popular',       name: 'Banco Popular Dominicano', country: 'do', kind: 'bank', aka: ['popular', 'bpd'] },
  { id: 'bhd',           name: 'Banco BHD',                country: 'do', kind: 'bank', aka: ['bhd leon', 'bhd león'] },
  { id: 'scotiabank-do', name: 'Scotiabank',               country: 'do', kind: 'bank', aka: ['scotia'] },
  { id: 'santa-cruz',    name: 'Banco Santa Cruz',         country: 'do', kind: 'bank', aka: ['santacruz'] },
  { id: 'banco-caribe',  name: 'Banco Caribe',             country: 'do', kind: 'bank', aka: ['bancaribe', 'caribe'] },
  { id: 'promerica',     name: 'Banco Promerica',          country: 'do', kind: 'bank', aka: ['promérica'] },
  { id: 'banesco-do',    name: 'Banesco',                  country: 'do', kind: 'bank' },
  { id: 'lafise',        name: 'Banco Lafise',             country: 'do', kind: 'bank' },
  { id: 'bdi',           name: 'Banco BDI',                country: 'do', kind: 'bank' },
  { id: 'vimenca',       name: 'Banco Vimenca',            country: 'do', kind: 'bank', aka: ['vimenpaq'] },
  { id: 'bancamerica',   name: 'Bancamérica',              country: 'do', kind: 'bank', aka: ['bancamerica'] },
  { id: 'ademi',         name: 'Banco Ademi',              country: 'do', kind: 'bank' },
  { id: 'bellbank',      name: 'BellBank',                 country: 'do', kind: 'bank', aka: ['bell bank'] },
  { id: 'agricola',      name: 'Banco Agrícola',           country: 'do', kind: 'bank', aka: ['agricola'] },
  { id: 'bandex',        name: 'Bandex',                   country: 'do', kind: 'bank', aka: ['banco nacional de las exportaciones'] },

  // ── Asociaciones de ahorros y préstamos ──
  { id: 'apap',          name: 'APAP',                     country: 'do', kind: 'savings', aka: ['asociacion popular', 'asociación popular de ahorros y préstamos'] },
  { id: 'cibao',         name: 'Asociación Cibao',         country: 'do', kind: 'savings', aka: ['acap', 'asociacion cibao'] },
  { id: 'la-nacional',   name: 'Asociación La Nacional',   country: 'do', kind: 'savings', aka: ['alnap', 'la nacional'] },
  { id: 'alaver',        name: 'ALAVER',                   country: 'do', kind: 'savings', aka: ['asociacion la vega real', 'la vega real'] },
  { id: 'duarte',        name: 'Asociación Duarte',        country: 'do', kind: 'savings' },
  { id: 'romana',        name: 'Asociación Romana',        country: 'do', kind: 'savings' },
  { id: 'peravia',       name: 'Asociación Peravia',       country: 'do', kind: 'savings' },
  { id: 'mocana',        name: 'Asociación Mocana',        country: 'do', kind: 'savings' },
  { id: 'maguana',       name: 'Asociación Maguana',       country: 'do', kind: 'savings' },
  { id: 'barahona',      name: 'Asociación Barahona',      country: 'do', kind: 'savings' },
  { id: 'noroestana',    name: 'Asociación Noroestana',    country: 'do', kind: 'savings' },
  { id: 'bonao',         name: 'Asociación Bonao',         country: 'do', kind: 'savings' },

  // ── Bancos de ahorro y crédito ──
  { id: 'motor-credito', name: 'Banco Motor Crédito',      country: 'do', kind: 'bank', aka: ['motorcredito', 'motor credito'] },
  { id: 'confisa',       name: 'Banco Confisa',            country: 'do', kind: 'bank' },
  { id: 'fihogar',       name: 'Banco Fihogar',            country: 'do', kind: 'bank' },
  { id: 'atlantico',     name: 'Banco Atlántico',          country: 'do', kind: 'bank', aka: ['atlantico'] },
  { id: 'bancotui',      name: 'Bancotui',                 country: 'do', kind: 'bank' },
  { id: 'empire',        name: 'Banco Empire',             country: 'do', kind: 'bank' },

  // ── Cooperativas ──
  { id: 'coop-vega-real', name: 'Cooperativa Vega Real',   country: 'do', kind: 'coop' },
  { id: 'coopherrera',    name: 'Coopherrera',             country: 'do', kind: 'coop' },
  { id: 'coop-san-jose',  name: 'Cooperativa San José',    country: 'do', kind: 'coop', aka: ['coop san jose'] },

  // ── Billeteras y medios de pago ──
  { id: 'qik',           name: 'Qik Banco Digital',        country: 'do', kind: 'wallet', aka: ['qik'] },
  { id: 'tpago',         name: 'tPago',                    country: 'do', kind: 'wallet' },
  { id: 'azul',          name: 'Azul',                     country: 'do', kind: 'wallet' },
  { id: 'cardnet',       name: 'CardNet',                  country: 'do', kind: 'wallet' },
]

/** Internacionales de uso frecuente entre quienes viven o reciben desde fuera. */
const INTL_BANKS: Bank[] = [
  { id: 'bofa',          name: 'Bank of America',      country: 'intl', kind: 'bank', aka: ['boa'] },
  { id: 'chase',         name: 'Chase',                country: 'intl', kind: 'bank', aka: ['jpmorgan', 'jp morgan'] },
  { id: 'wells-fargo',   name: 'Wells Fargo',          country: 'intl', kind: 'bank' },
  { id: 'citibank',      name: 'Citibank',             country: 'intl', kind: 'bank', aka: ['citi'] },
  { id: 'capital-one',   name: 'Capital One',          country: 'intl', kind: 'bank' },
  { id: 'amex-bank',     name: 'American Express',     country: 'intl', kind: 'bank', aka: ['amex'] },
  { id: 'discover-bank', name: 'Discover',             country: 'intl', kind: 'bank' },
  { id: 'td-bank',       name: 'TD Bank',              country: 'intl', kind: 'bank' },
  { id: 'pnc',           name: 'PNC Bank',             country: 'intl', kind: 'bank' },
  { id: 'us-bank',       name: 'U.S. Bank',            country: 'intl', kind: 'bank' },
  { id: 'hsbc',          name: 'HSBC',                 country: 'intl', kind: 'bank' },
  { id: 'santander',     name: 'Santander',            country: 'intl', kind: 'bank' },
  { id: 'bbva',          name: 'BBVA',                 country: 'intl', kind: 'bank' },
  { id: 'scotiabank',    name: 'Scotiabank (Canadá)',  country: 'intl', kind: 'bank' },
  { id: 'popular-pr',    name: 'Banco Popular (P.R.)', country: 'intl', kind: 'bank', aka: ['popular puerto rico'] },
  { id: 'revolut',       name: 'Revolut',              country: 'intl', kind: 'wallet' },
  { id: 'wise',          name: 'Wise',                 country: 'intl', kind: 'wallet', aka: ['transferwise'] },
  { id: 'n26',           name: 'N26',                  country: 'intl', kind: 'wallet' },
  { id: 'nubank',        name: 'Nubank',               country: 'intl', kind: 'wallet' },
  { id: 'mercado-pago',  name: 'Mercado Pago',         country: 'intl', kind: 'wallet' },
  { id: 'paypal',        name: 'PayPal',               country: 'intl', kind: 'wallet' },
  { id: 'zelle',         name: 'Zelle',                country: 'intl', kind: 'wallet' },
]

export const BANKS: Bank[] = [...DO_BANKS, ...INTL_BANKS]

export function findBank(id: string | undefined): Bank | null {
  if (!id) return null
  return BANKS.find(b => b.id === id) ?? null
}

/** Quita acentos y baja a minúsculas: "Promérica" debe encontrarse con "promerica". */
function normalize(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Busca bancos por nombre o alias. Sin consulta devuelve la lista completa,
 * con los dominicanos primero: la app se usa en RD y buscar el propio banco no
 * debería exigir scroll.
 */
export function searchBanks(query: string): Bank[] {
  const q = normalize(query.trim())
  if (!q) return BANKS
  return BANKS.filter(bank =>
    normalize(bank.name).includes(q)
    || (bank.aka ?? []).some(alias => normalize(alias).includes(q)))
}

/**
 * Adivina el banco por el nombre de la cuenta ("Visa Banreservas"). El alias
 * MÁS LARGO gana, para que "banco caribe" le gane a "caribe".
 *
 * Devuelve null si no hay coincidencia clara: sugerir el banco equivocado
 * haría que el usuario acepte comisiones que no son las suyas.
 */
export function guessBank(accountName: string): Bank | null {
  const haystack = normalize(accountName)
  const matches = BANKS
    .flatMap(bank => [bank.name, ...(bank.aka ?? [])].map(term => ({ bank, term: normalize(term) })))
    // Términos de menos de 3 letras generan falsos positivos ("br" dentro de
    // cualquier palabra), así que no se usan para adivinar.
    .filter(({ term }) => term.length >= 3 && haystack.includes(term))
    .sort((a, b) => b.term.length - a.term.length)
  return matches[0]?.bank ?? null
}
