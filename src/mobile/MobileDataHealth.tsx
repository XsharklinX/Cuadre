import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useDialogs } from '@/components/ui/DialogProvider'
import { backupNeedsAttention, daysSinceBackup } from '@/data/backupSchedule'
import { getDataHealthStatus } from '@/data/dataHealth'
import { BUSINESS_ISSUE_KEY, businessHealth, isAutoFixable } from '@/data/businessHealth'
import { accountCurrency, accountMovementsTotal, accountSecondaryMovementsTotal, contributionDelta, dateLocale } from '@/data/helpers'
import { useFmt } from '@/hooks/useFmt'
import { useT } from '@/i18n'
import { playSuccessHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useCaprices } from '@/store/caprices'
import { restoreEverything } from '@/lib/restoreAll'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { getScheduledBackupStatus, pickBackupFolder, runBackupNow, type ScheduledBackupStatus } from '@/lib/scheduledBackup'
import { SheetPortal } from './SheetPortal'
import type { Account, Goal } from '@/types'
import { driftKey, pendingDrifts } from '@/data/healthDismissals'
import { clearRecalcs, listRecalcs, totalMoved, undoRecalc, type RecalcEntry } from '@/data/recalcHistory'
import { findInflatedIncome, totalInflated } from '@/data/incomeFeeRepair'
import { listRecoverySnapshots, readRecoverySnapshot, type RecoverySnapshot } from '@/data/recovery'

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

/**
 * Una meta cuyo ahorro guardado no coincide con `apertura + aportes`.
 *
 * Ya se contaba (`driftedGoals` ponia el veredicto en ambar), pero no se
 * nombraba en ningun sitio: el usuario veia "algo no cuadra" y una lista de
 * cuentas donde no estaba el problema. Un aviso que no dice de que habla es
 * el que enseña a ignorar la pantalla.
 */
interface GoalDrift {
  goal: Goal
  /** Diferencia del ahorro (esperado − guardado). */
  diff: number
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
  /*
   * El historial y las copias viven en localStorage, no en el store: se leen
   * al abrir y se releen tras cada cambio que pueda tocarlos.
   */
  const [recalcs, setRecalcs] = useState<RecalcEntry[]>(listRecalcs)
  const [snapshots, setSnapshots] = useState<RecoverySnapshot[]>(listRecoverySnapshots)
  const refreshLog = () => { setRecalcs(listRecalcs()); setSnapshots(listRecoverySnapshots()) }

  // El estado real del backup lo tiene Android, no el store: preguntarselo es
  // la unica forma de saber si de verdad se esta copiando algo.
  const refreshBackup = () => { void getScheduledBackupStatus().then(setBackup) }
  useEffect(refreshBackup, [])

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const health = useMemo(() => getDataHealthStatus(state), [state])

  /*
   * LA MITAD NUEVA DE LA APP, QUE NO TENIA REDES.
   *
   * Esta pantalla es la que el usuario abre cuando algo le huele mal, y no
   * sabia que existieran clientes ni cobros: decia «todo correcto» con cobros
   * apuntando a movimientos borrados.
   */
  const negocio = useBusiness()
  const botes = useCaprices(st => st.items)
  const bizHealth = useMemo(() => businessHealth({
    clients: negocio.clients,
    businesses: negocio.businesses,
    services: negocio.services,
    charges: negocio.charges,
    caprices: botes,
    transactions: state.transactions,
    accounts: state.accounts,
    categories: state.categories,
  }), [negocio, botes, state.transactions, state.accounts, state.categories])

