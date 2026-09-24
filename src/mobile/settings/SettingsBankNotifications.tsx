import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { fmt, dateLocale } from '@/data/helpers'
import { isTauri } from '@/hooks/useTauri'
import { getNotificationAccessStatus, openNotificationAccessSettings } from '@/lib/bankNotifications'
import { useBankSuggestions } from '@/store/bankSuggestions'
import { useBankNotificationsDebug, type DebugVerdict } from '@/store/bankNotificationsDebug'
import { useDismissals } from '@/store/dismissals'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useT } from '@/i18n'
import { isBatteryExempt } from '@/lib/localReminders'
import { MobileBatteryGuide } from '../MobileBatteryGuide'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'
import { ACCT_ICONS, useBankSuggestionActions } from './bankSuggestionActions'
import { REMINDER_KINDS, isReminderKindOn, type ReminderKind } from '@/data/reminderKinds'
import type { IconName } from '@/types'

const isAndroidTauri = isTauri() && /android/i.test(navigator.userAgent)

/** "hace 3 min" / "hace 2 h" / "hace 1 d" a partir de un timestamp. */
function relativeTime(ms: number, t: ReturnType<typeof useT>): string {
  if (!ms) return '—'
  const diff = Date.now() - ms
  const min = Math.floor(diff / 60_000)
  if (min < 1) return t('justNow')
  if (min < 60) return t('minutesAgo').replace('{n}', String(min))
  const hours = Math.floor(min / 60)
  if (hours < 24) return t('hoursAgo').replace('{n}', String(hours))
  return t('daysAgo').replace('{n}', String(Math.floor(hours / 24)))
}

const VERDICT_LABEL_KEY: Record<DebugVerdict, string> = {
  'added': 'verdictAdded',
  'auto-added': 'verdictAutoAdded',
  'duplicate': 'verdictDuplicate',
  'no-amount': 'verdictNoAmount',
  'otp': 'verdictOtp',
  'promotional': 'verdictPromotional',
  'telecom': 'verdictTelecom',
  'not-financial': 'verdictNotFinancial',
  'no-tx-signal': 'verdictNoTxSignal',
}

/** Cada tipo de aviso con su cara: sin ellas, siete filas de texto identico. */
const KIND_ICON: Record<ReminderKind, IconName> = {
  budget: 'wallet', recurring: 'repeat', lowfunds: 'alert',
  goal: 'target', weekly: 'chart', fx: 'coins', anomaly: 'trend',
}
const KIND_TINT: Record<ReminderKind, string> = {
  budget: '#a78bfa', recurring: '#5bc0ff', lowfunds: '#ff6b8a',
  goal: '#35d0a2', weekly: '#ffdd3d', fx: '#f59e0b', anomaly: '#ff9f0a',
}

