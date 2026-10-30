import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { toast } from '@/components/ui/Toast'
import { useFinance } from '@/store/finance'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useSettings } from '@/store/settings'
import { fmt, localToday, savingsBalance } from '@/data/helpers'
import { goalStatus, isGoalDone, monthsToAchieve } from '@/data/goalPlans'
import { playAchievementSound, playDeleteSound, playSoftHaptic } from '@/lib/sound'
import { useT } from '@/i18n'
import type { CurrencyCode, Goal, ViewProps } from '@/types'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { useGoalsRequest } from './goals/goalsRequest'
import { Confetti, ProgressRing, goalPct, statusPill, useLongPress, useRingsIntro } from './goals/GoalBits'
import { GoalMenuSheet, QuickContributeSheet, WithdrawSheet, type MenuAction } from './goals/GoalSheets'
import { GoalDetail } from './goals/GoalDetail'
import { GoalForm } from './goals/GoalForm'

type Sheet =
  | { type: 'add' }
  | { type: 'edit'; goal: Goal; presetAuto?: number }
  | { type: 'detail'; goal: Goal; origin: DOMRect | null }
  | null

/*
 * LA TARJETA NUEVA.
 *
 * Anillo grande con el porcentaje dentro, «Ahorrado: X de Y», una etiqueta de
 * estado que dice la verdad y un solo «+» para aportar. Editar, sacar, marcar
 * como lograda y eliminar van en el menú (mantener pulsado, o «⋯» en el
 * detalle): antes eran tres botones repetidos en cada tarjeta y Eliminar
 * quedaba a un dedo de Aportar.
 */
function GoalCard({ goal, currency, index, intro, onOpen, onQuick, onMenu }: {
  goal: Goal
  currency: CurrencyCode
  index: number
  intro: boolean
  onOpen: (rect: DOMRect | null) => void
  onQuick: () => void
  onMenu: () => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const goalContributions = useFinance(s => s.goalContributions)
  const ref = useRef<HTMLDivElement>(null)
  const p = goalPct(goal.saved, goal.target)
  const done = isGoalDone(goal)
  const status = useMemo(() => goalStatus(goal, goalContributions, localToday()), [goal, goalContributions])
  const money = (n: number) => fmt(n, currency, { decimals: 0 })
  const pill = statusPill(status, t, lang, money)
  const achievedMonths = done ? monthsToAchieve(goal, goalContributions) : null
  const press = useLongPress(onMenu)

  return (
    <div
      ref={ref}
      className={`mgl-card mgn-card${done ? ' done' : ''}`}
      style={{ ['--c' as string]: goal.color, animationDelay: intro ? `${index * 60}ms` : undefined }}
      role="button"
      tabIndex={0}
      aria-label={`${goal.name}, ${p}%`}
      {...press.handlers}
      onClick={() => { if (press.consumeLong()) return; onOpen(ref.current?.getBoundingClientRect() ?? null) }}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(ref.current?.getBoundingClientRect() ?? null) }}
    >
      <ProgressRing pct={p} color={goal.color} size={58} stroke={6} intro={intro} delay={index * 90}>
        {done ? <Icon name="trophy" size={20} style={{ color: goal.color }} /> : <strong className="mgn-card-pct">{p}%</strong>}
      </ProgressRing>
      <div className="mgn-card-info">
        <strong>{goal.name}</strong>
        <span className="mgl-card-amounts">
          {t('goalSavedLine')
            .replace('{saved}', fmt(goal.saved, currency, { decimals: 0 }))
            .replace('{target}', fmt(goal.target, currency, { decimals: 0 }))}
        </span>
        <span className={`mgn-pill ${pill.tone}`}>
          {done && achievedMonths
            ? (achievedMonths === 1 ? t('goalAchievedInOne') : t('goalAchievedIn').replace('{n}', String(achievedMonths)))
            : pill.text}
        </span>
      </div>
      {!done && (
        <button
          className="mgn-card-add"
          aria-label={t('contributeToGoal').replace('{name}', goal.name)}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onQuick() }}
        >
          <Icon name="plus" size={18} />
        </button>
      )}
    </div>
  )
}

