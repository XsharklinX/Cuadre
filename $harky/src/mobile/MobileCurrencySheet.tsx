import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CURRENCIES, convertCurrency, getCurrencyMeta } from '@/data/currencies'
import { useFinance } from '@/store/finance'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'
import type { CurrencyCode } from '@/types'

export function MobileCurrencySheet({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { currency, setCurrency } = useFinance()
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const select = (code: CurrencyCode) => {
    if (code === currency) { onClose(); return }
    setCurrency(code)
    toast(t('currencyChanged').replace('{code}', code), { icon: 'dollar', type: 'ok' })
    onClose()
  }

  const current = getCurrencyMeta(currency)

  return (
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="mcur-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{t('currency')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <p className="mcur-subtitle">
          1 {current.symbol} ({currency}) {t('equivalentTo')}
        </p>

        <div className="mcur-list">
          {CURRENCIES.map(c => {
            const equivalent = c.code === currency ? null : convertCurrency(1, currency, c.code)
            const selected = c.code === currency
            return (
              <button
                key={c.code}
                className={`mcur-row${selected ? ' on' : ''}`}
                onClick={() => select(c.code)}
              >
                <span className="mcur-flag">{c.flag}</span>
                <div className="mcur-info">
                  <strong>{c.code}</strong>
                  <small>{c.name}</small>
                </div>
                <div className="mcur-right">
                  {equivalent !== null ? (
                    <span className="mcur-rate">
                      {equivalent >= 1000
                        ? `${c.symbol}${(equivalent / 1000).toFixed(1)}k`
                        : equivalent >= 1
                          ? `${c.symbol}${equivalent.toFixed(2)}`
                          : `${c.symbol}${equivalent.toFixed(4)}`}
                    </span>
                  ) : (
                    <span className="mcur-current">{t('currentLabel')}</span>
                  )}
                  {selected && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
                </div>
              </button>
            )
          })}
        </div>

        <p className="mcur-note">
          <Icon name="info" size={12} /> {t('approxRatesNote')}
        </p>
      </section>
    </div>
    </SheetPortal>
  )
}