export function SettingsBankNotifications({ activeSheet, onOpen, onClose, grouped }: SheetProps & { grouped?: boolean }) {
  const suggestions = useBankSuggestions()
  const { currency } = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const settings = useSettings()
  const t = useT()
  const debug = useBankNotificationsDebug()
  const [showDiag, setShowDiag] = useState(false)
  const [batteryGuide, setBatteryGuide] = useState(false)
  const [batteryExempt, setBatteryExempt] = useState<boolean | null>(null)
  const [granted, setGranted] = useState<boolean | null>(null)
  // "Vinculado" se rastrea aparte de "concedido": tras actualizar el APK Android
  // desvincula el listener y deja de detectar, aunque el permiso siga concedido.
  const [connected, setConnected] = useState<boolean | null>(null)
  const { handleAdd, openPicker, openCategoryPicker, categoryFor, resolveFor, pickerNode } = useBankSuggestionActions()
  const dismissals = useDismissals()
  const hiddenTotal = dismissals.dismissed.length
    + dismissals.hiddenInsights.length
    + dismissals.hiddenInsightTypes.length
    + settings.silencedRecurring.length
  const restoreAll = dismissals.restoreAll

  useEffect(() => {
    let cancelled = false
    const check = () => { void isBatteryExempt().then(v => { if (!cancelled) setBatteryExempt(v) }) }
    check()
    // Al volver de los ajustes del sistema, el estado pudo cambiar.
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let cancelled = false
    // Consultar el estado también PIDE el re-vínculo si hiciera falta, así que
    // abrir esta pantalla repara la detección tras una reinstalación.
    getNotificationAccessStatus().then(status => {
      if (cancelled) return
      setGranted(status.granted)
      setConnected(status.connected)

      /*
       * CONCEDER EL PERMISO ENCIENDE LA DETECCION.
       *
       * Habia DOS interruptores independientes: el permiso especial de Android
       * y este de la app. La tarjeta de estado solo miraba el primero, asi que
       * el usuario concedia el permiso —que es la parte dificil, en una
       * pantalla del sistema, buscando la app en una lista— veia "Servicio
       * activo" en verde, y la deteccion seguia apagada. No detectaba nada y
       * la app le decia que todo estaba bien.
       *
       * Conceder ese permiso es un acto deliberado que solo sirve para esto:
       * ya es el consentimiento. Pedir un segundo si despues de lo dificil es
       * una trampa.
       *
       * Solo la primera vez (`enabledSince === 0`): si alguien lo apago a
       * proposito y dejo el permiso puesto, su decision se respeta.
       */
      if (status.granted && status.connected && !suggestions.enabled && !suggestions.enabledSince) {
        suggestions.setEnabled(true)
        toast(t('detectionAutoEnabled'), { icon: 'check', type: 'ok' })
      }
    })
    return () => { cancelled = true }
    // Se re-evalua al abrir la pantalla, no cuando cambian `suggestions` o `t`:
    // incluirlos re-consultaria a Android en cada pulsacion de un interruptor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSheet])

  const handleOpenSettings = async () => {
    await openNotificationAccessSettings()
  }

  const handleDiscardAll = () => {
    suggestions.clear()
    toast(t('capturesCleared'), { icon: 'trash' })
  }

  if (!isTauri()) return null

  // Un "concedido" a secas era engañoso: el permiso puede estar dado y el
  // servicio desvinculado (no detecta nada). Se muestran los dos estados.
  const accessLabel = granted == null
    ? t('checking')
    : !granted
      ? t('accessNotGranted')
      : connected
        ? t('accessGranted')
        : t('accessGrantedNotBound')

  /*
   * La tarjeta mira la CADENA ENTERA, no solo el permiso.
   *
   * Antes decia "Servicio activo" en verde con la deteccion apagada: el
   * permiso estaba dado y el servicio vinculado, pero la app no drenaba nada.
   * Un estado verde que no significa "funciona" es peor que uno rojo — manda
   * al usuario a buscar el problema donde no esta.
   */
  const health = granted == null
    ? 'checking'
    : !granted ? 'bad'
    : !connected ? 'warn'
    : !suggestions.enabled ? 'off'
    : 'ok'
  const healthTitle = health === 'ok'
    ? t('detectionServiceActive')
    : health === 'off'
      ? t('detectionServiceOff')
      : health === 'warn'
        ? t('detectionServiceIdle')
        : health === 'bad'
          ? t('detectionServiceNoAccess')
          : t('checking')

  const card = (
    <div className="mset-card">
      {isAndroidTauri && (
        <div className="mset-row">
          <span className="mset-row-icon" style={{ background: '#ff6b8a22', color: '#ff6b8a' }}>
            <Icon name="bell" size={18} />
          </span>
          <div className="mset-row-text">
            <b>{t('backgroundReminders')}</b>
            <small>{t('backgroundRemindersDesc')}</small>
          </div>
          <label className="mset-toggle-wrap">
            <input
              type="checkbox"
              className="mset-toggle-input"
              checked={settings.remindersEnabled}
              onChange={e => settings.setRemindersEnabled(e.target.checked)}
            />
            <span className="mset-toggle" />
          </label>
        </div>
      )}
      {/*
        QUE avisos quieres, uno por uno.

        El interruptor de arriba era todo o nada: a quien le molestaba el
        resumen semanal solo le quedaba apagarlo TODO, y con el se iban los
        siete utiles — incluido el aviso de que se esta pasando del
        presupuesto. Un interruptor unico para siete cosas distintas se acaba
        apagando por la mas molesta.

        Solo aparece con los recordatorios encendidos: elegir cuales quieres
        entre unos que no van a llegar no significa nada.
      */}
      {isAndroidTauri && settings.remindersEnabled && (
        <div className="mset-kinds">
          <span className="mset-kinds-title">{t('reminderKindsTitle')}</span>
          {REMINDER_KINDS.map(kind => (
            <label key={kind} className="mset-kind-row">
              <span className="mset-kind-ico" style={{ background: `${KIND_TINT[kind]}22`, color: KIND_TINT[kind] }}>
                <Icon name={KIND_ICON[kind]} size={15} />
              </span>
              <span className="mset-kind-text">
                <b>{t(`reminderKind_${kind}` as Parameters<typeof t>[0])}</b>
                <small>{t(`reminderKindDesc_${kind}` as Parameters<typeof t>[0])}</small>
              </span>
              <input
                type="checkbox"
                className="mset-toggle-input"
                checked={isReminderKindOn(settings.reminderKinds, kind)}
                onChange={e => settings.setReminderKind(kind, e.target.checked)}
              />
              <span className="mset-toggle" />
            </label>
          ))}
        </div>
      )}

      {isAndroidTauri && (
        <div className="mset-row">
          <span className="mset-row-icon" style={{ background: '#5b9bff22', color: '#5b9bff' }}>
            <Icon name="plus" size={18} />
          </span>
          <div className="mset-row-text">
            <b>{t('quickAddNotifLabel')}</b>
            <small>{t('quickAddNotifDesc')}</small>
          </div>
          <label className="mset-toggle-wrap">
            <input
              type="checkbox"
              className="mset-toggle-input"
              checked={settings.quickAddNotification}
              onChange={e => settings.setQuickAddNotification(e.target.checked)}
            />
            <span className="mset-toggle" />
          </label>
        </div>
      )}
      {/* Ocultar avisos y tarjetas es permanente por diseño, así que tiene que
          existir la vuelta atrás en algún sitio visible — si no, un toque mal
          dado deja al usuario sin esa sugerencia para siempre. */}
      <SettingsRow
        icon="bell"
        iconColor="#a78bfa"
        label={t('hiddenSuggestionsTitle')}
        sublabel={hiddenTotal > 0 ? t('hiddenSuggestionsDesc') : t('hiddenSuggestionsEmpty')}
        value={hiddenTotal > 0 ? String(hiddenTotal) : undefined}
        onClick={() => {
          if (hiddenTotal === 0) return
          restoreAll()
          settings.silencedRecurring.forEach(id => settings.unsilenceRecurring(id))
          toast(t('hiddenSuggestionsRestored'), { icon: 'check', type: 'ok' })
        }}
      />
      <SettingsRow icon="shield" iconColor="#5bc0ff" label={t('transactionDetection')}
        sublabel={t('transactionDetectionSub')}
        value={suggestions.items.length ? t('capturedCount').replace('{count}', String(suggestions.items.length)) : undefined}
        onClick={() => onOpen('bankNotifications')} />
      {/* La guia tiene que vivir AQUI y no solo en el aviso de arranque: quien
          lo descarta una vez no tendria forma de volver, y es justo el ajuste
          del que depende que todo lo de esta pantalla siga funcionando. */}
      <SettingsRow icon="bolt" iconColor="#ff9f0a" label={t('batteryTitle')}
        sublabel={t('batteryNudgeBody')}
        value={batteryExempt === null ? undefined : batteryExempt ? t('batteryStatusOk') : t('batteryStatusMissing')}
        onClick={() => setBatteryGuide(true)} />
    </div>
  )

  return (
    <>
      {batteryGuide && <MobileBatteryGuide onClose={() => setBatteryGuide(false)} />}
      {grouped ? card : (
        <div className="mset-section">
          <div className="mset-section-label">{t('notificationsSection')}</div>
          {card}
        </div>
      )}

      {activeSheet === 'bankNotifications' && (
        <SettingsSheet title={t('transactionDetection')} onClose={onClose}>
          <div className="mset-sheet-body">
            <p className="mset-legal-intro">
              {t('bankNotificationsIntro')}
            </p>

            {/* Health card: el estado del servicio de un vistazo — concedido +
                vinculado + cuándo revisó por última vez. Antes había que abrir
                el diagnóstico para saber si "estaba funcionando". */}
            <div className={`mset-health ${health}`}>
              <span className="mset-health-ico"><Icon name="shield" size={20} /></span>
              <div className="mset-health-text">
                <b>{healthTitle}</b>
                <small>{health === 'off'
                  ? t('detectionServiceOffDesc')
                  : debug.drainCount > 0
                    ? `${relativeTime(debug.lastDrainAt, t)} · ${t('detectionDeliveredCount').replace('{n}', String(debug.lastPendingCount))}`
                    : accessLabel}</small>
              </div>
              <span className="mset-health-dot" />
            </div>
            <button className="mset-sheet-confirm" onClick={handleOpenSettings}>
              {t('openNotificationSettings')}
            </button>

            <div className="mset-row">
              <span className="mset-row-icon" style={{ background: '#a78bfa22', color: '#a78bfa' }}>
                <Icon name="bell" size={18} />
              </span>
              <div className="mset-row-text">
                <b>{t('autoDetectTransactions')}</b>
                <small>{t('autoDetectTransactionsDesc')}</small>
              </div>
              <label className="mset-toggle-wrap">
                <input type="checkbox" className="mset-toggle-input"
                  checked={suggestions.enabled}
                  onChange={e => suggestions.setEnabled(e.target.checked)} />
                <span className="mset-toggle" />
              </label>
            </div>

            {suggestions.enabled && (
              <div className="mset-row">
                <span className="mset-row-icon" style={{ background: '#35d0a222', color: '#35d0a2' }}>
                  <Icon name="check" size={18} />
                </span>
                <div className="mset-row-text">
                  <b>{t('autoCreateLabel')}</b>
                  <small>{t('autoCreateDesc')}</small>
                </div>
                <label className="mset-toggle-wrap">
                  <input type="checkbox" className="mset-toggle-input"
                    checked={suggestions.autoCreate}
                    onChange={e => suggestions.setAutoCreate(e.target.checked)} />
                  <span className="mset-toggle" />
                </label>
              </div>
            )}

            <p className="mset-section-label" style={{ marginTop: 16 }}>
              {t('suggestedMovements').replace('{count}', String(suggestions.items.length))}
            </p>
            {suggestions.items.length === 0 ? (
              <p className="mset-legal-intro">{t('noSuggestionsYet')}</p>
            ) : (
              <div className="mset-card">
                {suggestions.items.map(item => {
                  const resolvedAccount = resolveFor(item)
                  const suggestedCat = categoryFor(item)
                  return (
                    <div key={item.id} className="mset-row">
                      <span className="mset-row-icon" style={{
                        background: item.type === 'income' ? '#35d0a222' : '#ff6b8a22',
                        color: item.type === 'income' ? '#35d0a2' : '#ff6b8a',
                      }}>
                        <Icon name={item.type === 'income' ? 'arrowDn' : 'arrowUp'} size={16} style={{ transform: item.type === 'income' ? 'rotate(180deg)' : 'none' }} />
                      </span>
                      <div className="mset-row-text">
                        <b>{item.note}</b>
                        <small>
                          {new Date(item.date).toLocaleDateString(dateLocale(lang))} · {fmt(item.amount, item.currency ?? currency)}
                          {item.cardLast4 && ` · ••${item.cardLast4}`}
                        </small>
                        <div className="mset-suggestion-chips">
                          {/* Categoría sugerida por comercio (tócala para cambiarla). */}
                          <button
                            className="mset-suggestion-cat"
                            style={suggestedCat ? { color: suggestedCat.color, borderColor: `color-mix(in oklab, ${suggestedCat.color} 40%, transparent)` } : undefined}
                            onClick={() => openCategoryPicker(item)}
                          >
                            <Icon name={suggestedCat?.icon ?? 'tag'} size={11} />
                            {suggestedCat ? translateCategoryName(suggestedCat, lang) : t('chooseCategoryChip')}
                          </button>
                          <button className="mset-suggestion-account" onClick={() => openPicker(item)}>
                            <Icon name={resolvedAccount ? ACCT_ICONS[resolvedAccount.type] : 'alert'} size={11} />
                            {resolvedAccount ? resolvedAccount.name : t('chooseAccountLabel')}
                          </button>
                        </div>
                      </div>
                      <button className="mset-suggestion-add" onClick={() => handleAdd(item)} aria-label={t('addMovement')}>
                        <Icon name="plus" size={16} />
                      </button>
                      <button className="mset-suggestion-dismiss" onClick={() => suggestions.remove(item.id)} aria-label={t('dismiss')}>
                        <Icon name="close" size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {suggestions.items.length > 0 && (
              <button className="mset-sheet-danger" onClick={handleDiscardAll}>
                <Icon name="trash" size={16} /> {t('clearCaptures')}
              </button>
            )}

            {/* Diagnóstico: qué avisos entregó el sistema y qué se hizo con
                cada uno. Es la respuesta a "no detecta nada" — deja ver si el
                problema es que no llega nada (permiso/nativo) o que llega y se
                descarta (clasificador). */}
            <button className="mset-diag-toggle" onClick={() => setShowDiag(v => !v)}>
              <Icon name="shield" size={14} />
              {showDiag ? t('detectionDiagnosticsHide') : t('detectionDiagnosticsShow')}
              {debug.totalCaptured > 0 && <span className="mset-diag-count">{debug.totalCaptured}</span>}
            </button>

            {showDiag && (
              <div className="mset-diag">
                <p className="mset-legal-intro">{t('detectionDiagnosticsIntro')}</p>

                {/* Estado de las revisiones a la cola nativa. Es lo que separa
                    "la app no revisa" de "revisa pero el sistema no entrega". */}
                <div className="mset-diag-status">
                  <div>
                    <small>{t('detectionChecksLabel')}</small>
                    <b>{debug.drainCount === 0 ? t('detectionNeverChecked') : `${debug.drainCount} · ${relativeTime(debug.lastDrainAt, t)}`}</b>
                  </div>
                  <div>
                    <small>{t('detectionLastDeliveredLabel')}</small>
                    <b>{debug.lastPendingCount}</b>
                  </div>
                </div>
                {debug.drainCount > 0 && debug.totalCaptured === 0 && (
                  <p className="mset-diag-warn">{t('detectionNativeSilent')}</p>
                )}

                <p className="mset-diag-total">
                  {t('detectionCapturedTotal').replace('{count}', String(debug.totalCaptured))}
                </p>
                {debug.entries.length === 0 ? (
                  <p className="mset-legal-intro">{t('detectionNothingCaptured')}</p>
                ) : (
                  <>
                    <div className="mset-card">
                      {debug.entries.map(entry => (
                        <div key={entry.id} className={`mset-diag-row${entry.verdict === 'added' || entry.verdict === 'auto-added' ? ' ok' : entry.verdict === 'duplicate' ? ' dup' : ''}`}>
                          <span className="mset-diag-verdict-dot" />
                          <div className="mset-diag-text">
                            <b>{entry.title || entry.pkg}</b>
                            {entry.text && <small className="mset-diag-body">{entry.text}</small>}
                            <small className="mset-diag-verdict">
                              {new Date(entry.postTime).toLocaleString(dateLocale(lang))} · {t(VERDICT_LABEL_KEY[entry.verdict] as Parameters<typeof t>[0])}
                            </small>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button className="mset-sheet-danger" onClick={() => { debug.clear(); toast(t('detectionLogCleared'), { icon: 'trash' }) }}>
                      <Icon name="trash" size={16} /> {t('detectionClearLog')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </SettingsSheet>
      )}

      {pickerNode}
    </>
  )
}
