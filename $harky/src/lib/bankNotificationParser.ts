/**
 * Reconoce y lee avisos de movimientos bancarios entre todas las notificaciones
 * del teléfono — incluidos los que llegan por correo (Gmail, Outlook…), donde el
 * banco aparece en el remitente y no en el nombre del paquete.
 *
 * Arquitectura: el servicio nativo (Kotlin) reenvía un conjunto AMPLIO de
 * candidatos (recall); toda la precisión vive aquí, en `classifyBankNotification`,
 * que es puro y está cubierto por tests. Así se puede afinar sin recompilar el APK.
 */

export type IgnoreReason =
  | 'no-amount'        // no hay un monto en moneda reconocible
  | 'otp'              // código de verificación / seguridad (no es un movimiento)
  | 'promotional'      // oferta, promo, recarga, sorteo… (marketing, no un gasto)
  | 'telecom'          // notificación de una app de telecom (Claro, Altice…)
  | 'not-financial'    // correo/app sin señal de banco y sin señal de transacción
  | 'no-tx-signal'     // tiene monto pero no parece una transacción real

export interface BankTx {
  amount: number
  type: 'income' | 'expense'
  note: string
  currency: 'DOP' | 'USD'
  /** Últimos 4 dígitos de la tarjeta/cuenta mencionados en el aviso, si aparecen. */
  cardLast4?: string
}

export type Classification =
  | { ok: true; tx: BankTx }
  | { ok: false; reason: IgnoreReason }

// ── Reconocimiento de origen ────────────────────────────────────────────────

/**
 * Fragmentos que identifican una fuente financiera. Se buscan tanto en el nombre
 * del paquete (app nativa del banco) como en el TÍTULO/remitente (correo del
 * banco reenviado por Gmail/Outlook). Incluye bancos, cooperativas y billeteras
 * dominicanas, más wallets internacionales frecuentes (PayPal, etc.).
 */
const BANK_HINTS = [
  'banreservas', 'reservas', 'qik', 'tpago', 'tarjeta reservas',
  'popular', 'bhd', 'bhd leon', 'scotiabank', 'scotia',
  'promerica', 'apap', 'banesco', 'ademi', 'lafise', 'bdi', 'bancamerica',
  'motor credito', 'motorcredito', 'vimenca', 'santa cruz', 'santacruz',
  'bancaribe', 'caribe', 'citibank', 'citi', 'alaver', 'confisa', 'fihogar',
  'banco ', 'cooperativa', 'coop ', 'asociacion', 'financiera',
  'paypal', 'zelle', 'wise', 'remitly', 'remesas', 'dyme', 'azul', 'cardnet',
  'visa', 'mastercard', 'american express', 'amex',
]

/** Apps de correo: aquí el banco viaja en el remitente (título), no en el paquete. */
const EMAIL_PACKAGE_HINTS = [
  'google.android.gm', 'com.google.android.gm', 'gmail',
  'microsoft.office.outlook', 'outlook',
  'yahoo.mobile', 'com.yahoo', 'samsung.android.email', 'android.email',
  'protonmail', 'ch.protonmail', 'bluemail', 'aquamail', 'k9', 'fairemail',
]

/** Apps de telecom: sus avisos con "RD$" casi siempre son ofertas, no gastos. */
const TELECOM_PACKAGE_HINTS = ['claro', 'altice', 'orange', 'viva', 'tricom', 'wind', 'mas movil', 'masmovil']

// ── Patrones de contenido ───────────────────────────────────────────────────

// Moneda + monto, en cualquier orden: "RD$1,234.56", "US$12.34", "1,234.56 DOP",
// "50.00 pesos". Exigir un marcador de moneda evita confundir los 4 dígitos de la
// tarjeta o una fecha con un monto.
const CURRENCY = '(?:RD\\$|US\\$|U\\$D|DOP|USD|\\$)'
const AMOUNT_BEFORE = new RegExp(`${CURRENCY}\\s?(\\d[\\d.,]*\\d|\\d)`, 'i')
const AMOUNT_AFTER = new RegExp(`(\\d[\\d.,]*\\d|\\d)\\s?(?:DOP|USD|RD\\$|US\\$|pesos?|d[oó]lares?)`, 'i')

// Códigos de verificación / seguridad: nunca son un movimiento aunque mencionen monto.
const OTP_RE = /c[oó]digo (?:de )?(?:verificaci[oó]n|seguridad|acceso|confirmaci[oó]n|un solo uso)|(?:verification|security|one[- ]?time) code|\botp\b|clave temporal|no compart[ae]|token de|pin de acceso/i

