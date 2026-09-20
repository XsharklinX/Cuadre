import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { SheetPortal } from './SheetPortal'
import { CURRENCIES } from '@/data/seed'
import { playBackspaceSound, playDoneSound, playKeySound, playOperatorSound } from '@/lib/sound'
import { useT } from '@/i18n'
import type { CurrencyCode } from '@/types'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'

const keypad = [
  '7', '8', '9', '/',
  '4', '5', '6', '*',
  '1', '2', '3', '-',
  '0', '.', '+',
] as const

const OPERATORS = ['+', '-', '*', '/'] as const

function cleanAmount(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^\d.]/g, '')
  const [integer = '', ...rest] = normalized.split('.')
  const decimal = rest.join('').slice(0, 2)
  const safeInteger = integer.replace(/^0+(?=\d)/, '')
  return rest.length ? `${safeInteger || '0'}.${decimal}` : safeInteger
}

function lastOperatorIndex(expr: string): number {
  return Math.max(...OPERATORS.map(op => expr.lastIndexOf(op)))
}

function lastSegment(expr: string): string {
  const cut = lastOperatorIndex(expr)
  return cut === -1 ? expr : expr.slice(cut + 1)
}

function evaluateExpression(expr: string): number {
  const raw = expr.match(/[+\-*/]|[\d.]+/g)
  if (!raw?.length) return 0
  const tokens = (OPERATORS as readonly string[]).includes(raw[raw.length - 1]) ? raw.slice(0, -1) : raw
  if (!tokens.length) return 0
  const terms: number[] = []
  const signs: ('+' | '-')[] = []
  let acc = Number(tokens[0]) || 0
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i] as (typeof OPERATORS)[number]
    const val = Number(tokens[i + 1]) || 0
    if (op === '*') acc *= val
    else if (op === '/') acc = val !== 0 ? acc / val : acc
    else { terms.push(acc); signs.push(op); acc = val }
  }
  terms.push(acc)
  return terms.reduce((sum, term, idx) => idx === 0 ? term : sum + (signs[idx - 1] === '-' ? -term : term), 0)
}

export function MobileAmountSheet({
  title,
  value,
  currency,
  unit,
  allowNegative = false,
  onDone,
  onClose,
}: {
  title: string
  value: number
  currency?: string
  unit?: string
  allowNegative?: boolean
  onDone: (value: number) => void
  onClose: () => void
}) {
  const t = useT()
  const [amountText, setAmountText] = useState(value !== 0 ? String(Math.abs(value)) : '')
  const [negative, setNegative] = useState(allowNegative && value < 0)
  const startY = useRef(0)

  const amount = amountText ? evaluateExpression(amountText) : 0
  const signedAmount = negative ? -amount : amount
  const hasOperator = (OPERATORS as readonly string[]).some(op => amountText.slice(1).includes(op))
  const isPercent = unit === '%'
  const currencyPrefix = currency ? CURRENCIES[currency as CurrencyCode]?.symbol ?? currency : ''

  useMobileBackDismiss(true, onClose)

  const pressKey = (key: typeof keypad[number] | 'back') => {
    if (key === 'back') { playBackspaceSound(); setAmountText(v => v.slice(0, -1)); return }
    if ((OPERATORS as readonly string[]).includes(key)) {
      playOperatorSound()
      setAmountText(v => (!v || (OPERATORS as readonly string[]).includes(v.slice(-1)) ? v : v + key))
      return
    }
    if (key === '.') {
      playOperatorSound()
      setAmountText(v => {
        const segment = lastSegment(v)
        if (segment.includes('.')) return v
        return v + (segment ? '.' : '0.')
      })
      return
    }
    playKeySound()
    setAmountText(v => {
      const cut = lastOperatorIndex(v)
      const head = cut === -1 ? '' : v.slice(0, cut + 1)
      const segment = cut === -1 ? v : v.slice(cut + 1)
      if (/^0\.0*$/.test(segment) && key !== '0') return head + key
      return head + cleanAmount(segment + key)
    })
  }

  const done = () => {
    playDoneSound()
    onDone(signedAmount)
  }

  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  return (
    <SheetPortal>
    <div
      ref={dialogRef}
      className="mobile-detail-sheet mamt-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={event => { startY.current = event.touches[0]?.clientY ?? 0 }}
      onTouchEnd={event => {
        const delta = (event.changedTouches[0]?.clientY ?? 0) - startY.current
        if (delta > 88) onClose()
      }}
    >
      <section className="mamt-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mamt-amount-display">
          {hasOperator && <small className="mamt-expr">{currencyPrefix} {amountText}</small>}
          <strong style={{ color: negative ? 'var(--expense, #ff6b8a)' : (amount > 0 ? 'var(--income, #35d0a2)' : 'var(--m-text)') }}>
            {negative && '-'}
            {isPercent
              ? (amountText ? `${amount}%` : '0%')
              : (amountText
                  ? (amountText.endsWith('.')
                      ? `${currencyPrefix} ${amount.toLocaleString('en-US')}.`
                      : `${currencyPrefix} ${amount.toLocaleString('en-US', { minimumFractionDigits: amountText.includes('.') ? 2 : 0, maximumFractionDigits: amountText.includes('.') ? 2 : 0 })}`)
                  : `${currencyPrefix} 0`)}
          </strong>
          {allowNegative && (
            <button
              type="button"
              className={`mamt-sign-toggle${negative ? ' on' : ''}`}
              onClick={() => setNegative(v => !v)}
              aria-pressed={negative}
            >
              {negative ? t('negativeBalanceLabel') : t('positiveBalanceLabel')}
            </button>
          )}
        </div>

        <div className="mamt-keypad">
          <div className="mobile-keypad-row">
            <div className="mobile-keypad-compact">
              {keypad.map(key => (
                <button
                  key={key}
                  className={[
                    (OPERATORS as readonly string[]).includes(key) ? 'op' : '',
                    key === '0' ? 'wide' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => pressKey(key)}
                >
                  {key}
                </button>
              ))}
            </div>
            <div className="mobile-keypad-actions">
              <button className="mobile-back-button" onClick={() => pressKey('back')} aria-label={t('delete')}>
                <Icon name="close" size={18} />
              </button>
              <button className="mobile-done-button" onClick={done} aria-label={t('done')}>
                <Icon name="check" size={20} />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
    </SheetPortal>
  )
}
