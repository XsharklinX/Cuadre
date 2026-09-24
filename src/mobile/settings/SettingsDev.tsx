import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { detectionHealth } from '@/data/detectionHealth'
import { APP_NAME, APP_VERSION } from '@/data/release'
import { classifyBankNotification } from '@/lib/bankNotificationParser'
import { isTauri } from '@/hooks/useTauri'
import { useBankNotificationsDebug } from '@/store/bankNotificationsDebug'
import { useBankSuggestions } from '@/store/bankSuggestions'
import { useDev } from '@/store/dev'
import { useDismissals } from '@/store/dismissals'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { DevBackup, DevClock, DevLedger, DevNotifications, DevQueue, DevRating, DevUpdate } from './DevTools'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

/**
 * MODO DESARROLLADOR — no forma parte de la app.
 *
 * Existe porque casi todo lo que hay que probar aquí ocurre UNA sola vez por
 * instalación: el onboarding sale al instalar, las Novedades salen al
 * actualizar, la valoración sale cuando le toca. Probar cualquiera de esas
 * cosas significaba desinstalar y reinstalar, y así no se prueban: se dejan
 * sin probar.
 *
 * Todo lo de aquí toca datos REALES. Nada pide confirmación bonita: quien
 * llegó hasta aquí hizo seis toques a propósito.
 */
