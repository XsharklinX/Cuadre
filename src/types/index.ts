// ── Enums / literals ──────────────────────────────────────
export type AccountType  = 'debit' | 'savings' | 'credit' | 'cash'
export type TxType       = 'income' | 'expense' | 'transfer'
export type CurrencyCode = 'DOP' | 'USD' | 'EUR' | 'MXN' | 'GBP' | 'COP' | 'ARS' | 'BRL' | 'CAD'
export type ThemeName    = 'dark' | 'light' | 'amoled' | 'system'
export type DensityName  = 'compact' | 'regular' | 'comfy'
export type OverdraftPolicy = 'block' | 'warn' | 'allow'
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'discover' | 'other'
export type RecurrenceFrequency = 'weekly' | 'monthly'
export type IconName =
  // categorías existentes
  | 'home' | 'cart' | 'food' | 'car' | 'bolt' | 'play' | 'heart'
  | 'bag'  | 'book' | 'wallet' | 'laptop' | 'trend'
  // nuevas categorías
  | 'music' | 'coffee' | 'phone' | 'gym' | 'building' | 'bus'
  | 'gamepad' | 'gift' | 'scissors' | 'baby' | 'paw' | 'pill'
  | 'plane' | 'briefcase' | 'shirt' | 'pizza' | 'star' | 'fuel'
  | 'flame' | 'soda'
  // nav
  | 'grid' | 'list' | 'cards' | 'chart' | 'target'
  // acciones comunes
  | 'plus' | 'arrowUp' | 'arrowDn' | 'shark' | 'brand' | 'search'
  | 'bell' | 'close' | 'calendar' | 'dots'
  | 'edit' | 'trash' | 'download' | 'print'
  // extras
  | 'settings' | 'logout' | 'repeat' | 'tag' | 'camera'
  | 'check' | 'alert' | 'refresh' | 'dollar' | 'piggy'
  | 'sliders' | 'upload' | 'fileJson' | 'eye' | 'eyeOff' | 'info'
  | 'lock' | 'user' | 'palette'
  // 20 iconos nuevos
  | 'tree' | 'sun' | 'bike' | 'train' | 'tv' | 'monitor'
  | 'headphones' | 'clock' | 'key' | 'tool' | 'brush'
  | 'graduation' | 'stethoscope' | 'salad' | 'wine'
  | 'crown' | 'trophy' | 'shield' | 'map' | 'package'
  // iconos financieros
  | 'banknote' | 'coins' | 'handCoins' | 'landmark' | 'receipt'
  // compartir / portapapeles
  | 'share' | 'clipboard'

// ── Entidades financieras ─────────────────────────────────
export interface Account {
  id:      string
  name:    string
  short:   string
  type:    AccountType
  color:   string
  balance: number
  /**
   * Saldo de apertura inmutable. El saldo "real" de una cuenta es siempre
   * `openingBalance + suma de movimientos`. Se conserva aparte para poder
   * auditar y recalcular `balance` si alguna vez deriva por un bug.
   * Opcional por compatibilidad: las cuentas antiguas lo back-derivan al cargar.
   */
  openingBalance?: number
  last4:   string | null
  limit?:  number
  overdraftPolicy?: OverdraftPolicy
  /**
   * Si es false, esta cuenta no cuenta para los totales/balance agregados
   * (Home, Profile, Accounts hero, Analytics, Budgets, Annual, widget,
   * exports). undefined/true = se incluye. La vista propia de la cuenta
   * (su balance y actividad) no se ve afectada.
   */
  includeInTotal?: boolean
  /**
   * Divisa propia de la cuenta. Su saldo y movimientos se registran en esta
   * divisa; los totales globales la convierten a la divisa base de la app con
   * el motor de tasas en vivo. `undefined` = divisa base (compatibilidad).
   */
  currency?: CurrencyCode

