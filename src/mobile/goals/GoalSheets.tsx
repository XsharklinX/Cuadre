import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { sheetRoot } from '../SheetPortal'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { fmt, localToday } from '@/data/helpers'
import { planAmount, quickAmounts } from '@/data/goalPlans'
import { milestoneAlertId, topCrossedMilestone } from '@/data/goalMilestones'
import { playAchievementSound, playConfirmSound } from '@/lib/sound'
import { useT } from '@/i18n'
import type { CurrencyCode, Goal, IconName } from '@/types'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { useDialogA11y } from '../useDialogA11y'
import { useSubmitGuard } from '../useSubmitGuard'
import { AccountChoice, AccountPickSheet, goalPct } from './GoalBits'

/**
 * La cuenta de la que suele salir el ahorro de ESTA meta: la del último
 * aporte; si no hay, la de ahorros; si no, la primera que no sea tarjeta.
 */
function defaultSourceAccount(goalId: string): string {
  const { accounts, goalContributions } = useFinance.getState()
  const valid = accounts.filter(a => a.type !== 'credit')
  const last = goalContributions.find(c => c.goalId === goalId && !c.withdraw && valid.some(a => a.id === c.fromAccountId))
  return last?.fromAccountId ?? valid.find(a => a.type === 'savings')?.id ?? valid[0]?.id ?? ''
}

/*
 * APORTAR EN DOS TOQUES.
 *
 * Antes: teclado numérico, luego una lista del sistema para la cuenta, luego
 * el botón. Ahora el «+» de la tarjeta abre esto con montos de un toque, el
 * que pide tu plan y la cuenta ya elegida. «Otro…» abre el teclado de siempre.
 *
 * Los hitos (25, 50, 75 y 100 %) se celebran como antes, una vez por hito.
 */
