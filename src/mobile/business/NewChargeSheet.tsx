import { useState } from 'react'
import { SheetSelectList } from '@/components/ui/SheetSelect'
import { toast } from '@/components/ui/Toast'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { BizSheet } from './shared'
import { BigAmount, FormRow, FormRows } from './ShortForm'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { MobileDatePicker } from '../MobileDatePicker'

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
  const [hoja, setHoja] = useState<'amount' | 'date' | 'who' | null>(null)
  const lang = useSettings(s => s.language)

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
      missing={!client ? t('bizChargeWho') : !(monto > 0) ? t('fieldAmount') : !date ? t('date') : null}
    >
      <p className="mbizs-calc">{t('bizNewChargeWhy')}</p>

      {elegibles.length === 0 ? (
        <p className="mbizs-calc warn">{t('bizChargeNoClients')}</p>
      ) : (
        <>
          {/* La hoja corta (2.8): el monto en grande y dos filas. */}
          <BigAmount
            label={t('amount')}
            value={monto > 0 ? fmt(monto, cur, { decimals: moneyDecimals }) : t('n28TapToWrite')}
            missing={!!client && !(monto > 0)}
            empty={!(monto > 0)}
            onTap={() => setHoja('amount')}
          />
          <FormRows>
            <FormRow label={t('bizChargeWho')} value={client?.name ?? ''} missing={!client} onTap={fijo ? undefined : () => setHoja('who')} />
            <FormRow label={t('bizChargeDue')} value={date ? new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' }) : ''} onTap={() => setHoja('date')} />
          </FormRows>
        </>
      )}

      {hoja === 'amount' && (
        <MobileAmountSheet title={t('amount')} value={monto} currency={cur} onDone={v => { setAmount(v > 0 ? String(v) : ''); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'date' && (
        <MobileDatePicker value={date} onChange={v => { setDate(v); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'who' && (
        <SheetSelectList
          title={t('bizChargeWho')}
          value={clientId}
          options={elegibles.map(c => ({ value: c.id, label: c.name }))}
          onPick={v => { setClientId(v); setHoja(null) }}
          onClose={() => setHoja(null)}
        />
      )}
    </BizSheet>
  )
}