  /**
   * Banco al que pertenece la cuenta (`BANK_PROFILES` en `data/bankFees.ts`).
   * Define qué comisiones se sugieren al registrar un movimiento. Se adivina
   * por el nombre al crear la cuenta, pero SIEMPRE es editable: adivinar mal
   * el banco significaría sugerir cargos ajenos.
   */
  bankId?: string
  /**
   * Red de la tarjeta (Visa, Mastercard…). Es lo que está impreso en el
   * plástico, y lo que permite reconocer la cuenta de un vistazo sin leer.
   *
   * Solo en cuentas con tarjeta física (débito, ahorro, crédito). No se
   * deduce de `last4`: la red se identifica por el PRIMER dígito del número,
   * que la app nunca guarda.
   */
  network?: CardNetwork

  // ── Solo tarjetas de crédito (type === 'credit') ───────
  /**
   * SEGUNDO SALDO. Una tarjeta dominicana casi siempre arrastra dos deudas a
   * la vez: uno en la divisa local y otro en dólares, que se pagan por
   * separado y se liquidan por separado. `balance` es el saldo en `currency`;
   * esto es el saldo en la divisa secundaria, en SU propia divisa.
   *
   * Ausente = tarjeta de una sola divisa (lo normal fuera de RD). NO se crea
   * en cero automáticamente: una tarjeta que nunca operó en dólares no debe
   * mostrar `US$ 0.00`.
   */
  secondaryCurrency?: CurrencyCode
  secondaryBalance?:  number
  /** Saldo de apertura de la divisa secundaria, con el mismo rol que `openingBalance`. */
  secondaryOpeningBalance?: number
  /**
   * Límite PROPIO de la línea en divisa extranjera, en esa divisa.
   *
   * La mayoría de las tarjetas dominicanas comparten un solo límite entre
   * ambas líneas, y ese es `limit` (se mide contra la deuda total convertida).
   * Pero algunas emiten un cupo separado en dólares; cuando existe, se mide
   * aparte y `limit` deja de aplicar a la línea extranjera.
   *
   * Ausente = límite compartido, que es el caso normal.
   */
  secondaryLimit?: number

  /**
   * CICLO. Sin estas fechas el saldo de una tarjeta es un número sin
   * consecuencia. Son días del mes (1-31), no fechas: el ciclo se repite.
   * `statementDay` = día de corte; `paymentDay` = día límite de pago.
   */
  statementDay?: number
  paymentDay?:   number

  /**
   * COSTO DEL FINANCIAMIENTO. `apr` es la tasa ANUAL en porcentaje (ej. 24 =
   * 24% anual) sobre el saldo financiado. Se guarda solo si el usuario la
   * configura: NUNCA se asume una tasa por defecto, porque una proyección de
   * interés inventada es peor que ninguna.
   */
  apr?: number
  /** Pago mínimo como % del saldo al corte (ej. 10 = 10%). */
  minPaymentPct?: number
  /** Piso absoluto del pago mínimo, en la divisa de la tarjeta. */
  minPaymentFloor?: number
}

export interface Category {
  id:     string
  name:   string
  type:   'expense' | 'income'
  color:  string
  budget: number
  weeklyBudget?: number
  annualBudget?: number
  icon:   IconName
  /**
   * Si es true, el sobrante (o exceso) del presupuesto mensual del mes
   * anterior se suma (o resta) al presupuesto disponible de este mes.
   */
  rolloverEnabled?: boolean
}

/** Un cargo bancario aplicado a un movimiento, con su tasa para poder auditarlo. */
export interface TxFee {
  kind:   'itbis-transfer' | 'fx-surcharge' | 'cash-advance'
  pct:    number
  amount: number
}

/** Parte de una transacción dividida: cuánto del total va a cada categoría. */
export interface TxSplit {
  categoryId: string
  amount:     number
}

