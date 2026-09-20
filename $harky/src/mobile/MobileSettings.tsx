import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { isTauri } from '@/hooks/useTauri'
import { AvatarCropper } from '@/components/AvatarCropper'
import { canPickImageNative, pickImageNative } from '@/lib/nativeFiles'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useT, type LangKey } from '@/i18n'
import type { IconName } from '@/types'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { SettingsRow, SettingsSheet, type Sheet } from './settings/shared'
import { SettingsAppearance } from './settings/SettingsAppearance'
import { SettingsCategories } from './settings/SettingsCategories'
import { SettingsData } from './settings/SettingsData'
import { SettingsSecurity } from './settings/SettingsSecurity'
import { SettingsBankNotifications } from './settings/SettingsBankNotifications'
import { SettingsLegal } from './settings/SettingsLegal'
import { SettingsSyncConflicts } from './settings/SettingsSyncConflicts'

// ── Estructura tipo "hub" (Opción A) ────────────────────────────────────────
// La pantalla principal es corta: buscador + perfil + una fila por categoría.
// Cada categoría abre su propia sub-pantalla enfocada, en vez de mostrarlo todo
// a la vez (que saturaba). Cada sub-pantalla monta solo el/los componente(s) de
// esa categoría; sus sheets se renderizan por portal desde ahí.
type Category = 'finance' | 'appearance' | 'categories' | 'data' | 'security' | 'bank' | 'about'

interface CategoryMeta {
  id: Category
  icon: IconName
  color: string
  labelKey: LangKey
  descKey: LangKey
  tauriOnly?: boolean
}
const CATEGORIES: CategoryMeta[] = [
  { id: 'finance',    icon: 'dollar',   color: '#35d0a2', labelKey: 'financeSection',            descKey: 'financeCatDesc' },
  { id: 'appearance', icon: 'palette',  color: '#a78bfa', labelKey: 'appearanceSoundCat',        descKey: 'appearanceCatDesc' },
  { id: 'categories', icon: 'tag',      color: '#c084fc', labelKey: 'categoriesRulesCat',        descKey: 'categoriesCatDesc' },
  { id: 'data',       icon: 'fileJson', color: '#5bc0ff', labelKey: 'dataBackupSection',         descKey: 'dataCatDesc' },
  { id: 'security',   icon: 'lock',     color: '#ffdd3d', labelKey: 'securitySection',           descKey: 'securityCatDesc' },
  { id: 'bank',       icon: 'bell',     color: '#5b9bff', labelKey: 'notificationsSection',      descKey: 'notificationsCatDesc', tauriOnly: true },
  { id: 'about',      icon: 'info',     color: '#35d0a2', labelKey: 'aboutSection',              descKey: 'aboutCatDesc' },
]

// A qué categoría pertenece cada sheet — para que la búsqueda (y un `initialSheet`
// de atajo) sepan a qué sub-pantalla saltar antes de abrir el sheet.
const SHEET_CATEGORY: Partial<Record<Sheet, Category>> = {
  currency: 'finance', overdraft: 'finance', fxAlert: 'finance', anomalyAlert: 'finance',
  theme: 'appearance', accent: 'appearance', density: 'appearance', language: 'appearance', soundProfile: 'appearance',
  categories: 'categories', categoryRules: 'categories',
  export: 'data', backupSchedule: 'data', reset: 'data', backupPassword: 'data', restorePassword: 'data',
  pin: 'security',
  bankNotifications: 'bank',
  comments: 'about', about: 'about', privacy: 'about', terms: 'about',
}

