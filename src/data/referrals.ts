import type { Business, ReferralRules } from './business'
import type { Client, ClientStar } from './clients'

/**
 * LAS ESTRELLAS: CADA UNA ES ALGUIEN QUE TE TRAJO.
 *
 * ── LA IDEA ───────────────────────────────────────────────────────────
 * El boca a boca es como crece un negocio de revender cuentas o dar clases, y
 * la app no tenía forma de premiarlo. Cada recomendación es una estrella, y
 * cada estrella baja el precio de quien recomendó. El cliente ve su descuento
 * crecer con cada persona que trae, que es justo lo que hace que traiga otra.
 *
 * ── LAS TRES REGLAS QUE LO HACEN SOSTENIBLE ───────────────────────────
 *  1. Con TOPE: sin él, quien te trae a veinte acabaría usando el servicio
 *     gratis y pagándolo tú.
 *  2. Pueden CADUCAR, si el negocio quiere: una estrella de hace dos años ya
 *     se cobró en descuentos, y que caduquen es lo que hace que sigan
 *     recomendando.
 *  3. El descuento se guarda EN CADA COBRO al generarse (`discountPct`), no se
 *     recalcula: si mañana caduca una estrella, lo que ya se le pidió no
 *     cambia.
 */

/** Las de siempre: 5% por estrella, hasta 25%, sin caducar. */
export const DEFAULT_REFERRAL: ReferralRules = { pctPerStar: 5, maxPct: 25, expiresMonths: 0 }

const MES = 30.4375 * 86_400_000

/** Las reglas de un negocio, o las de siempre. */
export function referralRules(business: Business | undefined | null): ReferralRules {
  const r = business?.referral
  if (!r) return DEFAULT_REFERRAL
  return {
    pctPerStar: clampPct(r.pctPerStar),
    maxPct: clampPct(r.maxPct),
    expiresMonths: r.expiresMonths && r.expiresMonths > 0 ? Math.round(r.expiresMonths) : 0,
  }
}

function clampPct(n: number): number {
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0
}

/** Las estrellas que siguen valiendo hoy. */
export function activeStars(client: Client, rules: ReferralRules, now = Date.now()): ClientStar[] {
  const todas = client.stars ?? []
  if (!rules.expiresMonths) return todas
  const corte = now - rules.expiresMonths * MES
  return todas.filter(s => s.at >= corte)
}

/**
 * El descuento de un cliente hoy, en % entero.
 *
 * Entero a propósito: un «13.75% de descuento» no se le puede decir a nadie
 * sin sacar la calculadora.
 */
export function referralDiscount(client: Client, rules: ReferralRules, now = Date.now()): number {
  if (!(rules.pctPerStar > 0)) return 0
  const n = activeStars(client, rules, now).length
  return Math.round(Math.min(rules.maxPct, n * rules.pctPerStar))
}

/** Un monto con el descuento aplicado, redondeado a céntimos. */
export function applyDiscount(amount: number, pct: number): number {
  if (!(pct > 0)) return amount
  return Math.round(amount * (1 - Math.min(100, pct) / 100) * 100) / 100
}

/**
 * Cuántas estrellas más hacen falta para el siguiente escalón, o `null` si ya
 * está en el tope. Es la frase que hace que el cliente quiera traer a otro:
 * «una recomendación más y pagas 15% menos».
 */
export function nextStep(client: Client, rules: ReferralRules, now = Date.now()): { pct: number } | null {
  if (!(rules.pctPerStar > 0)) return null
  const ahora = referralDiscount(client, rules, now)
  if (ahora >= rules.maxPct) return null
  const n = activeStars(client, rules, now).length
  return { pct: Math.round(Math.min(rules.maxPct, (n + 1) * rules.pctPerStar)) }
}

export interface ReferralSummary {
  /** Clientes que llegaron recomendados por otro. */
  referred: number
  /** Clientes con al menos una estrella vigente. */
  recommenders: number
  /** Lo que dejas de cobrar al mes por los descuentos, en la divisa de cada uno. */
  discountPerMonth: number
  /** Lo que pagan al mes los que llegaron recomendados. */
  referredRevenue: number
}

/**
 * ¿COMPENSA EL PROGRAMA?
 *
 * Es la única pregunta que importa de un descuento: lo que regalas contra lo
 * que te traen. Si los recomendados pagan 2,800 al mes y los descuentos te
 * cuestan 400, el programa se paga solo siete veces.
 *
 * `perMonth` lo pone quien llama (con la divisa y el ciclo de cada uno).
 */
export function referralSummary(
  clients: Client[],
  rulesFor: (client: Client) => ReferralRules,
  perMonth: (client: Client) => number,
  now = Date.now(),
): ReferralSummary {
  const vivos = clients.filter(c => c.active && !c.deletedAt)
  let referred = 0, recommenders = 0, discountPerMonth = 0, referredRevenue = 0
  for (const c of vivos) {
    if (c.referredBy) {
      referred += 1
      referredRevenue += perMonth(c)
    }
    const pct = referralDiscount(c, rulesFor(c), now)
    if (pct > 0) {
      recommenders += 1
      discountPerMonth += perMonth(c) * pct / 100
    }
  }
  return {
    referred,
    recommenders,
    discountPerMonth: Math.round(discountPerMonth * 100) / 100,
    referredRevenue: Math.round(referredRevenue * 100) / 100,
  }
}

/**
 * El mensaje para darle las gracias, listo para pegar en WhatsApp.
 *
 * Decirle al cliente que ya tiene su descuento es la mitad del programa: un
 * descuento que nadie sabe que tiene no hace que nadie recomiende.
 */
export function thanksMessage(
  template: string,
  values: { name: string; referred?: string; pct: number; next?: number | null },
): string {
  return template
    .replace(/\{nombre\}|\{name\}/g, values.name.split(/\s+/)[0] ?? values.name)
    .replace(/\{recomendado\}|\{referred\}/g, values.referred ?? '')
    .replace(/\{pct\}/g, String(values.pct))
    .replace(/\{siguiente\}|\{next\}/g, values.next ? String(values.next) : '')
}