export interface Transaction {
  id:           string
  type:         TxType
  amount:       number
  date:         string              // YYYY-MM-DD
  note:         string
  categoryId?:  string              // income / expense
  accountId?:   string              // income / expense
  /**
   * División del monto entre 2+ categorías (ej. supermercado → comida +
   * limpieza). Si existe, las sumas deben igualar `amount` y los reportes /
   * presupuestos usan estas partes en lugar de `categoryId`. `categoryId`
   * se mantiene como categoría principal (la de mayor monto) por
   * compatibilidad con listas, búsqueda y exports simples.
   */
  splits?:      TxSplit[]
  fromAccount?: string              // transfer
  toAccount?:   string              // transfer
  /**
   * Solo transferencias entre cuentas de distinta divisa: monto que recibe la
   * cuenta destino en SU divisa (convertido con la tasa del momento de crear
   * la transferencia). `undefined` = misma divisa, se usa `amount`.
   */
  toAmount?:    number
  /**
   * Solo transferencias cuyo destino es una TARJETA con dos libros: `true`
   * abona la linea en divisa extranjera en vez del saldo principal.
   *
   * Existe porque una tarjeta dominicana lleva dos deudas que se pagan por
   * separado, y un pago al banco es una transferencia, no un ingreso: sin
   * esta marca el pago en dolares bajaba la deuda en pesos y dejaba la de
   * dolares intacta.
   */
  toSecondary?: boolean
  recurring?:   RecurrenceFrequency | null
  recurringStart?: string
  recurringEnd?: string
  recurringNext?: string
  /** Fechas (YYYY-MM-DD) de ocurrencias saltadas por el usuario: no se generan. */
  skippedDates?: string[]
  /**
   * Id de la transacción-plantilla recurrente que generó esta ocurrencia. Es
   * el vínculo estable (sobrevive a editar la plantilla) para deduplicar y
   * contar ocurrencias, en vez de adivinar por nota/cuenta/monto.
   */
  generatedFrom?: string
  /** Solo suscripciones creadas desde el catálogo: id en SUBSCRIPTION_CATALOG, para mostrar el logo real de la marca. */
  serviceId?:   string
  tags?:        string[]            // ej. ['trabajo', 'viaje']
  /** Origen cuando el movimiento se creó SOLO (no lo tecleó el usuario): un aviso
   *  bancario detectado. Se usa para marcarlo con un badge "automático" y para que
   *  el usuario pueda revisarlo/deshacerlo con confianza. */
  detectedFrom?: 'notification'
  /**
   * MULTI-MONEDA. `amount` SIEMPRE está en la divisa de la cuenta — es la
   * fuente de verdad del libro y lo que usan saldos, presupuestos, reportes y
   * proyecciones. Estos tres campos son la memoria de lo que el usuario tecleó
   * de verdad cuando gastó en OTRA divisa (ej. compra en US$ con tarjeta en
   * RD$): sirven para mostrarlo tal cual y para auditar la conversión.
   *
   * `fxRate` se CONGELA al crear el movimiento (1 originalCurrency = fxRate de
   * la divisa de la cuenta). No se recalcula nunca con la tasa de hoy: si se
   * recalculara, el historial cambiaría solo cada día y los reportes de meses
   * cerrados dejarían de cuadrar.
   *
   * Ausentes = el movimiento se tecleó en la divisa de su cuenta (lo normal).
   */
  originalAmount?:   number
  originalCurrency?: CurrencyCode
  fxRate?:           number

  /**
   * SEGUNDO LIBRO DE UNA TARJETA. Cuando es true, este movimiento afecta
   * `Account.secondaryBalance` en vez de `Account.balance`, y su `amount` está
   * en `Account.secondaryCurrency` — no se convierte.
   *
   * Es un campo EXPLÍCITO y congelado al crear, no algo que se deduzca de la
   * cuenta al leer. Si se dedujera, agregar o quitar la divisa secundaria de
   * una tarjeta re-enrutaría movimientos viejos y los saldos cambiarían solos
   * — justo el movimiento silencioso de dinero que la app promete no hacer.
   *
   * Nunca va en transferencias: mover dinero entre los dos saldos de una misma
   * tarjeta no es una transferencia, es un pago al banco.
   */
  onSecondaryBalance?: boolean

