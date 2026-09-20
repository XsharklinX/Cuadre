import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useDialogs } from '@/components/ui/DialogProvider'
import { ACCENT_COLORS } from '@/constants'
import { CURRENCIES } from '@/data/currencies'
import { currentRate } from '@/data/fxAlerts'
import { fmt } from '@/data/helpers'
import { useResolvedTheme } from '@/hooks/useResolvedTheme'
import { useT } from '@/i18n'
import { playSoundPreview, playSuccessHaptic } from '@/lib/sound'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { CurrencyCode, DensityName, OverdraftPolicy, ThemeName } from '@/types'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

function getAccents(t: ReturnType<typeof useT>) {
  return [
    { color: ACCENT_COLORS[0], label: t('accentYellow') },
    { color: ACCENT_COLORS[1], label: t('accentGreen') },
    { color: ACCENT_COLORS[2], label: t('accentBlue') },
    { color: ACCENT_COLORS[3], label: t('accentViolet') },
    { color: ACCENT_COLORS[4], label: t('accentPink') },
    { color: ACCENT_COLORS[5], label: t('accentOrange') },
  ]
}

function getThemeLabels(t: ReturnType<typeof useT>): Record<ThemeName, string> {
  return {
    dark: t('themeDarkLabel'),
    light: t('themeLightLabel'),
    amoled: t('themeAmoledLabel'),
    system: t('themeSystemLabel'),
  }
}

function getDensityLabels(t: ReturnType<typeof useT>): Record<DensityName, string> {
  return {
    compact: t('densityCompact'),
    regular: t('densityRegular'),
    comfy: t('densityComfy'),
  }
}

function getOverdraftLabels(t: ReturnType<typeof useT>): Record<OverdraftPolicy, string> {
  return {
    block: t('overdraftBlock'),
    warn: t('overdraftWarn'),
    allow: t('overdraftAllow'),
  }
}

const themePreviewBg: Record<'dark' | 'light' | 'amoled', string> = {
  dark: '#0a0e16',
  light: '#f4f7fb',
  amoled: '#000000',
}

const themePreviewFg: Record<'dark' | 'light' | 'amoled', string> = {
  dark: '#e9eef7',
  light: '#172033',
  amoled: '#e9eef7',
}