interface SearchEntry {
  sheet: Sheet
  icon: IconName
  color: string
  labelKey: LangKey
  crumbKey: LangKey
  keywords: string
  tauriOnly?: boolean
}
const SEARCH_INDEX: SearchEntry[] = [
  { sheet: 'currency',     icon: 'dollar',   color: '#35d0a2', labelKey: 'currency',              crumbKey: 'financeSection',     keywords: 'moneda currency divisa dop usd eur peso dolar' },
  { sheet: 'overdraft',    icon: 'alert',    color: '#f59e0b', labelKey: 'overdraft',             crumbKey: 'financeSection',     keywords: 'sobregiro overdraft saldo negativo limite' },
  { sheet: 'fxAlert',      icon: 'trend',    color: '#5bc0ff', labelKey: 'fxAlertLabel',          crumbKey: 'financeSection',     keywords: 'tasa cambio exchange rate alerta divisa' },
  { sheet: 'anomalyAlert', icon: 'alert',    color: '#ff6b8a', labelKey: 'anomalyAlertLabel',     crumbKey: 'financeSection',     keywords: 'gasto inusual anomaly alerta anomalia deteccion' },
  { sheet: 'theme',        icon: 'palette',  color: '#a78bfa', labelKey: 'theme',                 crumbKey: 'appearanceSection',  keywords: 'tema theme oscuro claro dark light amoled apariencia' },
  { sheet: 'accent',       icon: 'palette',  color: '#5bc0ff', labelKey: 'accentColor',           crumbKey: 'appearanceSection',  keywords: 'acento color accent' },
  { sheet: 'density',      icon: 'sliders',  color: '#35d0a2', labelKey: 'density',               crumbKey: 'appearanceSection',  keywords: 'densidad density compacto espaciado tamano' },
  { sheet: 'language',     icon: 'user',     color: '#ffdd3d', labelKey: 'language',              crumbKey: 'appearanceSection',  keywords: 'idioma language english espanol lenguaje' },
  { sheet: 'soundProfile', icon: 'bell',     color: '#ff6b8a', labelKey: 'soundProfile',          crumbKey: 'soundHapticsSection', keywords: 'sonido sound haptico vibracion volumen audio' },
  { sheet: 'categories',   icon: 'tag',      color: '#a78bfa', labelKey: 'categorySettings',      crumbKey: 'categorySettings',   keywords: 'categoria category presupuesto icono color' },
  { sheet: 'categoryRules', icon: 'sliders', color: '#5bc0ff', labelKey: 'categoryRulesLabel',    crumbKey: 'categorySettings',   keywords: 'regla rule aprendida categorizacion automatica' },
  { sheet: 'export',       icon: 'download', color: '#35d0a2', labelKey: 'exportData',            crumbKey: 'dataSection',        keywords: 'exportar export backup respaldo json excel pdf descargar' },
  { sheet: 'backupSchedule', icon: 'fileJson', color: '#a78bfa', labelKey: 'weeklyBackupLastLabel', crumbKey: 'dataSection',      keywords: 'backup semanal respaldo automatico carpeta weekly', tauriOnly: true },
  { sheet: 'reset',        icon: 'trash',    color: '#ff6b8a', labelKey: 'deleteAllData',         crumbKey: 'dataSection',        keywords: 'borrar delete eliminar reiniciar datos todo' },
  { sheet: 'pin',          icon: 'key',      color: '#ffdd3d', labelKey: 'appLock',               crumbKey: 'securitySection',    keywords: 'bloqueo lock pin patron biometria huella seguridad' },
  { sheet: 'bankNotifications', icon: 'bell', color: '#5bc0ff', labelKey: 'transactionDetection', crumbKey: 'notificationsSection', keywords: 'notificacion banco deteccion transaccion automatica recordatorio segundo plano agregar rapido', tauriOnly: true },
  { sheet: 'comments',     icon: 'edit',     color: '#a78bfa', labelKey: 'comments',              crumbKey: 'aboutSection',       keywords: 'comentario feedback sugerencia opinion' },
  { sheet: 'about',        icon: 'info',     color: '#5bc0ff', labelKey: 'aboutUs',               crumbKey: 'aboutSection',       keywords: 'acerca nosotros about version' },
  { sheet: 'privacy',      icon: 'lock',     color: '#35d0a2', labelKey: 'privacyPolicy',         crumbKey: 'aboutSection',       keywords: 'privacidad privacy datos politica' },
  { sheet: 'terms',        icon: 'fileJson', color: '#7a8296', labelKey: 'termsOfUse',            crumbKey: 'aboutSection',       keywords: 'terminos terms condiciones uso legal' },
]

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export function MobileSettings({
  mkey,
  onClose,
  initialSheet,
}: {
  mkey: string
  onClose: () => void
  initialSheet?: Sheet | null
}) {
  const settings = useSettings()
  const { currency } = useFinance()
  const t = useT()
  // Un `initialSheet` (ej. abrir directo en "PIN" desde el atajo) se consume una
  // vez, en el montaje: se sitúa la sub-pantalla de su categoría y se abre.
  const [section, setSection] = useState<Category | null>(() =>
    initialSheet ? (SHEET_CATEGORY[initialSheet] ?? null) : null)
  const [activeSheet, setActiveSheet] = useState<Sheet | null>(initialSheet ?? null)
  const [nameInput, setNameInput] = useState(settings.displayName)
  const [query, setQuery] = useState('')

  const searching = query.trim().length > 0

  // UN SOLO back-dismiss que decide según el estado actual (leído por ref, así
  // que siempre está fresco). Tener varias instancias que se activan/desactivan
  // al cambiar de sección provocaba una carrera con el modelo de historial del
  // hook: la que se desactivaba hacía history.back() y la que se activaba lo
  // capturaba, revirtiendo la navegación. Una sola instancia no alterna → sin
  // carrera. Orden: cerrar sheet → volver al hub → salir de Configuración.
  useMobileBackDismiss(true, () => {
    if (activeSheet) { setActiveSheet(null); return }
    if (section) { setSection(null); return }
    onClose()
  })

  const open = (sheet: Sheet) => {
    setActiveSheet(sheet)
    if (sheet === 'name') setNameInput(settings.displayName)
  }
  const close = () => setActiveSheet(null)
  const openFromSearch = (sheet: Sheet) => {
    const cat = SHEET_CATEGORY[sheet]
    if (cat) setSection(cat)
    setActiveSheet(sheet)
    setQuery('')
  }

  const saveName = () => {
    settings.setDisplayName(nameInput.trim())
    toast(t('nameSaved'), { icon: 'check', type: 'ok' })
    close()
  }

  // La foto se cambia tocando el avatar directamente (para de propagar así no
  // dispara también el `open('name')` del botón que lo envuelve) — antes no
  // había NINGUNA forma de tocarla aquí, solo existía dentro de Perfil.
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [cropSource, setCropSource] = useState<File | string | null>(null)

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

  const results = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return []
    const terms = q.split(/\s+/)
    return SEARCH_INDEX.filter(e => {
      if (e.tauriOnly && !isTauri()) return false
      const hay = normalize(`${t(e.labelKey)} ${e.keywords}`)
      return terms.every(term => hay.includes(term))
    })
  }, [query, t])

  const visibleCategories = CATEGORIES.filter(c => !c.tauriOnly || isTauri())
  const profileName = settings.displayName || t('myAccountLabel')
  const themeModeLabel = settings.theme === 'amoled' ? 'AMOLED'
    : settings.theme === 'dark' ? 'Dark'
    : settings.theme === 'light' ? 'Light' : 'Auto'
  const languageLabel = settings.language === 'en' ? 'English' : 'Espanol'

  const headerTitle = section
    ? t(CATEGORIES.find(c => c.id === section)!.labelKey)
    : t('settings')

  const sheetProps = { activeSheet, onOpen: open, onClose: close } as const

  return (
    <div className="mobile-settings-screen" role="dialog" aria-modal="true">
      <header className="mset-header">
        <button className="mset-back" aria-label={t('back')} onClick={() => section ? setSection(null) : onClose()}>
          <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <strong>{headerTitle}</strong>
        <span />
      </header>

      <div className="mset-body" key={section ?? 'hub'}>
        {section === null ? (
          <>
            <div className="mset-search">
              <Icon name="search" size={17} className="mset-search-icon" />
              <input
                type="text"
                value={query}
                placeholder={t('settingsSearchPlaceholder')}
                autoCapitalize="none"
                autoCorrect="off"
                enterKeyHint="search"
                aria-label={t('settingsSearchPlaceholder')}
                onChange={e => setQuery(e.target.value)}
              />
              {searching && (
                <button className="mset-search-clear" aria-label={t('close')} onClick={() => setQuery('')}>
                  <Icon name="close" size={15} />
                </button>
              )}
            </div>

            {searching ? (
              <div className="mset-section mset-search-results">
                {results.length === 0 ? (
                  <p className="mset-search-empty">{t('settingsNoResults').replace('{q}', query.trim())}</p>
                ) : (
                  <div className="mset-card">
                    {results.map(e => (
                      <SettingsRow key={e.sheet} icon={e.icon} iconColor={e.color}
                        label={t(e.labelKey)} sublabel={t(e.crumbKey)}
                        onClick={() => openFromSearch(e.sheet)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <>
                <button className="mset-summary" onClick={() => open('name')} aria-label={t('editNameLabel')}>
                  <span
                    className="mset-summary-avatar"
                    role="button"
                    tabIndex={0}
                    aria-label={settings.profilePhoto ? t('changePhotoLabel') : t('addPhotoLabel')}
                    onClick={e => { e.stopPropagation(); void openPhotoPicker() }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); void openPhotoPicker() } }}
                  >
                    {settings.profilePhoto
                      ? <img src={settings.profilePhoto} alt="" className="mset-summary-avatar-img" />
                      : (settings.displayName || '$').slice(0, 1).toUpperCase()}
                  </span>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handlePhotoChange}
                  />
                  <div className="mset-summary-body">
                    <strong>{profileName}</strong>
                    <span>{t('settingsQuickDesc')}</span>
                    <div className="mset-summary-pills">
                      <span className="mset-summary-pill">{`${t('theme')} - ${themeModeLabel}`}</span>
                      <span className="mset-summary-pill">{`${t('currency')} - ${currency}`}</span>
                      <span className="mset-summary-pill">{languageLabel}</span>
                    </div>
                  </div>
                  <Icon name="edit" size={15} className="mset-summary-edit" />
                </button>

                <div className="mset-card">
                  {visibleCategories.map(cat => (
                    <SettingsRow key={cat.id} icon={cat.icon} iconColor={cat.color}
                      label={t(cat.labelKey)} sublabel={t(cat.descKey)}
                      onClick={() => setSection(cat.id)} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          // ── Sub-pantalla de la categoría ──
          <>
            {section === 'finance' && <SettingsAppearance {...sheetProps} only="finance" />}
            {section === 'appearance' && <SettingsAppearance {...sheetProps} only="appearance" />}
            {section === 'categories' && <SettingsCategories {...sheetProps} />}
            {section === 'data' && (
              <>
                <SettingsData mkey={mkey} {...sheetProps} grouped />
                <SettingsSyncConflicts {...sheetProps} />
              </>
            )}
            {section === 'security' && <SettingsSecurity {...sheetProps} grouped />}
            {section === 'bank' && <SettingsBankNotifications {...sheetProps} grouped />}
            {section === 'about' && <SettingsLegal {...sheetProps} />}
          </>
        )}
      </div>

      {activeSheet === 'name' && (
        <SettingsSheet title={t('name')} onClose={close}>
          <div className="mset-sheet-body">
            <input
              className="mset-text-input"
              type="text"
              value={nameInput}
              placeholder={t('egName')}
              autoCapitalize="words"
              enterKeyHint="done"
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
            />
            <button className="mset-sheet-confirm" onClick={saveName}>{t('save')}</button>
          </div>
        </SettingsSheet>
      )}

      {cropSource && (
        <AvatarCropper
          file={cropSource}
          onCancel={() => setCropSource(null)}
          onDone={dataUrl => {
            settings.setProfilePhoto(dataUrl)
            setCropSource(null)
            toast(t('photoUpdatedToast'), { icon: 'check', type: 'ok' })
          }}
        />
      )}
    </div>
  )
}
