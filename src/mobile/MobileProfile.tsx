import { useRef, useState, type ChangeEvent } from 'react'
import { APP_VERSION } from '@/data/release'
import { MobileDataHealth } from './MobileDataHealth'
import { MobileWhatsNew } from './MobileWhatsNew'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { accountBalanceInBase, accountCurrency, availableBalanceInBase, visibleAccounts } from '@/data/helpers'
import { useFmt } from '@/hooks/useFmt'
import { useT } from '@/i18n'
import { AvatarCropper } from '@/components/AvatarCropper'
import { canPickImageNative, pickImageNative } from '@/lib/nativeFiles'
import { useFinance } from '@/store/finance'
import { useDev } from '@/store/dev'
import { useSettings } from '@/store/settings'
import type { Account, IconName, ViewId } from '@/types'

export function MobileProfile({
  userName,
  goto,
}: {
  userName?: string
  goto: (view: ViewId) => void
}) {
  const { displayName, setDisplayName, profilePhoto, setProfilePhoto } = useSettings()
  const isVip = useDev(d => d.vip)
  const { accounts, currency } = useFinance()
  const fmtVal = useFmt()
  const t = useT()
  const photoInputRef = useRef<HTMLInputElement>(null)

  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState(displayName || userName || '')
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false)
  const [healthOpen, setHealthOpen] = useState(false)
  // El auto-mostrado tras actualizar vive en App (`useWhatsNew`): aqui el
  // Perfil solo ofrece el acceso manual al historial.
  const [newsOpen, setNewsOpen] = useState(false)
  const [cropSource, setCropSource] = useState<File | string | null>(null)

  const effectiveName = displayName || userName || ''
  const initial = effectiveName ? effectiveName.slice(0, 1).toUpperCase() : '$'

  const handlePhotoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) setCropSource(file)
  }

  // En Android se usa el selector nativo (menú de galerías); si no está
  // disponible o falla, cae en silencio al <input type="file"> de siempre —
  // avisar del fallo Y abrir otro selector a continuación solo confunde,
  // porque el usuario igual acaba eligiendo su foto.
  const openPhotoPicker = async () => {
    if (canPickImageNative()) {
      try {
        const dataUrl = await pickImageNative({ chooserTitle: t('choosePhotoWith'), browseLabel: t('browseFilesLabel') })
        if (dataUrl) setCropSource(dataUrl)
        return
      } catch {
        // sin selector nativo — sigue al input de abajo
      }
    }
    photoInputRef.current?.click()
  }

  const handleAvatarClick = () => {
    if (profilePhoto) {
      setPhotoMenuOpen(v => !v)
    } else {
      void openPhotoPicker()
    }
  }

  const saveName = () => {
    const trimmed = nameInput.trim()
    setDisplayName(trimmed)
    setEditingName(false)
    if (trimmed) toast(t('nameUpdatedTo').replace('{name}', trimmed), { icon: 'check', type: 'ok' })
  }

  const activeAccounts = visibleAccounts(accounts)
  // "Balance total" = dinero disponible (sin crédito); la deuda de tarjetas se
  // muestra aparte en `debtBalance` más abajo.
  const totalBalance = availableBalanceInBase(accounts, currency)
  const bankingAccounts = activeAccounts.filter(account => account.type === 'debit' || account.type === 'savings')
  const creditAccounts = activeAccounts.filter(account => account.type === 'credit')
  const debtBalance = Math.abs(creditAccounts.reduce((sum, account) => sum + Math.min(0, accountBalanceInBase(account, currency)), 0))
  const topAccounts = [...activeAccounts].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 3)

  return (
    <div className="mpr-root">
      <div className="mpr-hero">
        <div className="mpr-hero-glow" aria-hidden="true" />
        <div className="mpr-avatar-wrap">
          <button
            className="mpr-avatar mpr-avatar-btn"
            onClick={handleAvatarClick}
            aria-label={profilePhoto ? t('changePhotoLabel') : t('addPhotoLabel')}
          >
            {profilePhoto ? <img src={profilePhoto} alt="" className="mpr-avatar-img" /> : initial}
          </button>
          {photoMenuOpen && (
            <>
              <button
                className="mpr-photo-menu-backdrop"
                aria-label={t('close')}
                onClick={() => setPhotoMenuOpen(false)}
              />
              <div className="mpr-photo-menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => { setPhotoMenuOpen(false); void openPhotoPicker() }}
                >
                  <Icon name="camera" size={14} /> {t('changePhotoLabel')}
                </button>
                <button
                  role="menuitem"
                  className="mpr-photo-menu-danger"
                  onClick={() => {
                    setPhotoMenuOpen(false)
                    setProfilePhoto(null)
                    toast(t('photoRemovedToast'), { icon: 'trash' })
                  }}
                >
                  <Icon name="trash" size={14} /> {t('removePhotoLabel')}
                </button>
              </div>
            </>
          )}
        </div>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handlePhotoChange}
        />
        {cropSource && (
          <AvatarCropper
            file={cropSource}
            onCancel={() => setCropSource(null)}
            onDone={dataUrl => {
              setProfilePhoto(dataUrl)
              setCropSource(null)
              toast(t('photoUpdatedToast'), { icon: 'check', type: 'ok' })
            }}
          />
        )}

        {editingName ? (
          <div className="mpr-name-editor">
            <input
              type="text"
              value={nameInput}
              placeholder={t('yourNamePlaceholder')}
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
            />
            <div className="mpr-name-actions">
              <button onClick={() => setEditingName(false)}>{t('cancel')}</button>
              <button className="primary" onClick={saveName}>{t('save')}</button>
            </div>
          </div>
        ) : (
          <div className="mpr-hero-identity">
            <h2>{effectiveName || t('myAccountLabel')}</h2>
            {/* La insignia va junto al NOMBRE, no en una fila aparte: lo que
                compra quien paga es que se note quien es. */}
            {isVip && (
              <span className="mpr-vip-badge">
                <Icon name="star" size={10} /> {t('vipBadgeLabel')}
              </span>
            )}
            <button
              className="mpr-edit-name-btn"
              onClick={() => {
                setNameInput(effectiveName)
                setEditingName(true)
              }}
              aria-label={effectiveName ? t('editNameLabel') : t('addNameLabel')}
            >
              <Icon name="edit" size={12} />
            </button>
          </div>
        )}
        <div className="mpr-hero-balance">
          <small>{t('totalBalance')}</small>
          <strong>{fmtVal(totalBalance, currency)}</strong>
        </div>

        <div className="mpr-stats-grid">
          <div className="mpr-stat-card">
            <small>{t('accounts')}</small>
            <strong>{activeAccounts.length}</strong>
          </div>
          <div className="mpr-stat-card">
            <small>{t('bankAccountsGroupLabel')}</small>
            <strong>{bankingAccounts.length}</strong>
          </div>
          <div className="mpr-stat-card">
            <small>{t('creditCardsGroupLabel')}</small>
            <strong>{creditAccounts.length}</strong>
          </div>
        </div>
      </div>

      {/* Deudas y Flujo de caja vivian aqui como tarjetas; desde la 2.5 estan
          en el menu ☰ (grupo «Compromisos»), con el mismo dato en vivo. */}

      {/* Confianza y novedades: dos cosas que el usuario busca en el Perfil,
          no en Ajustes. "Salud de datos" estaba enterrada en Ajustes > Datos y
          "Novedades" no existia aunque el historial de versiones si. */}
      <div className="mpr-card mpr-trust">
        <button className="mpr-trust-row" onClick={() => setHealthOpen(true)}>
          <span className="mpr-trust-icon health"><Icon name="shield" size={18} /></span>
          <div className="mpr-trust-info">
            <b>{t('dataHealthTitle')}</b>
            <small>{t('dataHealthRowHint')}</small>
          </div>
          <Icon name="arrowUp" size={13} className="mpr-inline-link-chevron" />
        </button>
        <button className="mpr-trust-row" onClick={() => setNewsOpen(true)}>
          <span className="mpr-trust-icon news"><Icon name="star" size={18} /></span>
          <div className="mpr-trust-info">
            <b>{t('whatsNewTitle')}</b>
            <small>{t('whatsNewRowHint').replace('{v}', APP_VERSION)}</small>
          </div>
          <Icon name="arrowUp" size={13} className="mpr-inline-link-chevron" />
        </button>
      </div>

      {healthOpen && <MobileDataHealth onClose={() => setHealthOpen(false)} />}
      {newsOpen && <MobileWhatsNew onClose={() => setNewsOpen(false)} />}

      <div className="mpr-card">
        <div className="mpr-card-header">
          <span>{t('accounts')}</span>
          <button className="mpr-inline-link" onClick={() => goto('accounts')}>
            {t('accounts')}
            <Icon name="arrowUp" size={13} className="mpr-inline-link-chevron" />
          </button>
        </div>

        {topAccounts.length ? (
          <>
            <div className="mpr-account-list">
              {topAccounts.map(account => (
                <button key={account.id} className="mpr-account-row" onClick={() => goto('accounts')}>
                  <span className="mpr-account-icon" style={{ background: `${account.color}22`, color: account.color }}>
                    <Icon name={accountIcon(account)} size={18} />
                  </span>
                  <div className="mpr-account-info">
                    <b>{account.short || account.name}</b>
                    <small>{accountMeta(account, t)}</small>
                  </div>
                  <strong>{fmtVal(account.balance, accountCurrency(account, currency))}</strong>
                </button>
              ))}
            </div>
            <div className="mpr-account-summary">
              <div>
                <small>{t('bankAccountsGroupLabel')}</small>
                <strong>{fmtVal(bankingAccounts.reduce((sum, account) => sum + accountBalanceInBase(account, currency), 0), currency)}</strong>
              </div>
              <div>
                <small>{t('debtsLabel')}</small>
                <strong>{fmtVal(debtBalance, currency)}</strong>
              </div>
            </div>
          </>
        ) : (
          <div className="mpr-empty">
            <p>{t('noAccountsShort')}</p>
            <button onClick={() => goto('accounts')}>{t('createAccount')}</button>
          </div>
        )}
      </div>

      {/* H5 · Perfil es tu cuenta y nada más: «Explorar» (Calendario) se fue
          al menú ☰, a Utilidades, junto a lo que salió de aquí en la 2.5. */}
    </div>
  )
}

function accountIcon(account: Account): IconName {
  if (account.type === 'savings') return 'piggy'
  if (account.type === 'cash') return 'wallet'
  return 'cards'
}

function accountMeta(account: Account, t: ReturnType<typeof useT>) {
  const typeLabel = account.type === 'cash'
    ? t('cash')
    : account.type === 'debit'
      ? t('debit')
      : account.type === 'savings'
        ? t('savings')
        : t('credit')

  return account.last4 ? `${typeLabel} - ****${account.last4}` : typeLabel
}
