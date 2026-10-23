import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { DRIFT_CAUSE_KEY, adjustmentsInMonth, driftCauses } from '@/data/driftCauses'
import { adjustmentsOnly, currentMonthKey, fmt, localToday, visibleAccounts } from '@/data/helpers'
import { applyClose, closePlan } from '@/data/periodClose'
import { pendingFixes, reconcilePlan } from '@/data/reconcileAll'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playConfirmSound, playWarningHaptic } from '@/lib/sound'
import { useArchive } from '@/store/archive'
import { useFinance } from '@/store/finance'
import { SettingsSheet, type SheetProps } from './shared'

/**
 * CUADRE GENERAL Y CIERRE DE PERIODO.
 *
 * ── LA REGLA QUE NO SE PUEDE ROMPER ───────────────────────────────────
 * Cuadrar NO escribe el saldo. El libro se apoya en
 * `saldo = apertura + movimientos`, y escribir el saldo a mano la rompe: la
 * próxima vez que alguien toque «Recalcular», el saldo se recompone desde los
 * movimientos y el arreglo desaparece. Habrías cuadrado para que se
 * descuadrara solo otra vez.
 *
 * Por eso cuadrar anota un MOVIMIENTO de ajuste por la diferencia. El saldo
 * cuadra, la igualdad se mantiene, y queda una línea en el libro que explica
 * qué pasó. Eso ya lo hacía `reconcileAccount`; lo que faltaba era esto de
 * alrededor: todas las cuentas de una pasada, con el total a la vista y sin
 * escribir nada hasta confirmar.
 */