export function QuickContributeSheet({ goal, currency, onClose, onCompleted }: {
  goal: Goal
  currency: CurrencyCode
  onClose: () => void
  /** Se llama si este aporte cierra la meta, para el confeti. */
  onCompleted: () => void
}) {
  const t = useT()
  const { accounts, contribute } = useFinance()
  const { dismissedAlerts, dismissAlert } = useSettings()
  const validAccounts = accounts.filter(a => a.type !== 'credit')
  const [accountId, setAccountId] = useState(() => defaultSourceAccount(goal.id))
  const [amount, setAmount] = useState(0)
  const [custom, setCustom] = useState(false)
  const [picker, setPicker] = useState(false)
  const { submitting, beginSubmit, endSubmit } = useSubmitGuard()
  const chips = useMemo(() => quickAmounts(goal), [goal])
  const plan = useMemo(() => planAmount(goal, localToday()), [goal])
  const remaining = Math.max(0, goal.target - goal.saved)

  useMobileBackDismiss(!custom && !picker, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, !custom && !picker)

  const submit = () => {
    if (!amount || amount <= 0 || !accountId) return
    if (!beginSubmit()) return
    try {
      contribute(goal.id, amount, accountId)
      const hito = topCrossedMilestone(goal.saved, goal.saved + amount, goal.target)
      const hitoId = hito ? milestoneAlertId(goal.id, hito) : null
      if (hito && hitoId && !dismissedAlerts.includes(hitoId)) {
        dismissAlert(hitoId)
        playAchievementSound()
        toast(
          hito === 100
            ? t('goalDoneCheer').replace('{name}', goal.name)
            : t('goalMilestoneCheer').replace('{pct}', String(hito)).replace('{name}', goal.name),
          { icon: hito === 100 ? 'trophy' : 'target', type: 'ok' },
        )
      } else {
        playConfirmSound()
      }
      if (goal.saved + amount >= goal.target) onCompleted()
      onClose()
    } catch (e: unknown) {
      endSubmit()
      toast(e instanceof Error ? e.message : t('errorContributing'), { icon: 'alert' })
    }
  }

  const account = validAccounts.find(a => a.id === accountId)
  const after = goalPct(goal.saved + amount, goal.target)

  return createPortal(
    <>
      <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('contributeToGoal').replace('{name}', goal.name)}>
        <section className="mgn-sheet" onClick={e => e.stopPropagation()}>
          <div className="mgn-sheet-head">
            <span className="mgn-sheet-icon" style={{ color: goal.color, background: `color-mix(in oklab, ${goal.color} 18%, transparent)` }}>
              <Icon name={goal.icon} size={18} />
            </span>
            <b>{t('contributeToGoal').replace('{name}', goal.name)}</b>
            <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </div>

          <AccountChoice label={t('fromAccountLine')} account={account} currency={currency} onOpen={() => setPicker(true)} />

          <div className="mgn-chips" role="group" aria-label={t('amountToContribute')}>
            {chips.map(v => (
              <button key={v} className={`mgn-chip${amount === v ? ' on' : ''}`} aria-pressed={amount === v} onClick={() => setAmount(v)}>
                {fmt(v, currency, { decimals: 0 })}
              </button>
            ))}
            {plan && plan > 0 && !chips.includes(plan) && (
              <button className={`mgn-chip plan${amount === plan ? ' on' : ''}`} aria-pressed={amount === plan} onClick={() => setAmount(plan)}>
                {t('planChip').replace('{amount}', fmt(plan, currency, { decimals: 0 }))}
              </button>
            )}
            {remaining > 0 && !chips.includes(remaining) && remaining !== plan && remaining <= (chips[chips.length - 1] ?? 0) * 4 && (
              <button className={`mgn-chip${amount === remaining ? ' on' : ''}`} aria-pressed={amount === remaining} onClick={() => setAmount(remaining)}>
                {t('completeGoalChip').replace('{amount}', fmt(remaining, currency, { decimals: 0 }))}
              </button>
            )}
            <button className={`mgn-chip${custom || (amount > 0 && !chips.includes(amount) && amount !== plan && amount !== remaining) ? ' on' : ''}`} onClick={() => setCustom(true)}>
              {amount > 0 && !chips.includes(amount) && amount !== plan && amount !== remaining ? fmt(amount, currency) : t('otherAmountChip')}
            </button>
          </div>

          {amount > 0 && (
            <p className="mgn-sheet-note">
              {t('contributePreview').replace('{pct}', String(after))}
            </p>
          )}

          <button
            className={`mgl-btn-save mgn-sheet-cta${!amount ? ' form-save-missing' : ''}`}
            style={amount ? { background: goal.color } : undefined}
            disabled={submitting}
            onClick={amount ? submit : () => setCustom(true)}
          >
            {amount ? t('contributeAmountBtn').replace('{amount}', fmt(amount, currency)) : t('missingFieldLabel').replace('{field}', t('fieldAmount'))}
          </button>
        </section>
      </div>
      {custom && (
        <MobileAmountSheet
          title={t('amountToContribute')}
          value={amount}
          currency={currency}
          onDone={v => { setAmount(v); setCustom(false) }}
          onClose={() => setCustom(false)}
        />
      )}
      {picker && (
        <AccountPickSheet title={t('sourceAccount')} accounts={validAccounts} value={accountId} onPick={setAccountId} onClose={() => setPicker(false)} />
      )}
    </>,
    sheetRoot(),
  )
}

/*
 * SACAR DINERO DE UNA META.
 *
 * Es un aporte al revés y se anota como movimiento real: la meta baja, la
 * cuenta sube y el historial lo enseña en rojo. Nada escribe un saldo a mano.
 */
