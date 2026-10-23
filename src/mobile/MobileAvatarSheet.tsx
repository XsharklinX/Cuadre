import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { useSettings } from '@/store/settings'
import { useSheetDrag } from '@/hooks/useSheetDrag'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { SheetPortal } from './SheetPortal'

/**
 * «MIS COSAS»: lo que había en tres iconos de la barra.
 *
 * ── POR QUÉ SE JUNTARON ───────────────────────────────────────────────
 * Perfil, ajustes y avisos son la misma intención y vivían en tres botones
 * distintos de una barra que ya llevaba ocho. Las tres se visitan en el mismo
 * momento —cuando dejas de mirar tu dinero y empiezas a mirar tu app— así que
 * comparten puerta.
 *
 * Nada se esconde: lo que estaba a un toque está a dos, y los tres destinos
 * son lo primero que se ve al abrir, sin desplegar nada.
 *
 * ── EL MODO PRIVADO TAMBIÉN ESTÁ AQUÍ ─────────────────────────────────
 * Su gesto rápido es mantener pulsado el saldo, que es más rápido que
 * cualquier icono. Pero un gesto que no se ve no existe para quien no lo
 * conoce, así que el interruptor vive aquí y dice cuál es el atajo.
 */
export function MobileAvatarSheet({
  onClose, onProfile, onNotifications, onSettings, notifCount,
}: {
  onClose: () => void
  onProfile: () => void
  onNotifications: () => void
  onSettings: () => void
  notifCount: number
}) {
  const t = useT()
  const displayName = useSettings(s => s.displayName)
  const profilePhoto = useSettings(s => s.profilePhoto)
  const privacyMode = useSettings(s => s.privacyMode)
  const togglePrivacyMode = useSettings(s => s.togglePrivacyMode)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, true, false)
  const dragRef = useSheetDrag<HTMLElement>(onClose)

  const ir = (fn: () => void) => () => { onClose(); fn() }
  const inicial = displayName.trim().charAt(0).toUpperCase()

  return (
    <SheetPortal>
      <div
        ref={dialogRef}
        className="mobile-detail-sheet mav-root"
        role="dialog"
        aria-modal="true"
        aria-label={t('myStuff')}
        onClick={onClose}
      >
        <section ref={dragRef} className="mav" onClick={e => e.stopPropagation()}>
          <header className="mav-head">
            <span className="mav-ava">
              {profilePhoto
                ? <img src={profilePhoto} alt="" />
                : inicial || <Icon name="user" size={22} />}
            </span>
            <span className="mav-id">
              <b>{displayName.trim() || t('profile')}</b>
              <small>{t('myStuffHint')}</small>
            </span>
          </header>

          <button className="mav-row" onClick={ir(onProfile)}>
            <Icon name="user" size={18} />
            <span>{t('profile')}</span>
            <Icon name="arrowUp" size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>

          <button className="mav-row" onClick={ir(onNotifications)}>
            <Icon name="bell" size={18} />
            <span>{t('notificationsLabel')}</span>
            {notifCount > 0 && <em className="mav-badge">{notifCount > 9 ? '9+' : notifCount}</em>}
            <Icon name="arrowUp" size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>

          <button className="mav-row" onClick={ir(onSettings)}>
            <Icon name="settings" size={18} />
            <span>{t('settings')}</span>
            <Icon name="arrowUp" size={14} style={{ transform: 'rotate(90deg)' }} />
          </button>

          {/* El interruptor y, debajo, cuál es el atajo: un gesto que no se
              ve no existe para quien no lo conoce. */}
          <button
            className={`mav-row toggle${privacyMode ? ' on' : ''}`}
            aria-pressed={privacyMode}
            onClick={togglePrivacyMode}
          >
            <Icon name={privacyMode ? 'eyeOff' : 'eye'} size={18} />
            <span>{t(privacyMode ? 'privacyModeOn' : 'privacyModeOff')}</span>
            <i />
          </button>
          <p className="mav-tip">{t('privacyHoldHint')}</p>
        </section>
      </div>
    </SheetPortal>
  )
}
