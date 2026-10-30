import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { sheetRoot } from '@/mobile/SheetPortal'
import { useDialogA11y } from '@/mobile/useDialogA11y'
import { useMobileBackDismiss } from '@/mobile/useMobileBackDismiss'

/*
 * B1 · FORMULARIOS QUE SE LEEN COMO UNA FRASE.
 *
 * El formulario clásico era una columna de campos con su etiqueta en
 * mayúsculas encima (NOMBRE, TIPO, BALANCE…): ocho preguntas sueltas que hay
 * que leer de arriba abajo. Aquí el formulario es una frase con huecos
 * subrayados: «Le debo RD$38,500 a Banco Popular». Cada hueco es un botón que
 * abre su teclado o su lista; la frase entera se lee de un vistazo.
 *
 * Un hueco vacío enseña su pista en gris y subrayado de puntos, para que se
 * vea que falta sin un asterisco ni un mensaje de error.
 */
export type PhrasePart =
  | string
  | {
      key: string
      /** Lo que se ve en el hueco. Vacío = enseña `hint`. */
      text: string
      hint?: string
      onTap: () => void
      tone?: 'bad' | 'ok'
      /** Resaltado mientras se edita o porque falta. */
      active?: boolean
    }

export function Phrase({ parts, className }: { parts: PhrasePart[]; className?: string }) {
  return (
    <p className={`nx-phrase${className ? ` ${className}` : ''}`}>
      {parts.map((part, i) => typeof part === 'string'
        ? <span key={i}>{part}</span>
        : (
          <button
            key={part.key}
            type="button"
            className={`nx-tk${part.text ? '' : ' empty'}${part.tone ? ` ${part.tone}` : ''}${part.active ? ' on' : ''}`}
            onClick={part.onTap}
          >
            {part.text || part.hint}
          </button>
        ))}
    </p>
  )
}

/*
 * B2 · LA HOJA SOBRIA.
 *
 * El contenedor común de las hojas nuevas: título en texto, sin icono en un
 * cuadro ni cabecera con halo; la X a la derecha; el contenido en filas de
 * línea fina; y un pie opcional con la acción principal.
 */
export function NxSheet({ title, sub, onClose, children, footer, className }: {
  title: string
  sub?: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <section className={`nx-sheet${className ? ` ${className}` : ''}`} onClick={e => e.stopPropagation()}>
        <header className="nx-sheet-head">
          <span>
            <b>{title}</b>
            {sub && <small>{sub}</small>}
          </span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={17} /></button>
        </header>
        <div className="nx-sheet-body">{children}</div>
        {footer && <div className="nx-sheet-foot">{footer}</div>}
      </section>
    </div>,
    sheetRoot(),
  )
}

/** Fila de línea fina: etiqueta a la izquierda, valor (que se puede tocar) a la derecha. */
export function NxRow({ label, value, onTap, tone, hint }: {
  label: React.ReactNode
  value?: React.ReactNode
  onTap?: () => void
  tone?: 'bad' | 'ok' | 'muted'
  hint?: React.ReactNode
}) {
  const inner = (
    <>
      <span className="nx-row-k">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      {value !== undefined && <span className={`nx-row-v${onTap ? ' edit' : ''}${tone ? ` ${tone}` : ''}`}>{value}</span>}
    </>
  )
  return onTap
    ? <button type="button" className="nx-row" onClick={onTap}>{inner}</button>
    : <div className="nx-row">{inner}</div>
}

/**
 * El icono en su cuadro teñido del color, como `CatBadge` en Movimientos. Es
 * la seña de la app: cada categoría, deuda o lista se reconoce por él.
 */
export function IconTile({ icon, color, size = 38 }: { icon: Parameters<typeof Icon>[0]['name']; color: string; size?: number }) {
  return (
    <span className="nx-tile" aria-hidden="true" style={{ width: size, height: size, color, background: `color-mix(in oklab, ${color} 18%, transparent)` }}>
      <Icon name={icon} size={Math.round(size * .5)} />
    </span>
  )
}
