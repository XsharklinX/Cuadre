import { useEffect, useState } from 'react'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { APP_VERSION } from '@/data/release'
import { createBackup, parseBackup } from '@/data/backup'
import { getDataHealthStatus } from '@/data/dataHealth'
import { exportExcel, exportMonthlyPdf } from '@/data/professionalExport'
import { monthLabel } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useAuth } from '@/store/auth'
import { isTauri, openBackup, saveBackup } from '@/hooks/useTauri'
import { checkBiometric } from '@/lib/biometric'
import type { Category, DensityName, IconName, OverdraftPolicy, ThemeName } from '@/types'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'

const ACCENTS = [
  { color: '#ffdd3d', label: 'Amarillo' },
  { color: '#35d0a2', label: 'Verde'    },
  { color: '#5bc0ff', label: 'Azul'     },
  { color: '#a78bfa', label: 'Violeta'  },
  { color: '#ff6b8a', label: 'Rosa'     },
  { color: '#f59e0b', label: 'Naranja'  },
]

const THEME_LABELS: Record<ThemeName, string>     = { dark: 'Oscuro', light: 'Claro' }
const DENSITY_LABELS: Record<DensityName, string> = { compact: 'Compacto', regular: 'Regular', comfy: 'Cómodo' }
const OVERDRAFT_LABELS: Record<OverdraftPolicy, string> = { block: 'Bloquear', warn: 'Advertir', allow: 'Permitir' }

type Sheet = 'theme' | 'accent' | 'density' | 'currency' | 'overdraft' | 'name' | 'reset' | 'language'
  | 'comments' | 'about' | 'privacy' | 'terms' | 'export' | 'pin' | 'categories'

const CAT_COLORS = ['#ffdd3d','#35d0a2','#5bc0ff','#a78bfa','#ff6b8a','#f59e0b','#fb7185','#22c55e','#c084fc','#38bdf8']

const CAT_ICONS: IconName[] = [
  'cart','food','car','bolt','heart','home','bag','book','wallet','laptop','trend','play',
  'music','coffee','phone','gym','bus','building','gamepad','gift','scissors','baby','paw','pill',
  'plane','briefcase','shirt','pizza','star','fuel','flame','soda',
  'tree','sun','bike','train','tv','monitor','headphones','clock','key','tool',
  'brush','graduation','stethoscope','salad','wine','crown','trophy','shield','map','package',
]

const PRIVACY_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Who is responsible for your data',
    body: [
      '$harky is developed and maintained by David Bonilla ("the Developer", "we", "us"). For any question about this Privacy Policy or your data, write to us at contactosharklin@gmail.com.',
    ],
  },
  {
    title: '2. What data we collect',
    body: [
      'Financial data you enter (accounts, transactions, categories, budgets and goals): stored only on your device, locally, unless you voluntarily turn on sync with your Google account as described below.',
      'Google account data (optional): if you choose to sign in with Google, we receive the name, email address, profile photo and account identifier that Google provides, used solely to identify you inside the app and enable sync across your devices.',
      'Cloud-synced data (optional): if you turn on sync, your accounts, transactions, categories, goals and contributions are stored on our database infrastructure (Supabase), linked to your user identifier, so you can access them from different devices.',
      'Comments and suggestions: if you use the "Comments" section in Settings, the text you write is sent directly to us from within the app and may include basic context such as the app version and platform, so we can read and respond to it.',
      'We do not include advertising or third-party commercial trackers, and we do not collect browsing data for marketing purposes.',
    ],
  },
  {
    title: '3. How we use your data',
    body: [
      'To make the app work: calculations, reports, budgets, projections and goals are generated locally from the information you enter.',
      'To sync your data across your own devices when you sign in and turn that feature on.',
      'To read and respond to the comments, questions or support requests you send us.',
      'We never sell, rent or share your financial data for advertising or commercial purposes.',
    ],
  },
  {
    title: '4. Who we share information with',
    body: [
      'Google LLC, as the sign-in provider, only if you choose to use that feature. How Google handles your data is governed by its own privacy policy.',
      'Supabase Inc., as our cloud database infrastructure provider, solely to securely store the data you choose to sync. Supabase acts as a data processor and does not use your information for its own purposes.',
      'We do not share your information with advertisers, data brokers, or third parties for marketing purposes.',
    ],
  },
  {
    title: '5. Data security',
    body: [
      'We apply reasonable technical measures to protect your data: encryption in transit (HTTPS/TLS), secure credential storage, and authentication via the OAuth PKCE flow. No system is perfectly secure, so we cannot guarantee absolute protection.',
    ],
  },
  {
    title: '6. Your rights and control over your data',
    body: [
      'You can use $harky entirely offline and without creating an account; in that case your data never leaves your device.',
      'You can export a copy of your data at any time from Settings → Data → Export backup, and restore it later.',
      'You can permanently delete all your local data from Settings → Data → Delete all data.',
      'You can sign out of Google and turn off sync at any time from Settings → Account.',
      'If you want us to delete the data synced on our servers, write to us at contactosharklin@gmail.com and we will handle your request within a reasonable time.',
    ],
  },
  {
    title: '7. Data retention',
    body: [
      'Locally stored data stays on your device until you delete it or uninstall the app. Cloud-synced data is kept while your account is active or until you request its deletion.',
    ],
  },
  {
    title: '8. Children',
    body: [
      '$harky is not directed at children under 13, and we do not knowingly collect information from minors. If you believe a minor has provided us with personal data, please contact us so we can remove it.',
    ],
  },
  {
    title: '9. Changes to this policy',
    body: [
      'We may update this Privacy Policy from time to time. If the changes are significant, we will notify you inside the app. The date of the latest update always appears at the top of this document.',
    ],
  },
  {
    title: '10. Contact',
    body: [
      'For questions, data requests, or any privacy concern, write to us at contactosharklin@gmail.com.',
    ],
  },
]