export function SettingsReconcile({ activeSheet, onClose }: SheetProps) {
  const t = useT()
  const finance = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const archive = useArchive()
  const [typed, setTyped] = useState<Record<string, number | null>>({})
  const [closeTyped, setCloseTyped] = useState<Record<string, number>>({})
  const [confirmando, setConfirmando] = useState(false)
  const [cerrando, setCerrando] = useState(false)

  const cuentas = useMemo(() => visibleAccounts(finance.accounts), [finance.accounts])
  const plan = useMemo(
    () => reconcilePlan(cuentas, typed, finance.currency),
    [cuentas, typed, finance.currency],
  )

  const hoy = localToday()
  const mkey = currentMonthKey()

  /** Los cuadres de este mes: tres en un mes son la señal de que algo se cuela. */
  const cuadresDelMes = useMemo(() => {
    const ajustes = adjustmentsOnly(finance.transactions, finance.categories)
    return adjustmentsInMonth(ajustes, mkey)
  }, [finance.transactions, finance.categories, mkey])

  const aplicar = () => {
    const pendientes = pendingFixes(plan)
    if (!pendientes.length) return
    let hechos = 0
    for (const fix of pendientes) {
      // `reconcileAccount` devuelve la diferencia aplicada; 0 = ya cuadraba.
      if (finance.reconcileAccount(fix.accountId, fix.balance) !== 0) hechos += 1
    }
    playConfirmSound()
    toast(t('recAppliedN').replace('{n}', String(hechos)), { icon: 'check', type: 'ok' })
    setTyped({})
    setConfirmando(false)
    onClose()
  }

  const cerrarPeriodo = () => {
    const plan2 = closePlan(finance.accounts, closeTyped, finance.transactions, hoy)
    /*
     * Lo viejo SALE del libro y se guarda en el archivo, de solo lectura. No se
     * borra nada: ver el comentario largo de `data/periodClose.ts` sobre por
     * qué se archiva en vez de poner una fecha de corte en el cálculo.
     */
    archive.push(plan2.archive, hoy)
    useFinance.setState({
      transactions: plan2.keep,
      accounts: applyClose(finance.accounts, plan2),
    })
    playConfirmSound()
    toast(t('recClosedN').replace('{n}', String(plan2.archive.length)), { icon: 'check', type: 'ok' })
    setCerrando(false)
    setCloseTyped({})
    onClose()
  }

  if (activeSheet === 'reconcileAll') {
    return (
      <SettingsSheet title={t('recTitle')} onClose={onClose}>
        <div className="mset-sheet-body">
          <p className="mrec-intro">{t('recIntro')}</p>

          {cuadresDelMes.count >= 2 && (
            <div className="mrec-warn">
              <Icon name="alert" size={15} />
              <span>
                {t('recManyThisMonth')
                  .replace('{n}', String(cuadresDelMes.count))
                  .replace('{amount}', fmt(Math.abs(cuadresDelMes.net), finance.currency, { decimals: moneyDecimals }))}
              </span>
            </div>
          )}

          {plan.entries.map(entry => {
            const cuenta = cuentas.find(a => a.id === entry.accountId)
            const delaCuenta = finance.transactions.filter(tx =>
              tx.accountId === entry.accountId || tx.fromAccount === entry.accountId || tx.toAccount === entry.accountId)
            const causas = entry.needsFix && entry.diff !== null
              ? driftCauses({ diff: entry.diff, accountTx: delaCuenta, today: hoy })
              : []
            return (
              <div key={entry.accountId} className={`mrec-row${entry.needsFix ? ' off' : ''}${entry.actual !== null && !entry.needsFix ? ' ok' : ''}`}>
                <div className="mrec-row-head">
                  <span className="mrec-name">
                    <b>{entry.name}</b>
                    <small>{t('recAppThinks').replace('{amount}', fmt(entry.expected, entry.currency, { decimals: moneyDecimals }))}</small>
                  </span>
                  {entry.diff !== null && (
                    <span className={`mrec-diff${entry.needsFix ? (entry.diff < 0 ? ' neg' : ' pos') : ' zero'}`}>
                      {!entry.needsFix
                        ? t('recMatches')
                        : `${entry.diff > 0 ? '+' : '−'}${fmt(Math.abs(entry.diff), entry.currency, { decimals: moneyDecimals })}`}
                    </span>
                  )}
                </div>
                <input
                  className="mrec-input"
                  type="number"
                  inputMode="decimal"
                  placeholder={t('recRealBalance')}
                  value={typed[entry.accountId] ?? ''}
                  onChange={e => {
                    const v = e.target.value
                    setTyped(prev => ({ ...prev, [entry.accountId]: v === '' ? null : Number(v) }))
                  }}
                />
                {/* Arreglar el síntoma cada mes no es arreglarlo: si hay una
                    pista de por qué bailó, se dice antes de aplicar nada. */}
                {causas.map(causa => (
                  <div key={causa.kind} className="mrec-cause">
                    <Icon name="info" size={13} />
                    <span>{t(DRIFT_CAUSE_KEY[causa.kind] as LangKey)}</span>
                  </div>
                ))}
                {cuenta?.currency && cuenta.currency !== finance.currency && (
                  <small className="mrec-fx">{t('recOtherCurrency').replace('{code}', cuenta.currency)}</small>
                )}
              </div>
            )
          })}

          <div className="mrec-total">
            <span>{t('recTotalDiff')}</span>
            <b className={plan.totalDiff < 0 ? 'expense' : plan.totalDiff > 0 ? 'income' : ''}>
              {plan.totalDiff > 0 ? '+' : plan.totalDiff < 0 ? '−' : ''}
              {fmt(Math.abs(plan.totalDiff), finance.currency, { decimals: moneyDecimals })}
            </b>
          </div>
          {plan.otherCurrencies > 0 && (
            <small className="mrec-fx">{t('recExcludedFx').replace('{n}', String(plan.otherCurrencies))}</small>
          )}

          {!confirmando ? (
            <button
              className="mset-sheet-primary"
              disabled={plan.toFix === 0}
              onClick={() => { setConfirmando(true); playWarningHaptic() }}
            >
              {plan.toFix === 0 ? t('recNothingToFix') : t('recReview').replace('{n}', String(plan.toFix))}
            </button>
          ) : (
            <>
              <p className="mrec-confirm">{t('recConfirmText').replace('{n}', String(plan.toFix))}</p>
              <button className="mset-sheet-primary" onClick={aplicar}>{t('recApply')}</button>
              <button className="mset-sheet-cancel" onClick={() => setConfirmando(false)}>{t('cancel')}</button>
            </>
          )}
        </div>
      </SettingsSheet>
    )
  }

  if (activeSheet === 'periodClose') {
    const plan2 = closePlan(finance.accounts, closeTyped, finance.transactions, hoy)
    return (
      <SettingsSheet title={t('pcTitle')} onClose={onClose}>
        <div className="mset-sheet-body">
          <p className="mrec-intro">{t('pcIntro')}</p>
          <div className="mrec-warn">
            <Icon name="info" size={15} />
            <span>{t('pcKeepsHistory')}</span>
          </div>

          {visibleAccounts(finance.accounts).map(a => (
            <div key={a.id} className="mrec-row">
              <div className="mrec-row-head">
                <span className="mrec-name">
                  <b>{a.name}</b>
                  <small>{t('recAppThinks').replace('{amount}', fmt(a.balance, a.currency ?? finance.currency, { decimals: moneyDecimals }))}</small>
                </span>
              </div>
              <input
                className="mrec-input"
                type="number"
                inputMode="decimal"
                placeholder={t('recRealBalance')}
                value={closeTyped[a.id] ?? ''}
                onChange={e => {
                  const v = Number(e.target.value)
                  setCloseTyped(prev => ({ ...prev, [a.id]: v }))
                }}
              />
            </div>
          ))}

          <div className="mrec-total">
            <span>{t('pcWillArchive')}</span>
            <b>{t('pcNMovements').replace('{n}', String(plan2.archive.length))}</b>
          </div>

          {!cerrando ? (
            <button className="mset-sheet-danger" onClick={() => { setCerrando(true); playWarningHaptic() }}>
              {t('pcStart')}
            </button>
          ) : (
            <>
              <p className="mrec-confirm">{t('pcConfirmText').replace('{n}', String(plan2.archive.length))}</p>
              <button className="mset-sheet-danger" onClick={cerrarPeriodo}>{t('pcConfirm')}</button>
              <button className="mset-sheet-cancel" onClick={() => setCerrando(false)}>{t('cancel')}</button>
            </>
          )}
        </div>
      </SettingsSheet>
    )
  }

  if (activeSheet === 'archive') {
    return (
      <SettingsSheet title={t('arcTitle')} onClose={onClose}>
        <div className="mset-sheet-body">
          {archive.periods.length === 0 ? (
            <p className="mrec-intro">{t('arcEmpty')}</p>
          ) : (
            <>
              <p className="mrec-intro">{t('arcIntro')}</p>
              {archive.periods.map(p => (
                <div key={p.closedAt} className="mrec-row">
                  <div className="mrec-row-head">
                    <span className="mrec-name">
                      <b>{t('arcClosedOn').replace('{date}', p.cutoff)}</b>
                      <small>{t('pcNMovements').replace('{n}', String(p.transactions.length))}</small>
                    </span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </SettingsSheet>
    )
  }

  return null
}
