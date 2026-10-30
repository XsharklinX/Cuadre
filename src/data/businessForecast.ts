import { clientTotalAmount, dueDatesBetween, type Client } from './clients'
import { serviceAccounts, type Service } from './business'
import { isLongCycle, serviceDueDates } from './autopay'
import { convertCurrency } from './currencies'
import { applyDiscount } from './referrals'
import { monthKey } from './helpers'
import type { CurrencyCode, Transaction } from '@/types'

/**
 * G4 · EL MES QUE VIENE, ANTES DE QUE LLEGUE.
 *
 * Lo que vas a cobrar según tus clientes activos, lo que vas a pagar según tus
 * servicios, y lo que te quedaría, mes a mes. Lo que más se nota son los pagos
 * anuales: marzo, cuando toca Disney+, sale como el mes flojo que va a ser, y
 * no como una sorpresa.
 *
 * Es una PREVISIÓN y se dice: usa los precios de hoy y supone que todos pagan.
 * No mira el pasado salvo para una cosa: si un servicio no tiene día de pago
 * configurado, se toma la fecha de su último pago como ancla, que es lo más
 * parecido a saber cuándo toca.
 */

export interface ForecastMonth {
  mkey: string
  income: number
  costs: number
  net: number
  /** Los pagos de ciclo largo que caen este mes: lo que lo hace distinto. */
  big: Array<{ service: Service; amount: number }>
}

function cents(n: number): number {
  return Math.round(n * 100) / 100
}

function enBase(amount: number, from: CurrencyCode | undefined, base: CurrencyCode): number {
  if (!from || from === base) return amount
  return convertCurrency(amount, from, base)
}

/** El último pago de un servicio, como ancla cuando no tiene día puesto. */
function ultimoPago(service: Service, txns: Transaction[]): string | undefined {
  let ultimo: string | undefined
  for (const tx of txns) {
    if (tx.type === 'expense' && tx.paidService === service.id && (!ultimo || tx.date > ultimo)) ultimo = tx.date
  }
  return ultimo
}

export function businessForecast(
  clients: Client[],
  services: Service[],
  txns: Transaction[],
  today: string,
  months: number,
  base: CurrencyCode,
  discountFor: (client: Client) => number = () => 0,
): ForecastMonth[] {
  const inicio = new Date(`${today.slice(0, 7)}-01T00:00:00`)
  inicio.setMonth(inicio.getMonth() + 1)
  const fin = new Date(inicio)
  fin.setMonth(fin.getMonth() + months)
  fin.setDate(0)
  const desde = `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}-01`
  const hasta = `${fin.getFullYear()}-${String(fin.getMonth() + 1).padStart(2, '0')}-${String(fin.getDate()).padStart(2, '0')}`

  const meses = new Map<string, ForecastMonth>()
  const cursor = new Date(inicio)
  for (let i = 0; i < months; i += 1) {
    const mk = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
    meses.set(mk, { mkey: mk, income: 0, costs: 0, net: 0, big: [] })
    cursor.setMonth(cursor.getMonth() + 1)
  }

  for (const client of clients) {
    if (!client.active || client.deletedAt || client.variableAmount) continue
    const monto = enBase(applyDiscount(clientTotalAmount(client), discountFor(client)), client.currency, base)
    for (const fecha of dueDatesBetween(client, desde, hasta)) {
      const mes = meses.get(monthKey(fecha))
      if (mes) mes.income += monto
    }
  }

  for (const service of services) {
    if (service.archivedAt) continue
    const ancla = service.payAnchor ?? ultimoPago(service, txns)
      ?? new Date(service.createdAt).toISOString().slice(0, 10)
    const largo = isLongCycle(service)
    for (const account of serviceAccounts(service)) {
      const monto = enBase(account.cost, service.currency, base)
      for (const fecha of serviceDueDates(service, account, desde, hasta, ancla)) {
        const mes = meses.get(monthKey(fecha))
        if (!mes) continue
        mes.costs += monto
        if (largo) {
          const ya = mes.big.find(b => b.service.id === service.id)
          if (ya) ya.amount = cents(ya.amount + monto)
          else mes.big.push({ service, amount: cents(monto) })
        }
      }
    }
  }

  return [...meses.values()].map(m => ({
    ...m,
    income: cents(m.income),
    costs: cents(m.costs),
    net: cents(m.income - m.costs),
  }))
}

/**
 * El mes que se sale de lo normal, para decirlo con una frase: el de menos
 * ganancia, si queda bastante por debajo de la media de los demás.
 */
export function weakestMonth(meses: ForecastMonth[]): ForecastMonth | null {
  if (meses.length < 2) return null
  const peor = meses.reduce((a, b) => (b.net < a.net ? b : a))
  const resto = meses.filter(m => m !== peor)
  const media = resto.reduce((s, m) => s + m.net, 0) / resto.length
  // Solo si de verdad destaca: un mes un 5% peor no merece una frase.
  if (!(media > 0) || peor.net > media * 0.75) return null
  return peor
}
