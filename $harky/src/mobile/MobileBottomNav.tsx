import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { playOpenSound, playSoftHaptic } from '@/lib/sound'
import { useMobileBackDismiss } from './useMobileBackDismiss'

export type MobileRoute = 'home' | 'analysis' | 'add' | 'reports' | 'profile'
export type QuickAddMode = 'expense' | 'income'

type NavItem = { route: Exclude<MobileRoute, 'add'>; icon: Parameters<typeof Icon>[0]['name']; labelKey: 'movementsLabel' | 'analysisTab' | 'accounts' | 'profile' }

// El route interno sigue llamándose 'reports' (no vale la pena renombrarlo en
// todo el árbol), pero la pestaña que aterriza ahí ahora es Cuentas, con
// Informes y Metas como sub-pestañas dentro (ver MobileShell.renderReportsRoute).
const ITEMS: NavItem[] = [
  { route: 'home',     icon: 'list',  labelKey: 'movementsLabel' },
  { route: 'analysis', icon: 'chart', labelKey: 'analysisTab' },
  { route: 'reports', icon: 'cards', labelKey: 'accounts' },
  { route: 'profile',  icon: 'user', labelKey: 'profile' },
]

const LONG_PRESS_MS = 420

export function MobileBottomNav({ route, onRoute, onQuickAdd }: {
  route: MobileRoute
  onRoute: (route: MobileRoute) => void
  onQuickAdd?: (mode: QuickAddMode) => void
}) {
  const t = useT()
  const [quickMenu, setQuickMenu] = useState(false)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressed = useRef(false)
  useMobileBackDismiss(quickMenu, () => setQuickMenu(false))

  const cancelPress = () => {
    if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null }
  }
  const startPress = () => {
    longPressed.current = false
    cancelPress()
    pressTimer.current = setTimeout(() => {
      longPressed.current = true
      playSoftHaptic()
      setQuickMenu(true)
    }, LONG_PRESS_MS)
  }
  const endPress = () => {
    cancelPress()
    if (!longPressed.current) {
      playOpenSound()
      onRoute('add')
    }
  }

  const pickQuick = (mode: QuickAddMode) => {
    setQuickMenu(false)
    playOpenSound()
    onQuickAdd?.(mode)
  }

  return (
    <nav className="mobile-bottom-nav" aria-label={t('mainNavigation')}>
      {ITEMS.slice(0, 2).map(item => (
        <button key={item.route} className={route === item.route ? 'on' : ''}
          aria-current={route === item.route ? 'page' : undefined}
          onClick={() => onRoute(item.route)}>
          <Icon name={item.icon} size={21} />
          <span>{t(item.labelKey)}</span>
        </button>
      ))}

      <div className="mobile-add-fab-wrap">
        {quickMenu && (
          <>
            <div className="mobile-fab-menu-backdrop" onClick={() => setQuickMenu(false)} />
            <div className="mobile-fab-menu" role="menu">
              <button role="menuitem" className="expense" onClick={() => pickQuick('expense')}>
                <Icon name="arrowUp" size={15} style={{ transform: 'rotate(45deg)' }} /> {t('expense')}
              </button>
              <button role="menuitem" className="income" onClick={() => pickQuick('income')}>
                <Icon name="arrowUp" size={15} style={{ transform: 'rotate(-135deg)' }} /> {t('income')}
              </button>
            </div>
          </>
        )}
        <button className="mobile-add-fab" aria-label={t('add')}
          onPointerDown={startPress}
          onPointerUp={endPress}
          onPointerLeave={cancelPress}
          onContextMenu={e => e.preventDefault()}>
          <Icon name="plus" size={28} stroke={2.6} />
        </button>
      </div>

      {ITEMS.slice(2).map(item => (
        <button key={item.route} className={route === item.route ? 'on' : ''}
          aria-current={route === item.route ? 'page' : undefined}
          onClick={() => onRoute(item.route)}>
          <Icon name={item.icon} size={21} />
          <span>{t(item.labelKey)}</span>
        </button>
      ))}
    </nav>
  )
}
