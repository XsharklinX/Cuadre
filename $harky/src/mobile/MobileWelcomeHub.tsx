import { useState } from 'react'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import type { IconName } from '@/types'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { CURRENCIES } from '@/data/currencies'
import { useT } from '@/i18n'
import { MobileOnboarding } from './MobileOnboarding'
import type { CurrencyCode } from '@/types'

// Onboarding EXPRESS: 3 pasos informativos (bienvenida → cómo funciona → nombre)
// y, solo para usuarios nuevos, los 2 pasos funcionales (moneda → primera cuenta).
// Antes eran 4 diapositivas de tutorial; se cambiaron por una sola pantalla que
// comunica el valor real de la app.
const WELCOME = 0
const HOW = 1
const NAME = 2
const CURRENCY = 3
const ACCOUNT = 4

// Los 3 puntos de valor de "Así funciona": qué diferencia a $harky, no un tutorial.
function howPoints(t: ReturnType<typeof useT>): Array<{ icon: IconName; color: string; title: string; desc: string }> {
  return [
    { icon: 'bell',  color: '#5bc0ff', title: t('obDetectTitle'),     desc: t('obDetectDesc') },
    { icon: 'lock',  color: '#35d0a2', title: t('obPrivateTitle'),    desc: t('obPrivateDesc') },
    { icon: 'chart', color: '#ffdd3d', title: t('obUnderstandTitle'), desc: t('obUnderstandDesc') },
  ]
}

export function MobileWelcomeHub() {
  const startEmpty        = useFinance(s => s.startEmpty)
  const setCurrency       = useFinance(s => s.setCurrency)
  const { setDisplayName, markOnboardingSeen, displayName } = useSettings()
  const isExistingUser    = !!localStorage.getItem('sharky-finance-v2')

  const [step, setStep]   = useState(WELCOME)
  const [name, setName]   = useState(displayName || '')
  const [currency, setCurrencyChoice] = useState<CurrencyCode>('DOP')
  const t = useT()

  const finish = () => {
    const trimmed = name.trim()
    if (trimmed) setDisplayName(trimmed)
    markOnboardingSeen()
  }

  const goToCurrency = () => {
    const trimmed = name.trim()
    if (trimmed) setDisplayName(trimmed)
    startEmpty()
    setStep(CURRENCY)
  }

  const finishNewUser = () => markOnboardingSeen()

  const skipAll = () => {
    if (!isExistingUser) startEmpty()
    markOnboardingSeen()
  }

  const prevStep = () => setStep(s => Math.max(s - 1, WELCOME))

  /* ── Bienvenida ─────────────────────────────────────────── */
  if (step === WELCOME) {
    return (
      <div className="mobile-welcome-hub">
        <div className="mobile-welcome-top">
          <div className="mobile-welcome-glow" />
          <div className="mobile-welcome-brand">
            <BrandMark size={72} />
            <h1><span className="mobile-welcome-dollar">$</span>harky</h1>
          </div>
          <p className="mobile-welcome-tagline">{t('welcomeTaglineLine1')}<br />{t('welcomeTaglineLine2')}</p>
        </div>

        <div className="mobile-welcome-actions">
          <button className="mobile-welcome-primary" onClick={() => setStep(HOW)}>
            {t('obStartLabel')}
            <Icon name="arrowUp" size={16} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button className="mobile-welcome-ghost" onClick={skipAll}>
            {isExistingUser ? t('gotItKnowHow') : t('skipTutorial')}
          </button>
          <p className="mobile-welcome-fine">{t('noCloudPrivacy')}</p>
        </div>
      </div>
    )
  }

  /* ── Así funciona (una sola pantalla, informativa) ──────── */
  if (step === HOW) {
    return (
      <div className="mobile-welcome-hub mwh-how-screen">
        <div>
          <div className="mwh-dots"><span className="mwh-dot on" /><span className="mwh-dot" /></div>
          <h2 className="mwh-how-title">{t('obHowTitle')}</h2>
        </div>

        <div className="mwh-how-rows">
          {howPoints(t).map(pt => (
            <div key={pt.title} className="mwh-how-row">
              <span className="mwh-how-ic" style={{ background: `color-mix(in oklab, ${pt.color} 16%, transparent)`, color: pt.color }}>
                <Icon name={pt.icon} size={22} />
              </span>
              <div>
                <b>{pt.title}</b>
                <p>{pt.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mwh-slide-nav">
          <button className="mwh-nav-back" onClick={prevStep} aria-label={t('back')}>
            <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="mobile-welcome-primary mwh-nav-next" onClick={() => setStep(NAME)}>
            {t('continueBtn')}
            <Icon name="arrowUp" size={16} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
      </div>
    )
  }

  /* ── Nombre (opcional) ──────────────────────────────────── */
  if (step === NAME) {
    const onContinue = isExistingUser ? finish : goToCurrency
    return (
      <div className="mobile-welcome-hub mwh-name-screen">
        <div className="mwh-name-brand">
          <BrandMark size={54} />
        </div>
        <h2>{t('whatsYourName')}</h2>
        <p className="mwh-name-hint">
          {t('nameHint')}
          {isExistingUser && t('nameHintExisting')}
        </p>
        <input
          className="mwh-name-input"
          type="text"
          value={name}
          placeholder={t('yourNamePlaceholder')}
          autoCapitalize="words"
          autoCorrect="off"
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onContinue()}
        />

        <div className="mwh-name-actions">
          <button className="mwh-nav-back" onClick={prevStep} aria-label={t('back')}>
            <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="mobile-welcome-primary mwh-nav-next" onClick={onContinue}>
            {isExistingUser ? t('saveAndEnter') : t('continueBtn')}
            <Icon name="arrowUp" size={16} style={{ transform: isExistingUser ? undefined : 'rotate(90deg)' }} />
          </button>
        </div>
      </div>
    )
  }

  /* ── Moneda (solo usuarios nuevos) ──────────────────────── */
  if (step === CURRENCY) {
    return (
      <div className="mobile-welcome-hub mwh-name-screen">
        <div className="mwh-name-brand">
          <BrandMark size={54} />
        </div>
        <h2>{t('whatCurrency')}</h2>
        <p className="mwh-name-hint">{t('changeCurrencyLaterHint')}</p>
        <div className="mwh-currency-grid">
          {CURRENCIES.map(c => (
            <button
              key={c.code}
              className={`mwh-currency-item${currency === c.code ? ' on' : ''}`}
              onClick={() => setCurrencyChoice(c.code)}
            >
              <span className="mwh-currency-flag">{c.flag}</span>
              <strong>{c.code}</strong>
              <small>{c.name}</small>
            </button>
          ))}
        </div>
        <div className="mwh-name-actions">
          <button className="mwh-nav-back" onClick={prevStep} aria-label={t('back')}>
            <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
          </button>
          <button className="mobile-welcome-primary mwh-nav-next" onClick={() => { setCurrency(currency); setStep(ACCOUNT) }}>
            {t('continueBtn')}
            <Icon name="arrowUp" size={16} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
      </div>
    )
  }

  /* ── Primera cuenta (solo usuarios nuevos, último paso) ──── */
  return <MobileOnboarding onBack={prevStep} onDone={finishNewUser} />
}
