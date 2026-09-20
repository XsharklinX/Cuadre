import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { CURRENCIES, convertCurrency, getCurrencyMeta } from '@/data/currencies'
import { getRatesFetchedAt, syncExchangeRates } from '@/data/exchangeRates'
import { dateLocale, fmt } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { playBackspaceSound, playKeySound } from '@/lib/sound'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'
import type { CurrencyCode } from '@/types'

const NUMPAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const

function fmtAmountText(text: string, prefix: string): string {
  if (!text) return `${prefix} 0`
  const n = parseFloat(text)
  if (isNaN(n)) return `${prefix} 0`
  if (text.endsWith('.')) return `${prefix} ${n.toLocaleString('en-US')}.`
  return `${prefix} ${n.toLocaleString('en-US', { minimumFractionDigits: text.includes('.') ? 2 : 0 })}`
}

/**
 * Calculadora de conversión de divisas con tasas en vivo.
 * Convierte entre las 9 monedas de la app usando el mismo motor de tasas
 * (open.er-api.com, cache 12h) que alimenta el resto de la aplicación.
 * El numpad es propio de la app y va SIEMPRE debajo, con la conversión
 * visible arriba actualizándose en vivo — no un teclado nativo ni un sheet
 * separado que tape la pantalla.
 */
export function MobileCurrencyConverter({ onClose }: { onClose: () => void }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const appCurrency = useFinance(s => s.currency)
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  // El dólar va SIEMPRE primero (arriba) y el monto arranca en 1, para leer la
  // tasa directa (1 USD = X). Desde ahí cada quien cambia lo que necesite.
  const [amountText, setAmountText] = useState('1')
  const [from, setFrom] = useState<CurrencyCode>('USD')
  const [to, setTo] = useState<CurrencyCode>(appCurrency === 'USD' ? 'DOP' : appCurrency)
  const [picker, setPicker] = useState<'from' | 'to' | null>(null)
  // Bump para re-renderizar cuando llegan tasas frescas (mutan CURRENCIES in place)
  const [, setRatesVersion] = useState(0)

  useEffect(() => {
    let alive = true
    void syncExchangeRates().then(changed => {
      if (alive && changed) setRatesVersion(v => v + 1)
    })
    return () => { alive = false }
  }, [])

  const amount = amountText ? parseFloat(amountText) || 0 : 0
  const result = convertCurrency(amount, from, to)
  const unitRate = convertCurrency(1, from, to)
  const fromMeta = getCurrencyMeta(from)
  const toMeta = getCurrencyMeta(to)
  const fetchedAt = getRatesFetchedAt()

  const swap = () => {
    setFrom(to)
    setTo(from)
  }

  const pick = (code: CurrencyCode) => {
    if (picker === 'from') {
      if (code === to) setTo(from)
      setFrom(code)
    } else if (picker === 'to') {
      if (code === from) setFrom(to)
      setTo(code)
    }
    setPicker(null)
  }

  const pressKey = (key: typeof NUMPAD_KEYS[number]) => {
    if (key === 'back') {
      playBackspaceSound()
      setAmountText(v => v.slice(0, -1))
      return
    }
    playKeySound()
    setAmountText(v => {
      if (key === '.') return v.includes('.') ? v : (v || '0') + '.'
      if (v === '0') return key
      const next = v + key
      const [, dec] = next.split('.')
      if (dec && dec.length > 2) return v
      return next
    })
  }

  return (
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('converterTitle')} onClick={onClose}>
      <section className="mcur-sheet mconv-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{t('converterTitle')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        {picker ? (
          <>
            <p className="mcur-subtitle">{picker === 'from' ? t('converterFrom') : t('converterTo')}</p>
            <div className="mcur-list">
              {CURRENCIES.map(c => {
                const selected = c.code === (picker === 'from' ? from : to)
                return (
                  <button key={c.code} className={`mcur-row${selected ? ' on' : ''}`} onClick={() => pick(c.code)}>
                    <span className="mcur-flag">{c.flag}</span>
                    <div className="mcur-info">
                      <strong>{c.code}</strong>
                      <small>{c.name}</small>
                    </div>
                    <div className="mcur-right">
                      {selected && <Icon name="check" size={16} style={{ color: 'var(--accent)' }} />}
                    </div>
                  </button>
                )
              })}
            </div>
            <p className="mcur-note">
              <button className="mconv-picker-back" onClick={() => setPicker(null)}>
                <Icon name="arrowUp" size={12} style={{ transform: 'rotate(-90deg)' }} /> {t('back')}
              </button>
            </p>
          </>
        ) : (
          <>
            <div className="mconv-body">
              <div className="mconv-card">
                <div className="mconv-card-top">
                  <button className="mconv-currency-btn" onClick={() => setPicker('from')} aria-label={t('converterFrom')}>
                    <span className="mconv-flag">{fromMeta.flag}</span>
                    <strong>{from}</strong>
                    <small>{fromMeta.name}</small>
                    <Icon name="arrowDn" size={13} className="mconv-chevron" />
                  </button>
                </div>
                <div className="mconv-amount-display">{fmtAmountText(amountText, fromMeta.symbol)}</div>
              </div>

              <button className="mconv-swap" onClick={swap} aria-label={t('converterSwap')}>
                <Icon name="refresh" size={18} />
              </button>

              <div className="mconv-card mconv-card-result">
                <div className="mconv-card-top">
                  <button className="mconv-currency-btn" onClick={() => setPicker('to')} aria-label={t('converterTo')}>
                    <span className="mconv-flag">{toMeta.flag}</span>
                    <strong>{to}</strong>
                    <small>{toMeta.name}</small>
                    <Icon name="arrowDn" size={13} className="mconv-chevron" />
                  </button>
                </div>
                <div className="mconv-result-value">{fmt(result, to)}</div>
              </div>

              <div className="mconv-rate-line">
                <Icon name="trend" size={13} />
                1 {from} = {fmt(unitRate, to)}
              </div>

              <p className="mcur-note mconv-fetched-note">
                <Icon name="info" size={12} />
                {fetchedAt
                  ? t('converterUpdated').replace('{date}', new Date(fetchedAt).toLocaleString(dateLocale(lang), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }))
                  : t('approxRatesNote')}
              </p>
            </div>

            <div className="mconv-numpad">
              {NUMPAD_KEYS.map(key => (
                <button
                  key={key}
                  className={key === 'back' ? 'mconv-numpad-back' : 'mconv-numpad-key'}
                  onClick={() => pressKey(key)}
                >
                  {key === 'back' ? <Icon name="close" size={17} /> : key}
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
    </SheetPortal>
  )
}
