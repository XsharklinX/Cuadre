import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { categoryRollover, fmt, fmtCompact, prevMonthKey, transactionsForTotals, txForMonth } from '@/data/helpers'
import { computeEnvelopeSummary } from '@/data/envelopes'
import { CAT_COLORS } from '@/constants'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useCategoryName, useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { MobileAmountSheet } from './MobileAmountSheet'
import { SheetPortal } from './SheetPortal'
import type { Category, CurrencyCode, IconName, ViewProps } from '@/types'

const COLORS = CAT_COLORS

const ALL_ICONS: IconName[] = [
  'cart','food','car','bolt','heart','home','bag','book','wallet','laptop','trend','play',
  'music','coffee','phone','gym','bus','building','gamepad','gift','scissors','baby','paw','pill',
  'plane','briefcase','shirt','pizza','star','fuel','flame','soda',
  'tree','sun','bike','train','tv','monitor','headphones','clock','key','tool',
  'brush','graduation','stethoscope','salad','wine','crown','trophy','shield','map','package',
]

export function MobileBudgets({ txns, mkey }: ViewProps) {
  const { accounts, categories, currency, addCategory, updateCategory, deleteCategory, transferEnvelopeFunds } = useFinance()
  const t = useT()
  const settings = useSettings()
  const lang = (settings.language ?? 'es') as 'en' | 'es'
  const budgetAlertThresholds = settings.budgetAlertThresholds
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)

  const visTxns = transactionsForTotals(txns, accounts, currency)
  const monthTx = txForMonth(visTxns, mkey)
  const prevMonthTx = txForMonth(visTxns, prevMonthKey(mkey))
  const cats = categories.filter(c => c.type === 'expense')

  const spent: Record<string, number> = {}
  monthTx.forEach(tx => {
    if (tx.type === 'expense' && tx.categoryId)
      spent[tx.categoryId] = (spent[tx.categoryId] ?? 0) + tx.amount
  })

  const rollover: Record<string, number> = {}
  const effectiveBudget: Record<string, number> = {}
  cats.forEach(c => {
    rollover[c.id] = categoryRollover(c, prevMonthTx, settings.budgetRollover)
    effectiveBudget[c.id] = c.budget > 0 ? Math.max(0, c.budget + rollover[c.id]) : c.budget
  })

  const totalBudget = cats.reduce((s, c) => s + effectiveBudget[c.id], 0)
  const totalSpent  = cats.reduce((s, c) => s + (spent[c.id] ?? 0), 0)
  const totalLeft   = totalBudget - totalSpent
  const globalPct   = totalBudget > 0 ? Math.min(100, totalSpent / totalBudget * 100) : 0
  const overCount   = cats.filter(c => (spent[c.id] ?? 0) > effectiveBudget[c.id] && c.budget > 0).length

  // Orden por "más ajustado primero": las categorías con presupuesto se ordenan
  // por porcentaje gastado descendente (los riesgos arriba), y las sin límite
  // quedan al final. Así el usuario ve de un vistazo dónde está apretado sin
  // scrollear. El orden se recalcula por mes, así que es estable dentro de la vista.
  const orderedCats = [...cats].sort((a, b) => {
    const ab = effectiveBudget[a.id]; const bb = effectiveBudget[b.id]
    const aHas = ab > 0; const bHas = bb > 0
    if (aHas !== bHas) return aHas ? -1 : 1
    if (!aHas) return 0
    return (spent[b.id] ?? 0) / bb - (spent[a.id] ?? 0) / ab
  })

  const envelopes = cats.filter(c => c.budget > 0)
  const envelopeSummary = computeEnvelopeSummary(cats, monthTx)
  const assignedPct = envelopeSummary.income > 0
    ? Math.min(100, Math.max(0, Math.round(envelopeSummary.assigned / envelopeSummary.income * 100)))
    : 0

  const save = (fields: { name: string; budget: number; color: string; icon: IconName; rolloverEnabled: boolean }) => {
    if (!fields.name.trim()) { toast(t('enterCategoryName'), { icon: 'alert' }); return }
    if (editing === 'new') {
      addCategory({ name: fields.name.trim(), type: 'expense', budget: fields.budget, color: fields.color, icon: fields.icon, rolloverEnabled: fields.rolloverEnabled })
      toast(t('categoryCreatedSimple'), { icon: 'check', type: 'ok' })
    } else if (editing) {
      updateCategory(editing.id, { name: fields.name.trim(), budget: fields.budget, color: fields.color, icon: fields.icon, rolloverEnabled: fields.rolloverEnabled })
      toast(t('categoryUpdated'), { icon: 'check', type: 'ok' })
    }
    setEditing(null)
  }

  const remove = (cat: Category) => {
    try {
      deleteCategory(cat.id)
      toast(t('categoryDeleted'), { icon: 'trash' })
      setEditing(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('couldNotDelete'), { icon: 'alert' })
    }
  }

  const moveMoney = (fromCategoryId: string, toCategoryId: string, amount: number) => {
    try {
      transferEnvelopeFunds(fromCategoryId, toCategoryId, amount)
      toast(t('envelopeTransferSuccess'), { icon: 'check', type: 'ok' })
      setTransferOpen(false)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('couldNotDelete'), { icon: 'alert' })
    }
  }

  useMobileBackDismiss(!!editing, () => setEditing(null))
  useMobileBackDismiss(transferOpen, () => setTransferOpen(false))

  return (
    <div className="mbud-root">
      <div className="mbud-envelope-card">
        <div className="mbud-envelope-top">
          <div className="mbud-envelope-col">
            <span>{t('envelopeIncomeLabel')}</span>
            <strong><AnimatedMoney value={envelopeSummary.income} compact /></strong>
          </div>
          <div className="mbud-envelope-col">
            <span>{t('envelopeAssignedLabel')}</span>
            <strong><AnimatedMoney value={envelopeSummary.assigned} compact /></strong>
          </div>
          <div className="mbud-envelope-col unassigned">
            <span>{t('envelopeUnassignedLabel')}</span>
            <strong className={envelopeSummary.unassigned < 0 ? 'over' : envelopeSummary.unassigned === 0 ? 'zero' : ''}>
              <AnimatedMoney value={envelopeSummary.unassigned} compact />
            </strong>
          </div>
        </div>
        <div className="mbud-envelope-bar-track">
          <div className="mbud-envelope-bar-fill" style={{
            width: `${assignedPct}%`,
            background: envelopeSummary.unassigned < 0 ? '#ff6b8a' : 'var(--accent, #ffdd3d)',
          }} />
        </div>
        <div className="mbud-envelope-foot">
          {envelopeSummary.unassigned < 0 ? (
            <span className="over"><Icon name="alert" size={12} /> {t('envelopeOverAssignedHint')}</span>
          ) : envelopeSummary.unassigned === 0 && envelopeSummary.income > 0 ? (
            <span className="zero"><Icon name="check" size={12} /> {t('envelopeAllAssignedHint')}</span>
          ) : <span />}
          <button
            className="mbud-move-btn"
            onClick={() => envelopes.length < 2
              ? toast(t('envelopeTransferEmptyHint'), { icon: 'alert' })
              : setTransferOpen(true)}
          >
            <Icon name="refresh" size={13} /> {t('moveMoneyLabel')}
          </button>
        </div>
      </div>

      <div className="mbud-summary">
        <div className="mbud-summary-top">
          <div>
            <span className="mbud-summary-label">{t('totalBudgetLabel')}</span>
            <strong className="mbud-summary-total">
              <AnimatedMoney value={totalBudget} compact />
            </strong>
          </div>
          <button className="mbud-add-btn" onClick={() => setEditing('new')}>
            <Icon name="plus" size={18} /> {t('new')}
          </button>
        </div>

        <div className="mbud-global-bar-wrap">
          <div className="mbud-global-bar-track">
            <div className="mbud-global-bar-fill" style={{
              width: `${globalPct}%`,
              background: globalPct >= 100 ? '#ff6b8a' : globalPct >= 80 ? '#f59e0b' : 'var(--accent, #ffdd3d)',
            }} />
          </div>
          <span className={`mbud-global-pct${globalPct >= 100 ? ' over' : globalPct >= 80 ? ' warn' : ''}`}>
            {Math.round(globalPct)}%
          </span>
        </div>

        <div className="mbud-summary-pills">
          <div className="mbud-pill">
            <Icon name="arrowUp" size={13} style={{ color: '#ff6b8a' }} />
            <div>
              <strong><AnimatedMoney value={totalSpent} compact /></strong>
              <small>{t('spentLabel')}</small>
            </div>
          </div>
          <div className="mbud-pill-sep" />
          <div className="mbud-pill">
            <Icon name="target" size={13} style={{ color: '#35d0a2' }} />
            <div>
              <strong className={totalLeft < 0 ? 'over' : ''}><AnimatedMoney value={Math.abs(totalLeft)} compact /></strong>
              <small>{totalLeft < 0 ? t('overBudgetLabel') : t('availableLabel')}</small>
            </div>
          </div>
          {overCount > 0 && (
            <>
              <div className="mbud-pill-sep" />
              <div className="mbud-pill">
                <Icon name="alert" size={13} style={{ color: '#f59e0b' }} />
                <div>
                  <strong style={{ color: '#f59e0b' }}>{overCount}</strong>
                  <small>{t('overLimitLabel')}</small>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {cats.length > 0 && (
        <div className="mbud-list-head">
          <div>
            <span>{t('categoriesTitle')}</span>
            <small>{t('monthlyBudget')}</small>
          </div>
          <strong>{cats.length}</strong>
        </div>
      )}

      <div className="mbud-list">
        {cats.length === 0 ? (
          <div className="mbud-empty">
            <span><Icon name="target" size={32} /></span>
            <strong>{t('noBudgetsYet')}</strong>
            <p>{t('createExpenseCategoriesHint')}</p>
            <button onClick={() => setEditing('new')}>
              <Icon name="plus" size={16} /> {t('createFirstCategory')}
            </button>
          </div>
        ) : (
          orderedCats.map(cat => {
            const s = spent[cat.id] ?? 0
            const budget = effectiveBudget[cat.id]
            const roll = rollover[cat.id]
            const pct = budget > 0 ? Math.min(100, s / budget * 100) : 0
            const rawPct = budget > 0 ? Math.round(s / budget * 100) : 0
            const over = budget > 0 && s > budget
            const left = budget - s
            // El color de la barra ES el estado: verde va bien, ámbar cerca del
            // límite (≥80%), rojo excedido. La categoría ya la identifica el chip
            // de icono a color, así que la barra queda libre para comunicar salud.
            const statusColor = over ? '#ff6b8a' : pct >= 80 ? '#f59e0b' : '#35d0a2'
            const reachedThreshold = budget > 0
              ? [...budgetAlertThresholds].sort((a, b) => a - b).filter(threshold => pct >= threshold).pop()
              : undefined
            return (
              <button key={cat.id} className="mbud-row" onClick={() => setEditing(cat)}>
                <span className="mbud-row-icon" style={{
                  color: cat.color,
                  background: `color-mix(in oklab, ${cat.color} 16%, transparent)`,
                }}>
                  <Icon name={cat.icon} size={20} />
                </span>
                <div className="mbud-row-body">
                  <div className="mbud-row-top">
                    <span className="mbud-row-name">{translateCategoryName(cat, lang)}</span>
                    {budget > 0 ? (
                      <span className={`mbud-row-status${over ? ' over' : pct >= 80 ? ' warn' : ' ok'}`}>
                        {over
                          ? t('budgetOverShort')
                          : t('budgetLeftShort').replace('{amount}', fmtCompact(left, currency))}
                      </span>
                    ) : (
                      <span className="mbud-row-status muted">{t('noLimitLabel')}</span>
                    )}
                  </div>
                  {budget > 0 && (
                    <div className="mbud-row-bar">
                      <div className="mbud-row-fill" style={{ width: `${pct}%`, background: statusColor }} />
                    </div>
                  )}
                  <div className="mbud-row-meta">
                    <span>
                      {budget > 0
                        ? `${fmtCompact(s, currency)} / ${fmtCompact(budget, currency)} · ${rawPct}%`
                        : t('spentAmount').replace('{amount}', fmtCompact(s, currency))}
                    </span>
                  </div>
                  {(cat.rolloverEnabled || settings.budgetRollover) && roll !== 0 && (
                    <div className="mbud-row-rollover">
                      <Icon name="repeat" size={11} />
                      {roll > 0
                        ? t('rolloverAddedLabel').replace('{amount}', fmtCompact(roll, currency))
                        : t('rolloverDeductedLabel').replace('{amount}', fmtCompact(Math.abs(roll), currency))}
                    </div>
                  )}
                  {reachedThreshold !== undefined && (
                    <div className={`mbud-row-rollover${over ? ' over' : pct >= 80 ? ' warn' : ''}`}>
                      <Icon name={over ? 'alert' : 'bell'} size={11} />
                      {t('budgetThresholdBody')
                        .replace('{threshold}', String(reachedThreshold))
                        .replace('{spent}', fmtCompact(s, currency))
                        .replace('{budget}', fmtCompact(budget, currency))
                        .replace('{pct}', String(Math.round(pct)))}
                    </div>
                  )}
                </div>
                <Icon name="arrowUp" size={14} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)', flexShrink: 0 }} />
              </button>
            )
          })
        )}
      </div>

      {editing !== null && (
        <BudgetEditor
          category={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSave={save}
          onDelete={editing !== 'new' ? remove : undefined}
        />
      )}

      {transferOpen && (
        <EnvelopeTransferSheet
          envelopes={envelopes}
          lang={lang}
          currency={currency}
          onClose={() => setTransferOpen(false)}
          onMove={moveMoney}
        />
      )}
    </div>
  )
}

function EnvelopeTransferSheet({
  envelopes,
  lang,
  currency,
  onClose,
  onMove,
}: {
  envelopes: Category[]
  lang: 'en' | 'es'
  currency: CurrencyCode
  onClose: () => void
  onMove: (fromCategoryId: string, toCategoryId: string, amount: number) => void
}) {
  const t = useT()
  const [fromId, setFromId] = useState(envelopes[0]?.id ?? '')
  const [toId, setToId] = useState(envelopes.find(e => e.id !== envelopes[0]?.id)?.id ?? '')
  const [amount, setAmount] = useState(0)
  const [amountSheet, setAmountSheet] = useState(false)

  const from = envelopes.find(e => e.id === fromId)
  const to = envelopes.find(e => e.id === toId)
  const canMove = !!from && !!to && from.id !== to.id && amount > 0 && amount <= from.budget

  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !amountSheet)
  useMobileBackDismiss(amountSheet, () => setAmountSheet(false))

  return (
    <>
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet mbud-editor-overlay" role="dialog" aria-modal="true" aria-label={t('envelopeTransferTitle')} onClick={onClose}>
      <section className="mbud-editor-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{t('envelopeTransferTitle')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mbud-editor-body">
          <div className="mbud-field">
            <span>{t('envelopeTransferFromLabel')}</span>
            <div className="mbud-envelope-chip-row">
              {envelopes.map(env => (
                <button
                  key={env.id}
                  className={`mbud-envelope-chip${fromId === env.id ? ' on' : ''}`}
                  disabled={env.id === toId}
                  onClick={() => setFromId(env.id)}
                  style={fromId === env.id ? { color: env.color, background: `color-mix(in oklab, ${env.color} 18%, transparent)` } : {}}
                >
                  <Icon name={env.icon} size={14} />
                  {translateCategoryName(env, lang)}
                </button>
              ))}
            </div>
            {from && <small className="mbud-envelope-chip-hint">{t('envelopeTransferAvailable').replace('{amount}', fmt(from.budget, currency))}</small>}
          </div>

          <div className="mbud-field">
            <span>{t('envelopeTransferToLabel')}</span>
            <div className="mbud-envelope-chip-row">
              {envelopes.map(env => (
                <button
                  key={env.id}
                  className={`mbud-envelope-chip${toId === env.id ? ' on' : ''}`}
                  disabled={env.id === fromId}
                  onClick={() => setToId(env.id)}
                  style={toId === env.id ? { color: env.color, background: `color-mix(in oklab, ${env.color} 18%, transparent)` } : {}}
                >
                  <Icon name={env.icon} size={14} />
                  {translateCategoryName(env, lang)}
                </button>
              ))}
            </div>
          </div>

          <div className="mbud-field">
            <span>{t('envelopeTransferAmountLabel')}</span>
            <button className="mdebt-amount-row" onClick={() => setAmountSheet(true)}>
              <span className={amount > 0 ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                {amount > 0 ? fmt(amount, currency) : fmt(0, currency)}
              </span>
              <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
            </button>
          </div>
        </div>

        <div className="mbud-editor-actions">
          <button className="mbud-btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button
            className="mbud-btn-save"
            disabled={!canMove}
            onClick={() => from && to && onMove(from.id, to.id, amount)}
          >
            {t('moveMoneyLabel')}
          </button>
        </div>
      </section>
    </div>
    </SheetPortal>

    {amountSheet && (
      <MobileAmountSheet
        title={t('envelopeTransferAmountLabel')}
        value={amount}
        currency={currency}
        onDone={v => { setAmount(v); setAmountSheet(false) }}
        onClose={() => setAmountSheet(false)}
      />
    )}
    </>
  )
}

function BudgetEditor({
  category,
  onClose,
  onSave,
  onDelete,
}: {
  category?: Category
  onClose: () => void
  onSave: (f: { name: string; budget: number; color: string; icon: IconName; rolloverEnabled: boolean }) => void
  onDelete?: (c: Category) => void
}) {
  const { currency } = useFinance()
  const t = useT()
  const initialName = useCategoryName(category ?? { id: '', name: '' })
  const [name,       setName]       = useState(category ? initialName : '')
  const [budget,     setBudget]     = useState(category?.budget ?? 0)
  const [color,      setColor]      = useState(category?.color ?? COLORS[0])
  const [icon,       setIcon]       = useState<IconName>(category?.icon ?? 'cart')
  const [rolloverEnabled, setRolloverEnabled] = useState(category?.rolloverEnabled ?? false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [budgetSheet, setBudgetSheet] = useState(false)

  useMobileBackDismiss(budgetSheet, () => setBudgetSheet(false))
  useMobileBackDismiss(!budgetSheet, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !budgetSheet)

  return (
    <>
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet mbud-editor-overlay" role="dialog" aria-modal="true" aria-label={category ? t('editCategory') : t('newCategory')} onClick={onClose}>
      <section className="mbud-editor-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{category ? t('editCategory') : t('newCategory')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mbud-editor-body">
          <label className="mbud-field">
            <span>{t('name')}</span>
            <input
              className="mbud-input"
              type="text"
              value={name}
              placeholder={t('egCategoryName')}
              autoCapitalize="words"
              onChange={e => setName(e.target.value)}
            />
          </label>

          <div className="mbud-field">
            <span>{t('monthlyBudget')}</span>
            <button className="mdebt-amount-row" onClick={() => setBudgetSheet(true)}>
              <span className={budget > 0 ? 'mdebt-amt-set' : 'mdebt-amt-ph'}>
                {budget > 0 ? fmt(budget, currency) : t('noLimitLabel')}
              </span>
              <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)', color: 'var(--m-muted)' }} />
            </button>
            <button
              type="button"
              className={`mbud-nolimit${budget === 0 ? ' on' : ''}`}
              onClick={() => setBudget(0)}
            >
              {budget === 0 && <Icon name="check" size={13} />}
              {t('noLimitLabel')}
            </button>
          </div>

          {budget > 0 && (
            <div className="mpr-form-section mpr-toggle-row">
              <div className="mpr-toggle-row-text">
                <span className="mpr-toggle-row-label">{t('rolloverLabel')}</span>
                <small className="mpr-toggle-row-desc">{t('rolloverDesc')}</small>
              </div>
              <label className="mset-toggle-wrap">
                <input
                  type="checkbox"
                  className="mset-toggle-input"
                  checked={rolloverEnabled}
                  onChange={e => setRolloverEnabled(e.target.checked)}
                />
                <span className="mset-toggle" />
              </label>
            </div>
          )}

          <div className="mbud-field">
            <span>{t('color')}</span>
            <div className="mbud-color-strip">
              {COLORS.map(c => (
                <button
                  key={c}
                  className={`mbud-color-dot${color === c ? ' on' : ''}`}
                  aria-label={t('colorOption').replace('{c}', c)}
                  aria-pressed={color === c}
                  style={{ background: c, color: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          <div className="mbud-field">
            <span>{t('icon')}</span>
            <div className="mbud-icon-grid-sheet">
              {ALL_ICONS.map(ic => (
                <button
                  key={ic}
                  className={`mbud-icon-btn-sheet${icon === ic ? ' on' : ''}`}
                  aria-label={t('iconOption').replace('{ic}', ic)}
                  aria-pressed={icon === ic}
                  style={icon === ic ? { color, background: `color-mix(in oklab, ${color} 18%, transparent)` } : {}}
                  onClick={() => setIcon(ic)}
                >
                  <Icon name={ic} size={20} />
                </button>
              ))}
            </div>
          </div>

          {category && onDelete && (
            !confirmDel ? (
              <button className="mbud-del-btn" onClick={() => setConfirmDel(true)}>
                <Icon name="trash" size={16} /> {t('deleteCategory')}
              </button>
            ) : (
              <div className="mbud-confirm-del">
                <p>{t('deleteCategoryConfirm').replace('{name}', initialName)}</p>
                <div>
                  <button onClick={() => setConfirmDel(false)}>{t('cancel')}</button>
                  <button className="danger" onClick={() => onDelete(category)}>
                    <Icon name="trash" size={16} /> {t('delete')}
                  </button>
                </div>
              </div>
            )
          )}
        </div>

        <div className="mbud-editor-actions">
          <button className="mbud-btn-cancel" onClick={onClose}>{t('cancel')}</button>
          <button
            className="mbud-btn-save"
            style={{ background: color }}
            onClick={() => onSave({ name, budget, color, icon, rolloverEnabled })}
          >
            {category ? t('save') : t('create')}
          </button>
        </div>
      </section>
    </div>
    </SheetPortal>

    {budgetSheet && (
      <MobileAmountSheet
        title={t('monthlyBudget')}
        value={budget}
        currency={currency}
        onDone={v => { setBudget(v); setBudgetSheet(false) }}
        onClose={() => setBudgetSheet(false)}
      />
    )}
    </>
  )
}
