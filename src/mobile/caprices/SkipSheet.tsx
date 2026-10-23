import { useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { remaining, sortCaprices } from '@/data/caprices'
import { convertCurrency } from '@/data/currencies'
import { fmt, localToday } from '@/data/helpers'
import { newId } from '@/data/seed'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSuccessHaptic } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useWishes } from '@/store/wishes'
import type { Wish } from '@/data/wishes'
import { BizSheet, Field } from '../business/shared'

/**
 * «YA NO LO QUIERO»: lo que pasa cuando dejas pasar un antojo.
 *
 * ── LA LÍNEA QUE NO SE CRUZA ──────────────────────────────────────────
 * No comprar algo de 4,500 no mueve ni un peso: tu saldo es exactamente el
 * que era. Abonarlo al bote sin más sería inventarse una recuperación,
 * igual que marcar un cobro sin movimiento detrás sería inventarse un ingreso.
 *
 * Así que esta hoja ofrece lo único que lo hace real: una TRANSFERENCIA de
 * ese monto a tu ahorro. Entonces sí se movió dinero, y entonces sí abona el
 * bote de un capricho.
 *
 * Y se puede decir que no. El antojo cuenta igual en «lo que no gastaste»
 * —eso es cierto sin mover nada—, pero el bote no baja, porque el bote mide
 * dinero recuperado y no buenas intenciones.
 */
export function SkipSheet({ wish, onClose }: { wish: Wish; onClose: () => void }) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const { accounts, currency, addTx } = useFinance()
  const skip = useWishes(s => s.skip)
  const items = useCaprices(s => s.items)
  const pay = useCaprices(s => s.pay)

  const liquidas = accounts.filter(a => a.type !== 'credit')
  const ahorros = liquidas.filter(a => a.type === 'savings')

  const [mover, setMover] = useState(ahorros.length > 0)
  const [fromId, setFromId] = useState(liquidas.find(a => a.type !== 'savings')?.id ?? liquidas[0]?.id ?? '')
  const [toId, setToId] = useState(ahorros[0]?.id ?? '')
  // Los caprichos abiertos, el que menos le falta primero: cerrar uno es
  // mejor que dejar tres a medias.
  const abiertos = sortCaprices(items.filter(c => !c.closed && remaining(c) > 0))
  const [capriceId, setCapriceId] = useState(abiertos[0]?.id ?? '')

  const desde = accounts.find(a => a.id === fromId)
  const hacia = accounts.find(a => a.id === toId)
  const puedeMover = mover && !!desde && !!hacia && desde.id !== hacia.id

  const confirmar = () => {
    if (puedeMover && desde && hacia) {
      try {
        const curDesde = desde.currency ?? currency
        const monto = curDesde === currency
          ? wish.amount
          : Math.round(convertCurrency(wish.amount, currency, curDesde) * 100) / 100

        const txId = newId()
        addTx({
          id: txId,
          type: 'transfer',
          date: localToday(),
          amount: monto,
          note: t('wishSkipNote').replace('{name}', wish.name),
          fromAccount: desde.id,
          toAccount: hacia.id,
        })

        // Y si hay un capricho elegido, el movimiento lo abona: el aporte
        // queda respaldado por dinero que de verdad se movió.
        const elegido = abiertos.find(c => c.id === capriceId)
        if (elegido) pay(elegido.id, Math.min(monto, remaining(elegido)), txId)
      } catch (error) {
        toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
        return
      }
    }

    skip(wish.id)
    playSuccessHaptic()
    toast(t('wishSkipped').replace('{amount}', fmt(wish.amount, currency, { decimals: moneyDecimals })), {
      icon: 'check',
      type: 'ok',
    })
    onClose()
  }

  return (
    <BizSheet
      title={t('wishSkipTitle')}
      onClose={onClose}
      onSave={confirmar}
      saveLabel={puedeMover ? t('wishSkipAndMove') : t('wishSkipOnly')}
    >
      <div className="mbizs-hero">
        <small>{t('wishSaved')}</small>
        <strong>{fmt(wish.amount, currency, { decimals: moneyDecimals })}</strong>
        <span>{wish.name}</span>
      </div>

      {/* La diferencia entre «no lo gasté» y «lo recuperé», dicha donde
          importa: una es cierta sin mover nada, la otra necesita un
          movimiento. */}
      <p className="mbizs-calc">{t('wishSkipExplain')}</p>

      {ahorros.length > 0 && liquidas.length > 1 && (
        <button
          type="button"
          className={`mbizs-toggle${mover ? ' on' : ''}`}
          onClick={() => setMover(v => !v)}
        >
          <span>
            <b>{t('wishMoveIt')}</b>
            <small>{t('wishMoveItHint')}</small>
          </span>
          <i />
        </button>
      )}

      {puedeMover && (
        <>
          <Field label={t('from')}>
            <select className="mbizs-input" value={fromId} onChange={e => setFromId(e.target.value)}>
              {liquidas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label={t('to')}>
            <select className="mbizs-input" value={toId} onChange={e => setToId(e.target.value)}>
              {ahorros.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>

          {abiertos.length > 0 && (
            <Field label={t('wishAbonaTo')} hint={t('wishAbonaToHint')}>
              <select className="mbizs-input" value={capriceId} onChange={e => setCapriceId(e.target.value)}>
                <option value="">{t('wishAbonaNone')}</option>
                {abiertos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.note} · {fmt(remaining(c), currency, { decimals: moneyDecimals })}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
    </BizSheet>
  )
}
