import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { playBackspaceSound, playDoneSound, playKeySound } from '@/lib/sound'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'

const DIGIT_KEYS = ['1','2','3','4','5','6','7','8','9','0'] as const

export function MobileDigitSheet({
  title,
  value,
  maxDigits = 4,
  onDone,
  onClose,
}: {
  title: string
  value: string
  maxDigits?: number
  onDone: (value: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [digits, setDigits] = useState(value)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const press = (d: string) => {
    if (digits.length >= maxDigits) return
    playKeySound()
    setDigits(v => v + d)
  }

  const back = () => {
    playBackspaceSound()
    setDigits(v => v.slice(0, -1))
  }

  const done = () => {
    playDoneSound()
    onDone(digits || '')
    onClose()
  }

  const display = digits.padEnd(maxDigits, '·')

  return (
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet mamt-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <section className="mamt-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mamt-amount-display">
          <strong className="mdig-display">
            {display.split('').map((ch, i) => (
              <span key={i} className={ch === '·' ? 'mdig-placeholder' : 'mdig-filled'}>{ch}</span>
            ))}
          </strong>
        </div>

        <div className="mamt-keypad">
          <div className="mdig-grid">
            {DIGIT_KEYS.slice(0, 9).map(d => (
              <button key={d} className="mdig-btn" onClick={() => press(d)}>{d}</button>
            ))}
            <button className="mdig-btn mdig-back" onClick={back}>
              <Icon name="close" size={18} />
            </button>
            <button className="mdig-btn" onClick={() => press('0')}>0</button>
            <button className="mdig-btn mdig-done" onClick={done}>
              <Icon name="check" size={20} />
            </button>
          </div>
        </div>
      </section>
    </div>
    </SheetPortal>
  )
}
