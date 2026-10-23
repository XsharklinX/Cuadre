import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { CYCLE_KEY, CYCLE_ORDER, type BillingCycle } from '@/data/billing'
import { CURRENCIES } from '@/data/seed'
import { useT, type LangKey } from '@/i18n'
import { useSheetDrag } from '@/hooks/useSheetDrag'
import { useDialogA11y } from '../useDialogA11y'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { sheetRoot } from '../SheetPortal'
import type { CurrencyCode } from '@/types'

/**
 * Las piezas que comparten las hojas de Negocio.
 *
 * Están juntas porque las cuatro hojas tienen la misma forma —cabecera, cuerpo
 * desplazable, acciones ABAJO— y repetirla cuatro veces garantizaría que una
 * de las cuatro acabe distinta.
 *
 * Las acciones van al pie y no en la cabecera a propósito: en un teléfono de
 * seis pulgadas y media, Guardar en la esquina de arriba obliga a recolocar el
 * aparato en la mano cada vez.
 */

export function BizSheet({
  title, onClose, onSave, saveLabel, canSave = true, onDelete, deleteLabel, children,
}: {
  title: string
  onClose: () => void
  onSave?: () => void
  saveLabel?: string
  canSave?: boolean
  onDelete?: () => void
  deleteLabel?: string
  children: React.ReactNode
}) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  /* Arrastrar hacia abajo la cierra, que es lo que todo el mundo intenta
     antes de buscar la X. */
  const dragRef = useSheetDrag<HTMLElement>(onClose)

  return createPortal(
    <div ref={dialogRef} className="mobile-detail-sheet mbizs-root" role="dialog" aria-modal="true" aria-label={title}>
      <section ref={dragRef} className="mbizs" onClick={e => e.stopPropagation()}>
        <header className="mbizs-head">
          <span>{title}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="mbizs-body">{children}</div>
        <div className="mbizs-actions">
          {onDelete && (
            <button className="mbizs-del" onClick={onDelete} aria-label={deleteLabel ?? t('delete')}>
              <Icon name="trash" size={16} />
            </button>
          )}
          <button className="mbizs-cancel" onClick={onClose}>{t('cancel')}</button>
          {onSave && (
            <button className="mbizs-save" disabled={!canSave} onClick={onSave}>
              {saveLabel ?? t('save')}
            </button>
          )}
        </div>
      </section>
    </div>,
    sheetRoot(),
  )
}

/** Una fila de formulario con su etiqueta. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="mbizs-field">
      <span className="mbizs-field-label">{label}</span>
      {children}
      {hint && <small className="mbizs-field-hint">{hint}</small>}
    </label>
  )
}

/**
 * El selector de ciclo.
 *
 * Ofrece la lista COMPLETA, no solo lo mensual: la app está en producción y
 * quien la use no tiene por qué cobrar ni pagar como quien la escribió. Hay
 * negocios que facturan por semana, por trimestre, una sola vez, o que compran
 * el año por adelantado porque sale más barato.
 */
export function CyclePicker({
  value, onChange, months, onMonths,
}: {
  value: BillingCycle
  onChange: (c: BillingCycle) => void
  months?: number
  onMonths?: (n: number) => void
}) {
  const t = useT()
  return (
    <>
      <div className="mbizs-chips" role="group">
        {CYCLE_ORDER.map(cycle => (
          <button
            key={cycle}
            type="button"
            className={value === cycle ? 'on' : ''}
            aria-pressed={value === cycle}
            onClick={() => onChange(cycle)}
          >
            {t(CYCLE_KEY[cycle] as LangKey)}
          </button>
        ))}
      </div>
      {value === 'custom' && onMonths && (
        <input
          className="mbizs-input mbizs-input-sm"
          type="number"
          min={1}
          max={120}
          inputMode="numeric"
          value={months ?? ''}
          placeholder={t('cycleCustomMonths')}
          onChange={e => onMonths(Math.max(1, Math.round(Number(e.target.value) || 0)))}
        />
      )}
    </>
  )
}

/**
 * El selector de divisa.
 *
 * Hace falta de verdad en los dos lados: muchas suscripciones se pagan en
 * dólares aunque el libro lleve pesos, y hay clientes que pagan en una divisa
 * y otros en otra dentro del mismo negocio.
 */
export function CurrencyPicker({
  value, base, onChange,
}: {
  value: CurrencyCode | undefined
  base: CurrencyCode
  onChange: (c: CurrencyCode | undefined) => void
}) {
  const t = useT()
  const codes = Object.keys(CURRENCIES) as CurrencyCode[]
  return (
    <div className="mbizs-chips" role="group" aria-label={t('currency')}>
      <button
        type="button"
        className={!value || value === base ? 'on' : ''}
        aria-pressed={!value || value === base}
        onClick={() => onChange(undefined)}
      >
        {base}
      </button>
      {codes.filter(c => c !== base).map(code => (
        <button
          key={code}
          type="button"
          className={value === code ? 'on' : ''}
          aria-pressed={value === code}
          onClick={() => onChange(code)}
        >
          {code}
        </button>
      ))}
    </div>
  )
}

/**
 * EL DÍA DE PAGO: LOS 31, PARA TOCAR UNO.
 *
 * ── LO QUE ERA, Y POR QUÉ NO SERVÍA ───────────────────────────────────
 * Era un campo de número con un `1` ya dentro y un recorte a 1–31 en CADA
 * tecla. Tres cosas salían mal a la vez:
 *
 *  1. El `1` se quedaba DELANTE de lo que escribieras. Para el día 5 tecleabas
 *     «5» y te quedaba «15»; para el 25, «125», que el recorte convertía en 31.
 *  2. Vaciar el campo era imposible: `Number('') || 1` lo devolvía a 1 al
 *     instante, así que no había forma de empezar de cero.
 *  3. Había que borrar lo de delante para poner lo de atrás, en un teclado
 *     numérico de teléfono, para elegir entre treinta y un valores conocidos.
 *
 * Un dato que solo puede ser uno de 31 valores no se teclea: se señala. Y se
 * señala en siete columnas porque así se lee un mes en cualquier calendario.
 */
export function DayPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT()
  return (
    <>
      <div className="mbizs-days" role="group" aria-label={t('bizDueDay')}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
          <button
            key={day}
            type="button"
            className={value === day ? 'on' : ''}
            aria-pressed={value === day}
            onClick={() => onChange(day)}
          >
            {day}
          </button>
        ))}
      </div>
      {/*
        El aviso del mes corto, solo cuando aplica.
        Estaba fijo bajo el campo, así que lo leía todo el mundo y no le decía
        nada a quien cobra el día 5. Un aviso que está siempre es decoración;
        uno que aparece al elegir el 29, el 30 o el 31 es información.
      */}
      {value >= 29 && <small className="mbizs-field-hint">{t('bizDueDayHint')}</small>}
    </>
  )
}

/** Día de la semana, para los ciclos semanales. */
export function WeekdayPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useT()
  const keys: LangKey[] = ['dowSun', 'dowMon', 'dowTue', 'dowWed', 'dowThu', 'dowFri', 'dowSat']
  return (
    <div className="mbizs-chips" role="group">
      {keys.map((key, i) => (
        <button
          key={key}
          type="button"
          className={value === i ? 'on' : ''}
          aria-pressed={value === i}
          onClick={() => onChange(i)}
        >
          {t(key)}
        </button>
      ))}
    </div>
  )
}
