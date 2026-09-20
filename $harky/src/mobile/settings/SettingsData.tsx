import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { createBackup, parseBackup } from '@/data/backup'
import { wipeCloudData } from '@/data/cloudSync'
import { getDataHealthStatus } from '@/data/dataHealth'
import { exportExcel, exportMonthlyPdf } from '@/data/professionalExport'
import { dateLocale, monthLabel } from '@/data/helpers'
import { decryptWithPassphrase, encryptWithPassphrase, looksEncrypted } from '@/lib/backupCrypto'
import { getScheduledBackupStatus, pickBackupFolder as pickSafBackupFolder, runBackupNow, type ScheduledBackupStatus } from '@/lib/scheduledBackup'
import { useFinance } from '@/store/finance'
import { useNotes } from '@/store/notes'
import { useAuth } from '@/store/auth'
import { clearCloudWorkspaceCache } from '@/hooks/useCloudWorkspace'
import { isTauri, openBackup, pickBackupFolder, saveBackup } from '@/hooks/useTauri'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

export function SettingsData({ mkey, activeSheet, onOpen, onClose, grouped }: SheetProps & { mkey: string; grouped?: boolean }) {
  const finance = useFinance()
  const auth    = useAuth()
  const t       = useT()
  const health  = getDataHealthStatus(finance, auth.user?.id)
  const lang    = useSettings(s => s.language)
  const lastWeeklyBackupAt = useSettings(s => s.lastWeeklyBackupAt)
  const lastManualBackupAt = useSettings(s => s.lastManualBackupAt)
  const setLastManualBackupAt = useSettings(s => s.setLastManualBackupAt)
  const weeklyAutoBackupEnabled = useSettings(s => s.weeklyAutoBackupEnabled)
  const weeklyAutoBackupDay = useSettings(s => s.weeklyAutoBackupDay)
  const weeklyAutoBackupHour = useSettings(s => s.weeklyAutoBackupHour)
  const setWeeklyAutoBackupEnabled = useSettings(s => s.setWeeklyAutoBackupEnabled)
  const setWeeklyAutoBackupDay = useSettings(s => s.setWeeklyAutoBackupDay)
  const setWeeklyAutoBackupHour = useSettings(s => s.setWeeklyAutoBackupHour)
  const weeklyBackupFolder = useSettings(s => s.weeklyBackupFolder)
  const setWeeklyBackupFolder = useSettings(s => s.setWeeklyBackupFolder)
  const isAndroid = /android/i.test(navigator.userAgent)
  const [pickingFolder, setPickingFolder] = useState(false)
  // Estado real del backup nativo de Android (carpeta SAF, última ejecución).
  const [backupStatus, setBackupStatus] = useState<ScheduledBackupStatus | null>(null)
  const [testingBackup, setTestingBackup] = useState(false)

  useEffect(() => {
    if (activeSheet !== 'backupSchedule') return
    let cancelled = false
    void getScheduledBackupStatus().then(s => { if (!cancelled) setBackupStatus(s) })
    return () => { cancelled = true }
  }, [activeSheet])

  const handleTestBackup = async () => {
    setTestingBackup(true)
    try {
      const result = await runBackupNow()
      toast(
        result.ok ? t('backupTestOk') : t('backupTestFailed').replace('{error}', result.error ?? '?'),
        { icon: result.ok ? 'check' : 'alert', type: result.ok ? 'ok' : 'error' },
      )
      setBackupStatus(await getScheduledBackupStatus())
    } finally {
      setTestingBackup(false)
    }
  }

  const [exportingPdf,    setExportingPdf]    = useState(false)
  const [exportingExcel,  setExportingExcel]  = useState(false)
  const [pendingReset,    setPendingReset]    = useState(false)
  const [resetting,       setResetting]       = useState(false)
  const [encryptExport,   setEncryptExport]   = useState(false)
  const [exportPassword,  setExportPassword]  = useState('')
  const [exporting,       setExporting]       = useState(false)
  const [restorePendingText, setRestorePendingText] = useState<string | null>(null)
  const [restorePassword, setRestorePassword] = useState('')
  const [restoring,       setRestoring]       = useState(false)

  const weekdayLabels = [
    t('daySunday'),
    t('dayMonday'),
    t('dayTuesday'),
    t('dayWednesday'),
    t('dayThursday'),
    t('dayFriday'),
    t('daySaturday'),
  ]

  const backupScheduleLabel = weeklyAutoBackupEnabled
    ? `${weekdayLabels[weeklyAutoBackupDay]} - ${String(weeklyAutoBackupHour).padStart(2, '0')}:00`
    : t('backupAutoDisabled')

  // Salud de la copia: la más reciente entre la manual y la semanal. Se colorea
  // por antigüedad para que «¿estoy a salvo?» se responda de un vistazo, que es
  // justo lo que faltaba — antes la fecha estaba enterrada en una fila y solo
  // para el backup semanal.
  const backupDates = [lastManualBackupAt, lastWeeklyBackupAt]
    .filter((v): v is string => !!v)
    .sort()
  const lastBackupAt = backupDates.length ? backupDates[backupDates.length - 1] : null
  const backupHealth = (() => {
    if (!lastBackupAt) return { level: 'never' as const, days: Infinity }
    const days = Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000)
    const level = days <= 7 ? 'fresh' as const : days <= 30 ? 'stale' as const : 'old' as const
    return { level, days }
  })()
  const backupHealthText = (() => {
    if (backupHealth.level === 'never') return t('backupNever')
    if (backupHealth.days <= 0) return t('backupToday')
    if (backupHealth.days === 1) return t('backupYesterday')
    return t('backupDaysAgo').replace('{n}', String(backupHealth.days))
  })()
  const backupHealthColor = backupHealth.level === 'fresh' ? '#35d0a2'
    : backupHealth.level === 'stale' ? '#f59e0b' : '#ff6b8a'

  // Limpiar reset cuando el sheet se cierra
  useEffect(() => { if (activeSheet !== 'reset') setPendingReset(false) }, [activeSheet])
  useEffect(() => {
    if (activeSheet !== 'backupPassword') { setEncryptExport(false); setExportPassword('') }
    if (activeSheet !== 'restorePassword') { setRestorePendingText(null); setRestorePassword('') }
  }, [activeSheet])

  const exportBackup = async (passphrase?: string) => {
    setExporting(true)
    try {
      const json = JSON.stringify(createBackup(finance), null, 2)
      const payload = passphrase ? await encryptWithPassphrase(json, passphrase) : json
      const saved = await saveBackup(payload, weeklyBackupFolder)
      // Solo se marca como respaldado si de verdad se guardó (en web el usuario
      // pudo cancelar el selector de archivo) — si no, la tarjeta de estado
      // mentiría diciendo que hay copia reciente cuando no la hay.
      if (saved) setLastManualBackupAt(new Date().toISOString())
      if (saved && isTauri()) toast(t('backupSavedToFolder'), { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      toast(error instanceof Error ? error.message : t('exportError'), { icon: 'alert' })
    } finally {
      setExporting(false)
    }
  }

  // Verifica que los datos actuales se pueden respaldar Y volver a leer sin
  // errores: crea la copia en memoria, la serializa y la vuelve a parsear con
  // el MISMO validador que usa restaurar. Comprobar que los conteos calzan
  // descarta una copia truncada. No toca nada — es una prueba en seco de que,
  // si algún día tienes que restaurar, la copia servirá.
  const verifyBackupIntegrity = () => {
    try {
      const json = JSON.stringify(createBackup(finance))
      const parsed = parseBackup(json)
      const intact = parsed.transactions.length === finance.transactions.length
        && parsed.accounts.length === finance.accounts.length
        && parsed.goals.length === finance.goals.length
      if (!intact) throw new Error(t('verifyBackupMismatch'))
      toast(t('verifyBackupOk'), { icon: 'check', type: 'ok' })
    } catch (error) {
      toast(error instanceof Error ? error.message : t('verifyBackupFailed'), { icon: 'alert' })
    }
  }

  const importBackup = async () => {
    try {
      const text = await openBackup()
      if (!text) return
      if (looksEncrypted(text)) {
        setRestorePendingText(text)
        onOpen('restorePassword')
        return
      }
      const data = parseBackup(text)
      finance.restoreBackup(data)
      useNotes.getState().importNotes(data.notes ?? [])
      toast(t('backupRestored'), { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : t('invalidFile'), { icon: 'alert' })
    }
  }

  const confirmEncryptedRestore = async () => {
    if (!restorePendingText) return
    setRestoring(true)
    try {
      const decrypted = await decryptWithPassphrase(restorePendingText, restorePassword)
      const data = parseBackup(decrypted)
      finance.restoreBackup(data)
      useNotes.getState().importNotes(data.notes ?? [])
      toast(t('backupRestored'), { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      toast(error instanceof Error ? error.message : t('invalidFile'), { icon: 'alert' })
    } finally {
      setRestoring(false)
    }
  }

  const handleChooseFolder = async () => {
    setPickingFolder(true)
    try {
      if (isAndroid) {
        // Selector real de Android (SAF): el permiso queda persistido para que
        // el worker de fondo pueda escribir ahí aunque la app esté cerrada.
        const result = await pickSafBackupFolder()
        if (!result.cancelled) setBackupStatus(await getScheduledBackupStatus())
        return
      }
      const path = await pickBackupFolder()
      if (path) setWeeklyBackupFolder(path)
    } finally {
      setPickingFolder(false)
    }
  }

  const handleExportPdf = async () => {
    setExportingPdf(true)
    try {
      await exportMonthlyPdf(finance, mkey, '')
      toast(t('pdfExportedFor').replace('{month}', monthLabel(mkey)), { icon: 'download', type: 'ok' })
    } catch {
      toast(t('pdfExportError'), { icon: 'alert' })
    } finally {
      setExportingPdf(false)
    }
  }

  const handleExportExcel = async () => {
    setExportingExcel(true)
    try {
      await exportExcel(finance)
      toast(t('excelExported'), { icon: 'download', type: 'ok' })
    } catch {
      toast(t('excelExportError'), { icon: 'alert' })
    } finally {
      setExportingExcel(false)
    }
  }

  const confirmReset = async () => {
    const user = auth.user
    if (user?.mode === 'cloud' && user.id) {
      setResetting(true)
      try {
        await wipeCloudData(user.id)
        clearCloudWorkspaceCache(user.id)
      } catch (error) {
        toast(error instanceof Error ? error.message : t('couldNotDeleteCloudData'), { icon: 'alert' })
        setResetting(false)
        return
      }
      setResetting(false)
    }
    finance.startEmpty()
    useNotes.getState().importNotes([])
    toast(t('allDataDeleted'), { icon: 'trash' })
    onClose()
  }

  const cards = (
    <>
      <button
        className="mset-backup-health"
        style={{ borderColor: `color-mix(in oklab, ${backupHealthColor} 45%, transparent)` }}
        onClick={() => onOpen('export')}
      >
        <span className="mset-backup-health-dot" style={{ background: backupHealthColor }} />
        <span className="mset-backup-health-text">
          <strong>{t('backupHealthTitle')}</strong>
          <small>{backupHealthText}{backupHealth.level === 'never' ? '' : ` · ${t('backupTapToUpdate')}`}</small>
        </span>
        <Icon name={backupHealth.level === 'fresh' ? 'check' : 'download'} size={18} style={{ color: backupHealthColor }} />
      </button>
      <div className="mset-card">
        <div className="mset-stats">
          <div><strong>{health.transactions}</strong><small>{t('transactionsLabel')}</small></div>
          <div><strong>{health.categories}</strong><small>{t('categoriesTitle')}</small></div>
          <div><strong>{health.goals}</strong><small>{t('goals')}</small></div>
        </div>
        {health.warnings.map(w => (
          <p className="mset-warning" key={w}><Icon name="alert" size={13} />{w}</p>
        ))}
      </div>
      <div className="mset-card">
        <SettingsRow icon="refresh" iconColor="#f59e0b" label={t('recalcBalancesLabel')}
          sublabel={t('recalcBalancesSub')}
          value={(health.driftedAccounts + health.driftedGoals) > 0 ? String(health.driftedAccounts + health.driftedGoals) : undefined}
          onClick={() => {
            const fixed = finance.recomputeBalances()
            toast(fixed > 0 ? t('balancesFixed').replace('{n}', String(fixed)) : t('balancesOk'),
              { icon: 'check', type: 'ok' })
          }} />
        <SettingsRow icon="download" iconColor="#35d0a2" label={t('exportData')}
          sublabel={t('exportDataSub')}
          onClick={() => onOpen('export')} />
        <SettingsRow icon="upload" iconColor="#5bc0ff" label={t('restoreBackup')}
          onClick={() => void importBackup()} />
        {isTauri() && (
          <SettingsRow icon="fileJson" iconColor="#a78bfa" label={t('weeklyBackupLastLabel')}
            sublabel={backupScheduleLabel}
            onClick={() => onOpen('backupSchedule')}
            right={(
              <span className="mset-value">
                {lastWeeklyBackupAt
                  ? new Date(lastWeeklyBackupAt).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' })
                  : t('weeklyBackupNever')}
              </span>
            )} />
        )}
      </div>
      <div className="mset-card">
        <SettingsRow icon="trash" iconColor="#ff6b8a" label={t('deleteAllData')}
          danger onClick={() => onOpen('reset')} />
      </div>
    </>
  )

  return (
    <>
      {grouped ? cards : (
        <div className="mset-section">
          <span className="mset-section-title">{t('dataSection')}</span>
          {cards}
        </div>
      )}

      {/* ── Sheets ── */}
      {activeSheet === 'export' && (
        <SettingsSheet title={t('exportData')} onClose={onClose}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">{t('exportDataIntro')}</p>
            <div className="mset-card" style={{ margin: 0 }}>
              <SettingsRow icon="fileJson" iconColor="#35d0a2" label={t('backupJson')}
                onClick={() => onOpen('backupPassword')} />
              <SettingsRow icon="download" iconColor="#5bc0ff"
                label={exportingExcel ? t('generatingExcel') : t('fullReportExcel')}
                onClick={() => { if (!exportingExcel) void handleExportExcel() }} />
              <SettingsRow icon="download" iconColor="#a78bfa"
                label={exportingPdf ? t('generatingPdf') : t('statementOfMonth').replace('{month}', monthLabel(mkey))}
                onClick={() => { if (!exportingPdf) void handleExportPdf() }} />
            </div>
            <div className="mset-card" style={{ margin: 0 }}>
              <SettingsRow icon="shield" iconColor="#35d0a2" label={t('verifyBackupLabel')}
                sublabel={t('verifyBackupSub')}
                onClick={verifyBackupIntegrity} />
            </div>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'backupPassword' && (
        <SettingsSheet title={t('backupPasswordTitle')} onClose={onClose}>
          <div className="mset-sheet-body">
            <div className="mset-card" style={{ margin: 0 }}>
              <div className="mpr-form-section mpr-toggle-row" style={{ padding: '14px 16px' }}>
                <div className="mpr-toggle-row-text">
                  <span className="mpr-toggle-row-label">{t('backupPasswordEnableLabel')}</span>
                  <small className="mpr-toggle-row-desc">{t('backupPasswordEnableDesc')}</small>
                </div>
                <label className="mset-toggle-wrap">
                  <input
                    type="checkbox"
                    className="mset-toggle-input"
                    checked={encryptExport}
                    onChange={e => setEncryptExport(e.target.checked)}
                  />
                  <span className="mset-toggle" />
                </label>
              </div>
            </div>

            {encryptExport && (
              <div className="mset-card" style={{ margin: 0 }}>
                <div className="mset-field-stack">
                  <input
                    type="password"
                    className="mset-text-input"
                    placeholder={t('backupPasswordPlaceholder')}
                    value={exportPassword}
                    onChange={e => setExportPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <small className="mset-field-label" style={{ textTransform: 'none', fontWeight: 700, letterSpacing: 0 }}>
                    {t('backupPasswordHint')}
                  </small>
                </div>
              </div>
            )}

            <button
              className="mset-sheet-primary"
              disabled={exporting || (encryptExport && exportPassword.trim().length < 10)}
              onClick={() => void exportBackup(encryptExport ? exportPassword : undefined)}
            >
              <Icon name="fileJson" size={18} />
              {encryptExport ? t('exportEncryptedLabel') : t('exportPlainLabel')}
            </button>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'restorePassword' && (
        <SettingsSheet title={t('restorePasswordTitle')} onClose={onClose}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">{t('restorePasswordDesc')}</p>
            <div className="mset-card" style={{ margin: 0 }}>
              <div className="mset-field-stack">
                <input
                  type="password"
                  className="mset-text-input"
                  placeholder={t('restorePasswordPlaceholder')}
                  value={restorePassword}
                  onChange={e => setRestorePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
            </div>
            <button
              className="mset-sheet-primary"
              disabled={restoring || !restorePassword}
              onClick={() => void confirmEncryptedRestore()}
            >
              <Icon name="upload" size={18} /> {restoring ? t('restoringEllipsis') : t('unlockAndRestoreLabel')}
            </button>
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'backupSchedule' && (
        <SettingsSheet title={t('weeklyBackupConfigTitle')} onClose={onClose}>
          <div className="mset-sheet-body">
            <div className="mset-card" style={{ margin: 0 }}>
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
                  <Icon name="fileJson" size={18} />
                </span>
                <div className="mset-row-text">
                  <b>{t('weeklyBackupAutoLabel')}</b>
                  <small>{t('weeklyBackupAutoDesc')}</small>
                </div>
                <label className="mset-toggle-wrap">
                  <input
                    type="checkbox"
                    className="mset-toggle-input"
                    checked={weeklyAutoBackupEnabled}
                    onChange={event => setWeeklyAutoBackupEnabled(event.target.checked)}
                  />
                  <span className="mset-toggle" />
                </label>
              </div>
            </div>

            <div className="mset-card" style={{ margin: 0 }}>
              <div className="mset-field-stack">
                <span className="mset-field-label">{t('dayLabel')}</span>
                <div className="mset-chip-grid">
                  {weekdayLabels.map((label, index) => (
                    <button
                      key={label}
                      className={`mset-chip${weeklyAutoBackupDay === index ? ' on' : ''}`}
                      disabled={!weeklyAutoBackupEnabled}
                      onClick={() => setWeeklyAutoBackupDay(index)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mset-field-stack">
                <span className="mset-field-label">{t('timeLabel')}</span>
                <div className="mset-hour-grid">
                  {[0, 3, 6, 9, 12, 15, 18, 21].map(hour => (
                    <button
                      key={hour}
                      className={`mset-chip${weeklyAutoBackupHour === hour ? ' on' : ''}`}
                      disabled={!weeklyAutoBackupEnabled}
                      onClick={() => setWeeklyAutoBackupHour(hour)}
                    >
                      {String(hour).padStart(2, '0')}:00
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mset-card" style={{ margin: 0 }}>
              <div className="mset-field-stack">
                <span className="mset-field-label">{t('backupDestinationTitle')}</span>
                {isAndroid ? (
                  <div className="mset-row" style={{ padding: '10px 0' }}>
                    <div className="mset-row-text">
                      <small>{backupStatus?.folderLabel ?? t('backupNoFolderChosen')}</small>
                    </div>
                    <button className="mset-sheet-cancel" style={{ margin: 0, width: 'auto' }} disabled={pickingFolder} onClick={() => void handleChooseFolder()}>
                      {t('chooseFolderLabel')}
                    </button>
                  </div>
                ) : (
                  <div className="mset-row" style={{ padding: '10px 0' }}>
                    <div className="mset-row-text">
                      <small>{weeklyBackupFolder ?? t('backupDestinationAppFolder')}</small>
                    </div>
                    <button className="mset-sheet-cancel" style={{ margin: 0, width: 'auto' }} disabled={pickingFolder} onClick={() => void handleChooseFolder()}>
                      {t('chooseFolderLabel')}
                    </button>
                  </div>
                )}
                {!isAndroid && weeklyBackupFolder && (
                  <button className="mset-sheet-cancel" onClick={() => setWeeklyBackupFolder(null)}>
                    {t('restoreDefaultFolderLabel')}
                  </button>
                )}
              </div>
            </div>

            {/* Estado real del backup automático de Android: sin esto no había
                forma de saber si de verdad se está ejecutando. */}
            {isAndroid && backupStatus && (
              <div className="mset-card" style={{ margin: 0 }}>
                <div className="mset-widget-diag">
                  <p>
                    <Icon name={backupStatus.folderWritable ? 'check' : 'alert'} size={13} />
                    {backupStatus.hasFolder
                      ? (backupStatus.folderWritable ? t('backupFolderOk') : t('backupFolderLostAccess'))
                      : t('backupNoFolderChosen')}
                  </p>
                  <p>
                    <Icon name={backupStatus.lastSuccessAt ? 'check' : 'alert'} size={13} />
                    {backupStatus.lastSuccessAt
                      ? t('backupLastSuccess').replace('{when}', backupStatus.lastSuccessAt.toLocaleString(dateLocale(lang)))
                      : t('backupNeverRan')}
                  </p>
                  {backupStatus.lastError && (
                    <p>
                      <Icon name="alert" size={13} />
                      {t('backupLastError').replace('{error}', backupStatus.lastError)}
                    </p>
                  )}
                  <button
                    className="mset-widget-refresh"
                    disabled={testingBackup || !backupStatus.hasFolder}
                    onClick={() => void handleTestBackup()}
                  >
                    <Icon name="refresh" size={14} /> {testingBackup ? t('backupTesting') : t('backupTestNow')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </SettingsSheet>
      )}

      {activeSheet === 'reset' && (
        <SettingsSheet title={t('deleteDataTitle')} onClose={onClose}>
          <div className="mset-sheet-body">
            <p className="mset-reset-warning">
              {t('deleteDataWarningPrefix')}<strong>{t('deleteDataWarningBoldText')}</strong>
              {auth.user?.mode === 'cloud' ? <>{t('deleteDataWarningCloudSuffix')}<strong>{t('deleteDataWarningCloudBoldText')}</strong></> : null}
              {t('deleteDataWarningSuffix')}
            </p>
            {!pendingReset ? (
              <button className="mset-sheet-danger" onClick={() => setPendingReset(true)}>
                {t('continueBtn')}
              </button>
            ) : (
              <>
                <button className="mset-sheet-danger" disabled={resetting} onClick={() => void confirmReset()}>
                  <Icon name="trash" size={18} /> {resetting ? t('deletingEllipsis') : t('yesDeleteAll')}
                </button>
                <button className="mset-sheet-cancel" disabled={resetting} onClick={() => setPendingReset(false)}>
                  {t('cancel')}
                </button>
              </>
            )}
          </div>
        </SettingsSheet>
      )}
    </>
  )
}