export function WithdrawSheet({ goal, currency, onClose }: { goal: Goal; currency: CurrencyCode; onClose: () => void }) {
  const t = useT()
  const { accounts, withdrawFromGoal } = useFinance()
  const validAccounts = accounts.filter(a => a.type !== 'credit')
  const [accountId, setAccountId] = useState(() => defaultSourceAccount(goal.id))
  const [amount, setAmount] = useState(0)
  const [numpad, setNumpad] = useState(true)
  const [picker, setPicker] = useState(false)
  const { submitting, beginSubmit, endSubmit } = useSubmitGuard()
  useMobileBackDismiss(!numpad && !picker, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, !numpad && !picker)
  const tooMuch = amount > goal.saved + 0.005

  const submit = () => {
    if (!amount || tooMuch || !accountId) return
    if (!beginSubmit()) return
    try {
      withdrawFromGoal(goal.id, amount, accountId)
      playConfirmSound()
      toast(t('withdrawDone').replace('{amount}', fmt(amount, currency)).replace('{name}', goal.name), { icon: 'check', type: 'ok' })
      onClose()
    } catch (e: unknown) {
      endSubmit()
      toast(e instanceof Error ? e.message : t('couldNotSave'), { icon: 'alert' })
    }
  }
  const account = validAccounts.find(a => a.id === accountId)
  const missing = !amount ? t('fieldAmount') : !accountId ? t('account') : null

  return createPortal(
    <>
      <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('withdrawTitle').replace('{name}', goal.name)}>
        <section className="mgn-sheet" onClick={e => e.stopPropagation()}>
          <div className="mgn-sheet-head">
            <span className="mgn-sheet-icon withdraw"><Icon name="download" size={18} /></span>
            <b>{t('withdrawTitle').replace('{name}', goal.name)}</b>
            <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
          <button className="mgn-amount-big" onClick={() => setNumpad(true)}>
            <span className={tooMuch ? 'warn' : ''}>{fmt(amount, currency)}</span>
            <small>{t('withdrawAvailable').replace('{amount}', fmt(goal.saved, currency))}</small>
          </button>
          <AccountChoice label={t('withdrawToAccount')} account={account} currency={currency} onOpen={() => setPicker(true)} />
          <p className="mgn-sheet-note">{t('withdrawExplain')}</p>
          <button
            className={`mgl-btn-save mgn-sheet-cta${missing || tooMuch ? ' form-save-missing' : ''}`}
            disabled={submitting}
            onClick={missing ? () => (!amount ? setNumpad(true) : setPicker(true)) : submit}
          >
            {tooMuch ? t('errWithdrawTooMuch')
              : missing ? t('missingFieldLabel').replace('{field}', missing)
              : t('withdrawBtn').replace('{amount}', fmt(amount, currency))}
          </button>
        </section>
      </div>
      {numpad && (
        <MobileAmountSheet
          title={t('withdrawTitle').replace('{name}', goal.name)}
          value={amount}
          currency={currency}
          onDone={v => { setAmount(v); setNumpad(false) }}
          onClose={() => setNumpad(false)}
        />
      )}
      {picker && (
        <AccountPickSheet title={t('withdrawToAccount')} accounts={validAccounts} value={accountId} onPick={setAccountId} onClose={() => setPicker(false)} />
      )}
    </>,
    sheetRoot(),
  )
}

export interface MenuAction {
  key: string
  icon: IconName
  label: string
  danger?: boolean
  onClick: () => void
}

/** Menú de la meta: lo que antes eran tres botones repetidos en cada tarjeta. */
export function GoalMenuSheet({ goal, actions, onClose }: { goal: Goal; actions: MenuAction[]; onClose: () => void }) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={goal.name} onClick={onClose}>
      <section className="mgn-sheet mgn-menu" onClick={e => e.stopPropagation()}>
        <div className="mgn-sheet-head">
          <span className="mgn-sheet-icon" style={{ color: goal.color, background: `color-mix(in oklab, ${goal.color} 18%, transparent)` }}>
            <Icon name={goal.icon} size={18} />
          </span>
          <b>{goal.name}</b>
          <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <div className="mgn-menu-list">
          {actions.map(a => (
            <button key={a.key} className={`mgn-menu-row${a.danger ? ' danger' : ''}`} onClick={() => { onClose(); a.onClick() }}>
              <Icon name={a.icon} size={18} />
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>,
    sheetRoot(),
  )
}
