import { businessMergePlan, serviceMergePlan } from '@/data/serviceMerge'
import { matchingDueKey, paidManually, type DuePayment } from '@/data/autopay'
import { serviceAccounts, type Business, type Service } from '@/data/business'
import { outstanding, type Charge, type Client } from '@/data/clients'
import { convertCurrency } from '@/data/currencies'
import { localToday } from '@/data/helpers'
import { newId } from '@/data/seed'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import type { CurrencyCode } from '@/types'

/**
 * LO QUE TOCA A LA VEZ EL LIBRO Y NEGOCIO.
 *
 * Los dos almacenes no se conocen a propósito (ver `store/business.ts`): el
 * dinero vive en uno y las expectativas en el otro. Las pocas operaciones que
 * cambian los dos van aquí, juntas y con su deshacer, para que ninguna
 * pantalla tenga que acordarse de hacer las dos mitades.
 */

function dosDecimales(n: number): number {
  return Math.round(n * 100) / 100
}

/** Un monto de una divisa en la de una cuenta, con lo necesario para auditarlo. */
function enCuenta(amount: number, from: CurrencyCode, to: CurrencyCode) {
  if (from === to) return { amount, fx: {} }
  const convertido = dosDecimales(convertCurrency(amount, from, to))
  const tasa = Math.round((convertido / amount) * 10_000) / 10_000
  return { amount: convertido, fx: { originalAmount: amount, originalCurrency: from, fxRate: tasa } }
}

// ── S3 · Unir servicios ────────────────────────────────────────────

export interface ServiceMergeUndo {
  target: Service
  source: Service
  clients: Client[]
  paymentIds: string[]
}

export function mergeServices(targetId: string, sourceId: string): ServiceMergeUndo | null {
  const negocio = useBusiness.getState()
  const target = negocio.services.find(s => s.id === targetId)
  const source = negocio.services.find(s => s.id === sourceId)
  if (!target || !source || target.id === source.id) return null
  const { transactions } = useFinance.getState()
  const plan = serviceMergePlan(target, source, negocio.clients, transactions)

  const undo: ServiceMergeUndo = {
    target: { ...target },
    source: { ...source },
    clients: negocio.clients.filter(c => plan.clientChanges.has(c.id)).map(c => ({ ...c })),
    paymentIds: plan.paymentIds,
  }

  useBusiness.setState(st => ({
    services: st.services
      .filter(s => s.id !== source.id)
      .map(s => s.id === target.id ? { ...s, accounts: plan.accounts } : s),
    clients: st.clients.map(c => plan.clientChanges.has(c.id) ? { ...c, ...plan.clientChanges.get(c.id) } : c),
  }))
  // Los pagos del que se une pasan a ser del que queda. La cuenta no se toca:
  // cada uno pagó la cuenta que trajo su servicio.
  useFinance.getState().retagPayments(plan.paymentIds, target.id, serviceAccounts(source)[0]?.id)
  return undo
}

export function unmergeServices(undo: ServiceMergeUndo): void {
  const viejos = new Map(undo.clients.map(c => [c.id, c]))
  useBusiness.setState(st => ({
    services: [...st.services.map(s => s.id === undo.target.id ? undo.target : s), undo.source],
    clients: st.clients.map(c => viejos.get(c.id) ?? c),
  }))
  useFinance.getState().retagPayments(undo.paymentIds, undo.source.id)
}

// ── G2 · Unir negocios ─────────────────────────────────────────────

export interface BusinessMergeUndo {
  target: Business
  sources: Business[]
  serviceIds: Array<{ id: string; businessId: string }>
  clientIds: Array<{ id: string; businessId: string | undefined }>
}

export function mergeBusinesses(targetId: string, sourceIds: string[]): BusinessMergeUndo | null {
  const st = useBusiness.getState()
  const target = st.businesses.find(b => b.id === targetId)
  const sources = st.businesses.filter(b => sourceIds.includes(b.id) && b.id !== targetId)
  if (!target || !sources.length) return null
  const plan = businessMergePlan(target, sources, st.services, st.clients)
  const undo: BusinessMergeUndo = {
    target: { ...target },
    sources: sources.map(b => ({ ...b })),
    serviceIds: st.services.filter(s => plan.serviceIds.includes(s.id)).map(s => ({ id: s.id, businessId: s.businessId })),
    clientIds: st.clients.filter(c => plan.clientIds.includes(c.id)).map(c => ({ id: c.id, businessId: c.businessId })),
  }
  const fuera = new Set(sources.map(b => b.id))
  useBusiness.setState(s => ({
    businesses: s.businesses
      .filter(b => !fuera.has(b.id))
      .map(b => b.id === target.id
        ? { ...b, incomeCategoryIds: plan.incomeCategoryIds, expenseCategoryIds: plan.expenseCategoryIds }
        : b),
    services: s.services.map(v => plan.serviceIds.includes(v.id) ? { ...v, businessId: target.id } : v),
    clients: s.clients.map(c => plan.clientIds.includes(c.id) ? { ...c, businessId: target.id } : c),
  }))
  return undo
}

