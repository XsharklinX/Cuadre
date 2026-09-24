import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import type { MobileAlert } from '@/data/alerts'
import { useDetectionHealth } from '@/hooks/useDetectionHealth'
import { fmt, dateLocale } from '@/data/helpers'
import { useBankSuggestions } from '@/store/bankSuggestions'
import { useFinance } from '@/store/finance'
import { useNotificationHistory } from '@/store/notificationHistory'
import { useSettings } from '@/store/settings'
import { useNotificationFeed } from '@/hooks/useNotificationFeed'
import type { NotificationTargetType } from '@/hooks/useNotificationTarget'
import { translateCategoryName, useT } from '@/i18n'
import type { IconName, Transaction } from '@/types'
import { SheetPortal } from './SheetPortal'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { ACCT_ICONS, useBankSuggestionActions } from './settings/bankSuggestionActions'

const HISTORY_ICONS: Record<NotificationTargetType, IconName> = {
  budget: 'wallet',
  recurring: 'repeat',
  lowfunds: 'alert',
  goal: 'target',
  weekly: 'chart',
  fx: 'coins',
  anomaly: 'trend',
  activity: 'edit',
}

function relativeTime(createdAt: number, t: ReturnType<typeof useT>): string {
  const diffMin = Math.round((Date.now() - createdAt) / 60000)
  if (diffMin < 1) return t('justNow')
  if (diffMin < 60) return t('minutesAgo').replace('{n}', String(diffMin))
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return t('hoursAgo').replace('{n}', String(diffH))
  const diffD = Math.round(diffH / 24)
  return t('daysAgo').replace('{n}', String(diffD))
}

/**
 * Centro de notificaciones (campanita). Reúne en un solo lugar:
 *  1) las transacciones detectadas por avisos bancarios (accionables: aceptar /
 *     descartar, eligiendo cuenta si hay ambigüedad), y
 *  2) los avisos financieros (presupuesto excedido, pagos recurrentes próximos)
 *     — cada uno lleva a donde está el problema, nunca es solo informativo.
 * El numerito de "no visto" se limpia al abrir (el padre llama a markAllSeen).
 *
 * Diseño propio (no las filas de Configuración reutilizadas): cada
 * transacción detectada es una tarjeta con su propia jerarquía — nombre en
 * una línea (con elipsis, nunca se envuelve peleando espacio con los
 * botones), monto destacado, y una fila de acciones con texto real en vez de
 * dos círculos diminutos. La hoja ocupa casi toda la pantalla para sentirse
 * como una pantalla propia, no un panel flotando sobre Movimientos.
 */
/**
 * Fecha de una sugerencia, a prueba de datos viejos o corruptos.
 *
 * `date` llego despues que `postTime`, asi que una cola guardada por una
 * version anterior puede no traerlo. `new Date(undefined)` da "Invalid Date",
 * y eso se pintaba tal cual.
 */
function fmtSuggestionDate(item: { date?: string; postTime?: number }, lang: string): string {
  const raw = item.date ? new Date(item.date) : item.postTime ? new Date(item.postTime) : null
  if (!raw || Number.isNaN(raw.getTime())) return ''
  return raw.toLocaleDateString(dateLocale(lang))
}

