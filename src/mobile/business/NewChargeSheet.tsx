import { useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { fmt, localToday } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { BizSheet, Field } from './shared'

/**
 * UN COBRO SUELTO.
 *
 * ── EL PROBLEMA QUE RESUELVE ──────────────────────────────────────────
 * Hasta ahora los cobros solo nacían del ciclo del cliente: si alguien que te
 * paga Netflix cada mes te encarga además una tarea, no había dónde apuntarla.
 * La única salida era crear un segundo cliente con el mismo nombre, y entonces
 * su historial queda partido en dos personas que no existen.
 *
 * Un cliente es una persona; un cobro es un trabajo. Son cosas distintas y
 * hasta ahora la app las trataba como una.
 *
 * ── LO QUE NO HACE ────────────────────────────────────────────────────
 * No toca el balance. Crea una expectativa con fecha, igual que las del ciclo,
 * y se cobra por la misma puerta (`CollectSheet` → `markPaid` → `addTx`). Un
 * cobro suelto que se pagara solo sería dinero inventado.
 */
export function NewChargeSheet({
  clientId: fijo, onClose,
}: {
  /** Si viene de la ficha de un cliente, ya se sabe a quién: no se pregunta. */
  clientId?: string
  onClose: () => void
}) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const { currency } = useFinance()
  const { clients, addCharge } = useBusiness()

  /*
   * Solo los activos. Ofrecer un cliente pausado aquí sería contradecir lo que
   * dice su propia ficha —«no se le generan cobros nuevos»— en la misma app.
   */
  const elegibles = clients.filter(c => c.active || c.id === fijo)

  const [clientId, setClientId] = useState(fijo ?? elegibles[0]?.id ?? '')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(localToday())

  const client = clients.find(c => c.id === clientId)
  const cur = client?.currency ?? currency
  const monto = Number(amount) || 0
  const canSave = !!client && monto > 0 && !!date

  const crear = () => {
    if (!canSave) return
    addCharge(clientId, date, monto)
    playSoftHaptic()
    toast(t('bizChargeCreated'), { icon: 'check', type: 'ok' })
    onClose()
  }

  return (
    <BizSheet
      title={t('bizNewCharge')}
      onClose={onClose}
      onSave={crear}
      saveLabel={t('bizChargeCreate')}
      canSave={canSave}
    >
      <p className="mbizs-calc">{t('bizNewChargeWhy')}</p>

      {elegibles.length === 0 ? (
        <p className="mbizs-calc warn">{t('bizChargeNoClients')}</p>
      ) : (
        <>
          {/* Con el cliente ya decidido no se pregunta, se recuerda. */}
          {fijo ? (
            <Field label={t('bizChargeWho')}>
              <input className="mbizs-input" type="text" value={client?.name ?? ''} readOnly />
            </Field>
          ) : (
            <Field label={t('bizChargeWho')}>
              <select className="mbizs-input" value={clientId} onChange={e => setClientId(e.target.value)}>
                {elegibles.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field
            label={t('amount')}
            hint={monto > 0 ? fmt(monto, cur, { decimals: moneyDecimals }) : undefined}
          >
            <input
              className="mbizs-input mbizs-input-sm"
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
            />
          </Field>

          <Field label={t('bizChargeDue')}>
            <input className="mbizs-input mbizs-input-sm" type="date" value={date} onChange={e => setDate(e.target.value)} />
          </Field>
        </>
      )}
    </BizSheet>
  )
}