/*
 * ORDENAR ARRASTRANDO.
 *
 * Cada fila se arrastra por su asa; al cruzar la mitad de la vecina se
 * intercambian. Las flechas hacen lo mismo para quien no quiera arrastrar.
 * La primera es la meta principal: la que propone el «+» grande en Metas.
 */
function ReorderList({ goals, onDone }: { goals: Goal[]; onDone: (ids: string[]) => void }) {
  const t = useT()
  const [order, setOrder] = useState(() => goals.map(g => g.id))
  const [drag, setDrag] = useState<{ id: string; dy: number } | null>(null)
  const startY = useRef(0)
  const rows = useRef(new Map<string, HTMLDivElement>())
  const byId = new Map(goals.map(g => [g.id, g]))

  const move = (from: number, to: number) => setOrder(o => {
    if (to < 0 || to >= o.length) return o
    const next = [...o]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    return next
  })

  const onDown = (id: string) => (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    startY.current = e.clientY
    setDrag({ id, dy: 0 })
    playSoftHaptic()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag) return
    const dy = e.clientY - startY.current
    const idx = order.indexOf(drag.id)
    const el = rows.current.get(drag.id)
    const h = (el?.offsetHeight ?? 60) + 8
    if (dy > h / 2 && idx < order.length - 1) { move(idx, idx + 1); startY.current += h; setDrag({ id: drag.id, dy: dy - h }); playSoftHaptic(); return }
    if (dy < -h / 2 && idx > 0) { move(idx, idx - 1); startY.current -= h; setDrag({ id: drag.id, dy: dy + h }); playSoftHaptic(); return }
    setDrag({ id: drag.id, dy })
  }
  const onUp = () => setDrag(null)

  return (
    <div className="mgn-reorder">
      <p className="mgn-sheet-note">{t('reorderHint')}</p>
      {order.map((id, i) => {
        const g = byId.get(id)
        if (!g) return null
        const dragging = drag?.id === id
        return (
          <div
            key={id}
            ref={el => { if (el) rows.current.set(id, el); else rows.current.delete(id) }}
            className={`mgn-reorder-row${dragging ? ' dragging' : ''}${i === 0 ? ' main' : ''}`}
            style={{ ['--c' as string]: g.color, transform: dragging ? `translateY(${drag.dy}px) scale(1.02)` : undefined }}
          >
            <span className="mgn-sheet-icon" style={{ color: g.color, background: `color-mix(in oklab, ${g.color} 18%, transparent)` }}>
              <Icon name={i === 0 ? 'pin' : g.icon} size={16} />
            </span>
            <span className="mgn-reorder-name">
              <b>{g.name}</b>
              {i === 0 && <small>{t('mainGoalLabel')}</small>}
            </span>
            <button className="mgn-reorder-arrow" aria-label={t('moveUp')} disabled={i === 0} onClick={() => move(i, i - 1)}>
              <Icon name="arrowUp" size={14} />
            </button>
            <button className="mgn-reorder-arrow" aria-label={t('moveDown')} disabled={i === order.length - 1} onClick={() => move(i, i + 1)}>
              <Icon name="arrowDn" size={14} />
            </button>
            <span
              className="mgn-reorder-grip"
              aria-hidden="true"
              onPointerDown={onDown(id)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <Icon name="grip" size={18} />
            </span>
          </div>
        )
      })}
      <button className="mgl-add-goal" onClick={() => onDone(order)}>
        <Icon name="check" size={18} /> {t('reorderDone')}
      </button>
    </div>
  )
}