  /**
   * Arregla los problemas que no necesitan decidir nada.
   *
   * Los demas piden una eleccion del usuario —a que cuenta mueves ese cliente,
   * que categoria le pones— y hacerlo por el seria elegir en su nombre algo que
   * afecta a su dinero. Esos se enseñan y se deja que entre a arreglarlos.
   */
  const arreglarNegocio = () => {
    const txIds = new Set(state.transactions.map(tx => tx.id))
    const clientIds = new Set(negocio.clients.map(c => c.id))
    const businessIds = new Set(negocio.businesses.map(b => b.id))

    useBusiness.setState(st => ({
      // Un cobro cuyo movimiento ya no esta vuelve a PENDIENTE, no se borra: el
      // cobro sigue siendo cierto, lo que se perdio es la prueba de que llego.
      charges: st.charges
        .filter(c => clientIds.has(c.clientId))
        .map(c => {
          const vivos = c.txIds.filter(id => txIds.has(id))
          return vivos.length === c.txIds.length ? c : { ...c, txIds: vivos, paid: 0, paidAt: 0 }
        }),
      services: st.services.filter(v => businessIds.has(v.businessId)),
    }))

    // Un capricho SI se descarta: es la referencia a un gasto, y sin el gasto
    // no queda nada que recuperar.
    useCaprices.setState(st => ({
      items: st.items
        .filter(c => txIds.has(c.txId))
        .map(c => {
          const vivos = c.payments.filter(pago => txIds.has(pago.txId))
          return vivos.length === c.payments.length ? c : { ...c, payments: vivos }
        }),
    }))

    playSuccessHaptic()
    toast(t('bhFixed'), { icon: 'check', type: 'ok' })
  }

