import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useDialogs } from '@/components/ui/DialogProvider'
import { backupNeedsAttention, daysSinceBackup } from '@/data/backupSchedule'
import { getDataHealthStatus } from '@/data/dataHealth'
import { accountCurrency, accountMovementsTotal, accountSecondaryMovementsTotal, dateLocale } from '@/data/helpers'
import { useFmt } from '@/hooks/useFmt'
import { useT } from '@/i18n'
import { playSuccessHaptic } from '@/lib/sound'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { getScheduledBackupStatus, pickBackupFolder, runBackupNow, type ScheduledBackupStatus } from '@/lib/scheduledBackup'
import { SheetPortal } from './SheetPortal'
import type { Account } from '@/types'

/**
 * SALUD DE DATOS — la pantalla que responde "¿cuadra lo que dice la app con lo
 * que dice mi banco?".
 *
 * Existía `dataHealth.ts` y existía "Recalcular saldos", pero enterrados en
 * Ajustes › Datos, donde nadie los encuentra cuando de verdad hacen falta: un
 * usuario que sospecha que un saldo está mal no va a Ajustes, va al Perfil.
 *
 * La pantalla lo dice en orden de confianza: primero si todo cuadra, después
 * qué no cuadra y por cuánto, y solo al final el botón que lo arregla.
 */

interface Drift {
  account: Account
  /** Diferencia del libro principal (esperado − guardado). */
  primary: number
  /** Diferencia del segundo libro de una tarjeta. */
  secondary: number
}

