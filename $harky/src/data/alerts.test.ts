import { describe, expect, it } from 'vitest'
import { getMobileAlerts } from './alerts'
import type { Transaction } from '@/types'

const TODAY = '2026-07-21'

const recharge = (over: Partial<Transaction> = {}): Transaction => ({
  id: 'tx_recarga', type: 'expense', amount: 300, date: '2026-06-21',
  note: 'Recarga papá', accountId: 'acc_1', categoryId: 'cat_otros',
  recurring: 'monthly', recurringNext: '2026-07-21', ...over,
})

describe('getMobileAlerts — silenciado de pagos recurrentes', () => {
  it('avisa de un pago recurrente que vence hoy', () => {
    const alerts = getMobileAlerts([recharge()], [], 'DOP', TODAY)
    expect(alerts.map(a => a.target)).toContainEqual({ type: 'recurring', transactionId: 'tx_recarga' })
  })

  it('descartar la ocurrencia NO silencia el mes siguiente', () => {
    const dismissed = [`recurring:tx_recarga:${TODAY}`]

    expect(getMobileAlerts([recharge()], [], 'DOP', TODAY, 'es-DO', dismissed)).toHaveLength(0)

    // Mismo pago, siguiente vencimiento: la id lleva la fecha dentro, así que
    // el descarte anterior ya no aplica y el aviso vuelve. Este es exactamente
    // el motivo por el que hace falta silenciar por plantilla.
    const nextMonth = getMobileAlerts(
      [recharge({ recurringNext: '2026-08-21' })], [], 'DOP', '2026-08-21', 'es-DO', dismissed,
    )
    expect(nextMonth).toHaveLength(1)
  })

  it('silenciar la plantilla lo calla en cualquier fecha futura', () => {
    const silenced = ['tx_recarga']

    expect(getMobileAlerts([recharge()], [], 'DOP', TODAY, 'es-DO', [], silenced)).toHaveLength(0)
    expect(getMobileAlerts(
      [recharge({ recurringNext: '2026-08-21' })], [], 'DOP', '2026-08-21', 'es-DO', [], silenced,
    )).toHaveLength(0)
  })

  it('silenciar un pago no afecta a los demás', () => {
    const otro = recharge({ id: 'tx_gym', note: 'Gimnasio' })
    const alerts = getMobileAlerts([recharge(), otro], [], 'DOP', TODAY, 'es-DO', [], ['tx_recarga'])
    expect(alerts).toHaveLength(1)
    expect(alerts[0].target).toEqual({ type: 'recurring', transactionId: 'tx_gym' })
  })
})