  /**
   * Las cuentas descuadradas CON su diferencia. Mostrar "3 cuentas
   * descuadradas" sin decir cuáles ni por cuánto no deja hacer nada: el
   * usuario necesita saber dónde mirar en su estado de cuenta.
   */
  const allDrifts = useMemo<Drift[]>(() => {
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

  /*
   * Las metas descuadradas, con su nombre y su diferencia: un aviso que no
   * dice de que meta habla no se puede atender.
   */
  const allGoalDrifts = useMemo<GoalDrift[]>(() => {
    return state.goals.flatMap(goal => {
      if (goal.openingSaved === undefined) return []
      const contributed = state.goalContributions
        .filter(c => c.goalId === goal.id)
        .reduce((sum, c) => sum + contributionDelta(c), 0)
      const diff = (goal.openingSaved + contributed) - goal.saved
      return Math.abs(diff) > 0.005 ? [{ goal, diff }] : []
    })
  }, [state])

  /*
   * Lo omitido se descuenta AQUI, no en el calculo: la lista completa sigue
   * existiendo para poder limpiar las huellas viejas y para poder devolverlo
   * todo a la vista.
   */
  const dismissedDrifts = useSettings(st => st.dismissedDrifts)
  const dismissDrift = useSettings(st => st.dismissDrift)
  const restoreDrifts = useSettings(st => st.restoreDrifts)
  const pruneDrifts = useSettings(st => st.pruneDrifts)
  const recomputeAccount = useFinance(st => st.recomputeAccount)
  const recomputeGoal = useFinance(st => st.recomputeGoal)
  const restoreAccountBalances = useFinance(st => st.restoreAccountBalances)
  const repairIncomeFees = useFinance(st => st.repairIncomeFees)

  /*
   * Ingresos a los que se les sumo un impuesto que no existe. No es deriva:
   * el saldo se calculo CON el monto inflado, asi que el libro cuadra consigo
   * mismo y ninguna invariante lo ve. Solo se nota contra el banco.
   */
  const inflados = useMemo(() => findInflatedIncome(state.transactions), [state.transactions])

  const fingerprint = (d: Drift) => ({ accountId: d.account.id, primary: d.primary, secondary: d.secondary })
  const drifts = useMemo(
    () => pendingDrifts(dismissedDrifts, allDrifts.map(d => ({ ...d, ...fingerprint(d) }))),
    [dismissedDrifts, allDrifts],
  )
  /* Las metas comparten la lista de omitidos; el prefijo evita que la huella
     de una meta choque con la de una cuenta del mismo id. */
  const goalFingerprint = (d: GoalDrift) => ({ accountId: `goal:${d.goal.id}`, primary: d.diff, secondary: 0 })
  const goalDrifts = useMemo(
    () => pendingDrifts(dismissedDrifts, allGoalDrifts.map(d => ({ ...d, ...goalFingerprint(d) }))),
    [dismissedDrifts, allGoalDrifts],
  )
  const dismissedCount = (allDrifts.length - drifts.length) + (allGoalDrifts.length - goalDrifts.length)

  /*
   * Al abrir se sueltan las huellas que ya no corresponden a ningun descuadre
   * vivo. Sin esto la lista crece sin fin, y una huella antigua podria volver
   * a coincidir por casualidad con un descuadre futuro del mismo importe —
   * justo el que no queremos silenciar.
   */
  useEffect(() => {
    pruneDrifts([
      ...allDrifts.map(d => driftKey(fingerprint(d))),
      ...allGoalDrifts.map(d => driftKey(goalFingerprint(d))),
    ])
    // Solo al abrir y cuando cambian los descuadres reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDrifts, allGoalDrifts])

  const healthy = drifts.length === 0 && goalDrifts.length === 0

  const runRecompute = async () => {
    const ok = await confirm({
      title: t('recalcBalancesLabel'),
      description: t('recalcConfirmBody'),
      confirmLabel: t('recalcBalancesLabel'),
    })
    if (!ok) return
    const fixed = recomputeBalances()
    setJustFixed(fixed)
    refreshLog()
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

          {/* NEGOCIO: lo que esta pantalla no sabia mirar. */}
          {(bizHealth.clients > 0 || bizHealth.businesses > 0 || bizHealth.caprices > 0) && (
            <div className="mhealth-biz">
              <div className="mhealth-biz-stats">
                <div><strong>{bizHealth.clients}</strong><small>{t('bizClients')}</small></div>
                <div><strong>{bizHealth.charges}</strong><small>{t('bizTabCollect')}</small></div>
                <div><strong>{fmtVal(bizHealth.outstanding, state.currency)}</strong><small>{t('bizLate')}</small></div>
              </div>

              {bizHealth.issues.length === 0 ? (
                <p className="mhealth-biz-ok"><Icon name="check" size={13} /> {t('bhAllGood')}</p>
              ) : (
                <>
                  {bizHealth.issues.map(issue => (
                    <p className="mset-warning" key={issue.kind}>
                      <Icon name="alert" size={13} />
                      {t(BUSINESS_ISSUE_KEY[issue.kind] as never).replace('{n}', String(issue.ids.length))}
                    </p>
                  ))}
                  {/* El boton solo si hay algo que la app pueda arreglar sola:
                      ofrecerlo para problemas que necesitan una decision seria
                      prometer algo que no va a pasar. */}
                  {bizHealth.issues.some(i => isAutoFixable(i.kind)) && (
                    <button className="mhealth-biz-fix" onClick={async () => {
                      const ok = await confirm({
                        title: t('bhFixTitle'),
                        description: t('bhFixConfirm'),
                        confirmLabel: t('bhFixAction'),
                      })
                      if (ok) arreglarNegocio()
                    }}>
                      {t('bhFixAction')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/*
            IMPUESTO COBRADO DE MAS EN INGRESOS.
            Va encima de los descuadres porque es peor: un descuadre avisa de
            que algo no casa, esto es dinero que la app invento y que cuadra
            perfectamente con su propio error.
          */}
          {inflados.length > 0 && (
            <div className="mhealth-repair">
              <div className="mhealth-repair-head">
                <Icon name="alert" size={16} />
                <strong>{t('incomeFeeTitle')}</strong>
              </div>
              <p>
                {t('incomeFeeBody')
                  .replace('{n}', String(inflados.length))
                  .replace('{amount}', fmtVal(totalInflated(inflados), state.currency))}
              </p>
              <button onClick={async () => {
                const ok = await confirm({
                  title: t('incomeFeeFix'),
                  description: t('incomeFeeConfirm'),
                  confirmLabel: t('incomeFeeFix'),
                })
                if (!ok) return
                const n = repairIncomeFees()
                refreshLog()
                playSuccessHaptic()
                toast(t('incomeFeeDone').replace('{n}', String(n)), { icon: 'check', type: 'ok' })
              }}>
                <Icon name="refresh" size={14} /> {t('incomeFeeFix')}
              </button>
            </div>
          )}

          {/* Que NO cuadra y POR CUANTO: sin el monto, el usuario no sabe que
              buscar en su estado de cuenta. */}
          {(drifts.length > 0 || goalDrifts.length > 0) && (
            <div className="mhealth-drifts">
              {drifts.map(({ account, primary, secondary }) => (
                <div key={account.id} className="mhealth-drift">
                  <div className="mhealth-drift-top">
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

                  {/*
                    DOS SALIDAS, no una.

                    Antes lo unico posible era «Recalcular», que arregla TODAS
                    las cuentas a la vez. Con varias descuadradas eso es una
                    mala oferta, y para un descuadre que el usuario ya reviso
                    y da por bueno no habia salida ninguna: el aviso se
                    quedaba encendido para siempre, y un aviso que no se puede
                    atender enseña a ignorar la pantalla entera.
                  */}
                  <div className="mhealth-drift-actions">
                    <button onClick={() => {
                      const moved = recomputeAccount(account.id)
                      refreshLog()
                      toast(
                        moved
                          ? t('accountRecalculated').replace('{name}', account.name)
                          : t('balancesOk'),
                        { icon: 'check', type: 'ok' },
                      )
                    }}>
                      <Icon name="refresh" size={13} /> {t('fixThisOneLabel')}
                    </button>
                    <button className="ghost" onClick={() => {
                      dismissDrift(driftKey({ accountId: account.id, primary, secondary }))
                      toast(t('driftDismissedToast'), { icon: 'check', type: 'ok' })
                    }}>
                      {t('driftDismissLabel')}
                    </button>
                  </div>
                </div>
              ))}

              {/* Las metas, en la misma lista y con la misma salida: para el
                  usuario es el mismo problema — un numero que no cuadra. */}
              {goalDrifts.map(({ goal, diff }) => (
                <div key={goal.id} className="mhealth-drift">
                  <div className="mhealth-drift-top">
                    <span className="mhealth-drift-dot" style={{ background: goal.color }} />
                    <div className="mhealth-drift-info">
                      <strong>{goal.name}</strong>
                      <small>{t('goalSavedDrift')}</small>
                    </div>
                    <div className="mhealth-drift-amounts">
                      <span className={diff > 0 ? 'up' : 'down'}>
                        {diff > 0 ? '+' : '−'}{fmtVal(Math.abs(diff), state.currency)}
                      </span>
                    </div>
                  </div>

                  <div className="mhealth-drift-actions">
                    <button onClick={() => {
                      const moved = recomputeGoal(goal.id)
                      toast(
                        moved
                          ? t('goalRecalculated').replace('{name}', goal.name)
                          : t('balancesOk'),
                        { icon: 'check', type: 'ok' },
                      )
                    }}>
                      <Icon name="refresh" size={13} /> {t('fixThisOneLabel')}
                    </button>
                    <button className="ghost" onClick={() => {
                      dismissDrift(driftKey({ accountId: `goal:${goal.id}`, primary: diff, secondary: 0 }))
                      toast(t('driftDismissedToast'), { icon: 'check', type: 'ok' })
                    }}>
                      {t('driftDismissLabel')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Lo omitido no desaparece: se dice cuanto hay y se puede deshacer.
              Esconder algo sin dejar rastro es como se pierde dinero. */}
          {dismissedCount > 0 && (
            <button className="mhealth-restore" onClick={() => {
              restoreDrifts()
              toast(t('driftsRestoredToast'), { icon: 'refresh' })
            }}>
              {t('driftsDismissedCount').replace('{n}', String(dismissedCount))}
              <span>{t('showAgainLabel')}</span>
            </button>
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

          {/*
            HISTORIAL. Antes, «Recalcular» reescribia los saldos y ahi acababa
            todo: el usuario veia unos numeros cambiar y no tenia con que
            comprobar que cambio ni como volver atras. Pedir confianza no es lo
            mismo que dar con que comprobar.
          */}
          <div className="mhealth-log">
            <div className="mhealth-log-head">
              <strong>{t('recalcHistoryTitle')}</strong>
              {recalcs.length > 0 && (
                <button className="mhealth-log-clear" onClick={async () => {
                  const ok = await confirm({
                    title: t('recalcClearLabel'),
                    description: t('recalcClearConfirm'),
                    confirmLabel: t('recalcClearLabel'),
                    tone: 'danger',
                  })
                  if (!ok) return
                  clearRecalcs()
                  refreshLog()
                }}>{t('recalcClearLabel')}</button>
              )}
            </div>

            {recalcs.length === 0 ? (
              <p className="mhealth-log-empty">{t('recalcHistoryEmpty')}</p>
            ) : recalcs.map(entry => (
              <div key={entry.id} className={`mhealth-log-row ${entry.undone ? 'undone' : ''}`}>
                <div className="mhealth-log-id">
                  <strong>{entryLabel(entry, t)}</strong>
                  <small>{new Date(entry.at).toLocaleString(dateLocale(lang))}</small>
                </div>
                {/* Cuanto se movio, con signo: es la cifra que deja comprobar
                    si el recalculo hizo lo que el usuario esperaba. */}
                <span className={`mhealth-log-delta ${totalMoved(entry) > 0 ? 'up' : 'down'}`}>
                  {totalMoved(entry) > 0 ? '+' : '−'}{fmtVal(Math.abs(totalMoved(entry)), state.currency)}
                </span>
                {entry.undone ? (
                  <span className="mhealth-log-done">{t('recalcUndoneLabel')}</span>
                ) : (
                  <button className="mhealth-log-undo" onClick={async () => {
                    const ok = await confirm({
                      title: t('recalcUndoLabel'),
                      description: t('recalcUndoConfirm'),
                      confirmLabel: t('recalcUndoLabel'),
                    })
                    if (!ok) return
                    const devueltas = restoreAccountBalances(undoRecalc(entry.id))
                    refreshLog()
                    toast(
                      devueltas > 0
                        ? t('recalcUndoneToast').replace('{n}', String(devueltas))
                        : t('recalcNothingToUndo'),
                      { icon: devueltas > 0 ? 'refresh' : 'info', type: devueltas > 0 ? 'ok' : undefined },
                    )
                  }}>{t('recalcUndoLabel')}</button>
                )}
              </div>
            ))}
          </div>

          {/*
            PUNTOS DE RECUPERACION. Existian, se creaban solos y se contaban
            aqui... y no habia forma de restaurar ninguno: una red de seguridad
            que no se podia alcanzar. Van al final y con aviso porque esto SI
            reemplaza el libro entero.
          */}
          {snapshots.length > 0 && (
            <div className="mhealth-log">
              <div className="mhealth-log-head">
                <strong>{t('recoveryPointsLabel')}</strong>
              </div>
              <p className="mhealth-log-empty">{t('recoveryPointsHint')}</p>
              {snapshots.map(snap => (
                <div key={snap.id} className="mhealth-log-row">
                  <div className="mhealth-log-id">
                    <strong>{new Date(snap.createdAt).toLocaleString(dateLocale(lang))}</strong>
                    <small>{reasonLabel(snap.reason, t)}</small>
                  </div>
                  <button className="mhealth-log-undo" onClick={async () => {
                    const ok = await confirm({
                      title: t('recoveryRestoreLabel'),
                      description: t('recoveryRestoreConfirm'),
                      confirmLabel: t('recoveryRestoreLabel'),
                      tone: 'danger',
                    })
                    if (!ok) return
                    /*
                     * Por el sitio unico, no por `restoreBackup` a pelo.
                     *
                     * Un punto de recuperacion es la red de seguridad que la
                     * app crea sola antes de cada operacion destructiva. Si
                     * usarla te dejara los cobros apuntando a movimientos
                     * borrados, la red seria parte del problema.
                     */
                    restoreEverything(readRecoverySnapshot(snap.id))
                    refreshLog()
                    toast(t('recoveryRestoredToast'), { icon: 'check', type: 'ok' })
                  }}>{t('recoveryRestoreLabel')}</button>
                </div>
              ))}
            </div>
          )}

          <dl className="mhealth-stats">
            <div><dt>{t('accounts')}</dt><dd>{health.accounts}</dd></div>
            <div><dt>{t('movementsLabel')}</dt><dd>{health.transactions}</dd></div>
            <div><dt>{t('recoveryPointsLabel')}</dt><dd>{health.recoveryPoints}</dd></div>
          </dl>

        </section>
      </div>
    </SheetPortal>
  )
}

/** Como se llama un recalculo en el historial. */
function entryLabel(entry: RecalcEntry, t: ReturnType<typeof useT>): string {
  if (entry.scope === 'account') return entry.moves[0]?.name ?? t('recalcScopeOne')
  return t('recalcScopeAll')
}

/** Por que se creo una copia. */
function reasonLabel(reason: RecoverySnapshot['reason'], t: ReturnType<typeof useT>): string {
  if (reason === 'manual') return t('recoveryReasonManual')
  if (reason === 'pre-restore') return t('recoveryReasonPreRestore')
  if (reason === 'pre-round') return t('recoveryReasonPreRound')
  return t('recoveryReasonAuto')
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
