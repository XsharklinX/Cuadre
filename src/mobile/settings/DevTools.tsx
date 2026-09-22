import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { backupDecision, type BackupDecision } from '@/data/backupSchedule'
import {
  devDate, getDevOffsetDays, isTimeTravelling, setDevOffsetDays,
} from '@/data/devClock'
import { makeStressData, sabotageAccounts, sabotageFx } from '@/data/devFixtures'
import { localToday } from '@/data/helpers'
import { ratingVerdict } from '@/data/ratingPrompt'
import { isTauri } from '@/hooks/useTauri'
import { takePendingBankNotifications } from '@/lib/bankNotifications'
import { getScheduledBackupStatus, runBackupNow, type ScheduledBackupStatus } from '@/lib/scheduledBackup'
import { useDev } from '@/store/dev'
import { useFinance } from '@/store/finance'
import { useRating } from '@/store/rating'
import { useT } from '@/i18n'

/**
 * Las ocho herramientas del panel de desarrollador.
 *
 * Viven aparte de `SettingsDev` porque son ocho cosas sin relación entre sí y
 * meterlas en el mismo archivo lo convertía en una lista de 400 líneas donde
 * no se encuentra nada.
 *
 * Todo lo destructivo pide UN segundo toque. No es un diálogo de confirmación
 * bonito: quien llegó aquí hizo seis toques a propósito y no necesita que se
 * le trate como a un usuario. Pero borrar el libro de alguien por un roce en
 * el bolsillo tampoco vale la pena.
 */

/** Botón que solo actúa al segundo toque, y se olvida a los 4 segundos. */
function DangerButton({ label, desc, onConfirm }: { label: string; desc?: string; onConfirm: () => void }) {
  const t = useT()
  const [armed, setArmed] = useState(false)

  return (
    <button
      className={`mset-dev-danger${armed ? ' armed' : ''}`}
      onClick={() => {
        if (armed) { setArmed(false); onConfirm(); return }
        setArmed(true)
        setTimeout(() => setArmed(false), 4000)
      }}
    >
      <span>
        <strong>{armed ? t('devConfirmDestructive') : label}</strong>
        {desc && !armed && <small>{desc}</small>}
      </span>
      <Icon name={armed ? 'alert' : 'trash'} size={15} />
    </button>
  )
}

// ── 1. Viajar en el tiempo ──────────────────────────────────
export function DevClock() {
  const t = useT()
  const [days, setDays] = useState(getDevOffsetDays())

  const move = (delta: number) => {
    const next = days + delta
    setDevOffsetDays(next)
    setDays(next)
  }

  return (
    <>
      <p className="mset-group-label">{t('devClockTitle')}</p>
      <div className="mset-card mset-dev-clock">
        <small>{t('devClockDesc')}</small>

        <div className="mset-dev-clock-row">
          <button onClick={() => move(-30)}>−30</button>
          <button onClick={() => move(-7)}>−7</button>
          <button onClick={() => move(-1)}>−1</button>
          <b>{days > 0 ? `+${days}` : days}d</b>
          <button onClick={() => move(1)}>+1</button>
          <button onClick={() => move(7)}>+7</button>
          <button onClick={() => move(30)}>+30</button>
        </div>

        <div className="mset-dev-facts">
          {/* La fecha real en LOCAL, no en UTC. `toISOString()` convierte a
              UTC, asi que en Republica Dominicana (UTC-4) a partir de las 8
              de la noche mostraba el dia siguiente: el panel decia que el
              reloj estaba desfasado cuando el desfase era cero. Un
              diagnostico que miente es peor que no tenerlo. */}
          <div><span>{t('devClockToday')}</span><b>{localToday(new Date())}</b></div>
          <div><span>{t('devClockAppToday')}</span><b>{localToday()}</b></div>
        </div>

        {isTimeTravelling() && (
          <>
            <p className="mset-dev-warn"><Icon name="alert" size={14} /> {t('devClockWarn')}</p>
            <button className="mset-dev-run" onClick={() => { setDevOffsetDays(0); setDays(0) }}>
              {t('devClockReset')}
            </button>
          </>
        )}
      </div>
    </>
  )
}

