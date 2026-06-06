import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { APP_VERSION } from '@/data/release'
import { createBackup, parseBackup } from '@/data/backup'
import { getDataHealthStatus } from '@/data/dataHealth'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useGoogleAuth, loadGIS } from '@/lib/googleAuth'
import { openBackup, saveBackup } from '@/hooks/useTauri'
import type { DensityName, IconName, OverdraftPolicy, ThemeName } from '@/types'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'

const ACCENTS = [
  { color: '#ffdd3d', label: 'Yellow'  },
  { color: '#35d0a2', label: 'Green'   },
  { color: '#5bc0ff', label: 'Blue'    },
  { color: '#a78bfa', label: 'Violet'  },
  { color: '#ff6b8a', label: 'Pink'    },
  { color: '#f59e0b', label: 'Orange'  },
]

const THEME_LABELS: Record<ThemeName, string>   = { dark: 'Dark', light: 'Light' }
const DENSITY_LABELS: Record<DensityName, string> = { compact: 'Compact', regular: 'Regular', comfy: 'Comfortable' }
const OVERDRAFT_LABELS: Record<OverdraftPolicy, string> = { block: 'Block', warn: 'Warn', allow: 'Allow' }

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

type Sheet = 'theme' | 'accent' | 'density' | 'currency' | 'overdraft' | 'name' | 'reset' | 'language'

interface SettingsRowProps {
  icon: IconName
  iconColor: string
  label: string
  value?: string
  danger?: boolean
  onClick: () => void
  right?: React.ReactNode
}
function SettingsRow({ icon, iconColor, label, value, danger, onClick, right }: SettingsRowProps) {
  return (
    <button className={`mset-row${danger ? ' danger' : ''}`} onClick={onClick}>
      <span className="mset-icon" style={{ color: iconColor, background: `color-mix(in oklab, ${iconColor} 14%, transparent)` }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="mset-label">{label}</span>
      {right ?? (
        <>
          {value && <span className="mset-value">{value}</span>}
          <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', color: '#4a4a4a', flexShrink: 0 }} />
        </>
      )}
    </button>
  )
}

interface SheetProps { title: string; onClose: () => void; children: React.ReactNode }
function SettingsSheet({ title, onClose, children }: SheetProps) {
  return (
    <div className="mobile-detail-sheet" role="dialog" aria-modal="true" onClick={onClose}>
      <section onClick={e => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          <button onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}

function GoogleButton({ onSignIn }: { onSignIn: (credential: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !ref.current) return
    loadGIS(() => {
      if (!ref.current || !window.google) return
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => onSignIn(r.credential),
      })
      window.google.accounts.id.renderButton(ref.current, {
        theme: 'filled_black',
        size: 'large',
        text: 'signin_with',
        shape: 'pill',
        width: '100%',
      })
    })
  }, [onSignIn])

  if (!GOOGLE_CLIENT_ID) {
    return (
      <div className="mset-google-no-config">
        <Icon name="info" size={15} />
        <span>Add <code>VITE_GOOGLE_CLIENT_ID</code> to your <code>.env</code> to enable Google Sign-In.</span>
      </div>
    )
  }

  return <div ref={ref} className="mset-google-btn-wrap" />
}

