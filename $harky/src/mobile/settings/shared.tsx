import { useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import type { IconName } from '@/types'
import { useDialogA11y } from '../useDialogA11y'
import { SheetPortal } from '../SheetPortal'

// ── Sheet type ────────────────────────────────────────────
export type Sheet =
  | 'theme' | 'accent' | 'density' | 'currency' | 'overdraft' | 'name' | 'reset' | 'language'
  | 'comments' | 'about' | 'privacy' | 'terms' | 'export' | 'pin' | 'categories' | 'bankNotifications'
  | 'syncConflicts' | 'widgetAccounts' | 'backupSchedule' | 'soundProfile' | 'fxAlert' | 'anomalyAlert'
  | 'backupPassword' | 'restorePassword' | 'categoryRules' | 'qrMigration'

export interface SheetProps {
  activeSheet: Sheet | null
  onClose: () => void
  onOpen: (s: Sheet) => void
}

// ── SettingsRow ───────────────────────────────────────────
interface SettingsRowProps {
  icon: IconName
  iconColor: string
  label: string
  /** Línea descriptiva bajo el título — da contexto sin abrir el sheet. */
  sublabel?: string
  value?: string
  danger?: boolean
  onClick: () => void
  right?: React.ReactNode
}

export function SettingsRow({ icon, iconColor, label, sublabel, value, danger, onClick, right }: SettingsRowProps) {
  return (
    <button className={`mset-row${danger ? ' danger' : ''}`} onClick={onClick}>
      <span className="mset-icon" style={{ color: iconColor, background: `color-mix(in oklab, ${iconColor} 15%, transparent)` }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="mset-label-wrap">
        <span className="mset-label">{label}</span>
        {sublabel && <span className="mset-sublabel">{sublabel}</span>}
      </span>
      {right ?? (
        <>
          {value && <span className="mset-value">{value}</span>}
          <Icon name="arrowUp" size={13} className="mset-chevron" />
        </>
      )}
    </button>
  )
}

// ── SettingsSheet ─────────────────────────────────────────
interface SettingsSheetContainerProps {
  title: string
  onClose: () => void
  children: React.ReactNode
}

export function SettingsSheet({ title, onClose, children }: SettingsSheetContainerProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)
  const startY = useRef(0)
  // Si el gesto empezó con el cuerpo ya scrolleado, era un scroll — no un swipe
  // para cerrar. Guardar la posición evita que arrastrar el contenido largo
  // (Términos/Privacidad) cierre la hoja sin querer.
  const startScrollable = useRef(false)
  const t = useT()
  return (
    <SheetPortal>
    <div
      ref={dialogRef}
      className="mobile-detail-sheet"
      role="dialog"
      aria-modal="true"
      // Portalado a <body>: debe pintar por encima del panel de Ajustes (z220)
      style={{ zIndex: 320 }}
      onClick={onClose}
      onTouchStart={event => {
        startY.current = event.touches[0]?.clientY ?? 0
        const scroller = (event.target as HTMLElement).closest<HTMLElement>('.mset-sheet-body')
        startScrollable.current = !!scroller && scroller.scrollTop > 4
      }}
      onTouchEnd={event => {
        const delta = (event.changedTouches[0]?.clientY ?? 0) - startY.current
        if (delta > 88 && !startScrollable.current) onClose()
      }}
    >
      <section className="mset-sheet" onClick={e => e.stopPropagation()}>
        <header className="mset-sheet-header">
          <span>{title}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {children}
      </section>
    </div>
    </SheetPortal>
  )
}

// ── GoogleButton ──────────────────────────────────────────
export function GoogleButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const t = useT()
  return (
    <button className="mset-google-btn-wrap" disabled={busy} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      {busy ? t('connectingGoogle') : t('continueWithGoogle')}
    </button>
  )
}
