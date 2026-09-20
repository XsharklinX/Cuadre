import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * Selector de DÍA DEL MES (1-31), para el corte y el pago de una tarjeta.
 *
 * Es una rejilla, no un campo de texto ni un calendario: el ciclo de una
 * tarjeta se repite todos los meses, así que lo que se elige es un día, no una
 * fecha. Un calendario obligaría a elegir un mes que no significa nada aquí.
 */
export function DayOfMonthSheet({
  title, hint, value, onDone, onClose,
}: {
  title: string
  hint?: string
  value?: number
  onDone: (day: number | undefined) => void
  onClose: () => void
}) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={onClose}>
        <section className="mnum-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{title}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          {hint && <p className="mnum-hint">{hint}</p>}

          <div className="mnum-daygrid">
            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
              <button
                key={day}
                className={`mnum-day${value === day ? ' on' : ''}`}
                onClick={() => onDone(day)}
                aria-pressed={value === day}
              >
                {day}
              </button>
            ))}
          </div>

          {/* Los días 29-31 no existen todos los meses. El motor los recorta al
              último día real, pero el usuario merece saberlo ANTES de elegir. */}
          {value !== undefined && value >= 29 && (
            <p className="mnum-warn">
              <Icon name="info" size={13} />
              {t('dayClampHint')}
            </p>
          )}

          <button className="mnum-clear" onClick={() => onDone(undefined)}>{t('clearLabel')}</button>
        </section>
      </div>
    </SheetPortal>
  )
}

/**
 * Entrada de PORCENTAJE para tasa anual y pago mínimo.
 *
 * Se deja vacío a propósito cuando no hay valor: la app NO asume una tasa por
 * defecto. Una proyección de interés calculada sobre una tasa inventada es
 * peor que no mostrar proyección.
 */
export function PercentSheet({
  title, hint, value, max, onDone, onClose,
}: {
  title: string
  hint?: string
  value?: number
  max: number
  onDone: (pct: number | undefined) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(value !== undefined ? String(value) : '')
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const parsed = Number(text.replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(parsed) && parsed > 0 && parsed <= max

  const commit = () => onDone(valid ? parsed : undefined)

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={onClose}>
        <section className="mnum-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{title}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          {hint && <p className="mnum-hint">{hint}</p>}

          <div className="mnum-pctfield">
            <input
              id="mnum-pct"
              autoFocus
              inputMode="decimal"
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && valid) commit() }}
              placeholder="0"
              aria-label={title}
            />
            <span aria-hidden="true">%</span>
          </div>

          {text.trim() !== '' && !valid && (
            <p className="mnum-warn mnum-warn-error">
              <Icon name="alert" size={13} />
              {t('percentRangeError').replace('{max}', String(max))}
            </p>
          )}

          <div className="mnum-actions">
            <button className="mnum-clear" onClick={() => onDone(undefined)}>{t('clearLabel')}</button>
            <button className="mnum-done" disabled={!valid} onClick={commit}>{t('save')}</button>
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}
