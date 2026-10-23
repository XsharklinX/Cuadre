import { useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { playOpenSound, playSoftHaptic } from '@/lib/sound'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/*
 * Las rutas de la barra.
 *
 * `profile` SIGUE existiendo aunque ya no tenga pestaña: es la ruta donde
 * viven las herramientas (Presupuestos, Metas, Listas, el bote…) y a la que se
 * llega desde la cabecera. Quitarla del tipo obligaría a reescribir el
 * enrutado entero para ganar nada.
 */
export type MobileRoute = 'home' | 'analysis' | 'add' | 'reports' | 'profile' | 'business'
export type QuickAddMode = 'expense' | 'income'

type NavItem = { route: Exclude<MobileRoute, 'add'>; icon: Parameters<typeof Icon>[0]['name']; labelKey: 'movementsLabel' | 'analysisTab' | 'accounts' | 'bizTitle' }

// El route interno sigue llamándose 'reports' (no vale la pena renombrarlo en
// todo el árbol), pero la pestaña que aterriza ahí ahora es Cuentas, con
// Informes y Metas como sub-pestañas dentro (ver MobileShell.renderReportsRoute).
/*
 * NEGOCIO OCUPA EL CUARTO SITIO; PERFIL SE VA ARRIBA.
 *
 * Perfil no es un destino: es una pantalla de ajustes y atajos a la que se
 * entra de vez en cuando. Tenía un sitio fijo en la barra —uno de cuatro— para
 * algo que casi nunca se mira, mientras Negocio, que se consulta a diario
 * cuando se vive de cobrar, estaba enterrado en el menú ☰.
 *
 * Perfil sigue estando a un toque, junto al engranaje de la cabecera, que es
 * donde la gente ya busca su cuenta y sus ajustes.
 */
const ITEMS: NavItem[] = [
  { route: 'home',     icon: 'list',      labelKey: 'movementsLabel' },
  { route: 'analysis', icon: 'chart',     labelKey: 'analysisTab' },
  { route: 'reports',  icon: 'cards',     labelKey: 'accounts' },
  { route: 'business', icon: 'briefcase', labelKey: 'bizTitle' },
]

/**
 * El orden de la barra, para saber HACIA DONDE se movio el usuario.
 *
 * Las sub-pestañas ya entraban por el lado correcto; las cuatro principales se
 * limitaban a desvanecerse 6px hacia arriba, que no dice nada sobre si fuiste
 * hacia delante o hacia atras. Sale de aqui y no de una lista aparte para que
 * reordenar la barra no deje la direccion mintiendo.
 */
export const ROUTE_ORDER: MobileRoute[] = ITEMS.map(i => i.route)

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
