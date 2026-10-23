import { Icon } from '@/components/ui/Icon'
import { getCurrencyMeta } from '@/data/currencies'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { MobileMonthStrip } from './MobileMonthStrip'
import type { MobileRoute } from './MobileBottomNav'
import type { IconName, ViewId } from '@/types'

export function MobileTopBar({
  route,
  view,
  mkey,
  monthKeys,
  title,
  onBack,
  onMenu,
  onSelectMonth,
  onAvatar,
  onCurrency,
  onSearch,
  notifCount = 0,
  action,
}: {
  route:        MobileRoute
  view:         ViewId
  mkey:         string
  monthKeys:    string[]
  title?:       string
  onBack?:      () => void
  onMenu?:      () => void
  onSelectMonth: (key: string) => void
  /**
   * Abre «mis cosas»: perfil, avisos y ajustes.
   *
   * Los tres estaban en tres iconos distintos de una barra que ya llevaba
   * ocho. Son la misma intencion y se visitan en el mismo momento.
   */
  onAvatar:     () => void
  onCurrency:   () => void
  onSearch:     () => void
  /** Para la insignia del avatar. */
  notifCount?:  number
  /**
   * LA ACCION DE ESTA PANTALLA, si tiene una.
   *
   * El calendario solo sirve en Movimientos y exportar solo en Negocio, pero
   * la barra cargaba los mismos iconos en todas partes: ninguna pantalla
   * tenia el suyo y todas llevaban los de las demas.
   */
  action?: { icon: IconName; label: string; onPress: () => void } | null
}) {
  const { currency } = useFinance()
  const meta = getCurrencyMeta(currency)
  const lang = useSettings(s => s.language)
  const displayName = useSettings(s => s.displayName)
  const profilePhoto = useSettings(s => s.profilePhoto)
  /*
   * La inicial de tu nombre sobre tu color, no un monigote gris igual al de
   * todos. Sin nombre puesto, el icono de persona: una letra inventada seria
   * peor que ninguna.
   */
  const avatarInitial = displayName.trim().charAt(0).toUpperCase()
  const locale = lang === 'es' ? 'es-DO' : 'en-US'
  const t = useT()

  const TITLES: Record<MobileRoute, string> = {
    home:     t('movementsLabel'),
    analysis: t('analysisTab'),
    add:      t('add'),
    reports:  t('accounts'),
    business: t('bizTitle'),
    profile:  t('profile'),
  }

  const showMonth = route === 'home'
    || (route === 'analysis' && view === 'stats')
    || (route === 'profile' && (view === 'budgets' || view === 'calendar'))
  const compactHeader = route === 'add'

  return (
    <header className="mobile-topbar">
      {/* Rejilla de 3 columnas con los lados a 1fr iguales: es lo que mantiene
          el título ópticamente centrado aunque un lado tenga más iconos que el
          otro. Con flex, el título se descentraba en cuanto los grupos dejaban
          de pesar lo mismo. */}
      <div className="mobile-topbar-row">
        <div className="mobile-topbar-side mobile-topbar-left">
          {onBack ? (
            <button className="mobile-icon-btn mobile-topbar-back" aria-label={t('back')} onClick={onBack}>
              <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
            </button>
          ) : onMenu ? (
            <button className="mobile-icon-btn mobile-topbar-menu" aria-label={t('toolsLabel')} onClick={onMenu}>
              <Icon name="list" size={22} />
            </button>
          ) : null}
          {/* Izquierda: moverse y encontrar, y nada mas. El calendario se fue
              al hueco de accion de la derecha, que solo sale donde sirve. */}
          {!compactHeader && (
            <button className="mobile-icon-btn" aria-label={t('search')} onClick={onSearch}>
              <Icon name="search" size={21} />
            </button>
          )}
        </div>

        <h1 className="mobile-topbar-title">{title ?? TITLES[route]}</h1>

        {/* Derecha: estado y configuración. */}
        <div className="mobile-topbar-side mobile-topbar-right">
          {!compactHeader && (
            <>
              {/* LA ACCION DE ESTA PANTALLA. Un hueco, no un cajon: el
                  calendario en Movimientos, exportar en Negocio. */}
              {action && (
                <button className="mobile-icon-btn" aria-label={action.label} onClick={action.onPress}>
                  <Icon name={action.icon} size={21} />
                </button>
              )}
              <button className="mobile-currency-btn" aria-label={t('currency')} onClick={onCurrency}>
                <span className="mobile-currency-flag">{meta.flag}</span>
                <span className="mobile-currency-code">{currency}</span>
              </button>
              {/*
                EL AVATAR SE COME TRES BOTONES.
                Perfil, ajustes y avisos son la misma intencion —«mis cosas»—
                y vivian en tres iconos distintos. Un solo avatar los reune y
                lleva encima la insignia de avisos. Tres a uno sin esconder
                nada: lo que estaba a un toque sigue a dos.

                Y es lo unico de la barra que es TUYO: la inicial de tu nombre
                sobre tu color, en vez de un monigote gris igual al de todos.
              */}
              <button
                className={`mobile-avatar-btn${route === 'profile' ? ' on' : ''}`}
                aria-label={t('myStuff')}
                aria-haspopup="dialog"
                onClick={onAvatar}
              >
                {/*
                  EL CIRCULO VA EN SU PROPIO ELEMENTO.
                  El boton necesita `overflow: visible` para que la insignia
                  de avisos asome por su esquina, pero eso dejaba la foto sin
                  recortar: se veia un cuadro con un anillo alrededor en vez
                  de un avatar. La cara se recorta aqui dentro y la insignia
                  queda fuera, cada una con lo que necesita.
                */}
                <span className="mobile-avatar-face">
                  {profilePhoto
                    ? <img className="mobile-avatar-img" src={profilePhoto} alt="" />
                    : avatarInitial
                      ? <span className="mobile-avatar-ini">{avatarInitial}</span>
                      : <Icon name="user" size={18} />}
                </span>
                {notifCount > 0 && (
                  <span className="mobile-bell-badge">{notifCount > 9 ? '9+' : notifCount}</span>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {showMonth && (
        <MobileMonthStrip keys={monthKeys} active={mkey} locale={locale} onSelect={onSelectMonth} />
      )}
    </header>
  )
}
