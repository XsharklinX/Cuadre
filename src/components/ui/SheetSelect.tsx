import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { sheetRoot } from '@/mobile/SheetPortal'
import { useDialogA11y } from '@/mobile/useDialogA11y'
import { useMobileBackDismiss } from '@/mobile/useMobileBackDismiss'

export interface SheetOption {
  value: string
  label: string
  /** Segunda línea: el saldo de una cuenta, el servicio de un cliente… */
  hint?: string
  /** Punto de color (cuenta, categoría). */
  color?: string
}

/*
 * FUERA LOS MENÚS GRISES DEL SISTEMA.
 *
 * El `<select>` del navegador abre en Android un diálogo gris distinto a todo
 * lo demás de la app, que además corta los nombres con la letra grande. Este
 * sustituto se usa igual (`value`, `onChange`, opciones) pero abre una hoja de
 * la app: nombre entero, segunda línea y su color.
 *
 * Los selectores técnicos (las columnas de un CSV) se quedan con el nativo: se
 * usan una vez y no compensa.
 */
export function SheetSelect({ id, value, options, onChange, title, className, placeholder }: {
  id?: string
  value: string
  options: SheetOption[]
  onChange: (value: string) => void
  /** Título de la hoja; también nombra el control para lectores de pantalla. */
  title: string
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.value === value)
  return (
    <>
      <button
        id={id}
        type="button"
        className={`sheet-select${className ? ` ${className}` : ''}`}
        aria-haspopup="dialog"
        aria-label={`${title}: ${current?.label ?? placeholder ?? ''}`}
        onClick={() => setOpen(true)}
      >
        {current?.color && <span className="sheet-select-dot" style={{ background: current.color }} />}
        <span className="sheet-select-label">{current?.label ?? placeholder ?? '—'}</span>
        <Icon name="arrowDn" size={14} className="sheet-select-chev" />
      </button>
      {open && (
        <SheetSelectList
          title={title}
          value={value}
          options={options}
          onPick={v => { onChange(v); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** La lista de opciones sola, para abrirla desde un hueco de una frase (B1). */
export function SheetSelectList({ title, value, options, onPick, onClose }: {
  title: string
  value: string
  options: SheetOption[]
  onPick: (value: string) => void
  onClose: () => void
}) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" style={{ zIndex: 460 }} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <section onClick={e => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="sheet-select-list" role="listbox" aria-label={title}>
          {options.map(o => {
            const on = o.value === value
            return (
              <button key={o.value} role="option" aria-selected={on} className={`sheet-select-row${on ? ' on' : ''}`} onClick={() => onPick(o.value)}>
                {o.color && <span className="sheet-select-dot" style={{ background: o.color }} />}
                <span className="sheet-select-text">
                  <b>{o.label}</b>
                  {o.hint && <small>{o.hint}</small>}
                </span>
                {on && <Icon name="check" size={16} className="sheet-select-check" />}
              </button>
            )
          })}
        </div>
      </section>
    </div>,
    sheetRoot(),
  )
}
