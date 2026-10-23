import { z } from 'zod'
import { CURRENCY_CODES } from '@/constants'
import { tt } from '@/i18n'
import type { FinanceState } from '@/store/finance'
import { useNotes } from '@/store/notes'
import { useBusiness } from '@/store/business'
import { useCaprices } from '@/store/caprices'
import type { Note } from '@/data/notes'
import type { Account, Category, CurrencyCode, Goal, GoalContribution, IconName, Transaction } from '@/types'

export interface FinanceBackup {
  version: 1 | 2 | 3 | 4
  exportedAt: string
  data: {
    accounts: Account[]
    categories: Category[]
    goals: Goal[]
    goalContributions: GoalContribution[]
    transactions: Transaction[]
    currency: CurrencyCode
    /** Listas / notas del usuario. Ausente en backups v1/v2. */
    notes?: Note[]
    /*
     * ── LO QUE FALTABA, Y POR QUE ERA GRAVE ───────────────────────────
     *
     * Clientes, negocios, servicios, cobros y caprichos viven en almacenes
     * propios (ver `store/business.ts`), y la copia no los incluia. Eso no era
     * solo «no se guardan»: era PEOR.
     *
     * Al restaurar, los movimientos se reemplazaban y esos almacenes se
     * quedaban intactos, asi que los cobros apuntaban a movimientos que ya no
     * existian y las funciones de limpieza —`pruneOrphanReceipts`,
     * `useCaprices.prune`— borraban en silencio caprichos y fotos de recibo
     * por considerarlos huerfanos. Restaurar una copia DESTRUIA datos.
     *
     * Van opcionales porque un backup v1/v2/v3 sigue siendo valido tal cual.
     */
    /*
     * SIN TIPAR A PROPOSITO: a este nivel NO estan validados.
     *
     * Su esquema es permisivo —rechazar la copia entera por un campo de un
     * cliente le costaria al usuario sus 400 movimientos—, asi que lo que sale
     * de aqui puede traer cualquier cosa dentro. Declararlos como `Client[]`
     * seria mentir sobre lo que `parseBackup` garantiza, y el proximo que lea
     * el tipo confiaria en algo que nadie comprobo.
     *
     * Quien los use pasa por `sanitizeBusinessData` / `sanitizeCaprices`, que
     * son el validador de verdad y el mismo que corre al cargar la app.
     */
    clients?: unknown[]
    businesses?: unknown[]
    services?: unknown[]
    charges?: unknown[]
    caprices?: unknown[]
  }
}

export function createBackup(state: FinanceState): FinanceBackup {
  const notes = useNotes.getState().notes
  const { clients, businesses, services, charges } = useBusiness.getState()
  const caprices = useCaprices.getState().items
  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: state.accounts,
      categories: state.categories,
      goals: state.goals,
      goalContributions: state.goalContributions ?? [],
      transactions: state.transactions,
      currency: state.currency,
      // Solo se incluye si hay listas: mantiene los backups v1/v2 idénticos
      // cuando el usuario no usa la función.
      ...(notes.length > 0 ? { notes } : {}),
      // Igual con los datos de negocio: quien no usa la funcion obtiene una
      // copia identica a la de antes, sin claves vacias que no dicen nada.
      ...(clients.length ? { clients } : {}),
      ...(businesses.length ? { businesses } : {}),
      ...(services.length ? { services } : {}),
      ...(charges.length ? { charges } : {}),
      ...(caprices.length ? { caprices } : {}),
    },
  }
}

const nonEmptyText = z.string().refine(value => value.trim().length > 0, tt('backupFieldEmpty'))