// Marketing/promoción/telecom: ofertas, recargas, sorteos, planes de datos…
const PROMO_RE = /oferta|promoci[oó]n|\bpromo\b|gratis|aprovech|disfrut|regal|descuento|cup[oó]n|sorteo|gana(?:te|ste|r)?\b|felicidad|\bmegas?\b|\bgigas?\b|\bgb\b|minutos? (?:gratis|ilimitad|de regalo)|paquet|recarga tu|rec[aá]rgate|activa (?:ya|tu)|suscr[ií]bete|black friday|2x1|renueva|vence tu plan|plan de datos|puntos? (?:acumulad|de recompensa)|bono de bienvenida|te regalamos/i

// Señales de que SÍ es una transacción, separadas por dirección del dinero.
const INCOME_RE = /dep[oó]sito|abono|acreditad|cr[eé]dito a (?:su|tu)|recib(?:iste|ido|es un pago)|te (?:enviaron|depositaron|transfirieron)|pago recibido|reembolso|devoluci[oó]n|cashback|n[oó]mina|salario|received|refund|you got paid/i
const EXPENSE_RE = /compra|consumo|cargo|retiro|pago (?:de|por|a|realizad|exitos|aprobad)|pagaste|d[eé]bito|debitad|enviaste|transferencia enviada|avance de efectivo|withdrawal|purchase|you (?:sent|paid)|se realiz[oó]/i

