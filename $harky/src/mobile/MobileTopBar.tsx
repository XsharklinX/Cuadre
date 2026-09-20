import { Icon } from '@/components/ui/Icon'
import { getCurrencyMeta } from '@/data/currencies'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { MobileSyncBadge } from './MobileSyncBadge'
import { MobileMonthStrip } from './MobileMonthStrip'
import type { MobileRoute } from './MobileBottomNav'
import type { ViewId } from '@/types'

export function MobileTopBar({
  route,
  view,
  mkey,
  monthKeys,
  title,
  onBack,
  onMenu,
  onSelectMonth,
  onSettings,
  onCurrency,
  onCalendar,
  onSearch,
  onBell,
  notifCount = 0,
}: {
  route:        MobileRoute
  view:         ViewId
  mkey:         string
  monthKeys:    string[]
  title?:       string
  onBack?:      () => void
  onMenu?:      () => void
  onSelectMonth: (key: string) => void
  onSettings:   () => void
  onCurrency:   () => void
  onCalendar?:  () => void
  onSearch:     () => void
  onBell?:      () => void
  notifCount?:  number
}) {
  const { currency } = useFinance()
  const meta = getCurrencyMeta(currency)
  const lang = useSettings(s => s.language)
  const locale = lang === 'es' ? 'es-DO' : 'en-US'
  const t = useT()

  const TITLES: Record<MobileRoute, string> = {
    home:     t('movementsLabel'),
    analysis: t('analysisTab'),
    add:      t('add'),
    reports:  t('accounts'),
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
          {/* Izquierda: moverse y encontrar. */}
          {!compactHeader && (
            <>
              <button className="mobile-icon-btn" aria-label={t('search')} onClick={onSearch}>
                <Icon name="search" size={21} />
              </button>
              {onCalendar && (
                <button className="mobile-icon-btn" aria-label={t('calendarLabel')} onClick={onCalendar}>
                  <Icon name="calendar" size={21} />
                </button>
              )}
            </>
          )}
        </div>

        <h1 className="mobile-topbar-title">{title ?? TITLES[route]}</h1>

        {/* Derecha: estado y configuración. */}
        <div className="mobile-topbar-side mobile-topbar-right">
          {!compactHeader && (
            <>
              <MobileSyncBadge />
              <button className="mobile-currency-btn" aria-label={t('currency')} onClick={onCurrency}>
                <span className="mobile-currency-flag">{meta.flag}</span>
                <span className="mobile-currency-code">{currency}</span>
              </button>
              {onBell && (
                <button className="mobile-icon-btn mobile-bell-btn" aria-label={t('notificationsLabel')} onClick={onBell}>
                  <Icon name="bell" size={21} />
                  {notifCount > 0 && (
                    <span className="mobile-bell-badge">{notifCount > 9 ? '9+' : notifCount}</span>
                  )}
                </button>
              )}
              <button className="mobile-icon-btn" aria-label={t('settings')} onClick={onSettings}>
                <Icon name="settings" size={21} />
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