export function MobileDataHealth({ onClose }: { onClose: () => void }) {
  const t = useT()
  const fmtVal = useFmt()
  const { confirm } = useDialogs()
  const lang = useSettings(s => s.language ?? 'es')
  const state = useFinance()
  const recomputeBalances = useFinance(s => s.recomputeBalances)
  const [justFixed, setJustFixed] = useState<number | null>(null)
  const [backup, setBackup] = useState<ScheduledBackupStatus | null>(null)
  const [backupBusy, setBackupBusy] = useState(false)

  // El estado real del backup lo tiene Android, no el store: preguntarselo es
  // la unica forma de saber si de verdad se esta copiando algo.
  const refreshBackup = () => { void getScheduledBackupStatus().then(setBackup) }
  useEffect(refreshBackup, [])

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const health = useMemo(() => getDataHealthStatus(state), [state])

  /**
   * Las cuentas descuadradas CON su diferencia. Mostrar "3 cuentas
   * descuadradas" sin decir cuáles ni por cuánto no deja hacer nada: el
   * usuario necesita saber dónde mirar en su estado de cuenta.
   */
  const drifts = useMemo<Drift[]>(() => {
    return state.accounts.flatMap(account => {
      if (account.openingBalance === undefined) return []
      const expected = account.openingBalance
        + accountMovementsTotal(account.id, state.transactions, state.goalContributions)
      const primary = expected - account.balance

      let secondary = 0
      if (account.type === 'credit' && account.secondaryCurrency && account.secondaryOpeningBalance !== undefined) {
        const expected2 = account.secondaryOpeningBalance
          + accountSecondaryMovementsTotal(account.id, state.transactions)
        secondary = expected2 - (account.secondaryBalance ?? 0)
      }

      const broken = Math.abs(primary) > 0.005 || Math.abs(secondary) > 0.005
      return broken ? [{ account, primary, secondary }] : []
    })
  }, [state])

  const healthy = drifts.length === 0 && health.driftedGoals === 0

  const runRecompute = async () => {
    const ok = await confirm({
      title: t('recalcBalancesLabel'),
      description: t('recalcConfirmBody'),
      confirmLabel: t('recalcBalancesLabel'),
    })
    if (!ok) return
    const fixed = recomputeBalances()
    setJustFixed(fixed)
    if (fixed > 0) playSuccessHaptic()
    toast(
      fixed > 0 ? t('balancesFixed').replace('{n}', String(fixed)) : t('balancesOk'),
      { icon: fixed > 0 ? 'check' : 'info', type: 'ok' },
    )
  }

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet mhealth-overlay" role="dialog" aria-modal="true" onClick={onClose}>
        <section className="mhealth-sheet" onClick={e => e.stopPropagation()}>
          <header className="mhealth-header">
            <span>{t('dataHealthTitle')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>

          {/* Veredicto primero. Es la unica pregunta que el usuario vino a
              hacer, y merece responderse sin scroll. */}
          <div className={`mhealth-verdict ${healthy ? 'ok' : 'warn'}`}>
            <Icon name={healthy ? 'check' : 'alert'} size={22} />
            <div>
              <strong>{healthy ? t('everythingBalances') : t('someAccountsDontBalance')}</strong>
              <small>
                {healthy
                  ? t('everythingBalancesHint')
                  : t('driftCountHint').replace('{n}', String(drifts.length))}
              </small>
            </div>
          </div>

          {/* Que NO cuadra y POR CUANTO: sin el monto, el usuario no sabe que
              buscar en su estado de cuenta. */}
          {drifts.length > 0 && (
            <div className="mhealth-drifts">
              {drifts.map(({ account, primary, secondary }) => (
                <div key={account.id} className="mhealth-drift">
                  <span className="mhealth-drift-dot" style={{ background: account.color }} />
                  <div className="mhealth-drift-info">
                    <strong>{account.name}</strong>
                    <small>{t('expectedVsStored')}</small>
                  </div>
                  <div className="mhealth-drift-amounts">
                    {Math.abs(primary) > 0.005 && (
                      <span className={primary > 0 ? 'up' : 'down'}>
                        {primary > 0 ? '+' : '−'}{fmtVal(Math.abs(primary), accountCurrency(account, state.currency))}
                      </span>
                    )}
                    {Math.abs(secondary) > 0.005 && account.secondaryCurrency && (
                      <span className={secondary > 0 ? 'up' : 'down'}>
                        {secondary > 0 ? '+' : '−'}{fmtVal(Math.abs(secondary), account.secondaryCurrency)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* BACKUP. Es la parte de "salud de datos" que de verdad decide si se
              pierde todo: un saldo descuadrado se repara, un backup que nunca
              corrio no se recupera. Por eso el fallo se muestra aqui, con su
              accion al lado, en vez de fallar en silencio. */}
          {backup && (
            <div className={`mhealth-backup ${backupHealthy(backup) ? 'ok' : 'warn'}`}>
              <div className="mhealth-backup-head">
                <Icon name={backupHealthy(backup) ? 'check' : 'alert'} size={16} />
                <strong>{t('weeklyBackupLabel')}</strong>
              </div>
              <p className="mhealth-backup-state">{backupMessage(backup, t, lang)}</p>
              {!backup.hasFolder ? (
                <button
                  className="mhealth-backup-action"
                  onClick={async () => {
                    const picked = await pickBackupFolder()
                    if (!picked.cancelled) { await runBackupNow(); refreshBackup() }
                  }}
                >
                  <Icon name="upload" size={14} />
                  {t('chooseBackupFolder')}
                </button>
              ) : (
                <button
                  className="mhealth-backup-action"
                  disabled={backupBusy}
                  onClick={async () => {
                    setBackupBusy(true)
                    const res = await runBackupNow()
                    setBackupBusy(false)
                    refreshBackup()
                    toast(res.ok ? t('backupRanOk') : t('backupFailed'), { icon: res.ok ? 'check' : 'alert', type: res.ok ? 'ok' : undefined })
                  }}
                >
                  <Icon name="refresh" size={14} />
                  {t('backupNowLabel')}
                </button>
              )}
            </div>
          )}

          {/* Como se calcula. La app pide confianza sobre el dinero del
              usuario; la invariante tiene que poder leerse, no ser magia. */}
          <p className="mhealth-formula">
            <Icon name="info" size={13} />
            {t('balanceFormulaHint')}
          </p>

          <button className="mhealth-fix" onClick={runRecompute}>
            <Icon name="refresh" size={16} />
            {t('recalcBalancesLabel')}
          </button>
          <p className="mhealth-safe">{t('recalcSafeHint')}</p>

          {justFixed !== null && (
            <p className="mhealth-result">
              {justFixed > 0
                ? t('balancesFixed').replace('{n}', String(justFixed))
                : t('balancesOk')}
            </p>
          )}

          <dl className="mhealth-stats">
            <div><dt>{t('accounts')}</dt><dd>{health.accounts}</dd></div>
            <div><dt>{t('movementsLabel')}</dt><dd>{health.transactions}</dd></div>
            <div><dt>{t('recoveryPointsLabel')}</dt><dd>{health.recoveryPoints}</dd></div>
          </dl>

          {health.lastRecoveryAt && (
            <p className="mhealth-meta">
              {t('lastRecoveryPoint')}: {new Date(health.lastRecoveryAt).toLocaleString(dateLocale(lang))}
            </p>
          )}
        </section>
      </div>
    </SheetPortal>
  )
}

/**
 * Un backup sano. Delega en `backupNeedsAttention`, que esta probado y es la
 * misma regla que usa el worker: duplicar el umbral aqui seria justo como las
 * dos implementaciones se separan sin que nadie lo note.
 */
function backupHealthy(status: ScheduledBackupStatus): boolean {
  return !backupNeedsAttention({
    hasFolder: status.hasFolder,
    folderWritable: status.folderWritable,
    lastSuccessAt: status.lastSuccessAt?.getTime() ?? 0,
  })
}

/**
 * Qué decirle al usuario sobre su backup. Cada caso nombra el problema Y su
 * consecuencia: "no has elegido carpeta" no mueve a nadie; "no se esta
 * guardando ninguna copia" sí.
 */
function backupMessage(
  status: ScheduledBackupStatus,
  t: ReturnType<typeof useT>,
  lang: string,
): string {
  if (!status.hasFolder) return t('backupNoFolder')
  if (!status.folderWritable) return t('backupFolderLost').replace('{folder}', status.folderLabel ?? '?')
  if (!status.lastSuccessAt) return t('backupNeverSaved')
  const days = daysSinceBackup(status.lastSuccessAt.getTime()) ?? 0
  if (days >= 8) return t('backupStale').replace('{n}', String(days))
  return t('backupLastOk').replace('{date}', status.lastSuccessAt.toLocaleDateString(dateLocale(lang)))
}