// Comercio: "en TIENDA", "a Juan", "to Store", "de Juan". Se prioriza la
// preposición que suele introducir al comercio (en/to/from) sobre "de"/"a"
// (que a veces preceden al monto: "consumo de RD$500…").
const MERCHANT_RE = /\b(en|para|to|from|a|de)\s+([A-Za-zÀ-ÿÑñ][\wÀ-ÿÑñ .,'&*/-]{1,44})/gi
const MERCHANT_PREP_RANK: Record<string, number> = { en: 0, to: 0, from: 0, para: 1, a: 2, de: 3 }
const MERCHANT_STOPWORD_RE = /^(su|tu|la|el|los|las|un|una|the|your|my|cuenta|tarjeta|cliente|nuestra?|este|esta)\b/i

// Tarjeta/cuenta: "terminada en 1234", "****1234", "cuenta termina en 1234".
const CARD_LAST4_RE = /(?:tarjeta|cuenta|card|account)?[^\d]{0,25}?termin(?:a|ada|ó|o)\s+en\s+(\d{4})\b|\*{2,}[\s*]*(\d{4})\b|(?:xx|••|\.{2,})(\d{4})\b/i

// ── Utilidades ──────────────────────────────────────────────────────────────

/** Minúsculas sin acentos, para comparar palabras clave de forma robusta. */
function norm(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Convierte "1,234.56" (formato dominicano) o "1.234,56" (europeo) a número.
 * Regla: cuando hay ambos separadores, el ÚLTIMO es el decimal; si solo hay coma,
 * es decimal cuando la siguen 1-2 dígitos, si no es separador de miles.
 */
function toNumber(raw: string): number {
  let s = raw.replace(/[^\d.,]/g, '')
  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '')
  } else if (hasComma) {
    const decimals = s.length - s.lastIndexOf(',') - 1
    s = decimals <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  return Number(s)
}

function extractAmount(content: string): { value: number; currency: 'DOP' | 'USD' } | null {
  const match = content.match(AMOUNT_BEFORE) ?? content.match(AMOUNT_AFTER)
  if (!match) return null
  const value = toNumber(match[1])
  if (!Number.isFinite(value) || value <= 0) return null
  const lower = norm(content)
  const usd = /us\$|u\$d|\busd\b|d[oó]lar/.test(lower)
  const dop = /rd\$|\bdop\b|peso/.test(lower)
  const currency: 'DOP' | 'USD' = usd && !dop ? 'USD' : 'DOP'
  return { value, currency }
}

function extractCardLast4(content: string): string | undefined {
  const m = content.match(CARD_LAST4_RE)
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined
}

function cleanMerchant(raw: string): string {
  return raw
    // Corta la cola de ruido: "…, tarjeta 4821", "con tarjeta …", "ref 123", etc.
    .replace(/[\s,]+(?:con\s+)?(?:tarjeta|cuenta|ref(?:erencia)?|autor(?:izaci[oó]n)?|aut|no\.?|nro|terminad).*$/i, '')
    .replace(/[.,;:\s]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function extractMerchant(content: string, fallback: string): string {
  const candidates = [...content.matchAll(MERCHANT_RE)]
    .map(m => ({ prep: m[1].toLowerCase(), text: cleanMerchant(m[2]) }))
    .filter(c =>
      c.text.length >= 2
      && !/RD\$|US\$|U\$D|\bDOP\b|\bUSD\b|\$/.test(c.text)   // no es el monto
      && !/^\d/.test(c.text)                                 // no empieza en cifra
      && !MERCHANT_STOPWORD_RE.test(c.text))                 // no es "su cuenta", etc.
    // La preposición que introduce al comercio (en/to/from) gana a "de"/"a".
    .sort((x, y) => (MERCHANT_PREP_RANK[x.prep] ?? 9) - (MERCHANT_PREP_RANK[y.prep] ?? 9))
  return candidates[0]?.text ?? (fallback.trim() || 'Movimiento bancario')
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some(n => haystack.includes(n))
}

// ── Clasificador principal ──────────────────────────────────────────────────

/**
 * Decide si una notificación es un movimiento bancario y, si lo es, lo interpreta.
 * Devuelve `{ ok: false, reason }` cuando debe ignorarse (con el motivo, útil para
 * diagnóstico), o `{ ok: true, tx }` con el movimiento listo para sugerir.
 */
export function classifyBankNotification(pkg: string, title: string, text: string): Classification {
  const rawContent = `${title ?? ''}\n${text ?? ''}`.trim()
  const source = norm(`${pkg} ${title ?? ''}`)
  const body = norm(rawContent)

  const isEmail = includesAny(norm(pkg), EMAIL_PACKAGE_HINTS)
  const isTelecomApp = includesAny(norm(pkg), TELECOM_PACKAGE_HINTS)
  // Reconoce el banco tanto en el paquete/remitente/asunto como en el CUERPO del
  // mensaje: en los correos (Gmail/Outlook) el nombre del banco casi siempre va
  // en el texto ("Notificaciones Banreservas…"), no en el remitente. Sin esto,
  // un aviso de consumo reenviado por Gmail se descartaba como "no es un banco".
  const bankRecognized = includesAny(source, BANK_HINTS) || includesAny(body, BANK_HINTS)

  // 1) Monto: sin un monto en moneda no hay nada que registrar.
  const amount = extractAmount(rawContent)
  if (!amount) return { ok: false, reason: 'no-amount' }

  // 2) Códigos de verificación: descartar siempre, aunque mencionen un monto.
  if (OTP_RE.test(body)) return { ok: false, reason: 'otp' }

  const cardLast4 = extractCardLast4(rawContent)
  const isIncome = INCOME_RE.test(body)
  const isExpense = EXPENSE_RE.test(body)
  const hasTxVerb = isIncome || isExpense
  // Ancla financiera: algo que ate el aviso a un banco/tarjeta. Sin esto, una
  // app de compras cualquiera con un precio no debe volverse un movimiento.
  const financialAnchor = bankRecognized || !!cardLast4

  // 3) Telecom: una app de telecom con monto es casi siempre una oferta. Solo se
  //    salva si trae verbo de transacción + tarjeta (pago de factura con tarjeta).
  if (isTelecomApp && !(hasTxVerb && !!cardLast4)) return { ok: false, reason: 'telecom' }

  // 4) Marketing/promoción: recargas, ofertas, sorteos… no son un gasto. Se
  //    perdona solo si hay tarjeta + verbo de transacción (una compra real nunca
  //    trae estas palabras, así que el riesgo de falso descarte es mínimo).
  if (PROMO_RE.test(body) && !(cardLast4 && hasTxVerb)) return { ok: false, reason: 'promotional' }

  // 5) Correo: normalmente exige banco reconocido (remitente o cuerpo) para no
  //    convertir cualquier correo con un precio (Amazon, facturas…) en un
  //    movimiento. PERO si el correo trae tarjeta + verbo de transacción
  //    (consumo/compra/pago), ES una confirmación de pago aunque el banco no esté
  //    en la lista: la cuenta (últimos 4) y el monto bastan para registrarlo.
  if (isEmail && !bankRecognized && !(cardLast4 && hasTxVerb)) return { ok: false, reason: 'not-financial' }

  // 6) Debe estar anclado a un banco/tarjeta…
  if (!financialAnchor) return { ok: false, reason: 'not-financial' }
  // …y parecer una transacción: verbo de movimiento, o al menos una tarjeta
  //    identificada (los avisos con tarjeta casi siempre son un consumo).
  if (!hasTxVerb && !cardLast4) return { ok: false, reason: 'no-tx-signal' }

  const type: BankTx['type'] = isIncome && !isExpense ? 'income' : 'expense'
  const note = extractMerchant(rawContent, title ?? '')

  return {
    ok: true,
    tx: {
      amount: amount.value,
      currency: amount.currency,
      type,
      note,
      ...(cardLast4 ? { cardLast4 } : {}),
    },
  }
}

// ── Compatibilidad ──────────────────────────────────────────────────────────
// `isBankNotification` / `parseBankNotification` se mantienen como envoltorios
// finos sobre el clasificador para no romper llamadas existentes.

export function isBankNotification(pkg: string, title: string, text: string): boolean {
  return classifyBankNotification(pkg, title, text).ok
}

export interface ParsedBankNotification {
  amount: number
  type: 'income' | 'expense'
  note: string
  currency: 'DOP' | 'USD'
  cardLast4?: string
}

export function parseBankNotification(title: string, text: string): ParsedBankNotification | null {
  const result = classifyBankNotification('', title, text)
  return result.ok ? result.tx : null
}
