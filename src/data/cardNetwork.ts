import type { Account, AccountType, CardNetwork } from '@/types'

/**
 * RED DE LA TARJETA (Visa, Mastercard…) y naturaleza de la cuenta.
 *
 * Una app de finanzas se siente profesional cuando reconoces tu tarjeta de un
 * vistazo, sin leer. Eso lo da la red — la marca que está impresa en el
 * plástico — no el nombre que el usuario le puso.
 */

export interface NetworkMeta {
  id: CardNetwork
  name: string
  /** Color de la marca, solo para el distintivo — nunca como fondo de la tarjeta. */
  color: string
  /** Primer dígito del número que identifica a esta red (regla ISO/IEC 7812). */
  bin?: string
}

export const CARD_NETWORKS: NetworkMeta[] = [
  { id: 'visa',       name: 'Visa',        color: '#1a1f71', bin: '4' },
  { id: 'mastercard', name: 'Mastercard',  color: '#eb001b', bin: '5' },
  { id: 'amex',       name: 'Amex',        color: '#006fcf', bin: '3' },
  { id: 'discover',   name: 'Discover',    color: '#ff6000', bin: '6' },
  { id: 'other',      name: 'Otra',        color: '#8a93a6' },
]

export function networkMeta(id: CardNetwork | undefined): NetworkMeta | null {
  if (!id) return null
  return CARD_NETWORKS.find(n => n.id === id) ?? null
}

/**
 * Adivina la red por el nombre de la cuenta ("Visa Clásica", "Mastercard
 * Gold"). Devuelve null si no hay señal clara: poner la marca equivocada en
 * una tarjeta es peor que no poner ninguna — el usuario deja de confiar en lo
 * que lee.
 *
 * NO se adivina por los últimos 4 dígitos: la red se identifica por el
 * PRIMER dígito del número, que la app nunca guarda.
 */
export function guessNetwork(name: string): CardNetwork | null {
  const haystack = name.toLowerCase()
  if (/\bvisa\b/.test(haystack)) return 'visa'
  if (/master\s?card|\bmc\b/.test(haystack)) return 'mastercard'
  if (/\bamex\b|american\s?express/.test(haystack)) return 'amex'
  if (/\bdiscover\b/.test(haystack)) return 'discover'
  return null
}

/**
 * Las cuentas que llevan una tarjeta física y por tanto pueden tener red.
 * Una cuenta de efectivo o una alcancía no tienen plástico.
 */
export function canHaveNetwork(type: AccountType): boolean {
  return type === 'debit' || type === 'credit' || type === 'savings'
}

// ── Efectivo: una sola cuenta ──────────────────────────────

/**
 * El efectivo es UNO. No tienes "dos efectivos": tienes el dinero que cargas
 * encima. Permitir varios convertía la lista en un montón de cuentas de
 * efectivo indistinguibles, que es justo lo que hace que una app se sienta
 * desordenada.
 *
 * Para guardar efectivo aparte (una alcancía, un sobre) existe el tipo
 * AHORRO, que es lo que de verdad es: ahorro que no está en un banco.
 */
export function cashAccountOf(accounts: Account[]): Account | null {
  return accounts.find(a => a.type === 'cash') ?? null
}

export function canCreateCash(accounts: Account[]): boolean {
  return cashAccountOf(accounts) === null
}

/**
 * Los tipos que el usuario puede elegir al CREAR, dado lo que ya existe.
 * Si ya hay efectivo, deja de ofrecerse en vez de dejar que lo elija y
 * fallar al guardar — un control que no se puede usar no debe estar activo.
 */
export function creatableTypes(accounts: Account[], editingType?: AccountType): AccountType[] {
  const all: AccountType[] = ['debit', 'savings', 'credit', 'cash']
  // Al EDITAR la cuenta de efectivo, su propio tipo sigue disponible.
  if (editingType === 'cash' || canCreateCash(accounts)) return all
  return all.filter(t => t !== 'cash')
}

/**
 * El efectivo no se borra: es la cuenta base de la app y siempre hay un
 * bolsillo. Se puede vaciar, no eliminar.
 */
export function canDeleteAccountType(account: Account): boolean {
  return account.type !== 'cash'
}