// ── 2. Disparar notificaciones nativas ──────────────────────
const NOTIFICATION_KINDS = ['budget', 'weekly', 'recurring', 'lowfunds', 'fx', 'anomaly'] as const

export function DevNotifications() {
  const t = useT()

  /**
   * Se abre el deep link que la notificación real abriría. No lanza el aviso
   * en la bandeja —eso lo decide `ReminderWorker` según sus condiciones— pero
   * sí prueba lo que de verdad se rompe: que tocar el aviso lleve a la
   * pantalla correcta en vez de dejarte en Inicio.
   */
  const fire = async (kind: string) => {
    if (!isTauri()) { toast('Solo en Android', { icon: 'info' }); return }
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:local-reminders|open_file', { path: `sharky://notification/${kind}` })
    } catch {
      // El comando puede no existir en un build viejo: se navega igual desde JS.
      window.dispatchEvent(new CustomEvent('cuadre-dev-notification', { detail: kind }))
      toast(kind, { icon: 'bell' })
    }
  }

  return (
    <>
      <p className="mset-group-label">{t('devNotifTitle')}</p>
      <div className="mset-card mset-dev-chips">
        <small>{t('devNotifDesc')}</small>
        <div>
          {NOTIFICATION_KINDS.map(kind => (
            <button key={kind} onClick={() => void fire(kind)}>{kind}</button>
          ))}
        </div>
      </div>
    </>
  )
}

// ── 3. Respaldo semanal ─────────────────────────────────────
export function DevBackup() {
  const t = useT()
  const [status, setStatus] = useState<ScheduledBackupStatus | null>(null)
  const [decision, setDecision] = useState<BackupDecision | null>(null)
  const [result, setResult] = useState<string | null>(null)

  /**
   * El estado REAL lo tiene Android, no los ajustes de JS: la carpeta es un
   * permiso SAF y el último respaldo lo escribe el worker nativo. Y
   * `backupDecision` es el espejo en JS de lo que decide `BackupWorker.kt`,
   * así que verlos juntos es lo que permite saber si divergen.
   */
  useEffect(() => {
    void (async () => {
      const real = await getScheduledBackupStatus()
      setStatus(real)
      if (!real) return
      setDecision(backupDecision({
        hasFolder: real.hasFolder,
        lastSuccessAt: real.lastSuccessAt?.getTime() ?? 0,
        preferredDay: real.day,
        preferredHour: real.hour,
        now: devDate(),
      }))
    })()
  }, [])

  return (
    <>
      <p className="mset-group-label">{t('devBackupTitle')}</p>
      <div className="mset-card mset-dev-facts">
        <div><span>{t('devBackupDecision')}</span><b>{decision ? (decision.due ? 'toca' : 'esperar') : '—'}</b></div>
        <div><span>motivo</span><b>{decision?.reason ?? '—'}</b></div>
        <div><span>carpeta</span><b>{status?.folderLabel ?? '—'}</b></div>
        <div><span>ultimo ok</span><b>{status?.lastSuccessAt?.toLocaleString() ?? 'nunca'}</b></div>
        <div><span>ultimo error</span><b>{status?.lastError ?? '—'}</b></div>
        {result && <div><span>resultado</span><b>{result}</b></div>}
      </div>
      <button className="mset-dev-run" onClick={async () => {
        const r = await runBackupNow()
        setResult(r.ok ? 'ok' : (r.error ?? 'error'))
      }}>
        {t('devBackupRun')}
      </button>
    </>
  )
}

// ── 4. Cola nativa cruda ────────────────────────────────────
export function DevQueue() {
  const t = useT()
  const [items, setItems] = useState<string[] | null>(null)

  return (
    <>
      <p className="mset-group-label">{t('devQueueTitle')}</p>
      <div className="mset-card mset-dev-sim">
        <small>{t('devQueueDesc')}</small>
        <button className="mset-dev-run" onClick={async () => {
          // OJO: `take_pending` VACÍA la cola. Es la única forma de verla —
          // el plugin no expone una lectura sin consumir — así que lo que se
          // saca aquí ya no lo va a clasificar la app.
          const pending = await takePendingBankNotifications()
          setItems(pending.map(p => `${p.package} · ${p.title} · ${p.text}`.slice(0, 160)))
        }}>
          {t('devQueuePeek')}
        </button>
        {items !== null && (
          items.length === 0
            ? <p className="mset-dev-verdict">{t('devQueueEmpty')}</p>
            : <ol className="mset-dev-queue">{items.map((line, i) => <li key={i}>{line}</li>)}</ol>
        )}
      </div>
    </>
  )
}

