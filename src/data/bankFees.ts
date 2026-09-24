import type { CurrencyCode } from '@/types'

/**
 * COMISIONES E IMPUESTOS BANCARIOS (República Dominicana).
 *
 * Lo que el usuario llama "el interés que cobra Banreservas" en una
 * transacción casi nunca es interés de financiamiento: es una comisión o un
 * impuesto que se aplica EN EL MOMENTO del movimiento. Son cosas distintas y
 * se modelan aparte:
 *
 * - El interés de financiamiento (`Account.apr`) se calcula sobre el saldo al
 *   corte, una vez al mes. Vive en `creditCard.ts`.
 * - Una comisión se aplica sobre ESTE movimiento y se cobra ya. Vive aquí.
 *
 * Mezclarlas daría números mal en las dos direcciones.
 *
 * IMPORTANTE SOBRE LAS TASAS: son valores POR DEFECTO, tomados de los
 * tarifarios publicados, y los bancos los cambian sin avisar. Siempre son
 * editables y siempre se muestran desglosadas antes de guardar — la app nunca
 * suma un cargo que el usuario no pueda ver y corregir.
 */

export type FeeKind =
  /** Impuesto a cheques y transferencias electrónicas (Ley 288-04). */
  | 'itbis-transfer'
  /** Recargo por compra en divisa distinta a la de la tarjeta. */
  | 'fx-surcharge'
  /** Comisión por avance de efectivo. */
  | 'cash-advance'

export interface FeeRule {
  kind: FeeKind
  /** Porcentaje sobre el monto (0.15 = 0.15%). */
  pct: number
  /** Cargo fijo adicional, en la divisa de la cuenta. */
  flat?: number
  /** Piso del cargo calculado. */
  min?: number
  /** Techo del cargo calculado. */
  max?: number
}

export interface BankProfile {
  id: string
  name: string
  /** Fragmentos que identifican al banco en el nombre de una cuenta o en un aviso. */
  hints: string[]
  rules: FeeRule[]
}

/**
 * El 0.15% de la Ley 288-04 aplica a cheques y transferencias electrónicas en
 * TODOS los bancos del país, no es de ninguno en particular.
 */
export const ITBIS_TRANSFER_PCT = 0.15

export const BANK_PROFILES: BankProfile[] = [
  {
    id: 'banreservas',
    name: 'Banreservas',
    hints: ['banreservas', 'reservas', 'tarjeta reservas'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
      { kind: 'cash-advance', pct: 5, min: 150 },
    ],
  },
  {
    id: 'popular',
    name: 'Banco Popular',
    hints: ['popular', 'bpd'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
      { kind: 'cash-advance', pct: 5, min: 150 },
    ],
  },
  {
    id: 'bhd',
    name: 'BHD',
    hints: ['bhd', 'bhd leon', 'bhd león'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
      { kind: 'cash-advance', pct: 5, min: 150 },
    ],
  },
  {
    id: 'scotiabank-do',
    name: 'Scotiabank',
    hints: ['scotiabank', 'scotia'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3.5 },
      { kind: 'cash-advance', pct: 5, min: 150 },
    ],
  },
  {
    id: 'apap',
    name: 'APAP',
    hints: ['apap', 'asociacion popular', 'asociación popular'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
    ],
  },
  {
    id: 'banco-caribe',
    name: 'Banco Caribe',
    hints: ['banco caribe', 'caribe'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
    ],
  },
  {
    id: 'promerica',
    name: 'Promerica',
    hints: ['promerica', 'promérica'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
    ],
  },
  {
    id: 'santa-cruz',
    name: 'Banco Santa Cruz',
    hints: ['santa cruz'],
    rules: [
      { kind: 'itbis-transfer', pct: ITBIS_TRANSFER_PCT },
      { kind: 'fx-surcharge', pct: 3 },
    ],
  },
]

/**
 * Adivina el banco por el nombre de la cuenta. Devuelve null si no hay una
 * coincidencia clara: se prefiere no sugerir nada antes que sugerir el banco
 * equivocado y que el usuario acepte un cargo que no es el suyo.
 */
export function guessBankProfile(accountName: string): BankProfile | null {
  const haystack = accountName.toLowerCase()
  // El hint más largo gana: "banco caribe" debe ganarle a "caribe", y
  // "bhd leon" a "bhd".
  const matches = BANK_PROFILES
    .flatMap(profile => profile.hints.map(hint => ({ profile, hint })))
    .filter(({ hint }) => haystack.includes(hint))
    .sort((a, b) => b.hint.length - a.hint.length)
  return matches[0]?.profile ?? null
}

export function findBankProfile(id: string | undefined): BankProfile | null {
  return BANK_PROFILES.find(p => p.id === id) ?? null
}

/**
 * true si de este banco CONOCEMOS el tarifario.
 *
 * El catálogo (`banks.ts`) tiene ~60 entidades; aquí solo están las pocas
 * cuyas tarifas publicadas conocemos. Inventar un recargo para las demás haría
 * que la app cobre montos que el banco real no cobra — peor que no calcular
 * nada. La UI usa esto para decir con franqueza cuándo no va a sugerir cargos.
 */