export function MobileSettings({ onClose }: { onClose: () => void }) {
  const settings = useSettings()
  const finance  = useFinance()
  const { user: gUser, signIn, signOut } = useGoogleAuth()
  const t = useT()
  const [activeSheet, setActiveSheet] = useState<Sheet | null>(null)
  const [nameInput, setNameInput] = useState(settings.displayName)
  const [pendingReset, setPendingReset] = useState(false)
  const health = getDataHealthStatus(finance)

  useMobileBackDismiss(true, onClose)
  useMobileBackDismiss(!!activeSheet, () => { setActiveSheet(null); setPendingReset(false) })

  const open  = (sheet: Sheet) => { setActiveSheet(sheet); if (sheet === 'name') setNameInput(settings.displayName) }
  const close = () => { setActiveSheet(null); setPendingReset(false) }

  const saveName = () => {
    settings.setDisplayName(nameInput.trim())
    toast('Name saved', { icon: 'check', type: 'ok' })
    close()
  }

  const exportBackup = async () => {
    try {
      await saveBackup(JSON.stringify(createBackup(finance), null, 2))
      toast('Backup exported', { icon: 'download', type: 'ok' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Export failed.', { icon: 'alert' })
    }
  }

  const importBackup = async () => {
    try {
      const text = await openBackup()
      if (!text) return
      finance.restoreBackup(parseBackup(text))
      toast('Backup restored', { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Invalid file.', { icon: 'alert' })
    }
  }

  const confirmReset = () => {
    finance.startEmpty()
    toast('All data deleted', { icon: 'trash' })
    close()
    onClose()
  }

  const themePreviewBg: Record<ThemeName, string> = { dark: '#0a0e16', light: '#f4f7fb' }
  const themePreviewFg: Record<ThemeName, string> = { dark: '#e9eef7', light: '#172033' }

  return (
    <div className="mobile-settings-screen" role="dialog" aria-modal="true">
      <header className="mset-header">
        <button className="mset-back" onClick={onClose}>
          <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <strong>{t('settings')}</strong>
        <span />
      </header>

      <div className="mset-body">

        {/* ── Google Account ── */}
        <div className="mset-section">
          <span className="mset-section-title">Account</span>
          {gUser ? (
            <div className="mset-card">
              <div className="mset-google-profile">
                {gUser.picture
                  ? <img className="mset-google-avatar" src={gUser.picture} alt={gUser.name} referrerPolicy="no-referrer" />
                  : <div className="mset-google-avatar initials">{gUser.name.slice(0, 1).toUpperCase()}</div>
                }
                <div className="mset-google-info">
                  <strong>{gUser.name}</strong>
                  <small>{gUser.email}</small>
                  <small className="mset-uid">ID: {gUser.id.slice(0, 12)}…</small>
                </div>
              </div>
              <SettingsRow icon="logout" iconColor="#ff6b8a" label="Sign out of Google" danger
                onClick={() => { signOut(); toast('Signed out', { icon: 'check' }) }} />
            </div>
          ) : (
            <div className="mset-card">
              <div className="mset-google-signin-wrap">
                <p className="mset-google-desc">Sign in to sync your data and keep it safe across devices.</p>
                <GoogleButton onSignIn={(cred) => { signIn(cred); toast('Signed in with Google', { icon: 'check', type: 'ok' }) }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Profile ── */}
        <div className="mset-section">
          <span className="mset-section-title">Profile</span>
          <div className="mset-card">
            <SettingsRow icon="user" iconColor="#5bc0ff" label="Display name"
              value={settings.displayName || 'Not set'}
              onClick={() => open('name')} />
          </div>
        </div>

        {/* ── Finance ── */}
        <div className="mset-section">
          <span className="mset-section-title">Finance</span>
          <div className="mset-card">
            <SettingsRow icon="dollar" iconColor="#35d0a2" label={t('currency')}
              value={finance.currency}
              onClick={() => open('currency')} />
            <SettingsRow icon="alert" iconColor="#f59e0b" label="Overdraft"
              value={OVERDRAFT_LABELS[settings.overdraftPolicy]}
              onClick={() => open('overdraft')} />
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="mset-section">
          <span className="mset-section-title">Appearance</span>
          <div className="mset-card">
            <SettingsRow icon="palette" iconColor="#a78bfa" label={t('theme')}
              value={THEME_LABELS[settings.theme]}
              onClick={() => open('theme')} />
            <SettingsRow icon="sliders" iconColor="#ff6b8a" label="Accent color"
              onClick={() => open('accent')}
              right={
                <>
                  <span className="mset-color-dot" style={{ background: settings.accent }} />
                  <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', color: '#4a4a4a', flexShrink: 0 }} />
                </>
              }
            />
            <SettingsRow icon="grid" iconColor="#f59e0b" label="Density"
              value={DENSITY_LABELS[settings.density]}
              onClick={() => open('density')} />
            <SettingsRow icon="map" iconColor="#64d2ff" label={t('language')}
              value={settings.language === 'en' ? 'English' : 'Español'}
              onClick={() => open('language')} />
          </div>
        </div>

        {/* ── Data ── */}
        <div className="mset-section">
          <span className="mset-section-title">Data</span>
          <div className="mset-card">
            <div className="mset-stats">
              <div><strong>{health.transactions}</strong><small>Transactions</small></div>
              <div><strong>{health.categories}</strong><small>Categories</small></div>
              <div><strong>{health.goals}</strong><small>{t('goals')}</small></div>
            </div>
            {health.warnings.map(w => (
              <p className="mset-warning" key={w}><Icon name="alert" size={13} />{w}</p>
            ))}
          </div>
          <div className="mset-card">
            <SettingsRow icon="download" iconColor="#35d0a2" label="Export backup"
              onClick={() => void exportBackup()} />
            <SettingsRow icon="upload" iconColor="#5bc0ff" label="Restore backup"
              onClick={() => void importBackup()} />
          </div>
          <div className="mset-card">
            <SettingsRow icon="trash" iconColor="#ff6b8a" label="Delete all data"
              danger onClick={() => open('reset')} />
          </div>
        </div>

        {/* ── App ── */}
        <div className="mset-section">
          <div className="mset-card">
            <div className="mset-info-row">
              <span>$harky</span>
              <span>v{APP_VERSION}</span>
            </div>
          </div>
        </div>

      </div>

      {/* ─── Sheets ─── */}

      {activeSheet === 'name' && (
        <SettingsSheet title="Display name" onClose={close}>
          <div className="mset-sheet-body">
            <input
              className="mset-text-input" autoFocus type="text"
              value={nameInput} placeholder="e.g. John Smith"
              autoCapitalize="words" enterKeyHint="done"
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
            />
            <button className="mset-sheet-confirm" onClick={saveName}>{t('save')}</button>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'theme' && (
        <SettingsSheet title="Theme" onClose={close}>
          <div className="mset-sheet-options">
            {(['dark', 'light'] as ThemeName[]).map(theme => (
              <button key={theme} className={`mset-theme-opt${settings.theme === theme ? ' on' : ''}`}
                onClick={() => { settings.setTheme(theme); close() }}>
                <span className="mset-theme-preview" style={{ background: themePreviewBg[theme], color: themePreviewFg[theme] }}>
                  <span />
                </span>
                <strong>{THEME_LABELS[theme]}</strong>
                {settings.theme === theme && <Icon name="check" size={14} style={{ color: '#ffdd3d', marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'accent' && (
        <SettingsSheet title="Accent color" onClose={close}>
          <div className="mset-sheet-body">
            <div className="mset-accent-grid">
              {ACCENTS.map(({ color, label }) => (
                <button key={color} className={`mset-accent-opt${settings.accent === color ? ' on' : ''}`}
                  onClick={() => { settings.setAccent(color); close() }}>
                  <span style={{ background: color }} />
                  <small>{label}</small>
                </button>
              ))}
            </div>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'density' && (
        <SettingsSheet title="Interface density" onClose={close}>
          <div className="mset-sheet-options">
            {(['compact', 'regular', 'comfy'] as DensityName[]).map(density => (
              <button key={density} className={`mset-option-row${settings.density === density ? ' on' : ''}`}
                onClick={() => { settings.setDensity(density); close() }}>
                <strong>{DENSITY_LABELS[density]}</strong>
                <small>{density === 'compact' ? 'More content visible' : density === 'comfy' ? 'More space between elements' : 'Balanced'}</small>
                {settings.density === density && <Icon name="check" size={16} style={{ color: '#ffdd3d', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'currency' && (
        <SettingsSheet title="Default currency" onClose={close}>
          <div className="mset-sheet-options">
            {(['DOP','USD','EUR','MXN','GBP','COP','ARS','BRL','CAD'] as const).map(code => (
              <button key={code} className={`mset-option-row${finance.currency === code ? ' on' : ''}`}
                onClick={() => { finance.setCurrency(code); close() }}>
                <strong>{code}</strong>
                {finance.currency === code && <Icon name="check" size={16} style={{ color: '#ffdd3d', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'overdraft' && (
        <SettingsSheet title="Overdraft policy" onClose={close}>
          <div className="mset-sheet-options">
            {(['block', 'warn', 'allow'] as OverdraftPolicy[]).map(policy => (
              <button key={policy} className={`mset-option-row${settings.overdraftPolicy === policy ? ' on' : ''}`}
                onClick={() => { settings.setOverdraftPolicy(policy); close() }}>
                <strong>{OVERDRAFT_LABELS[policy]}</strong>
                <small>{policy === 'block' ? 'Prevents spending when balance is zero' : policy === 'warn' ? 'Warns but allows to continue' : 'Always allows, no restriction'}</small>
                {settings.overdraftPolicy === policy && <Icon name="check" size={16} style={{ color: '#ffdd3d', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'language' && (
        <SettingsSheet title="Idioma / Language" onClose={close}>
          <div className="mset-sheet-options">
            {(['en', 'es'] as const).map(lang => (
              <button key={lang} className={`mset-option-row${settings.language === lang ? ' on' : ''}`}
                onClick={() => { settings.setLanguage(lang); close() }}>
                <strong>{lang === 'en' ? '🇺🇸 English' : '🇩🇴 Español'}</strong>
                <small>{lang === 'en' ? 'Interface in English' : 'Interfaz en español'}</small>
                {settings.language === lang && <Icon name="check" size={16} style={{ color: '#ffdd3d', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'reset' && (
        <SettingsSheet title="Delete data" onClose={close}>
          <div className="mset-sheet-body">
            <p className="mset-reset-warning">
              This will permanently delete <strong>all your transactions, accounts, categories and goals</strong>. This cannot be undone.
            </p>
            {!pendingReset ? (
              <button className="mset-sheet-danger" onClick={() => setPendingReset(true)}>
                Continue
              </button>
            ) : (
              <>
                <button className="mset-sheet-danger" onClick={confirmReset}>
                  <Icon name="trash" size={18} /> Yes, delete everything
                </button>
                <button className="mset-sheet-cancel" onClick={() => setPendingReset(false)}>
                  {t('cancel')}
                </button>
              </>
            )}
          </div>
        </SettingsSheet>
      )}
    </div>
  )
}