const TERMS_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. Acceptance of these terms',
    body: [
      'By downloading, installing or using $harky ("the app"), you agree to these Terms of Use. If you do not agree with them, please do not use the app.',
    ],
  },
  {
    title: '2. Description of the service',
    body: [
      '$harky is a personal finance management tool that lets you track income, expenses, budgets and savings goals. It is an informational and organizational tool: it is not a financial institution, a bank, or an investment advisor, and it does not replace professional advice.',
    ],
  },
  {
    title: '3. Not financial advice',
    body: [
      'The information, calculations, projections and reports the app generates are based solely on the data you enter and are for guidance only. They do not constitute financial, legal, accounting or tax advice. We recommend consulting a qualified professional before making important financial decisions.',
    ],
  },
  {
    title: '4. Your responsibility for your data',
    body: [
      'You are solely responsible for the accuracy of the information you enter, and for keeping backups of your data (the app includes a backup export/import feature for this purpose).',
      'If you choose to use Google sign-in and cloud sync, you are responsible for keeping your Google account secure and for any activity that happens through it.',
    ],
  },
  {
    title: '5. Acceptable use',
    body: [
      'You agree to use $harky lawfully, and not to attempt to breach, reverse-engineer, overload, or otherwise compromise the security of the app or the services that support it.',
    ],
  },
  {
    title: '6. Intellectual property',
    body: [
      'The "$harky" name, its logo, visual design, source code and content are the property of David Bonilla, except for third-party libraries used under their respective open-source licenses.',
    ],
  },
  {
    title: '7. Service availability',
    body: [
      'We make a reasonable effort to keep the app running correctly, but we do not guarantee it will be error-free, uninterrupted, or always available — particularly for features that depend on external services (Google, Supabase).',
    ],
  },
  {
    title: '8. Limitation of liability',
    body: [
      'To the maximum extent permitted by applicable law, David Bonilla will not be liable for indirect, incidental or consequential damages arising from the use or inability to use the app — including, among others, data loss or financial decisions made based on its information. The app is provided "as is" and "as available", without warranties of any kind, express or implied.',
    ],
  },
  {
    title: '9. Changes to the service and these terms',
    body: [
      'We may update, modify or discontinue features of the app, as well as these Terms of Use, at any time. We will notify you of relevant changes inside the app. If you keep using $harky after a change, you are considered to have accepted the new terms.',
    ],
  },
  {
    title: '10. Termination',
    body: [
      'You can stop using the app and delete your data whenever you want. We may suspend or limit features that depend on third-party services if those services change their terms or become unavailable.',
    ],
  },
  {
    title: '11. Governing law',
    body: [
      'These Terms are governed by the laws of the Dominican Republic, without prejudice to any consumer-protection rules that may apply to you based on your place of residence.',
    ],
  },
  {
    title: '12. Contact',
    body: [
      'For questions about these Terms of Use, write to us at contactosharklin@gmail.com.',
    ],
  },
]

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

function GoogleButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button className="mset-google-btn-wrap" disabled={busy} onClick={onClick}>
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
        <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
      </svg>
      {busy ? 'Conectando...' : 'Continuar con Google'}
    </button>
  )
}