  /**
   * CARGOS BANCARIOS desglosados (comisión por divisa, ITBIS 0.15%, avance de
   * efectivo). `amount` YA LOS INCLUYE: es lo que de verdad golpeó la cuenta,
   * así que el saldo cuadra contra el estado de cuenta del banco sin restas
   * mentales.
   *
   * El desglose se guarda aparte para poder mostrarlo. Un cargo que solo
   * aparece sumado dentro del total es justo lo que hace que un cobro
   * bancario se sienta arbitrario.
   */
  fees?: TxFee[]
}

export interface GoalAutoContribute {
  amount:        number      // monto del PRÓXIMO aporte (crece con `increment`)
  frequency:     RecurrenceFrequency
  fromAccountId: string
  nextDate:      string      // YYYY-MM-DD
  /** Reto tipo "52 semanas": si >0, cada aporte sube este monto respecto al anterior. */
  increment?:    number
  /**
   * Solo mensual: día(s) del mes (1-31) en que se cobra `amount`. 1 día = un pago
   * mensual; 2 días = dos pagos al mes (se cobra `amount` en cada fecha). Ausente
   * = comportamiento antiguo (un pago al mes en el día de `nextDate`).
   */
  monthDays?:    number[]
}

export interface Goal {
  id:        string
  name:      string
  target:    number
  saved:     number
  color:     string
  icon:      IconName
  deadline?: string          // YYYY-MM-DD
  /**
   * Ahorro de apertura inmutable. El `saved` real de una meta es siempre
   * `openingSaved + suma de GoalContribution`. Se conserva aparte para poder
   * auditar y recalcular `saved` si alguna vez deriva por un bug.
   * Opcional por compatibilidad: las metas antiguas lo back-derivan al cargar.
   */
  openingSaved?: number
  /** Aporte periódico automático hacia esta meta, generado como GoalContribution. */
  autoContribute?: GoalAutoContribute
}

export interface GoalContribution {
  id: string
  goalId: string
  amount: number
  fromAccountId: string
  date: string
  note?: string
}

export interface Currency {
  code:     CurrencyCode
  symbol:   string
  decimals: number
}

// ── Helpers ───────────────────────────────────────────────
export interface Totals {
  income:  number
  expense: number
  net:     number
}

export interface CategoryTotal {
  category: Category
  amount:   number
}

export interface MonthSeries {
  key:     string
  label:   string
  income:  number
  expense: number
  net:     number
}

export interface WeekBucket {
  label: string
  value: number
}

export interface FmtOptions {
  decimals?: number
}

// ── Props compartidas de vistas ───────────────────────────
/**
 * Las pantallas que existen de verdad.
 *
 * `'annual'` se fue: repetía el período anual de Análisis (mismos totales,
 * misma comparación contra el año anterior, mismo desglose, misma serie de
 * patrimonio). Lo único suyo —mejor mes, mes de mayor gasto, fuentes de
 * ingreso y exportar como imagen— vive ahora en ese período.
 *
 * `'reports'` también: era un id que nadie renderizaba. La pestaña del bottom
 * nav que se llama "reports" muestra `accounts`.
 */
export type ViewId =
  | 'dashboard'
  | 'transactions'
  | 'accounts'
  | 'stats'
  | 'budgets'
  | 'goals'
  | 'calendar'
  | 'subscriptions'
  | 'debt'
  | 'cashflow'
  | 'notes'

export interface ViewProps {
  txns:        Transaction[]
  mkey:        string
  onAdd:       () => void
  goto:        (view: ViewId) => void
  onEditTx:    (tx: Transaction) => void
  onDeleteTx?: (id: string) => void   // undo-aware delete desde App
  createRequest?: {
    target: 'account' | 'category' | 'goal'
    nonce: number
  }
}
