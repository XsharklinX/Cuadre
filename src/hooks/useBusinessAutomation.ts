import { useEffect, useRef } from 'react'
import { toast } from '@/components/ui/Toast'
import { duePayments } from '@/data/autopay'
import { localToday } from '@/data/helpers'
import { tt } from '@/i18n'
import {
  alreadyPaidByHand, collectCharge, registerServicePayment, uncollectCharge,
} from '@/lib/businessOps'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'

/**
 * P1 · P5 · LO QUE SE PAGA Y SE COBRA SOLO.
 *
 * Corre al abrir la app y cada vez que vuelve a primer plano, una vez al día,
 * igual que los recurrentes (ver `useRecurring`): con la app cerrada no corre
 * nada, así que lo que tocaba esos días se registra al volver CON SU FECHA,
 * no con la de hoy.
 *
 *  · Los servicios en modo `auto` crean su gasto el día que toca. Si ya lo
 *    pagaste a mano cerca de esa fecha, se da por resuelto sin crear nada.
 *  · Los clientes con «se cobra solo» marcan sus cobros vencidos como
 *    pagados, con su ingreso.
 *
 * Al terminar, un aviso con lo que hizo y un «Deshacer» que borra
 * exactamente eso, y nada de lo que pusiste tú.
 */
export function useBusinessAutomation(): void {
  const ultimoDia = useRef<string | null>(null)

  useEffect(() => {
    const correr = () => {
      const hoy = localToday()
      if (ultimoDia.current === hoy) return
      ultimoDia.current = hoy
      automatizar(hoy)
    }
    const alVolver = () => { if (document.visibilityState === 'visible') correr() }
    correr()
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])
}

function automatizar(hoy: string): void {
  // Del almacén, no de un closure: esto vuelve a correr al pasar a primer
  // plano, y comprobar duplicados contra una lista vieja es como se duplica.
  const { services, charges, clients, markPayHandled } = useBusiness.getState()

  const pagos: Array<{ txId: string; serviceId: string; key: string; name: string }> = []
  for (const due of duePayments(services, hoy, { modes: ['auto'] })) {
    if (alreadyPaidByHand(due)) {
      markPayHandled(due.service.id, [due.key], hoy)
      continue
    }
    const txId = registerServicePayment(due, { auto: true })
    if (txId) pagos.push({ txId, serviceId: due.service.id, key: due.key, name: due.service.name })
  }

  const cobros: Array<{ chargeId: string; paid: { txId: string; amount: number }; name: string }> = []
  const automaticos = new Map(clients.filter(c => c.autoCollect && c.active && !c.deletedAt).map(c => [c.id, c]))
  if (automaticos.size) {
    for (const ch of charges) {
      const client = automaticos.get(ch.clientId)
      if (!client || ch.waived || ch.dueDate > hoy || ch.paid >= ch.amount - 0.005) continue
      const paid = collectCharge(ch, ch.dueDate)
      if (paid) cobros.push({ chargeId: ch.id, paid, name: client.name })
    }
  }

  const total = pagos.length + cobros.length
  if (!total) return
  const nombres = [...new Set([...pagos.map(p => p.name), ...cobros.map(c => c.name)])].slice(0, 3).join(', ')
  toast(tt(total === 1 ? 'autoDoneOne' : 'autoDoneMany', { n: total, names: nombres }), {
    icon: 'repeat',
    type: 'ok',
    duration: 8000,
    action: {
      label: tt('undo'),
      onClick: () => {
        const negocio = useBusiness.getState()
        for (const p of pagos) {
          if (useFinance.getState().transactions.some(t => t.id === p.txId)) useFinance.getState().deleteTx(p.txId)
          // Deshacer lo deja pendiente otra vez, en vez de dado por pagado.
          negocio.unmarkPayHandled(p.serviceId, [p.key])
        }
        for (const c of cobros) uncollectCharge(c.chargeId, c.paid)
      },
    },
  })
}
