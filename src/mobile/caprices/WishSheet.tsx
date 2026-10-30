import { useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { WAIT_DAYS } from '@/data/wishes'
import { fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useFinance } from '@/store/finance'
import { useWishes } from '@/store/wishes'
import { BizSheet, Field } from '../business/shared'

/**
 * APUNTAR UN ANTOJO.
 *
 * Tres campos y ninguno obligatorio más que el nombre: si apuntar lo que
 * quieres cuesta más que comprarlo, nadie lo apunta y la función no existe.
 *
 * La espera no se elige. Siete días es la regla, y poder ponerla a uno la
 * convertiría en un trámite que se salta a sí mismo.
 */
export function WishSheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const { currency } = useFinance()
  const add = useWishes(s => s.add)

  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const monto = Number(amount) || 0
  const canSave = name.trim().length > 0 && monto > 0

  const guardar = () => {
    if (!canSave) return
    add(name, monto, note)
    playSoftHaptic()
    toast(t('wishAdded').replace('{n}', String(WAIT_DAYS)), { icon: 'check', type: 'ok' })
    onClose()
  }

  return (
    <BizSheet title={t('wishNew')} onClose={onClose} onSave={guardar} canSave={canSave}
      missing={!name.trim() ? t('fieldName') : !(monto > 0) ? t('fieldAmount') : null}>
      <p className="mbizs-calc">{t('wishNewWhy').replace('{n}', String(WAIT_DAYS))}</p>

      <Field label={t('wishWhat')} needs={!name.trim()}>
        <input
          className="mbizs-input"
          value={name}
          autoCapitalize="sentences"
          placeholder={t('wishWhatPlaceholder')}
          onChange={e => setName(e.target.value)}
        />
      </Field>

      <Field
        label={t('amount')}
        hint={monto > 0 ? fmt(monto, currency, { decimals: moneyDecimals }) : undefined}
        needs={!!name.trim() && !(monto > 0)}
      >
        <input
          className="mbizs-input mbizs-input-sm"
          type="number"
          inputMode="decimal"
          value={amount}
          placeholder="0"
          onChange={e => setAmount(e.target.value)}
        />
      </Field>

      {/* Por qué lo quieres. Es el campo que se lee al séptimo día, cuando ya
          no te acuerdas de por qué te parecía imprescindible. */}
      <Field label={t('wishWhy')} hint={t('wishWhyHint')}>
        <input
          className="mbizs-input"
          value={note}
          maxLength={280}
          onChange={e => setNote(e.target.value)}
        />
      </Field>
    </BizSheet>
  )
}