// ── 5, 6, 8. Libro: estrés, inspector y sabotajes ───────────
export function DevLedger() {
  const t = useT()
  const transactions = useFinance(s => s.transactions)
  const accounts = useFinance(s => s.accounts)
  const latest = transactions[0]

  const loadStress = () => {
    const data = makeStressData({ accounts: 30, transactions: 5_000, months: 36 })
    useFinance.setState({ ...data, goals: [], goalContributions: [] })
    toast(t('devStressDone'), { icon: 'check', type: 'ok' })
  }

  return (
    <>
      <p className="mset-group-label">{t('devStressTitle')}</p>
      <div className="mset-card mset-dev-sim">
        <small>{t('devStressDesc')}</small>
        <DangerButton label={t('devStressRun')} onConfirm={loadStress} />
      </div>

      <p className="mset-group-label">{t('devInspectTitle')}</p>
      <div className="mset-card mset-dev-sim">
        <small>{t('devInspectDesc')}</small>
        {/* JSON crudo: es justo lo que hay que ver. `fxRate`,
            `onSecondaryBalance` y `originalAmount` no se pintan en ninguna
            pantalla, y son los campos donde viven los bugs de divisa. */}
        <pre className="mset-dev-json">
          {latest ? JSON.stringify(latest, null, 2) : '—'}
        </pre>
      </div>

      <p className="mset-group-label">{t('devSabotageTitle')}</p>
      <div className="mset-card mset-dev-sim">
        <DangerButton
          label={t('devSabotageDrift')} desc={t('devSabotageDriftDesc')}
          onConfirm={() => {
            useFinance.setState({ accounts: sabotageAccounts(accounts) })
            toast(t('devSabotageDrift'), { icon: 'alert' })
          }}
        />
        <DangerButton
          label={t('devSabotageFx')} desc={t('devSabotageFxDesc')}
          onConfirm={() => {
            useFinance.setState({ transactions: sabotageFx(transactions) })
            toast(t('devSabotageFx'), { icon: 'alert' })
          }}
        />
      </div>
    </>
  )
}

// ── 7. Forzar la valoración ─────────────────────────────────
export function DevRating() {
  const t = useT()
  const setForceRating = useDev(d => d.setForceRating)
  const rating = useRating()
  const txCount = useFinance(s => s.transactions.length)

  /*
   * Por que hace falta forzarlo: el dialogo pide siete dias de uso, ocho
   * arranques y quince movimientos. Sin un atajo no se prueba nunca.
   *
   * La primera version de esta herramienta RESETEABA el historial a cero, que
   * es justo lo contrario: dejaba el contador de arranques en 0 y garantizaba
   * que no apareciera. Ahora se salta las reglas de verdad.
   */
  const verdict = ratingVerdict({ state: rating, transactionCount: txCount, now: Date.now() })

  return (
    <>
      <p className="mset-group-label">{t('devShowRating')}</p>
      <div className="mset-card mset-dev-sim">
        <small>{t('devRatingDesc')}</small>
        <button className="mset-dev-run" onClick={() => { setForceRating(true); location.reload() }}>
          {t('devRatingRun')}
        </button>
      </div>
      {/* Y por que NO saldria solo, que es la otra mitad de la pregunta. */}
      <div className="mset-card mset-dev-facts">
        <div><span>veredicto</span><b>{verdict}</b></div>
        <div><span>arranques</span><b>{rating.launches}</b></div>
        <div><span>movimientos</span><b>{txCount}</b></div>
        <div><span>ya valoro</span><b>{String(rating.rated)}</b></div>
        <div><span>pospuesto</span><b>{rating.timesAsked}</b></div>
      </div>
    </>
  )
}