export function hasFeeProfile(id: string | undefined): boolean {
  return findBankProfile(id) !== null
}

export function ruleFor(profile: BankProfile | null, kind: FeeKind): FeeRule | null {
  return profile?.rules.find(r => r.kind === kind) ?? null
}

export interface FeeLine {
  kind: FeeKind
  /** Porcentaje efectivamente aplicado, para poder mostrarlo. */
  pct: number
  amount: number
}

/** Aplica una regla a un monto. Redondea a 2 decimales (centavos). */
export function applyRule(rule: FeeRule, base: number): number {
  if (base <= 0) return 0
  let fee = base * (rule.pct / 100) + (rule.flat ?? 0)
  if (rule.min !== undefined) fee = Math.max(fee, rule.min)
  if (rule.max !== undefined) fee = Math.min(fee, rule.max)
  // Un cargo nunca puede superar al monto que lo genera: un piso de RD$150
  // sobre un avance de RD$100 sería un número que el banco no cobra así.
  return Math.round(Math.min(fee, base) * 100) / 100
}

export interface FeeContext {
  /** Banco de la cuenta, si se conoce. */
  profile: BankProfile | null
  /** Divisa en que se tecleó el movimiento. */
  typedCurrency: CurrencyCode
  /** Divisa de la cuenta (o del libro al que va el movimiento). */
  accountCurrency: CurrencyCode
  /** true si el usuario marcó el movimiento como transferencia/cheque. */
  isTransfer?: boolean
  /** true si el usuario marcó el movimiento como avance de efectivo. */
  isCashAdvance?: boolean
  /**
   * De dónde sale el dinero. Es lo que decide si aplica la Ley 288-04.
   *
   * `debit` incluye cuentas corrientes y de ahorro: el pago sale de tu cuenta
   * como cargo electrónico y el banco retiene el 0.15%.
   * `credit` NO lo paga al comprar — una compra con tarjeta de crédito no
   * debita tu cuenta; el impuesto llega después, cuando PAGAS la tarjeta desde
   * una cuenta de banco, y ahí ya se cobra como transferencia.
   * `cash` no toca el sistema bancario: no hay impuesto que cobrar.
   */
  payerType?: 'debit' | 'credit' | 'cash'
  /**
   * true si el movimiento va de una cuenta tuya a otra cuenta tuya.
   *
   * Moverte dinero entre tus propios bolsillos no es un gasto y no debe
   * cargarte un impuesto de gasto en el libro.
   */
  ownTransfer?: boolean
  /**
   * El usuario apagó el cálculo del 0.15%. Por defecto está encendido, pero
   * no todos los bancos lo retienen igual ni en todas las operaciones, así que
   * tiene que poder quitarse sin pelear con la app.
   */
  lawTaxDisabled?: boolean
}

/**
 * Los cargos que corresponden a un movimiento, ya calculados y desglosados.
 *
 * Devuelve una LISTA, no un total: el usuario tiene que poder ver de dónde
 * sale cada peso. Un total agregado es exactamente lo que hace que un cargo
 * bancario se sienta arbitrario.
 */
export function computeFees(base: number, ctx: FeeContext): FeeLine[] {
  if (base <= 0 || !ctx.profile) return []
  const lines: FeeLine[] = []

  const add = (kind: FeeKind) => {
    const rule = ruleFor(ctx.profile, kind)
    if (!rule) return
    const amount = applyRule(rule, base)
    if (amount > 0) lines.push({ kind, pct: rule.pct, amount })
  }

  /*
   * ENTRE CUENTAS PROPIAS NO SE COBRA NADA.
   *
   * Pasar dinero de tu ahorro a tu corriente no es un gasto: es el mismo
   * dinero cambiando de bolsillo. Cargarle un impuesto de gasto inflaria lo
   * gastado del mes con dinero que nunca salio de tus manos.
   */
  if (ctx.ownTransfer) return lines

  // El recargo por divisa solo aplica si de verdad hubo cambio de moneda.
  if (ctx.typedCurrency !== ctx.accountCurrency) add('fx-surcharge')
  if (ctx.isCashAdvance) add('cash-advance')

  /*
   * LEY 288-04 — el 0.15% que faltaba.
   *
   * Hasta ahora esto solo se aplicaba si el usuario marcaba el movimiento como
   * transferencia a mano. Resultado: una compra normal en pesos con tarjeta de
   * debito no generaba NINGUN cargo, mientras el banco si se lo retenia. El
   * libro quedaba con mas dinero del que habia de verdad.
   *
   * Se aplica cuando el dinero sale de una CUENTA DE BANCO (debito o ahorro),
   * que es cuando hay un cargo electronico que gravar. Efectivo no: no toca el
   * sistema bancario. Tarjeta de credito tampoco al comprar — el impuesto
   * llega cuando pagas la tarjeta desde tu cuenta, y ahi se cobra como la
   * transferencia que es.
   */
  const debits = ctx.isTransfer || ctx.payerType === 'debit'
  if (debits && !ctx.lawTaxDisabled) add('itbis-transfer')

  return lines
}

export function totalFees(lines: FeeLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.amount, 0) * 100) / 100
}
