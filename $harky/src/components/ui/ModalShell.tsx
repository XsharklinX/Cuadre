import { type ReactNode, useEffect, useId, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/types'

interface ModalShellProps {
  title: string
  eyebrow?: string
  description?: ReactNode
  icon?: IconName
  className?: string
  maxWidth?: number
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function ModalShell({
  title,
  eyebrow,
  description,
  icon,
  className = '',
  maxWidth,
  children,
  footer,
  onClose,
}: ModalShellProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = dialogRef.current
    const firstFocusable = dialog?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className={`modal app-modal ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        style={maxWidth ? { maxWidth } : undefined}
        onMouseDown={event => event.stopPropagation()}>
        <header className="modal-head app-modal-head">
          <div className="modal-title-wrap">
            {icon && <span className="modal-title-icon"><Icon name={icon} size={19} /></span>}
            <div>
              {eyebrow && <span className="section-eyebrow">{eyebrow}</span>}
              <h2 id={titleId}>{title}</h2>
              {description && <p id={descriptionId} className="modal-lead">{description}</p>}
            </div>
          </div>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="modal-content">{children}</div>

        {footer && <footer className="modal-actions">{footer}</footer>}
      </section>
    </div>
  )
}