const dateSchema = z.string().refine(
  value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00`)),
  tt('backupBadDate'),
)

const iconSchema = nonEmptyText.transform(value => value as IconName)

const AccountSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  short: nonEmptyText,
  type: z.enum(['debit', 'savings', 'credit', 'cash']),
  color: nonEmptyText,
  balance: z.number().finite(),
  openingBalance: z.number().finite().optional(),
  last4: z.string().nullable(),
  limit: z.number().finite().nonnegative().optional(),
  overdraftPolicy: z.enum(['block', 'warn', 'allow']).optional(),
  includeInTotal: z.boolean().optional(),
  currency: z.enum(CURRENCY_CODES).optional(),
})

const CategorySchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  type: z.enum(['expense', 'income']),
  color: nonEmptyText,
  budget: z.number().finite().nonnegative(),
  weeklyBudget: z.number().finite().nonnegative().optional(),
  annualBudget: z.number().finite().nonnegative().optional(),
  icon: iconSchema,
  rolloverEnabled: z.boolean().optional(),
})

const GoalAutoContributeSchema = z.object({
  amount: z.number().finite().positive(),
  frequency: z.enum(['weekly', 'monthly']),
  fromAccountId: nonEmptyText,
  nextDate: dateSchema,
  increment: z.number().finite().positive().optional(),
})

const GoalSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
  target: z.number().finite().nonnegative(),
  saved: z.number().finite().nonnegative(),
  color: nonEmptyText,
  icon: iconSchema,
  deadline: dateSchema.optional(),
  openingSaved: z.number().finite().optional(),
  autoContribute: GoalAutoContributeSchema.optional(),
})

const TxSplitSchema = z.object({
  categoryId: nonEmptyText,
  amount: z.number().finite(),
})

const TransactionSchema = z.object({
  id: nonEmptyText,
  type: z.enum(['income', 'expense', 'transfer']),
  amount: z.number().finite().positive(),
  date: dateSchema,
  note: nonEmptyText,
  categoryId: nonEmptyText.optional(),
  accountId: nonEmptyText.optional(),
  splits: z.array(TxSplitSchema).optional(),
  fromAccount: nonEmptyText.optional(),
  toAccount: nonEmptyText.optional(),
  toAmount: z.number().finite().positive().optional(),
  recurring: z.enum(['weekly', 'monthly']).nullable().optional(),
  recurringStart: dateSchema.optional(),
  recurringEnd: dateSchema.optional(),
  recurringNext: dateSchema.optional(),
  skippedDates: z.array(dateSchema).optional(),
  serviceId: nonEmptyText.optional(),
  resoldAs: nonEmptyText.optional(),
  paidService: nonEmptyText.optional(),
  generatedFrom: nonEmptyText.optional(),
  tags: z.array(nonEmptyText).optional(),
})

const GoalContributionSchema = z.object({
  id: nonEmptyText,
  goalId: nonEmptyText,
  amount: z.number().finite().positive(),
  fromAccountId: nonEmptyText,
  date: dateSchema,
  note: z.string().optional(),
})

function assertUniqueIds(items: { id: string }[], label: string, ctx: z.RefinementCtx): void {
  const ids = items.map(item => item.id)
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({ code: 'custom', message: `El backup contiene ${label} duplicadas o sin identificador.` })
  }
}

const NoteItemSchema = z.object({
  id: nonEmptyText,
  text: z.string(),
  done: z.boolean(),
  price: z.number().finite().nonnegative().optional(),
  qty: z.number().finite().positive().optional(),
  important: z.boolean().optional(),
})

// Las notas son secundarias: se validan en forma pero NO se cruzan contra
// cuentas/categorías/metas. Si una referencia ya no existe, la nota simplemente
// no la muestra — no debe invalidar un backup entero.
const NoteSchema = z.object({
  id: nonEmptyText,
  title: z.string(),
  type: z.enum(['note', 'checklist', 'shopping']),
  body: z.string().optional(),
  items: z.array(NoteItemSchema),
  color: nonEmptyText,
  icon: iconSchema,
  goalId: z.string().optional(),
  categoryId: z.string().optional(),
  accountId: z.string().optional(),
  archived: z.boolean().optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
})

/*
 * LOS ESQUEMAS DE NEGOCIO SON PERMISIVOS A PROPOSITO.
 *
 * El libro se valida con rigor porque un movimiento mal formado descuadra un
 * saldo. Aqui no hay saldos: un cliente con un ciclo raro se corrige en dos
 * toques, y rechazar la copia ENTERA por un campo de un cliente le costaria al
 * usuario sus 400 movimientos. Lo que no cuadre lo sanea el almacen al cargar
 * (ver `sanitize` en `store/business.ts`), que ya existe y ya esta probado.
 */
const ClientSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
}).passthrough()

const BusinessSchema = z.object({
  id: nonEmptyText,
  name: nonEmptyText,
}).passthrough()

const ServiceSchema = z.object({
  id: nonEmptyText,
  businessId: nonEmptyText,
  name: nonEmptyText,
}).passthrough()

const ChargeSchema = z.object({
  id: nonEmptyText,
  clientId: nonEmptyText,
  dueDate: dateSchema,
}).passthrough()

const CapriceSchema = z.object({
  id: nonEmptyText,
  txId: nonEmptyText,
}).passthrough()

const BackupDataSchema = z.object({
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  goals: z.array(GoalSchema),
  transactions: z.array(TransactionSchema),
  goalContributions: z.array(GoalContributionSchema).optional().default([]),
  currency: z.enum(CURRENCY_CODES),
  notes: z.array(NoteSchema).optional(),
  clients: z.array(ClientSchema).optional(),
  businesses: z.array(BusinessSchema).optional(),
  services: z.array(ServiceSchema).optional(),
  charges: z.array(ChargeSchema).optional(),
  caprices: z.array(CapriceSchema).optional(),
}).superRefine((data, ctx) => {
  assertUniqueIds(data.accounts, 'cuentas', ctx)
  assertUniqueIds(data.categories, 'categorías', ctx)
  assertUniqueIds(data.goals, 'metas', ctx)
  assertUniqueIds(data.transactions, 'transacciones', ctx)
  assertUniqueIds(data.goalContributions, 'aportes a metas', ctx)

  const accountIds = new Set(data.accounts.map(account => account.id))
  const categoryIds = new Set(data.categories.map(category => category.id))
  const goalIds = new Set(data.goals.map(goal => goal.id))

  const transactionsValid = data.transactions.every(tx => tx.type === 'transfer'
    ? !!tx.fromAccount && !!tx.toAccount && tx.fromAccount !== tx.toAccount
        && accountIds.has(tx.fromAccount) && accountIds.has(tx.toAccount)
    : !!tx.accountId && !!tx.categoryId && accountIds.has(tx.accountId) && categoryIds.has(tx.categoryId))
  if (!transactionsValid) {
    ctx.addIssue({ code: 'custom', message: tt('backupBadTransactions') })
  }

  const splitsValid = data.transactions.every(tx => {
    if (!tx.splits || tx.splits.length === 0) return true
    const sum = tx.splits.reduce((total, split) => total + split.amount, 0)
    return Math.abs(sum - tx.amount) < 0.01 && tx.splits.every(split => categoryIds.has(split.categoryId))
  })
  if (!splitsValid) {
    ctx.addIssue({ code: 'custom', message: tt('backupBadSplits') })
  }

  const contributionsValid = data.goalContributions.every(contribution =>
    goalIds.has(contribution.goalId) && accountIds.has(contribution.fromAccountId))
  if (!contributionsValid) {
    ctx.addIssue({ code: 'custom', message: tt('backupBadContributions') })
  }
})

// v1 -> v2: v2 solo agrega campos opcionales (currency de cuenta, splits,
// toAmount, serviceId, incremento de aportes automáticos) que antes se
// perdían silenciosamente al restaurar. Un backup v1 sigue siendo válido tal
// cual — los campos nuevos simplemente no estaban ahí — así que no hace
// falta transformar los datos, solo aceptar ambas versiones al leer.
// v2 -> v3: v3 solo agrega `notes` (listas del usuario), un campo opcional. Un
// backup v1/v2 sigue siendo válido tal cual (sin notas). Igual que en v1->v2,
// no hace falta transformar: solo aceptar las tres versiones al leer.
const FinanceBackupSchema = z.object({
  // v3 -> v4: agrega clientes, negocios, servicios, cobros y caprichos, todos
  // opcionales. Un backup v1/v2/v3 sigue siendo valido tal cual.
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  exportedAt: z.string().optional(),
  data: BackupDataSchema,
})

export function parseBackup(value: string): FinanceBackup['data'] {
  let backup: unknown
  try {
    backup = JSON.parse(value)
  } catch {
    throw new Error(tt('errNotValidJson'))
  }

  const result = FinanceBackupSchema.safeParse(backup)
  if (!result.success) {
    const customIssue = result.error.issues.find(issue => issue.code === 'custom')
    if (customIssue) throw new Error(customIssue.message)

    const paths = new Set(result.error.issues.map(issue => issue.path[1]))
    if (paths.has('accounts')) throw new Error(tt('errBackupAccounts'))
    if (paths.has('categories')) throw new Error(tt('errBackupCategories'))
    if (paths.has('goals')) throw new Error(tt('errBackupGoals'))
    if (paths.has('transactions')) throw new Error(tt('errBackupTransactions'))
    if (paths.has('goalContributions')) throw new Error(tt('errBackupContributions'))
    if (paths.has('currency')) throw new Error(tt('errBackupCurrency'))
    throw new Error(tt('errNotValidBackup'))
  }

  return result.data.data
}
