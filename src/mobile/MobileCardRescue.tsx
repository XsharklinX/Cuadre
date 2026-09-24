import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { balanceIfAvailable, type RescueCandidate } from '@/data/cardRescue'
import { useFmt } from '@/hooks/useFmt'
import { accountCurrency } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * "¿Son X lo que debes o lo que te queda?"
 *
 * PREGUNTA, no corrige. Un saldo a favor es legítimo, y arreglarle a alguien
 * un dato que estaba bien es peor que dejar el que estaba mal. Por eso las dos
 * salidas pesan igual y ninguna viene marcada por defecto.
 *
 * Se pregunta UNA vez por tarjeta: la respuesta se recuerda incluso cuando es
 * "déjalo así", porque volver a preguntar lo mismo cada arranque es la forma
 * más rápida de que se ignoren todos los avisos de la app.
 */
export function MobileCardRescue({ candidate, onClose }: {
  candidate: RescueCandidate
  onClose: () => void
}) {
  const t = useT()
  const fmtVal = useFmt()
  const currency = useFinance(s => s.currency)
  const accounts = useFinance(s => s.accounts)
  const updateAccount = useFinance(s => s.updateAccount)
  const dismissAlert = useSettings(s => s.dismissAlert)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const account = accounts.find(a => a.id === candidate.accountId)
  const cur = account ? accountCurrency(account, currency) : currency
  const dismissId = `card-rescue:${candidate.accountId}`

  const remember = () => dismissAlert(dismissId)

  const fixIt = () => {
    updateAccount(candidate.accountId, { balance: balanceIfAvailable(candidate) })
    remember()
    toast(t('cardRescueFixed'), { icon: 'check', type: 'ok' })
    onClose()
  }

  const keepIt = () => {
    remember()
    toast(t('cardRescueKept'), { icon: 'info' })
    onClose()
  }

  const body = t('cardRescueBody')
    .replace('{name}', candidate.name)
    .replace('{amount}', fmtVal(candidate.amount, cur))
    .replace('{debt}', fmtVal(candidate.impliedDebt, cur))

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet centered" role="dialog" aria-modal="true"
        aria-label={t('cardRescueTitle')}>
        <section className="mrescue" onClick={e => e.stopPropagation()}>
          <span className="mrescue-ico"><Icon name="cards" size={26} /></span>
          <strong>{t('cardRescueTitle')}</strong>
          <p>{body}</p>
          <div className="mrescue-actions">
            <button className="mrescue-primary" onClick={fixIt}>{t('cardRescueAvailable')}</button>
            <button className="mrescue-secondary" onClick={keepIt}>{t('cardRescueOwed')}</button>
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}