export function MobileNotificationCenter({ onClose, onGotoBudgets, onGotoTarget, onEditTx, onOpenDetection }: {
  onClose: () => void
  onGotoBudgets: () => void
  onGotoTarget: (type: NotificationTargetType) => void
  onEditTx: (transaction: Transaction) => void
  /** Abre Ajustes → Deteccion de transacciones (aviso de deteccion muerta). */
  onOpenDetection: () => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const dismissAlert = useSettings(s => s.dismissAlert)
  const silenceRecurring = useSettings(s => s.silenceRecurring)
  // Aviso cuyo descarte está esperando a que el usuario elija alcance.
  const [dismissing, setDismissing] = useState<MobileAlert | null>(null)
  const { currency, transactions } = useFinance()
  const suggestionStore = useBankSuggestions()
  const { suggestions, alerts, total } = useNotificationFeed()
  const { handleAdd, openPicker, openCategoryPicker, categoryFor, resolveFor, pickerNode } = useBankSuggestionActions()
  const history = useNotificationHistory(s => s.entries)
  const removeHistoryEntry = useNotificationHistory(s => s.remove)
  const historyTotal = total + history.length
  // "Por revisar" = lo accionable (transacciones detectadas + avisos), no el
  // historial ya pasado. Alimenta el subtítulo de la cabecera.
  const reviewCount = suggestions.length + alerts.length

  const goToHistoryEntry = (type: NotificationTargetType) => {
    onGotoTarget(type)
    onClose()
  }

  const goToAlert = (target: (typeof alerts)[number]['target']) => {
    if (target.type === 'budget') {
      onGotoBudgets()
      onClose()
      return
    }
    const tx = transactions.find(t => t.id === target.transactionId)
    if (tx) onEditTx(tx)
    onClose()
  }

  useMobileBackDismiss(true, onClose)

  // Evita el scroll del fondo mientras la hoja está abierta.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const [historyOpen, setHistoryOpen] = useState(false)
  const health = useDetectionHealth()

  /*
   * FILTROS.
   *
   * Todo caia en una sola lista: transacciones detectadas que hay que
   * responder, avisos que llevan a algun sitio, e historial ya pasado. Con
   * quince entradas, lo accionable —lo unico que pide algo del usuario— queda
   * enterrado entre lo informativo, y el panel se vuelve algo que se cierra
   * sin leer.
   */
  const [filter, setFilter] = useState<'all' | 'review' | 'log'>('all')
  const showReview = filter === 'all' || filter === 'review'
  const showLog = filter === 'all' || filter === 'log'

  const clearLog = useNotificationHistory(s => s.clear)
  // Con el filtro "Registro" puesto, el historial sale desplegado: plegarlo
  // ahi obligaria a un toque mas para ver justo lo que se acaba de pedir.
  const logOpen = historyOpen || filter === 'log'


  return (
    <SheetPortal>
      <div className="mobile-detail-sheet mnc-wrap" role="dialog" aria-modal="true"
        aria-label={t('notificationsLabel')} onClick={onClose}>
        <div className="mnc-sheet" onClick={e => e.stopPropagation()}>
          <div className="mnc-top">
            <div className="mnc-handle" aria-hidden="true" />
            <header className="mnc-header">
              <div className="mnc-header-icon">
                <Icon name="bell" size={18} />
                {reviewCount > 0 && <span className="mnc-header-icon-dot" />}
              </div>
              <div className="mnc-header-text">
                <span>{t('notificationsLabel')}</span>
                <small>{reviewCount > 0 ? t('notifSubReview').replace('{n}', String(reviewCount)) : t('notifSubCaughtUp')}</small>
              </div>
              <button className="mnc-close" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
            </header>
          </div>

          {/*
            LA BARRA DE FILTROS.
            "Por revisar" es lo que PIDE algo del usuario; el registro es lo
            que ya paso. Separarlos es la diferencia entre un panel que se
            atiende y uno que se cierra sin leer.
          */}
          {historyTotal > 0 && (
            <div className="mnc-filters" role="tablist">
              {([
                ['all', t('notifFilterAll'), historyTotal],
                ['review', t('notifFilterReview'), reviewCount],
                ['log', t('notifFilterLog'), history.length],
              ] as const).map(([key, label, count]) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={filter === key}
                  className={`mnc-filter${filter === key ? ' on' : ''}`}
                  onClick={() => setFilter(key)}
                >
                  {label}
                  {count > 0 && <em>{count}</em>}
                </button>
              ))}
              {/* Vaciar el registro. Antes solo se podian borrar de uno en uno:
                  con treinta entradas viejas, nadie lo hace. */}
              {showLog && history.length > 0 && (
                <button className="mnc-clear" onClick={() => {
                  clearLog()
                  toast(t('notifLogCleared'), { icon: 'check', type: 'ok' })
                }}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          )}

          <div className="mnc-body">
            {/*
              Va FUERA del "no hay nada": si la deteccion esta rota, lo que
              hay es justamente una lista vacia, y una lista vacia se lee como
              "no ha pasado nada" en vez de como "llevo meses sin registrar
              tus gastos". Ese malentendido duro meses.
            */}
            {health?.alert && (
              <button className="mnc-health" onClick={() => { onOpenDetection(); onClose() }}>
                <span className="mnc-health-ico"><Icon name="alert" size={16} /></span>
                <span className="mnc-health-text">
                  <strong>{t('detectionDeadTitle')}</strong>
                  <small>
                    {health.state === 'no-access' ? t('detectionNoAccessBody')
                      : health.state === 'unbound' ? t('detectionUnboundBody')
                      : health.daysSilent === null ? t('detectionSilentNeverBody')
                      : t('detectionSilentBody').replace('{n}', String(health.daysSilent))}
                  </small>
                </span>
                <span className="mnc-health-cta">{t('detectionFixAction')}</span>
              </button>
            )}

            {historyTotal === 0 ? (
              <div className="mnc-empty">
                {/* Un check, no una campana apagada: "no hay nada pendiente"
                    es un buen resultado, no una pantalla rota. */}
                <span className="mnc-empty-icon"><Icon name="check" size={34} /></span>
                <b>{t('notifEmptyTitle')}</b>
                <small>{t('notifEmptyHint')}</small>
              </div>
            ) : (
              <>
                {showReview && suggestions.length > 0 && (
                  <div className="mnc-group">
                    {/* PRIMERO lo que pide accion. Antes los tres bloques
                        —detectados, avisos e historial— tenian el mismo
                        tratamiento: punto de color y contador. Tres grupos de
                        igual peso no son jerarquia. */}
                    <div className="mnc-group-title primary">
                      {t('notifDetectedSection')}
                      <span className="mnc-group-count">{suggestions.length}</span>
                    </div>
                    <div className="mnc-card-list">
                      {suggestions.map(item => {
                        const account = resolveFor(item)
                        const suggestedCat = categoryFor(item)
                        const isIncome = item.type === 'income'
                        return (
                          <article
                            key={item.id}
                            className="mnc-card"
                            /* La naturaleza del movimiento la lleva la TARJETA,
                               no solo un icono de 34px: ingreso y gasto se
                               distinguian por un cuadrito de color que habia
                               que ir a buscar. */
                            data-kind={isIncome ? 'income' : 'expense'}
                          >
                            <div className="mnc-card-top">
                              <span className="mnc-card-icon" style={{
                                background: isIncome ? '#35d0a222' : '#ff6b8a22',
                                color: isIncome ? '#35d0a2' : '#ff6b8a',
                              }}>
                                <Icon name={isIncome ? 'arrowDn' : 'arrowUp'} size={17}
                                  style={{ transform: isIncome ? 'rotate(180deg)' : 'none' }} />
                              </span>
                              <div className="mnc-card-title">
                                <b>{item.note}</b>
                                {/* `postTime` de respaldo: una sugerencia guardada
                                    por una version vieja (o con la fecha
                                    corrupta) pintaba "Invalid Date" en la
                                    cara del usuario. Si tampoco hay hora, no
                                    se muestra nada — mejor un hueco que una
                                    mentira. */}
                                {/* El monto va en la SEGUNDA linea, junto a la
                                    fecha, no peleando con el concepto por el
                                    ancho. En un cajon estrecho ganaba siempre
                                    el monto (no encoge) y el concepto quedaba
                                    en "Consumo...", que no dice nada: leer
                                    QUE fue es la mitad de la decision. */}
                                <span className="mnc-card-meta">
                                  <small>{fmtSuggestionDate(item, lang)}</small>
                                  <strong className={`mnc-card-amount ${isIncome ? 'income' : 'expense'}`}>
                                    {isIncome ? '+' : '−'}{fmt(item.amount, item.currency ?? currency)}
                                  </strong>
                                </span>
                              </div>
                            </div>

                            <div className="mnc-card-chips">
                              <button
                                className="mnc-card-chip mnc-card-cat"
                                style={suggestedCat ? { color: suggestedCat.color } : undefined}
                                onClick={() => openCategoryPicker(item)}
                              >
                                <Icon name={suggestedCat?.icon ?? 'tag'} size={12} />
                                {suggestedCat ? translateCategoryName(suggestedCat, lang) : t('chooseCategoryChip')}
                                <Icon name="edit" size={10} className="mnc-card-account-edit" />
                              </button>
                              <button className="mnc-card-chip mnc-card-account" onClick={() => openPicker(item)}>
                                <Icon name={account ? ACCT_ICONS[account.type] : 'alert'} size={12} />
                                {account ? account.name : t('chooseAccountLabel')}
                                <Icon name="edit" size={10} className="mnc-card-account-edit" />
                              </button>
                            </div>

                            {/* Si el usuario pudo haberlo tecleado ya, se dice
                                aqui y NO se auto-creo. La app no decide por el:
                                dos cafes del mismo precio el mismo dia son dos
                                gastos legitimos. */}
                            {item.possibleDuplicateOf && (
                              <p className="mnc-card-dup">
                                <Icon name="alert" size={12} />
                                {t('maybeAlreadyRecorded')}
                              </p>
                            )}

                            <div className="mnc-card-actions">
                              <button className="mnc-card-dismiss" onClick={() => suggestionStore.remove(item.id)}>
                                <Icon name="close" size={14} /> {t('dismiss')}
                              </button>
                              <button className="mnc-card-accept" onClick={() => handleAdd(item)}>
                                <Icon name="check" size={14} /> {t('addMovement')}
                              </button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                )}

                {showReview && alerts.length > 0 && (
                  <div className="mnc-group">
                    <div className="mnc-group-title">
                      {t('notifAlertsSection')}
                      <span className="mnc-group-count">{alerts.length}</span>
                    </div>
                    <div className="mnc-card-list">
                      {alerts.map(alert => (
                        <div key={alert.id} className="mnc-alert-row" data-level={alert.level}>
                          <button className="mnc-alert" onClick={() => goToAlert(alert.target)}>
                            <span className="mnc-alert-icon">
                              <Icon name={alert.icon} size={17} />
                            </span>
                            <div className="mnc-alert-text">
                              <b>{alert.title}</b>
                              <small>{alert.text}</small>
                            </div>
                            <Icon name="arrowUp" size={14} className="mnc-alert-arrow" />
                          </button>
                          <button
                            className="mnc-alert-dismiss"
                            aria-label={t('deleteNotification')}
                            onClick={() => {
                              // Los de presupuesto se descartan directo: son de
                              // este mes y no se repiten con id nueva, así que
                              // no hay nada que elegir. Los de pago recurrente sí.
                              if (alert.target.type === 'recurring') setDismissing(alert)
                              else dismissAlert(alert.id)
                            }}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* El historial es REFERENCIA, no accion: va plegado. Abierto
                    competia por la pantalla con lo que si hay que revisar, y
                    era lo que hacia que el panel se sintiera un volcado. */}
                {showLog && history.length > 0 && (
                  <div className="mnc-group">
                    <button
                      className="mnc-group-title toggle"
                      onClick={() => setHistoryOpen(v => !v)}
                      aria-expanded={logOpen}
                    >
                      {t('notifHistorySection')}
                      <span className="mnc-group-count">{history.length}</span>
                      <Icon
                        name="arrowUp"
                        size={13}
                        style={{ transform: logOpen ? 'rotate(180deg)' : 'rotate(90deg)', marginLeft: 'auto' }}
                      />
                    </button>
                    <div className="mnc-card-list" hidden={!logOpen}>
                      {history.map(entry => (
                        <div key={entry.id} className="mnc-history-row">
                          <button className="mnc-history-tap" onClick={() => goToHistoryEntry(entry.type)}>
                            <span className="mnc-history-icon"><Icon name={HISTORY_ICONS[entry.type]} size={16} /></span>
                            <div className="mnc-history-text">
                              <b>{entry.title}</b>
                              <small>{entry.body}</small>
                              <span className="mnc-history-time">{relativeTime(entry.createdAt, t)}</span>
                            </div>
                          </button>
                          <button
                            className="mnc-history-delete"
                            aria-label={t('deleteNotification')}
                            onClick={() => removeHistoryEntry(entry.id)}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {pickerNode}

      {dismissing && (
        <div
          className="mnc-choice-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('dismissAlertTitle')}
          onClick={() => setDismissing(null)}
        >
          <div className="mnc-choice" onClick={e => e.stopPropagation()}>
            <strong>{t('dismissAlertTitle')}</strong>
            <small>{dismissing.title}</small>
            <button
              className="mnc-choice-btn"
              onClick={() => { dismissAlert(dismissing.id); setDismissing(null) }}
            >
              {t('dismissAlertOnce')}
            </button>
            <button
              className="mnc-choice-btn mnc-choice-btn-strong"
              onClick={() => {
                const target = dismissing.target
                if (target.type === 'recurring') {
                  silenceRecurring(target.transactionId)
                  const template = transactions.find(tx => tx.id === target.transactionId)
                  toast(t('recurringSilencedToast').replace('{name}', template?.note ?? ''), { icon: 'check', type: 'ok' })
                }
                setDismissing(null)
              }}
            >
              {t('dismissAlertForever')}
            </button>
            <button className="mnc-choice-cancel" onClick={() => setDismissing(null)}>{t('cancel')}</button>
          </div>
        </div>
      )}
    </SheetPortal>
  )
}