export function MobileGoals(_props: ViewProps) {
  const t = useT()
  const decimals = useMoneyDecimals()
  const {
    accounts, goals, goalContributions, addGoal, updateGoal, deleteGoal, restoreGoal, currency,
    reorderGoals, setGoalAchieved, setGoalAutoPaused,
  } = useFinance()
  const cur = currency as CurrencyCode
  const [sheet, setSheet] = useState<Sheet>(null)
  const [quick, setQuick] = useState<Goal | null>(null)
  const [withdraw, setWithdraw] = useState<Goal | null>(null)
  const [menu, setMenu] = useState<Goal | null>(null)
  const [reordering, setReordering] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [confetti, setConfetti] = useState(false)
  const intro = useRingsIntro()

  const active = goals.filter(g => !isGoalDone(g))
  const achieved = goals.filter(isGoalDone)
  const fresh = (g: Goal) => goals.find(x => x.id === g.id) ?? g

  // El «+» grande, en Metas, puede pedir «aportar a la principal» o «nueva meta».
  const request = useGoalsRequest(s => s.request)
  const clearRequest = useGoalsRequest(s => s.clear)
  useEffect(() => {
    if (!request) return
    if (request === 'new') setSheet({ type: 'add' })
    else if (request === 'contributeMain' && active[0]) setQuick(active[0])
    clearRequest()
  }, [request, active, clearRequest])

  const askDelete = (g: Goal) => {
    const contribs = goalContributions.filter(c => c.goalId === g.id)
    playDeleteSound()
    deleteWithUndo({
      message: t('goalDeleted'),
      onDelete: () => deleteGoal(g.id),
      onRestore: () => restoreGoal(g, contribs),
    })
    setSheet(null)
  }

  const celebrate = useCallback(() => {
    playAchievementSound()
    setConfetti(true)
  }, [])

  const menuActions = (g0: Goal): MenuAction[] => {
    const g = fresh(g0)
    const done = isGoalDone(g)
    const list: MenuAction[] = []
    if (!done) list.push({ key: 'add', icon: 'plus', label: t('contribute'), onClick: () => setQuick(g) })
    if (g.saved > 0) list.push({ key: 'out', icon: 'download', label: t('menuWithdraw'), onClick: () => setWithdraw(g) })
    list.push({ key: 'edit', icon: 'edit', label: t('edit'), onClick: () => setSheet({ type: 'edit', goal: g }) })
    if (!done) {
      list.push({
        key: 'done', icon: 'trophy', label: t('menuMarkDone'),
        onClick: () => { setGoalAchieved(g.id, true); celebrate(); toast(t('goalMarkedDone').replace('{name}', g.name), { icon: 'trophy', type: 'ok' }) },
      })
    } else if (g.achievedAt && g.saved < g.target) {
      list.push({
        key: 'reopen', icon: 'repeat', label: t('menuReopen'),
        onClick: () => { setGoalAchieved(g.id, false); toast(t('goalReopened'), { icon: 'check', type: 'ok' }) },
      })
    }
    if (g.autoContribute && !done) {
      list.push(g.autoPaused
        ? { key: 'resume', icon: 'repeat', label: t('menuResumeAuto'), onClick: () => { setGoalAutoPaused(g.id, false); toast(t('autoResumedToast'), { icon: 'repeat', type: 'ok' }) } }
        : { key: 'pause', icon: 'pause', label: t('menuPauseAuto'), onClick: () => { setGoalAutoPaused(g.id, true); toast(t('autoPausedToast'), { icon: 'pause' }) } })
    }
    list.push({ key: 'del', icon: 'trash', label: t('delete'), danger: true, onClick: () => askDelete(g) })
    return list
  }

  const totalSaved = active.reduce((s, g) => s + g.saved, 0)
  const totalTarget = active.reduce((s, g) => s + g.target, 0)
  const overallPct = goalPct(totalSaved, totalTarget)
  const backedSavings = savingsBalance(accounts)
  const savingsCoverage = totalSaved > 0 ? Math.min(999, Math.round(backedSavings / totalSaved * 100)) : 0
  const achievedSaved = achieved.reduce((s, g) => s + g.saved, 0)

  const card = (g: Goal, i: number) => (
    <GoalCard
      key={g.id}
      goal={g}
      currency={cur}
      index={i}
      intro={intro}
      onOpen={rect => setSheet({ type: 'detail', goal: g, origin: rect })}
      onQuick={() => setQuick(g)}
      onMenu={() => setMenu(g)}
    />
  )

  return (
    <div className="mgl-root mgn-root">
      <div className="mgn-head">
        <div>
          <span className="mgn-eyebrow">{t('goalsEyebrow')}</span>
          <h2>{t('goalsTitle')}</h2>
        </div>
        {active.length >= 2 && !reordering && (
          <button className="mgn-head-btn" aria-label={t('reorderGoals')} onClick={() => setReordering(true)}>
            <Icon name="grip" size={16} /> <span className="mgn-head-btn-text">{t('reorderGoals')}</span>
          </button>
        )}
        <button className="mgn-head-add" aria-label={t('newGoal')} onClick={() => setSheet({ type: 'add' })}>
          <Icon name="plus" size={20} />
        </button>
      </div>

      {active.length > 0 && !reordering && (
        <div className="mgn-summary">
          <span className="mgn-summary-label">{t('goalsSavedOf')}</span>
          <div className="mgn-summary-line">
            <AnimatedMoney value={totalSaved} decimals={decimals} className="mgn-summary-value" />
            <span className="mgn-summary-of">{t('ofTargetLine').replace('{target}', fmt(totalTarget, cur, { decimals }))}</span>
          </div>
          <div className="mgn-bar" role="progressbar" aria-valuenow={overallPct} aria-valuemin={0} aria-valuemax={100}>
            <i style={{ width: `${overallPct}%` }} />
          </div>
          {backedSavings > 0 && (
            <small className="mgn-summary-foot">
              {t('goalsCoverage').replace('{pct}', String(savingsCoverage)).replace('{amount}', fmt(backedSavings, cur, { decimals }))}
            </small>
          )}
        </div>
      )}

      {goals.length === 0 ? (
        <div className="mgl-empty">
          <EmptyArt kind="goals" />
          <p>{t('noGoals')}</p>
          <button className="mgl-empty-btn" onClick={() => setSheet({ type: 'add' })}>
            {t('createFirstGoal')}
          </button>
        </div>
      ) : reordering ? (
        <div className="mgl-list">
          <ReorderList
            goals={active}
            onDone={ids => { reorderGoals([...ids, ...achieved.map(g => g.id)]); setReordering(false) }}
          />
        </div>
      ) : (
        <div className="mgl-list">
          {active.map(card)}
          {active.length === 0 && (
            <p className="mgn-sheet-note">{t('allGoalsDone')}</p>
          )}
          <button className="mgl-add-goal" onClick={() => setSheet({ type: 'add' })}>
            <Icon name="plus" size={18} /> {t('newGoal')}
          </button>

          {achieved.length > 0 && (
            <>
              <button className={`mgn-wins${showDone ? ' open' : ''}`} aria-expanded={showDone} onClick={() => setShowDone(o => !o)}>
                <Icon name="trophy" size={18} />
                <b>{t('goalsAchievedGroup').replace('{n}', String(achieved.length))}</b>
                <small>{t('goalsAchievedSaved').replace('{amount}', fmt(achievedSaved, cur, { decimals }))}</small>
                <Icon name="arrowUp" size={12} className="txf-more-chev" />
              </button>
              {showDone && <div className="mgn-wins-list txf-more">{achieved.map(card)}</div>}
            </>
          )}
        </div>
      )}

      {sheet?.type === 'add' && (
        <GoalForm
          currency={cur}
          onSave={data => { addGoal({ ...data, saved: 0 }); setSheet(null) }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'edit' && (
        <GoalForm
          initial={fresh(sheet.goal)}
          presetAuto={sheet.presetAuto}
          currency={cur}
          onSave={data => {
            // Lo que el formulario no conoce se borra explícitamente, como antes.
            updateGoal(sheet.goal.id, { autoPaused: undefined, ...data })
            setSheet(null)
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet?.type === 'detail' && (
        <GoalDetail
          goal={fresh(sheet.goal)}
          origin={sheet.origin}
          currency={cur}
          onClose={() => setSheet(null)}
          onContribute={() => setQuick(fresh(sheet.goal))}
          onMenu={() => setMenu(fresh(sheet.goal))}
          onUseAmount={amount => setSheet({ type: 'edit', goal: fresh(sheet.goal), presetAuto: amount })}
        />
      )}

      {quick && (
        <QuickContributeSheet goal={fresh(quick)} currency={cur} onClose={() => setQuick(null)} onCompleted={celebrate} />
      )}
      {withdraw && <WithdrawSheet goal={fresh(withdraw)} currency={cur} onClose={() => setWithdraw(null)} />}
      {menu && <GoalMenuSheet goal={fresh(menu)} actions={menuActions(menu)} onClose={() => setMenu(null)} />}
      {confetti && <Confetti onDone={() => setConfetti(false)} />}
    </div>
  )
}