export function unmergeBusinesses(undo: BusinessMergeUndo): void {
  const svc = new Map(undo.serviceIds.map(x => [x.id, x.businessId]))
  const cli = new Map(undo.clientIds.map(x => [x.id, x.businessId]))
  useBusiness.setState(s => ({
    businesses: [...s.businesses.map(b => b.id === undo.target.id ? undo.target : b), ...undo.sources],
    services: s.services.map(v => svc.has(v.id) ? { ...v, businessId: svc.get(v.id)! } : v),
    clients: s.clients.map(c => cli.has(c.id) ? { ...c, businessId: cli.get(c.id) } : c),
  }))
}

// ── P1/P2 · Registrar el pago de un servicio ───────────────────────

/**
 * Crea el gasto de un pago de servicio, con su cuenta y su categoría.
 *
 * Devuelve el id del gasto, o `null` si no se pudo (sin cuenta, sin
 * categoría, o el saldo no da con la política de «bloquear»). El pago se
 * apunta como resuelto solo si el gasto se creó: si no, mañana se intenta
 * otra vez en vez de darse por pagado sin dinero detrás.
 */
export function registerServicePayment(due: DuePayment, opts: { auto: boolean }): string | null {
  const { accounts, categories, currency, addTx } = useFinance.getState()
  const { service, account, date, key } = due
  const cuenta = accounts.find(a => a.id === service.payAccountId)
  const categoria = categories.find(c => c.id === service.payCategoryId && c.type === 'expense')
  if (!cuenta || !categoria) return null
  const { amount, fx } = enCuenta(due.amount, service.currency ?? currency, cuenta.currency ?? currency)
  const varias = serviceAccounts(service).length > 1
  const id = newId()
  try {
    addTx({
      id,
      type: 'expense',
      date,
      amount,
      note: varias && account.label ? `${service.name} · ${account.label}` : service.name,
      categoryId: categoria.id,
      accountId: cuenta.id,
      paidService: service.id,
      paidAccount: account.id,
      ...(opts.auto ? { autoPaid: true } : {}),
      ...fx,
    })
  } catch {
    return null
  }
  useBusiness.getState().markPayHandled(service.id, [key], localToday())
  return id
}

/**
 * Un pago hecho a mano desde «Pagar» resuelve el que tocaba cerca de esa
 * fecha: si no se apuntara, el día que toca la app lo registraría otra vez.
 */
export function settleManualPayment(service: Service, accountId: string | undefined, date: string): void {
  const cuenta = serviceAccounts(service).find(a => a.id === accountId) ?? serviceAccounts(service)[0]
  if (!cuenta) return
  const key = matchingDueKey(service, cuenta, date)
  if (key) useBusiness.getState().markPayHandled(service.id, [key], localToday())
}

/** Si ese pago ya se hizo a mano: entonces se resuelve sin crear nada. */
export function alreadyPaidByHand(due: DuePayment): boolean {
  return paidManually(due.service, due.account, due.date, useFinance.getState().transactions)
}

// ── P5 · Cobrar solo / E3 · Cobrar varios ──────────────────────────

/**
 * Cobra un cobro entero, como «Me pagó» con todo por defecto.
 *
 * El mismo orden que `CollectSheet`: primero el movimiento, y solo si existe
 * se marca el cobro. Devuelve el ingreso y lo cobrado, o `null`.
 */
export function collectCharge(charge: Charge, date = localToday()): { txId: string; amount: number } | null {
  const negocio = useBusiness.getState()
  const client = negocio.clients.find(c => c.id === charge.clientId)
  const { accounts, currency, addTx } = useFinance.getState()
  if (!client || !client.categoryId) return null
  const cuenta = accounts.find(a => a.id === client.accountId && a.type !== 'credit')
  if (!cuenta) return null
  const falta = outstanding(charge)
  if (!(falta > 0)) return null
  const { amount, fx } = enCuenta(falta, client.currency ?? currency, cuenta.currency ?? currency)
  const id = newId()
  try {
    addTx({
      id,
      type: 'income',
      date,
      amount,
      note: `${client.name}${client.concept ? ` · ${client.concept}` : ''}`,
      categoryId: client.categoryId,
      accountId: cuenta.id,
      ...fx,
    })
  } catch {
    return null
  }
  negocio.markPaid(charge.id, falta, id)
  return { txId: id, amount: falta }
}

/** Deshace un cobro hecho con `collectCharge`, con lo que él devolvió. */
export function uncollectCharge(chargeId: string, paid: { txId: string; amount: number }): void {
  useBusiness.getState().unmarkPaid(chargeId, paid.txId, paid.amount)
  if (useFinance.getState().transactions.some(t => t.id === paid.txId)) useFinance.getState().deleteTx(paid.txId)
}

/** Marca como de este servicio unos pagos viejos sin marca. */
export function markOldPayments(serviceId: string, ids: string[]): void {
  useFinance.getState().retagPayments(ids, serviceId)
}
