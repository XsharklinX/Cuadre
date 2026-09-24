import { Icon } from '@/components/ui/Icon'
import { accountCurrency } from '@/data/helpers'
import { useFmt } from '@/hooks/useFmt'
import { useFinance } from '@/store/finance'
import type { Account, IconName } from '@/types'

/**
 * Una cuenta dentro de un selector.
 *
 * Existía copiada en tres pantallas (crear movimiento, suscripciones, lote de
 * recibos) con tres formatos de saldo distintos, así que un arreglo en una no
 * llegaba a las otras. Ahora es una sola.
 *
 * LO QUE RESUELVE: con varias tarjetas del mismo banco —"BANRESERVAS",
 * "Banreservas Secundaria", "Banreservas Credito"— la lista era un juego de
 * adivinanzas. Los últimos 4 dígitos van DEBAJO del nombre, como en el
 * plástico, y sólo donde hay plástico: el efectivo no tiene número y ponerle
 * una etiqueta vacía sería ruido.
 */

const ACCT_ICONS: Record<Account['type'], IconName> = {
  cash: 'wallet',
  debit: 'cards',
  savings: 'piggy',
  credit: 'cards',
}

export function AccountPickerRow({ account, selected, onSelect }: {
  account: Account
  selected: boolean
  onSelect: () => void
}) {
  const currency = useFinance(s => s.currency)
  const fmtVal = useFmt()

  return (
    <button
      className={`mobile-picker-row${selected ? ' active' : ''}`}
      onClick={onSelect}
    >
      <span style={{ color: account.color }}>
        <Icon name={ACCT_ICONS[account.type] ?? 'wallet'} size={22} />
      </span>
      <span className="mpick-id">
        <b>{account.name}</b>
        {account.last4 && <small className="mpick-last4">···· {account.last4}</small>}
      </span>
      <small className="mpick-amount">{fmtVal(account.balance, accountCurrency(account, currency))}</small>
      {selected && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 4 }} />}
    </button>
  )
}