export function MobileSettings({ mkey, onClose }: { mkey: string; onClose: () => void }) {
  const settings = useSettings()
  const finance  = useFinance()
  const auth = useAuth()
  const t = useT()
  const [activeSheet, setActiveSheet] = useState<Sheet | null>(null)
  const [nameInput, setNameInput] = useState(settings.displayName)
  const [commentText, setCommentText] = useState('')
  const [pendingReset, setPendingReset] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | 'new-expense' | 'new-income' | null>(null)
  const [pinStep, setPinStep] = useState<'idle' | 'enter' | 'confirm' | 'remove'>('idle')
  const [pinDraft, setPinDraft] = useState('')
  const [pinValue, setPinValue] = useState('')
  const [pinError, setPinError] = useState('')
  const health = getDataHealthStatus(finance)

  useEffect(() => {
    if (isTauri()) checkBiometric().then(s => setBioAvailable(s.available))
  }, [])

  useMobileBackDismiss(true, onClose)
  useMobileBackDismiss(!!activeSheet, () => { setActiveSheet(null); setPendingReset(false); resetPinFlow() })
  useMobileBackDismiss(!!editingCat, () => setEditingCat(null))

  const open  = (sheet: Sheet) => { setActiveSheet(sheet); if (sheet === 'name') setNameInput(settings.displayName) }
  const close = () => { setActiveSheet(null); setPendingReset(false); resetPinFlow() }

  function resetPinFlow() {
    setPinStep('idle'); setPinDraft(''); setPinValue(''); setPinError('')
  }

  const saveName = () => {
    settings.setDisplayName(nameInput.trim())
    toast('Nombre guardado', { icon: 'check', type: 'ok' })
    close()
  }

  const exportBackup = async () => {
    try {
      await saveBackup(JSON.stringify(createBackup(finance), null, 2))
      toast('Backup exportado', { icon: 'download', type: 'ok' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Error al exportar.', { icon: 'alert' })
    }
  }

  const importBackup = async () => {
    try {
      const text = await openBackup()
      if (!text) return
      finance.restoreBackup(parseBackup(text))
      toast('Backup restaurado', { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Archivo inválido.', { icon: 'alert' })
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportMonthlyPdf(finance, mkey, settings.displayName || '$harky')
      toast(`Estado de ${monthLabel(mkey)} exportado en PDF`, { icon: 'download', type: 'ok' })
    } catch {
      toast('No se pudo generar el PDF.', { icon: 'alert' })
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportExcel = async () => {
    setExportingExcel(true)
    try {
      await exportExcel(finance)
      toast('Reporte completo exportado en Excel', { icon: 'download', type: 'ok' })
    } catch {
      toast('No se pudo generar el Excel.', { icon: 'alert' })
    } finally {
      setExportingExcel(false)
    }
  }

  const saveCategory = (fields: { name: string; type: 'expense' | 'income'; budget: number; color: string; icon: IconName }) => {
    if (!fields.name.trim()) { toast('Escribe un nombre para la categoría.', { icon: 'alert' }); return }
    try {
      if (editingCat === 'new-expense' || editingCat === 'new-income') {
        finance.addCategory({ name: fields.name.trim(), type: fields.type, budget: fields.budget, color: fields.color, icon: fields.icon })
        toast('Categoría creada', { icon: 'check', type: 'ok' })
      } else if (editingCat) {
        finance.updateCategory(editingCat.id, { name: fields.name.trim(), budget: fields.budget, color: fields.color, icon: fields.icon })
        toast('Categoría actualizada', { icon: 'check', type: 'ok' })
      }
      setEditingCat(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo guardar la categoría.', { icon: 'alert' })
    }
  }

  const removeCategory = (cat: Category) => {
    try {
      finance.deleteCategory(cat.id)
      toast('Categoría eliminada', { icon: 'trash' })
      setEditingCat(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'No se pudo eliminar.', { icon: 'alert' })
    }
  }

  const pressPinDigit = (digit: string) => {
    if (pinError) setPinError('')
    if (pinStep === 'enter') {
      setPinValue(v => {
        if (v.length >= 4) return v
        const next = v + digit
        if (next.length === 4) setTimeout(() => { setPinDraft(next); setPinValue(''); setPinStep('confirm') }, 120)
        return next
      })
    } else if (pinStep === 'confirm') {
      setPinValue(v => {
        if (v.length >= 4) return v
        const next = v + digit
        if (next.length === 4) {
          if (next === pinDraft) {
            settings.setAppPin(next)
            toast('PIN configurado', { icon: 'check', type: 'ok' })
            setTimeout(close, 250)
          } else {
            setTimeout(() => { setPinValue(''); setPinDraft(''); setPinStep('enter'); setPinError('Los PIN no coinciden, intenta de nuevo') }, 200)
          }
        }
        return next
      })
    } else if (pinStep === 'remove') {
      setPinValue(v => {
        if (v.length >= 4) return v
        const next = v + digit
        if (next.length === 4) {
          if (next === settings.appPin) {
            settings.setAppPin(null)
            toast('PIN eliminado', { icon: 'trash' })
            setTimeout(close, 200)
          } else {
            setTimeout(() => { setPinValue(''); setPinError('PIN incorrecto') }, 200)
          }
        }
        return next
      })
    }
  }
  const backspacePin = () => { if (pinError) setPinError(''); setPinValue(v => v.slice(0, -1)) }

  const sendComment = () => {
    const body = commentText.trim()
    if (!body) return
    toast('¡Gracias por tu comentario! Lo tendremos en cuenta.', { icon: 'check', type: 'ok' })
    setCommentText('')
    close()
  }

  const confirmReset = () => {
    finance.startEmpty()
    toast('Todos los datos eliminados', { icon: 'trash' })
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

        {/* ── Cloud account (only when Supabase is configured) ── */}
        {auth.cloudAvailable && (
          <div className="mset-section">
            <span className="mset-section-title">Cuenta</span>
            {auth.user?.mode === 'cloud' ? (
              <div className="mset-card">
                <div className="mset-google-profile">
                  <div className="mset-google-avatar initials">{auth.user.name.slice(0, 1).toUpperCase()}</div>
                  <div className="mset-google-info">
                    <strong>{auth.user.name}</strong>
                    <small>{auth.user.email}</small>
                  </div>
                </div>
                <SettingsRow icon="logout" iconColor="#ff6b8a" label="Cerrar sesión" danger
                  onClick={async () => {
                    try {
                      await auth.logout()
                      toast('Sesión cerrada', { icon: 'check' })
                    } catch (error) {
                      toast(error instanceof Error ? error.message : 'No se pudo cerrar la sesión.', { icon: 'alert' })
                    }
                  }} />
              </div>
            ) : (
              <div className="mset-card">
                <div className="mset-google-signin-wrap">
                  <p className="mset-google-desc">Conecta una cuenta de Google para sincronizar tus datos en todos tus dispositivos.</p>
                  <GoogleButton busy={googleBusy} onClick={async () => {
                    setGoogleBusy(true)
                    try {
                      await auth.loginWithGoogle()
                    } catch (error) {
                      toast(error instanceof Error ? error.message : 'No se pudo conectar con Google.', { icon: 'alert' })
                    } finally {
                      setGoogleBusy(false)
                    }
                  }} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Profile ── */}
        <div className="mset-section">
          <span className="mset-section-title">Perfil</span>
          <div className="mset-card">
            <SettingsRow icon="user" iconColor="#5bc0ff" label="Nombre"
              value={settings.displayName || 'Sin definir'}
              onClick={() => open('name')} />
          </div>
        </div>

        {/* ── Finance ── */}
        <div className="mset-section">
          <span className="mset-section-title">Finanzas</span>
          <div className="mset-card">
            <SettingsRow icon="dollar" iconColor="#35d0a2" label={t('currency')}
              value={finance.currency}
              onClick={() => open('currency')} />
            <SettingsRow icon="alert" iconColor="#f59e0b" label="Sobregiro"
              value={OVERDRAFT_LABELS[settings.overdraftPolicy]}
              onClick={() => open('overdraft')} />
            <SettingsRow icon="tag" iconColor="#c084fc" label="Ajustes de categorías"
              onClick={() => open('categories')} />
          </div>
        </div>

        {/* ── Appearance ── */}
        <div className="mset-section">
          <span className="mset-section-title">Apariencia</span>
          <div className="mset-card">
            <SettingsRow icon="palette" iconColor="#a78bfa" label={t('theme')}
              value={THEME_LABELS[settings.theme]}
              onClick={() => open('theme')} />
            <SettingsRow icon="sliders" iconColor="#ff6b8a" label="Color de acento"
              onClick={() => open('accent')}
              right={
                <>
                  <span className="mset-color-dot" style={{ background: settings.accent }} />
                  <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', color: '#4a4a4a', flexShrink: 0 }} />
                </>
              }
            />
            <SettingsRow icon="grid" iconColor="#f59e0b" label="Densidad"
              value={DENSITY_LABELS[settings.density]}
              onClick={() => open('density')} />
            <SettingsRow icon="map" iconColor="#64d2ff" label={t('language')}
              value={settings.language === 'en' ? 'English' : 'Español'}
              onClick={() => open('language')} />
            <div className="mset-row">
              <span className="mset-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}>
                <Icon name="bell" size={18} />
              </span>
              <div className="mset-row-text">
                <b>Sonidos de interfaz</b>
                <small>Tonos al escribir, guardar y abrir</small>
              </div>
              <label className="mset-toggle-wrap">
                <input type="checkbox" className="mset-toggle-input"
                  checked={settings.soundsEnabled}
                  onChange={e => settings.setSoundsEnabled(e.target.checked)} />
                <span className="mset-toggle" />
              </label>
            </div>
            {settings.soundsEnabled && (
              <div className="mset-row mset-row-volume">
                <span className="mset-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}>
                  <Icon name="sliders" size={18} />
                </span>
                <div className="mset-row-text">
                  <b>Volumen de sonidos</b>
                  <input
                    className="mset-slider" type="range"
                    min={0} max={100} step={5}
                    value={Math.round(settings.soundVolume * 100)}
                    onChange={e => settings.setSoundVolume(Number(e.target.value) / 100)}
                    onInput={e => settings.setSoundVolume(Number((e.target as HTMLInputElement).value) / 100)}
                  />
                </div>
                <span className="mset-value">{Math.round(settings.soundVolume * 100)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Data ── */}
        <div className="mset-section">
          <span className="mset-section-title">Datos</span>
          <div className="mset-card">
            <div className="mset-stats">
              <div><strong>{health.transactions}</strong><small>Transacciones</small></div>
              <div><strong>{health.categories}</strong><small>Categorías</small></div>
              <div><strong>{health.goals}</strong><small>{t('goals')}</small></div>
            </div>
            {health.warnings.map(w => (
              <p className="mset-warning" key={w}><Icon name="alert" size={13} />{w}</p>
            ))}
          </div>
          <div className="mset-card">
            <SettingsRow icon="download" iconColor="#35d0a2" label="Exportar Datos"
              onClick={() => open('export')} />
            <SettingsRow icon="upload" iconColor="#5bc0ff" label="Restaurar backup"
              onClick={() => void importBackup()} />
          </div>
          <div className="mset-card">
            <SettingsRow icon="trash" iconColor="#ff6b8a" label="Eliminar todos los datos"
              danger onClick={() => open('reset')} />
          </div>
        </div>

        {/* ── Security ── */}
        <div className="mset-section">
          <div className="mset-section-label">Seguridad</div>
          <div className="mset-card">
            {isTauri() && (
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
                  <Icon name="lock" size={18} />
                </span>
                <div className="mset-row-text">
                  <b>Requerir biometría</b>
                  <small>{bioAvailable ? 'Bloquear app al abrir' : 'No disponible en este dispositivo'}</small>
                </div>
                <label className="mset-toggle-wrap">
                  <input type="checkbox" className="mset-toggle-input"
                    checked={settings.requireBiometric}
                    disabled={!bioAvailable}
                    onChange={e => settings.setRequireBiometric(e.target.checked)} />
                  <span className="mset-toggle" />
                </label>
              </div>
            )}
            <SettingsRow icon="key" iconColor="#ffdd3d" label="Contraseña de la app"
              value={settings.appPin ? 'Activada' : 'Desactivada'}
              onClick={() => { resetPinFlow(); setPinStep(settings.appPin ? 'idle' : 'enter'); open('pin') }} />
          </div>
        </div>

        {/* ── Acerca de / Legal ── */}
        <div className="mset-section">
          <span className="mset-section-title">Acerca de</span>
          <div className="mset-card">
            <SettingsRow icon="edit" iconColor="#5bc0ff" label="Comentarios"
              onClick={() => open('comments')} />
            <SettingsRow icon="info" iconColor="#35d0a2" label="Sobre nosotros"
              onClick={() => open('about')} />
          </div>
          <div className="mset-card">
            <SettingsRow icon="shield" iconColor="#a78bfa" label="Política de privacidad"
              onClick={() => open('privacy')} />
            <SettingsRow icon="book" iconColor="#f59e0b" label="Términos de uso"
              onClick={() => open('terms')} />
          </div>
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
        <SettingsSheet title="Nombre" onClose={close}>
          <div className="mset-sheet-body">
            <input
              className="mset-text-input" type="text"
              value={nameInput} placeholder="Ej. Juan Pérez"
              autoCapitalize="words" enterKeyHint="done"
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
            />
            <button className="mset-sheet-confirm" onClick={saveName}>{t('save')}</button>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'theme' && (
        <SettingsSheet title="Tema" onClose={close}>
          <div className="mset-sheet-options">
            {(['dark', 'light'] as ThemeName[]).map(theme => (
              <button key={theme} className={`mset-theme-opt${settings.theme === theme ? ' on' : ''}`}
                onClick={() => { settings.setTheme(theme); close() }}>
                <span className="mset-theme-preview" style={{ background: themePreviewBg[theme], color: themePreviewFg[theme] }}>
                  <span />
                </span>
                <strong>{THEME_LABELS[theme]}</strong>
                {settings.theme === theme && <Icon name="check" size={14} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto' }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'accent' && (
        <SettingsSheet title="Color de acento" onClose={close}>
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
        <SettingsSheet title="Densidad de interfaz" onClose={close}>
          <div className="mset-sheet-options">
            {(['compact', 'regular', 'comfy'] as DensityName[]).map(density => (
              <button key={density} className={`mset-option-row${settings.density === density ? ' on' : ''}`}
                onClick={() => { settings.setDensity(density); close() }}>
                <strong>{DENSITY_LABELS[density]}</strong>
                <small>{density === 'compact' ? 'Más contenido visible' : density === 'comfy' ? 'Más espacio entre elementos' : 'Balanceado'}</small>
                {settings.density === density && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'currency' && (
        <SettingsSheet title="Moneda predeterminada" onClose={close}>
          <div className="mset-sheet-options">
            {(['DOP','USD','EUR','MXN','GBP','COP','ARS','BRL','CAD'] as const).map(code => (
              <button key={code} className={`mset-option-row${finance.currency === code ? ' on' : ''}`}
                onClick={() => { finance.setCurrency(code); close() }}>
                <strong>{code}</strong>
                {finance.currency === code && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'overdraft' && (
        <SettingsSheet title="Política de sobregiro" onClose={close}>
          <div className="mset-sheet-options">
            {(['block', 'warn', 'allow'] as OverdraftPolicy[]).map(policy => (
              <button key={policy} className={`mset-option-row${settings.overdraftPolicy === policy ? ' on' : ''}`}
                onClick={() => { settings.setOverdraftPolicy(policy); close() }}>
                <strong>{OVERDRAFT_LABELS[policy]}</strong>
                <small>{policy === 'block' ? 'Bloquea gastos cuando el saldo es cero' : policy === 'warn' ? 'Advierte pero permite continuar' : 'Siempre permite, sin restricción'}</small>
                {settings.overdraftPolicy === policy && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'language' && (
        <SettingsSheet title="Idioma" onClose={close}>
          <div className="mset-sheet-options">
            {(['es', 'en'] as const).map(lang => (
              <button key={lang} className={`mset-option-row${settings.language === lang ? ' on' : ''}`}
                onClick={() => { settings.setLanguage(lang); close() }}>
                <strong>{lang === 'en' ? '🇺🇸 English' : '🇩🇴 Español'}</strong>
                <small>{lang === 'en' ? 'Interfaz en inglés' : 'Interfaz en español'}</small>
                {settings.language === lang && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto', flexShrink: 0 }} />}
              </button>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'reset' && (
        <SettingsSheet title="Eliminar datos" onClose={close}>
          <div className="mset-sheet-body">
            <p className="mset-reset-warning">
              Esto eliminará permanentemente <strong>todas tus transacciones, cuentas, categorías y metas</strong>. Esta acción no se puede deshacer.
            </p>
            {!pendingReset ? (
              <button className="mset-sheet-danger" onClick={() => setPendingReset(true)}>
                Continuar
              </button>
            ) : (
              <>
                <button className="mset-sheet-danger" onClick={confirmReset}>
                  <Icon name="trash" size={18} /> Sí, eliminar todo
                </button>
                <button className="mset-sheet-cancel" onClick={() => setPendingReset(false)}>
                  {t('cancel')}
                </button>
              </>
            )}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'comments' && (
        <SettingsSheet title="Comentarios" onClose={close}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">
              ¿Tienes una sugerencia, encontraste un error o quieres contarnos algo? Escríbelo abajo y lo enviamos directo a nuestro equipo.
            </p>
            <textarea
              className="mset-textarea" rows={6}
              value={commentText} placeholder="Escribe tu comentario aquí…"
              onChange={e => setCommentText(e.target.value)}
            />
            <button className="mset-sheet-confirm" disabled={!commentText.trim()} onClick={sendComment}>
              <Icon name="edit" size={16} style={{ marginRight: 8 }} /> Enviar comentario
            </button>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'about' && (
        <SettingsSheet title="Sobre nosotros" onClose={close}>
          <div className="mset-sheet-body mset-about">
            <BrandMark size={64} />
            <strong className="mset-about-name">$harky</strong>
            <span className="mset-about-version">Versión {APP_VERSION}</span>
            <p className="mset-about-dev">Desarrollador: <strong>David Bonilla</strong></p>
            <p className="mset-about-desc">
              $harky es tu compañero de finanzas personales: simple, privado por diseño y pensado para ayudarte a entender y mejorar tus hábitos financieros, sin complicaciones.
            </p>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'privacy' && (
        <SettingsSheet title="Privacy Policy" onClose={close}>
          <div className="mset-sheet-body mset-legal">
            <p className="mset-legal-updated">Last updated: June 7, 2026</p>
            {PRIVACY_SECTIONS.map(section => (
              <div key={section.title}>
                <h3>{section.title}</h3>
                {section.body.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'terms' && (
        <SettingsSheet title="Terms of Use" onClose={close}>
          <div className="mset-sheet-body mset-legal">
            <p className="mset-legal-updated">Last updated: June 7, 2026</p>
            {TERMS_SECTIONS.map(section => (
              <div key={section.title}>
                <h3>{section.title}</h3>
                {section.body.map((p, i) => <p key={i}>{p}</p>)}
              </div>
            ))}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'export' && (
        <SettingsSheet title="Exportar Datos" onClose={close}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">Elige el formato en el que quieres exportar tu información financiera.</p>
            <div className="mset-card" style={{ margin: 0 }}>
              <SettingsRow icon="fileJson" iconColor="#35d0a2" label="Backup (JSON)"
                onClick={() => void exportBackup()} />
              <SettingsRow icon="download" iconColor="#5bc0ff" label={exportingExcel ? 'Generando Excel…' : 'Reporte completo (Excel)'}
                onClick={() => { if (!exportingExcel) void handleExportExcel() }} />
              <SettingsRow icon="download" iconColor="#a78bfa" label={exportingPdf ? 'Generando PDF…' : `Estado de ${monthLabel(mkey)} (PDF)`}
                onClick={() => { if (!exportingPdf) void handleExportPdf() }} />
            </div>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'pin' && (
        <SettingsSheet title="Contraseña de la app" onClose={close}>
          <div className="mset-sheet-body">
            {pinStep === 'idle' && (
              <>
                <p className="mset-legal-intro">Tu app está protegida con un PIN de 4 dígitos. Puedes cambiarlo o quitarlo.</p>
                <button className="mset-sheet-confirm" onClick={() => { setPinStep('enter'); setPinValue(''); setPinDraft(''); setPinError('') }}>
                  Cambiar PIN
                </button>
                <button className="mset-sheet-danger" onClick={() => { setPinStep('remove'); setPinValue(''); setPinError('') }}>
                  <Icon name="trash" size={16} /> Quitar PIN
                </button>
              </>
            )}

            {pinStep !== 'idle' && (
              <>
                <p className="mset-legal-intro">
                  {pinStep === 'enter' && 'Crea un PIN de 4 dígitos para bloquear la app.'}
                  {pinStep === 'confirm' && 'Confirma tu nuevo PIN.'}
                  {pinStep === 'remove' && 'Ingresa tu PIN actual para quitarlo.'}
                </p>
                <p style={{ color: pinError ? '#ff6b8a' : 'var(--m-muted)', fontSize: 13, minHeight: 18, textAlign: 'center' }}>
                  {pinError || ' '}
                </p>
                <div className="mpin-dots" style={{ justifyContent: 'center', margin: '4px 0 18px' }}>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <span key={i} className={`mpin-dot${i < pinValue.length ? ' on' : ''}${pinError ? ' err' : ''}`} />
                  ))}
                </div>
                <div className="mpin-keypad">
                  {['1','2','3','4','5','6','7','8','9'].map(d => (
                    <button key={d} onClick={() => pressPinDigit(d)}>{d}</button>
                  ))}
                  <span />
                  <button onClick={() => pressPinDigit('0')}>0</button>
                  <button aria-label="Borrar" onClick={backspacePin}><Icon name="close" size={18} /></button>
                </div>
              </>
            )}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'categories' && (
        <SettingsSheet title="Ajustes de categorías" onClose={close}>
          <div className="mset-sheet-body">
            <CategoryGroup
              title="Gastos" type="expense"
              categories={finance.categories.filter(c => c.type === 'expense')}
              onAdd={() => setEditingCat('new-expense')}
              onEdit={c => setEditingCat(c)} />
            <CategoryGroup
              title="Ingresos" type="income"
              categories={finance.categories.filter(c => c.type === 'income')}
              onAdd={() => setEditingCat('new-income')}
              onEdit={c => setEditingCat(c)} />
          </div>
        </SettingsSheet>
      )}

      {editingCat !== null && (
        <CategoryEditor
          category={typeof editingCat === 'string' ? undefined : editingCat}
          type={editingCat === 'new-income' ? 'income' : editingCat === 'new-expense' ? 'expense' : editingCat.type}
          onClose={() => setEditingCat(null)}
          onSave={saveCategory}
          onDelete={typeof editingCat !== 'string' ? removeCategory : undefined}
        />
      )}
    </div>
  )
}

function CategoryGroup({ title, type, categories, onAdd, onEdit }: {
  title: string
  type: 'expense' | 'income'
  categories: Category[]
  onAdd: () => void
  onEdit: (c: Category) => void
}) {
  return (
    <div className="mset-cat-group">
      <div className="mset-cat-group-head">
        <span>{title}</span>
        <button onClick={onAdd}><Icon name="plus" size={14} /> Agregar</button>
      </div>
      {categories.length === 0 ? (
        <p className="mset-cat-empty">Sin categorías de {type === 'expense' ? 'gastos' : 'ingresos'} todavía.</p>
      ) : (
        <div className="mset-cat-list">
          {categories.map(cat => (
            <button key={cat.id} className="mset-cat-row" onClick={() => onEdit(cat)}>
              <span className="mset-cat-icon" style={{ color: cat.color, background: `color-mix(in oklab, ${cat.color} 16%, transparent)` }}>
                <Icon name={cat.icon} size={18} />
              </span>
              <span className="mset-cat-name">{cat.name}</span>
              <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)', color: '#4a4a4a', flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryEditor({ category, type, onClose, onSave, onDelete }: {
  category?: Category
  type: 'expense' | 'income'
  onClose: () => void
  onSave: (f: { name: string; type: 'expense' | 'income'; budget: number; color: string; icon: IconName }) => void
  onDelete?: (c: Category) => void
}) {
  const [name,       setName]       = useState(category?.name ?? '')
  const [budget,     setBudget]     = useState(String(category?.budget ?? ''))
  const [color,      setColor]      = useState(category?.color ?? CAT_COLORS[0])
  const [icon,       setIcon]       = useState<IconName>(category?.icon ?? (type === 'income' ? 'wallet' : 'cart'))
  const [confirmDel, setConfirmDel] = useState(false)

  useMobileBackDismiss(true, onClose)

  return (
    <div className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={category ? 'Editar categoría' : 'Nueva categoría'} onClick={onClose}>
      <section className="mbud-editor-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{category ? 'Editar categoría' : `Nueva categoría de ${type === 'expense' ? 'gasto' : 'ingreso'}`}</span>
          <button aria-label="Cerrar" onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mbud-editor-body">
          <label className="mbud-field">
            <span>Nombre</span>
            <input className="mbud-input" type="text" value={name}
              placeholder="ej. Comida, Salario" autoCapitalize="words"
              onChange={e => setName(e.target.value)} />
          </label>

          {type === 'expense' && (
            <label className="mbud-field">
              <span>Límite mensual (0 = sin límite)</span>
              <input className="mbud-input" type="number" inputMode="decimal"
                value={budget} placeholder="0" onChange={e => setBudget(e.target.value)} />
            </label>
          )}

          <div className="mbud-field">
            <span>Color</span>
            <div className="mbud-color-strip">
              {CAT_COLORS.map(c => (
                <button key={c} className={`mbud-color-dot${color === c ? ' on' : ''}`}
                  aria-label={`Color ${c}`} aria-pressed={color === c}
                  style={{ background: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>

          <div className="mbud-field">
            <span>Ícono</span>
            <div className="mbud-icon-grid-sheet">
              {CAT_ICONS.map(ic => (
                <button key={ic} className={`mbud-icon-btn-sheet${icon === ic ? ' on' : ''}`}
                  aria-label={`Ícono ${ic}`} aria-pressed={icon === ic}
                  style={icon === ic ? { color, background: `color-mix(in oklab, ${color} 18%, transparent)` } : {}}
                  onClick={() => setIcon(ic)}>
                  <Icon name={ic} size={20} />
                </button>
              ))}
            </div>
          </div>

          {category && onDelete && (
            !confirmDel ? (
              <button className="mbud-del-btn" onClick={() => setConfirmDel(true)}>
                <Icon name="trash" size={16} /> Eliminar categoría
              </button>
            ) : (
              <div className="mbud-confirm-del">
                <p>¿Eliminar "{category.name}"? Esta acción no se puede deshacer.</p>
                <div>
                  <button onClick={() => setConfirmDel(false)}>Cancelar</button>
                  <button className="danger" onClick={() => onDelete(category)}>
                    <Icon name="trash" size={16} /> Eliminar
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        <div className="mbud-editor-actions">
          <button className="mbud-btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="mbud-btn-save" style={{ background: color }}
            onClick={() => onSave({ name, type, budget: Number(budget) || 0, color, icon })}>
            {category ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </section>
    </div>
  )
}