export function SettingsAppearance({ activeSheet, onOpen, onClose, only }: SheetProps & { only?: 'finance' | 'appearance' }) {
  const settings = useSettings()
  const finance = useFinance()
  const resolvedTheme = useResolvedTheme()
  const { confirm } = useDialogs()
  const t = useT()

  const handleRoundAmounts = async () => {
    const ok = await confirm({
      title: t('roundAmountsTitle'),
      description: t('roundAmountsWarning'),
      confirmLabel: t('roundAmountsConfirm'),
      icon: 'coins',
    })
    if (!ok) return
    const changed = finance.roundAllAmounts()
    toast(
      changed > 0 ? t('roundAmountsDone').replace('{n}', String(changed)) : t('roundAmountsNothing'),
      { icon: 'check', type: 'ok' },
    )
  }

  // Cambiar la moneda re-expresa TODOS los montos en la nueva divisa según la
  // tasa actual. Es un cambio grande y global, así que se confirma primero.
  const changeCurrency = (code: CurrencyCode) => {
    if (code === finance.currency) { onClose(); return }
    void confirm({
      title: t('changeCurrencyConfirmTitle'),
      description: t('changeCurrencyConfirmBody').replace('{currency}', code),
      confirmLabel: t('changeCurrencyConfirmBtn'),
      icon: 'refresh',
    }).then(ok => {
      if (ok) {
        finance.setCurrency(code)
        toast(t('currencyChangedToast').replace('{currency}', code), { icon: 'check', type: 'ok' })
      }
      onClose()
    })
  }

  const accents = getAccents(t)
  const themeLabels = getThemeLabels(t)
  const densityLabels = getDensityLabels(t)
  const overdraftLabels = getOverdraftLabels(t)
  const languageValue = settings.language === 'en' ? 'English' : 'Español'

  const soundLabels = {
    silent: t('soundProfileSilent'),
    soft: t('soundProfileSoft'),
    full: t('soundProfileFull'),
  } as const

  const [fxThresholdSheet, setFxThresholdSheet] = useState(false)
  const fxWatchedCurrency = settings.fxAlertCurrency as CurrencyCode
  const fxAlertSummary = settings.fxAlertEnabled
    ? `${fxWatchedCurrency} ${settings.fxAlertDirection === 'above' ? '≥' : '≤'} ${fmt(settings.fxAlertThreshold, finance.currency)}`
    : t('fxAlertOffLabel')
  const fxCurrentRate = currentRate(fxWatchedCurrency, finance.currency)

  const sensitivityLabels: Record<'strict' | 'balanced' | 'relaxed', string> = {
    strict: t('anomalySensitivityStrict'),
    balanced: t('anomalySensitivityBalanced'),
    relaxed: t('anomalySensitivityRelaxed'),
  }
  const anomalyAlertSummary = settings.anomalyAlertsEnabled
    ? sensitivityLabels[settings.anomalySensitivity]
    : t('anomalyAlertOffLabel')

  const showFinance = !only || only === 'finance'
  const showAppearance = !only || only === 'appearance'

  return (
    <>
      {showFinance && (
      <div className="mset-section">
        {!only && <span className="mset-section-title">{t('financeSection')}</span>}
        <div className="mset-card">
          <SettingsRow
            icon="dollar"
            iconColor="#35d0a2"
            label={t('currency')}
            value={finance.currency}
            onClick={() => onOpen('currency')}
          />
          <SettingsRow
            icon="alert"
            iconColor="#f59e0b"
            label={t('overdraft')}
            value={overdraftLabels[settings.overdraftPolicy]}
            onClick={() => onOpen('overdraft')}
          />
          <SettingsRow
            icon="trend"
            iconColor="#5b9bff"
            label={t('fxAlertLabel')}
            value={fxAlertSummary}
            onClick={() => onOpen('fxAlert')}
          />
          <SettingsRow
            icon="alert"
            iconColor="#ff6b8a"
            label={t('anomalyAlertLabel')}
            value={anomalyAlertSummary}
            onClick={() => onOpen('anomalyAlert')}
          />
          <SettingsRow icon="coins" iconColor="#ffdd3d" label={t('roundAmountsLabel')}
            sublabel={t('roundAmountsSub')}
            onClick={() => void handleRoundAmounts()} />
        </div>

        {/* Cuentas ocultas ("no incluidas"): control de dónde aparecen. Solo se
            muestra si el usuario tiene al menos una cuenta marcada así. */}
        {finance.accounts.some(a => a.includeInTotal === false) && (
          <>
            {!only && <span className="mset-section-title">{t('hiddenAccountsTitle')}</span>}
            <div className="mset-card">
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#5b9bff22', color: '#5b9bff' }}><Icon name="list" size={18} /></span>
                <div className="mset-row-text"><b>{t('hiddenShowInMovementsLabel')}</b><small>{t('hiddenShowInMovementsDesc')}</small></div>
                <label className="mset-toggle-wrap"><input type="checkbox" className="mset-toggle-input" checked={settings.hiddenShowInMovements} onChange={e => settings.setHiddenShowInMovements(e.target.checked)} /><span className="mset-toggle" /></label>
              </div>
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}><Icon name="wallet" size={18} /></span>
                <div className="mset-row-text"><b>{t('hiddenCountInBalanceLabel')}</b><small>{t('hiddenCountInBalanceDesc')}</small></div>
                <label className="mset-toggle-wrap"><input type="checkbox" className="mset-toggle-input" checked={settings.hiddenCountInBalance} onChange={e => settings.setHiddenCountInBalance(e.target.checked)} /><span className="mset-toggle" /></label>
              </div>
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#a78bfa22', color: '#a78bfa' }}><Icon name="chart" size={18} /></span>
                <div className="mset-row-text"><b>{t('hiddenCountInSummaryLabel')}</b><small>{t('hiddenCountInSummaryDesc')}</small></div>
                <label className="mset-toggle-wrap"><input type="checkbox" className="mset-toggle-input" checked={settings.hiddenCountInSummary} onChange={e => settings.setHiddenCountInSummary(e.target.checked)} /><span className="mset-toggle" /></label>
              </div>
            </div>
          </>
        )}

        {finance.categories.some(c => c.type === 'expense' && c.budget > 0) && (
          <>
            {!only && <span className="mset-section-title">{t('budgets')}</span>}
            <div className="mset-card">
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#22c55e22', color: '#22c55e' }}><Icon name="repeat" size={18} /></span>
                <div className="mset-row-text"><b>{t('budgetRolloverLabel')}</b><small>{t('budgetRolloverDesc')}</small></div>
                <label className="mset-toggle-wrap"><input type="checkbox" className="mset-toggle-input" checked={settings.budgetRollover} onChange={e => settings.setBudgetRollover(e.target.checked)} /><span className="mset-toggle" /></label>
              </div>
            </div>
          </>
        )}
      </div>
      )}

      {showAppearance && (
      <div className="mset-section">
        {!only && <span className="mset-section-title">{t('appearanceSection')}</span>}
        <div className="mset-card">
          <SettingsRow
            icon="palette"
            iconColor="#a78bfa"
            label={t('theme')}
            value={themeLabels[settings.theme]}
            onClick={() => onOpen('theme')}
          />
          <SettingsRow
            icon="sliders"
            iconColor="#ff6b8a"
            label={t('accentColor')}
            onClick={() => onOpen('accent')}
            right={
              <>
                <span className="mset-color-dot" style={{ background: settings.accent }} />
                <Icon name="arrowUp" size={13} className="mset-chevron" />
              </>
            }
          />
          <SettingsRow
            icon="grid"
            iconColor="#f59e0b"
            label={t('density')}
            value={densityLabels[settings.density]}
            onClick={() => onOpen('density')}
          />
          <SettingsRow
            icon="map"
            iconColor="#64d2ff"
            label={t('language')}
            value={languageValue}
            onClick={() => onOpen('language')}
          />

          <div className="mset-row">
            <span className="mset-row-icon" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
              <Icon name="chart" size={18} />
            </span>
            <div className="mset-row-text">
              <b>{t('compactNumbers')}</b>
              <small>{t('compactNumbersDesc')}</small>
            </div>
            <label className="mset-toggle-wrap">
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={settings.compactNumbers}
                onChange={e => settings.setCompactNumbers(e.target.checked)}
              />
              <span className="mset-toggle" />
            </label>
          </div>

          <div className="mset-row">
            <span className="mset-row-icon" style={{ background: '#ffdd3d22', color: '#ffdd3d' }}>
              <Icon name="bolt" size={18} />
            </span>
            <div className="mset-row-text">
              <b>{t('quickAddsToggleLabel')}</b>
              <small>{t('quickAddsToggleDesc')}</small>
            </div>
            <label className="mset-toggle-wrap">
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={settings.quickAddsEnabled}
                onChange={e => settings.setQuickAddsEnabled(e.target.checked)}
              />
              <span className="mset-toggle" />
            </label>
          </div>

          {/* Tamaño de fuente / de toda la UI. El deslizador escala en vivo y se
              acompaña de un botón para volver al 100% de un toque. */}
          <div className="mset-row mset-row-fontsize">
            <span className="mset-row-icon" style={{ background: '#5bc0ff22', color: '#5bc0ff' }}>
              <Icon name="edit" size={18} />
            </span>
            <div className="mset-row-text">
              <b>{t('fontSizeLabel')}</b>
              <small>{t('fontSizeDesc')}</small>
              <div className="mset-fontsize-slider">
                <span className="mset-fontsize-a" aria-hidden="true">A</span>
                <input
                  type="range"
                  min={85}
                  max={135}
                  step={5}
                  value={Math.round(settings.fontScale * 100)}
                  aria-label={t('fontSizeLabel')}
                  onChange={e => settings.setFontScale(Number(e.target.value) / 100)}
                />
                <span className="mset-fontsize-a big" aria-hidden="true">A</span>
              </div>
            </div>
            {Math.round(settings.fontScale * 100) !== 100 && (
              <button className="mset-fontsize-reset" onClick={() => settings.setFontScale(1)}>
                {t('resetLabel')}
              </button>
            )}
          </div>

        </div>
      </div>
      )}

      {showAppearance && (
      <div className="mset-section">
        <span className="mset-section-title">{t('soundHapticsSection')}</span>
        <div className="mset-card">
          <SettingsRow
            icon="bell"
            iconColor="#35d0a2"
            label={t('soundProfile')}
            value={soundLabels[settings.soundProfile]}
            onClick={() => onOpen('soundProfile')}
          />
          {settings.soundProfile !== 'silent' && (
            <div className="mset-row mset-row-volume">
              <span className="mset-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}>
                <Icon name="sliders" size={18} />
              </span>
              <div className="mset-row-text">
                <b>{t('soundVolume')}</b>
                <input
                  className="mset-slider"
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(settings.soundVolume * 100)}
                  onChange={e => settings.setSoundVolume(Number(e.target.value) / 100)}
                  onInput={e => settings.setSoundVolume(Number((e.target as HTMLInputElement).value) / 100)}
                />
              </div>
              <button className="mset-sound-test" type="button" onClick={playSoundPreview}>
                {t('testSound')}
              </button>
            </div>
          )}
          <div className="mset-row">
            <span className="mset-row-icon" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
              <Icon name="bell" size={18} />
            </span>
            <div className="mset-row-text">
              <b>{t('hapticsLabel')}</b>
              <small>{t('hapticsDesc')}</small>
            </div>
            <label className="mset-toggle-wrap">
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={settings.hapticsEnabled}
                onChange={e => {
                  settings.setHapticsEnabled(e.target.checked)
                  if (e.target.checked) playSuccessHaptic()
                }}
              />
              <span className="mset-toggle" />
            </label>
          </div>
        </div>
      </div>
      )}

      {activeSheet === 'theme' && (
        <SettingsSheet title={t('theme')} onClose={onClose}>
          <div className="mset-sheet-options">
            {(['dark', 'light', 'amoled', 'system'] as ThemeName[]).map(theme => {
              const previewKey = theme === 'system' ? resolvedTheme : theme
              return (
                <button
                  key={theme}
                  className={`mset-theme-opt${settings.theme === theme ? ' on' : ''}`}
                  onClick={() => {
                    settings.setTheme(theme)
                    onClose()
                  }}
                >
                  <span className="mset-theme-preview" style={{ background: themePreviewBg[previewKey], color: themePreviewFg[previewKey] }}>
                    <span />
                  </span>
                  <strong>{themeLabels[theme]}</strong>
                  {settings.theme === theme && <Icon name="check" size={14} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto' }} />}
                </button>
              )
            })}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'accent' && (
        <SettingsSheet title={t('accentColor')} onClose={onClose}>
          <div className="mset-sheet-body">
            <div className="mset-accent-grid">
              {accents.map(({ color, label }) => (
                <button
                  key={color}
                  className={`mset-accent-opt${settings.accent === color ? ' on' : ''}`}
                  onClick={() => {
                    settings.setAccent(color)
                    onClose()
                  }}
                >
                  <span style={{ background: color }} />
                  <small>{label}</small>
                </button>
              ))}
            </div>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'density' && (
        <SettingsSheet title={t('density')} onClose={onClose}>
          <div className="mset-sheet-options">
            {(['compact', 'regular', 'comfy'] as DensityName[]).map(density => (
              <button
                key={density}
                className={`mset-option-row${settings.density === density ? ' on' : ''}`}
                onClick={() => {
                  settings.setDensity(density)
                  onClose()
                }}
              >
                <strong>{densityLabels[density]}</strong>
                <small>{density === 'compact' ? t('densityCompactDesc') : density === 'comfy' ? t('densityComfyDesc') : t('densityRegularDesc')}</small>
                {settings.density === density && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'soundProfile' && (
        <SettingsSheet title={t('soundProfile')} onClose={onClose}>
          <div className="mset-sheet-options">
            {(['silent', 'soft', 'full'] as const).map(profile => (
              <button
                key={profile}
                className={`mset-option-row${settings.soundProfile === profile ? ' on' : ''}`}
                onClick={() => {
                  settings.setSoundProfile(profile)
                  if (profile !== 'silent') setTimeout(playSoundPreview, 40)
                  onClose()
                }}
              >
                <strong>{soundLabels[profile]}</strong>
                <small>
                  {profile === 'silent'
                    ? t('soundProfileSilentDesc')
                    : profile === 'soft'
                      ? t('soundProfileSoftDesc')
                      : t('soundProfileFullDesc')}
                </small>
                {settings.soundProfile === profile && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'currency' && (
        <SettingsSheet title={t('currencySheetTitle')} onClose={onClose}>
          <div className="mset-sheet-options">
            {(['DOP', 'USD', 'EUR', 'MXN', 'GBP', 'COP', 'ARS', 'BRL', 'CAD'] as const).map(code => (
              <button
                key={code}
                className={`mset-option-row${finance.currency === code ? ' on' : ''}`}
                onClick={() => changeCurrency(code)}
              >
                <strong>{code}</strong>
                {finance.currency === code && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'fxAlert' && (
        <SettingsSheet title={t('fxAlertLabel')} onClose={onClose}>
          <div className="mset-field-stack">
            <span className="mset-field-label">{t('fxAlertCurrentRateLabel')}</span>
            <p className="mset-note-block">
              {t('fxAlertCurrentRateText')
                .replace('{currency}', fxWatchedCurrency)
                .replace('{rate}', fmt(fxCurrentRate, finance.currency))}
            </p>
          </div>
          <div className="mpr-form-section mpr-toggle-row" style={{ padding: '14px 16px' }}>
            <div className="mpr-toggle-row-text">
              <span className="mpr-toggle-row-label">{t('fxAlertEnableLabel')}</span>
              <small className="mpr-toggle-row-desc">{t('fxAlertEnableDesc')}</small>
            </div>
            <label className="mset-toggle-wrap">
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={settings.fxAlertEnabled}
                onChange={e => settings.setFxAlertEnabled(e.target.checked)}
              />
              <span className="mset-toggle" />
            </label>
          </div>
          <div className="mset-field-stack">
            <span className="mset-field-label">{t('fxAlertWatchLabel')}</span>
            <div className="mset-chip-grid">
              {(['USD', 'EUR', 'MXN', 'GBP', 'COP', 'ARS', 'BRL', 'CAD'] as const).map(code => (
                <button
                  key={code}
                  className={`mset-chip${settings.fxAlertCurrency === code ? ' on' : ''}`}
                  disabled={!settings.fxAlertEnabled}
                  onClick={() => settings.setFxAlertCurrency(code)}
                >
                  {CURRENCIES.find(c => c.code === code)?.flag} {code}
                </button>
              ))}
            </div>
          </div>
          <div className="mset-field-stack">
            <span className="mset-field-label">{t('fxAlertDirectionLabel')}</span>
            <div className="mset-chip-grid">
              <button
                className={`mset-chip${settings.fxAlertDirection === 'above' ? ' on' : ''}`}
                disabled={!settings.fxAlertEnabled}
                onClick={() => settings.setFxAlertDirection('above')}
              >
                {t('fxAlertAboveLabel')}
              </button>
              <button
                className={`mset-chip${settings.fxAlertDirection === 'below' ? ' on' : ''}`}
                disabled={!settings.fxAlertEnabled}
                onClick={() => settings.setFxAlertDirection('below')}
              >
                {t('fxAlertBelowLabel')}
              </button>
            </div>
          </div>
          <div className="mset-field-stack">
            <span className="mset-field-label">{t('fxAlertThresholdLabel')}</span>
            <button
              className="mset-row"
              disabled={!settings.fxAlertEnabled}
              onClick={() => setFxThresholdSheet(true)}
            >
              <span className="mset-label">{fmt(settings.fxAlertThreshold, finance.currency)}</span>
              <Icon name="edit" size={16} style={{ opacity: .5 }} />
            </button>
            <p className="mset-note-block">
              {t('fxAlertHint')
                .replace('{currency}', fxWatchedCurrency)
                .replace('{direction}', settings.fxAlertDirection === 'above' ? t('fxAlertAboveLabel').toLowerCase() : t('fxAlertBelowLabel').toLowerCase())}
            </p>
          </div>
        </SettingsSheet>
      )}

      {fxThresholdSheet && (
        <MobileAmountSheet
          title={t('fxAlertThresholdLabel')}
          value={settings.fxAlertThreshold}
          currency={finance.currency}
          onDone={v => { settings.setFxAlertThreshold(v); setFxThresholdSheet(false) }}
          onClose={() => setFxThresholdSheet(false)}
        />
      )}

      {activeSheet === 'anomalyAlert' && (
        <SettingsSheet title={t('anomalyAlertLabel')} onClose={onClose}>
          <div className="mpr-form-section mpr-toggle-row" style={{ padding: '14px 16px' }}>
            <div className="mpr-toggle-row-text">
              <span className="mpr-toggle-row-label">{t('anomalyAlertEnableLabel')}</span>
              <small className="mpr-toggle-row-desc">{t('anomalyAlertEnableDesc')}</small>
            </div>
            <label className="mset-toggle-wrap">
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={settings.anomalyAlertsEnabled}
                onChange={e => settings.setAnomalyAlertsEnabled(e.target.checked)}
              />
              <span className="mset-toggle" />
            </label>
          </div>
          <div className="mset-field-stack">
            <span className="mset-field-label">{t('anomalySensitivityLabel')}</span>
            <div className="mset-chip-grid">
              {(['relaxed', 'balanced', 'strict'] as const).map(level => (
                <button
                  key={level}
                  className={`mset-chip${settings.anomalySensitivity === level ? ' on' : ''}`}
                  disabled={!settings.anomalyAlertsEnabled}
                  onClick={() => settings.setAnomalySensitivity(level)}
                >
                  {sensitivityLabels[level]}
                </button>
              ))}
            </div>
            <p className="mset-note-block">{t('anomalySensitivityHint')}</p>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'overdraft' && (
        <SettingsSheet title={t('overdraftSheetTitle')} onClose={onClose}>
          <div className="mset-sheet-options">
            {(['block', 'warn', 'allow'] as OverdraftPolicy[]).map(policy => (
              <button
                key={policy}
                className={`mset-option-row${settings.overdraftPolicy === policy ? ' on' : ''}`}
                onClick={() => {
                  settings.setOverdraftPolicy(policy)
                  onClose()
                }}
              >
                <strong>{overdraftLabels[policy]}</strong>
                <small>{policy === 'block' ? t('overdraftBlockDesc') : policy === 'warn' ? t('overdraftWarnDesc') : t('overdraftAllowDesc')}</small>
                {settings.overdraftPolicy === policy && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'language' && (
        <SettingsSheet title={t('language')} onClose={onClose}>
          <div className="mset-sheet-options">
            {(['es', 'en'] as const).map(lang => (
              <button
                key={lang}
                className={`mset-option-row${settings.language === lang ? ' on' : ''}`}
                onClick={() => {
                  settings.setLanguage(lang)
                  onClose()
                }}
              >
                <strong>{lang === 'en' ? 'English' : 'Español'}</strong>
                <small>{lang === 'en' ? t('englishInterface') : t('spanishInterface')}</small>
                {settings.language === lang && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

    </>
  )
}