export function SettingsDev({ activeSheet, onOpen, onClose }: SheetProps) {
  const t = useT()
  const lock = useDev(d => d.lock)
  const vip = useDev(d => d.vip)
  const setVip = useDev(d => d.setVip)

  // No hay setter publico para "no visto" — es una bandera de un solo sentido
  // por diseño. Aqui se escribe directo en el store, que es exactamente el
  // tipo de cosa para la que existe este panel.
  const restoreAll = useDismissals(d => d.restoreAll)

  const debug = useBankNotificationsDebug()
  const bankEnabled = useBankSuggestions(s => s.enabled)
  const enabledSince = useBankSuggestions(s => s.enabledSince)

  const [sample, setSample] = useState('')
  const [verdict, setVerdict] = useState<string | null>(null)

  /**
   * El onboarding se dispara al montar la app, no aquí: marcar la bandera y
   * quedarse en Ajustes no enseña nada. Se recarga para que arranque desde
   * cero, que es exactamente lo que se quiere ver.
   */
  const replayOnboarding = () => {
    useSettings.setState({ hasSeenOnboarding: false })
    location.reload()
  }

  const showWhatsNew = () => {
    // Las Novedades comparan la versión vista con la actual; borrando la
    // marca, el próximo arranque cree que acabas de actualizar.
    try { localStorage.removeItem('sharky-seen-version-v1') } catch { /* sin storage, nada que borrar */ }
    location.reload()
  }

  const health = detectionHealth({
    enabled: bankEnabled,
    granted: true, connected: true,   // el estado real lo pide la pantalla de Detección
    lastCapturedAt: debug.lastCapturedAt,
    enabledSince,
    now: Date.now(),
  })

  const classify = () => {
    const result = classifyBankNotification('com.test.bank', 'Banco', sample)
    setVerdict(result.ok
      ? `OK · ${result.tx.type} · ${result.tx.amount} ${result.tx.currency ?? ''} ${result.tx.cardLast4 ?? ''}`.trim()
      : `descartado · ${result.reason}`)
  }

  const fmtWhen = (ms: number) =>
    ms > 0 ? new Date(ms).toLocaleString() : t('devNeverCaptured')

  return (
    <>
      <div className="mset-card mset-dev-card">
        <SettingsRow
          icon="sliders" iconColor="#ff9f0a"
          label={t('devSection')} sublabel={t('devSectionDesc')}
          onClick={() => onOpen('dev')}
        />
      </div>

      {activeSheet === 'dev' && (
        <SettingsSheet title={t('devSection')} onClose={onClose}>
          {/*
            MODO CONSOLA.
            El panel se ve distinto al resto de la app a propósito. No es
            decoración: son herramientas que borran datos, viajan en el tiempo
            y sabotean saldos, y tienen que SENTIRSE como otro sitio. Cuando un
            entorno peligroso se ve igual que la pantalla de ajustes normal, se
            toca con la misma confianza que un interruptor de tema.
          */}
          <div className="mset-sheet-body mset-dev-mode">
            <div className="mset-dev-banner">
              <span className="mset-dev-prompt">cuadre@dev</span>
              <span className="mset-dev-blink" aria-hidden="true">█</span>
            </div>
            <p className="mset-dev-warn">
              <Icon name="alert" size={14} /> {t('devDangerNote')}
            </p>

            {/* ── Pantallas que solo salen una vez ── */}
            <div className="mset-card">
              <SettingsRow icon="play" iconColor="#5bc0ff"
                label={t('devReplayOnboarding')} sublabel={t('devReplayOnboardingDesc')}
                onClick={replayOnboarding} />
              <SettingsRow icon="info" iconColor="#a78bfa"
                label={t('devShowWhatsNew')} sublabel={t('devShowWhatsNewDesc')}
                onClick={showWhatsNew} />
              <SettingsRow icon="heart" iconColor="#ff6b8a"
                label={t('devResetDismissals')} sublabel={t('devResetDismissalsDesc')}
                onClick={() => { restoreAll(); toast(t('devResetDismissals'), { icon: 'check', type: 'ok' }) }} />
            </div>

            <DevClock />

            {/* ── Detección: lo que de verdad costó meses diagnosticar ── */}
            <p className="mset-group-label">{t('devDetectionStatus')}</p>
            <div className="mset-card mset-dev-facts">
              <div><span>estado</span><b>{health.state}</b></div>
              <div><span>{t('devLastCapture')}</span><b>{fmtWhen(debug.lastCapturedAt)}</b></div>
              <div><span>{t('devLastCheck')}</span><b>{fmtWhen(debug.lastDrainAt)}</b></div>
              <div><span>{t('devCapturedTotal')}</span><b>{debug.totalCaptured}</b></div>
              <div><span>revisiones</span><b>{debug.drainCount}</b></div>
              <div><span>ultima cola</span><b>{debug.lastPendingCount}</b></div>
            </div>

            {/* ── Probar el clasificador sin esperar a que llegue un aviso ── */}
            <p className="mset-group-label">{t('devSimulateBank')}</p>
            <div className="mset-card mset-dev-sim">
              <small>{t('devSimulateBankDesc')}</small>
              <textarea
                value={sample}
                rows={3}
                onChange={e => { setSample(e.target.value); setVerdict(null) }}
                placeholder="Consumo RD$ 1,250.00 en SUPERMERCADO con tarjeta ****7109"
              />
              <button className="mset-dev-run" disabled={!sample.trim()} onClick={classify}>
                {t('devSimulateRun')}
              </button>
              {verdict && (
                <p className="mset-dev-verdict">
                  <span>{t('devSimulateVerdict')}</span> <b>{verdict}</b>
                </p>
              )}
            </div>

            <DevQueue />
            <DevNotifications />
            <DevUpdate />
            <DevBackup />
            <DevLedger />

            <DevRating />

            {/* ── VIP simulado ── */}
            <p className="mset-group-label">VIP</p>
            <div className="mset-card">
              <div className="mpr-toggle-row">
                <div className="mpr-toggle-row-text">
                  <span className="mpr-toggle-row-label">{t('devVipToggle')}</span>
                  <small className="mpr-toggle-row-desc">{t('devVipToggleDesc')}</small>
                </div>
                <label className="mset-toggle-wrap">
                  <input type="checkbox" className="mset-toggle-input"
                    checked={vip} onChange={e => setVip(e.target.checked)} />
                  <span className="mset-toggle" />
                </label>
              </div>
              <SettingsRow icon="star" iconColor="#ffd166"
                label="Abrir pantalla VIP" onClick={() => onOpen('vip')} />
            </div>

            {/* ── Entorno ── */}
            <p className="mset-group-label">{t('devEnvTitle')}</p>
            <div className="mset-card mset-dev-facts">
              <div><span>app</span><b>{APP_NAME} {APP_VERSION}</b></div>
              <div><span>tauri</span><b>{String(isTauri())}</b></div>
              <div><span>idioma</span><b>{navigator.language}</b></div>
              <div><span>pantalla</span><b>{window.innerWidth}×{window.innerHeight}</b></div>
            </div>

            <button className="mpr-del-btn" onClick={() => { lock(); onClose(); toast(t('devLockedToast'), { icon: 'check' }) }}>
              <Icon name="close" size={15} /> {t('devLockAction')}
            </button>
          </div>
        </SettingsSheet>
      )}
    </>
  )
}
