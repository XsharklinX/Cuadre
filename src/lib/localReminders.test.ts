import { beforeEach, describe, expect, it } from 'vitest'
import { buildReminderSnapshot } from './localReminders'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { localToday } from '@/data/helpers'

/**
 * EL SNAPSHOT DE LOS AVISOS NATIVOS SE PUEDE CONSTRUIR.
 *
 * Con un solo movimiento recurrente lanzaba un ReferenceError (`on` se usaba
 * antes de declararse) y el `catch` de quien lo llama lo callaba: el teléfono
 * se quedaba con los avisos viejos sin que nada lo dijera. Esto lo construye
 * con un recurrente y con un pago de servicio, que son los dos casos que lo
 * tocan.
 */
describe('buildReminderSnapshot', () => {
  beforeEach(() => {
    useFinance.setState({
      currency: 'DOP',
      accounts: [{ id: 'a1', name: 'Popular', short: 'BP', type: 'debit', balance: 100, color: '#000', last4: null, includeInTotal: true }],
      categories: [{ id: 'c1', name: 'Subs', type: 'expense', color: '#000', budget: 0, icon: 'tv' }],
      transactions: [{
        id: 'r1', type: 'expense', amount: 500, date: '2026-01-05', note: 'Gimnasio',
        accountId: 'a1', categoryId: 'c1', recurring: 'monthly', recurringStart: '2026-01-05',
      }],
      goals: [],
    } as never)
    useBusiness.setState({ services: [], clients: [], charges: [], businesses: [] })
  })

  it('con un recurrente no lanza', () => {
    expect(() => buildReminderSnapshot()).not.toThrow()
  })

  it('el pago de un servicio que pregunta sale hoy en la lista de recurrentes', () => {
    const hoy = localToday()
    useBusiness.setState({
      services: [{
        id: 's1', businessId: 'b1', name: 'Netflix', cost: 880, costCycle: 'monthly', createdAt: 0,
        payMode: 'ask', payDay: Number(hoy.slice(8, 10)), payFrom: hoy, payAccountId: 'a1', payCategoryId: 'c1',
      }],
    })
    const snap = JSON.parse(buildReminderSnapshot())
    const fila = snap.recurring.find((r: { id: string }) => r.id.startsWith('svcpay:'))
    expect(fila).toMatchObject({ note: 'Netflix', nextDate: hoy, lowFunds: true })
  })
})
