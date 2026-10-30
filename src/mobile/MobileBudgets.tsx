import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { toast } from '@/components/ui/Toast'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { amountForCategory, categoryRollover, fmt, fmtCompact, prevMonthKey, transactionsForTotals, txForMonth } from '@/data/helpers'
import { computeEnvelopeSummary } from '@/data/envelopes'
import { CAT_COLORS } from '@/constants'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useCategoryName, useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { MobileAmountSheet } from './MobileAmountSheet'
import { SheetPortal } from './SheetPortal'
import { MobileTextSheet } from './MobileTextSheet'
import { IconTile, NxRow, NxSheet, Phrase } from '@/components/ui/Phrase'
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
  const [editing, setEditing] = useState<Category | 'new' | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)

  const visTxns = transactionsForTotals(txns, accounts, currency, categories)
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

  /*
   * P1 · UNA CIFRA, UNA LISTA Y CUÁNTO PUEDES GASTAR AL DÍA.
   *
   * Antes: seis cajitas de resumen, tarjetas con icono en un cuadro, barra
   * gruesa y debajo una frase roja que repetía la barra («Alerta del 100 %:
   * llevas…»). Ahora arriba va lo único que importa —lo que te queda y cuánto
   * toca al día hasta fin de mes— y debajo las categorías en filas de línea
   * fina, primero las que se pasaron.
   */
  const now = new Date()
  const esteMes = mkey === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const [yy, mm] = mkey.split('-').map(Number)
  const diasMes = new Date(yy, mm, 0).getDate()
  const diasQuedan = esteMes ? diasMes - now.getDate() + 1 : 0
  const alDia = (left: number) => (diasQuedan > 0 && left > 0 ? left / diasQuedan : 0)
  const conLimite = orderedCats.filter(c => effectiveBudget[c.id] > 0)
  const pasados = conLimite.filter(c => (spent[c.id] ?? 0) > effectiveBudget[c.id])
  const enMarcha = conLimite.filter(c => (spent[c.id] ?? 0) <= effectiveBudget[c.id])
  const sinLimite = orderedCats.filter(c => !(effectiveBudget[c.id] > 0))
  const money = (n: number) => fmtCompact(n, currency)

  const fila = (cat: Category) => {
    const s = spent[cat.id] ?? 0
    const budget = effectiveBudget[cat.id]
    const roll = rollover[cat.id]
    const left = budget - s
    const over = budget > 0 && s > budget
    const pct = budget > 0 ? Math.min(100, (s / budget) * 100) : 0
    return (
      <button key={cat.id} className="nxb-row" onClick={() => setEditing(cat)}>
        <IconTile icon={cat.icon} color={cat.color} />
        <span className="nxb-main">
        <span className="nxb-top">
          <b>{translateCategoryName(cat, lang)}</b>
          <span className={over ? 'bad' : budget > 0 && pct < 80 ? 'ok' : ''}>
            {budget > 0 ? (over ? `−${money(-left)}` : money(left)) : money(s)}
          </span>
        </span>
        {budget > 0 && <span className="nx-thin"><i className={over ? 'bad' : ''} style={{ width: `${pct}%`, ...(over ? {} : { background: cat.color }) }} /></span>}
        <span className="nxb-sub">
          <span>
            {budget > 0
              ? t('nxbSpentOf').replace('{spent}', money(s)).replace('{budget}', money(budget))
              : t('nxbNoLimitSpent')}
            {(cat.rolloverEnabled || settings.budgetRollover) && roll !== 0 && (
              ` · ${roll > 0 ? t('rolloverAddedLabel').replace('{amount}', money(roll)) : t('rolloverDeductedLabel').replace('{amount}', money(Math.abs(roll)))}`
            )}
          </span>
          {over ? <span className="bad">{t('nxbOver')}</span>
            : alDia(left) > 0 ? <span>{t('nxbPerDay').replace('{amount}', money(alDia(left)))}</span> : null}
        </span>
        </span>
      </button>
    )
  }

  return (
    <div className="mbud-root nx">
      {cats.length === 0 ? (
        <div className="mbud-empty">
          <EmptyArt kind="budgets" />
          <strong>{t('noBudgetsYet')}</strong>
          <p>{t('createExpenseCategoriesHint')}</p>
          <button onClick={() => setEditing('new')}>
            <Icon name="plus" size={16} /> {t('createFirstCategory')}
          </button>
        </div>
      ) : (
        <>
          <div className="nx-hero">
            <small>{totalLeft < 0 ? t('nxbOverTitle') : esteMes ? t('nxbLeftTitle') : t('nxbLeftPastTitle')}</small>
            <span className={`nx-big${totalLeft < 0 ? ' bad' : ''}`}><AnimatedMoney value={Math.abs(totalLeft)} compact /></span>
            {esteMes && totalLeft > 0 && (
              <small>
                <b>{t('nxbPerDay').replace('{amount}', money(alDia(totalLeft)))}</b>
                {' '}{t('nxbUntil').replace('{n}', String(diasMes))}
              </small>
            )}
            {overCount > 0 && <small className="nxb-overcount">{t('nxbOverCount').replace('{n}', String(overCount))}</small>}
          </div>

          {envelopeSummary.income > 0 && (
            <div className="nxb-env">
              <span className="nx-split" aria-hidden="true">
                <i style={{ flexGrow: Math.max(0, Math.min(envelopeSummary.assigned, envelopeSummary.income)), background: 'var(--m-text)' }} />
                <i style={{ flexGrow: Math.max(0, envelopeSummary.unassigned), background: 'color-mix(in oklab, var(--m-text) 14%, transparent)' }} />
              </span>
              <span className="nxb-env-txt">
                <span>{t('nxbAssigned').replace('{amount}', money(envelopeSummary.assigned))}</span>
                <span className={envelopeSummary.unassigned < 0 ? 'bad' : ''}>
                  {envelopeSummary.unassigned < 0
                    ? t('envelopeOverAssignedHint')
                    : t('nxbUnassigned').replace('{amount}', money(envelopeSummary.unassigned))}
                </span>
              </span>
              {envelopes.length >= 2 && <button className="nx-link" onClick={() => setTransferOpen(true)}>{t('moveMoneyLabel')}</button>}
            </div>
          )}

          {pasados.length > 0 && (
            <>
              <p className="nx-label">{t('nxbGroupOver')}</p>
              <div className="nx-list">{pasados.map(fila)}</div>
            </>
          )}
          {enMarcha.length > 0 && (
            <>
              <p className="nx-label">{t('nxbGroupActive')}<button onClick={() => setEditing('new')}>+ {t('new')}</button></p>
              <div className="nx-list">{enMarcha.map(fila)}</div>
            </>
          )}
          {sinLimite.length > 0 && (
            <>
              <p className="nx-label">{t('nxbGroupNoLimit')}{enMarcha.length === 0 && <button onClick={() => setEditing('new')}>+ {t('new')}</button>}</p>
              <div className="nx-list">{sinLimite.map(fila)}</div>
            </>
          )}
        </>
      )}

      {editing !== null && (
        editing === 'new'
          ? <NewBudgetSheet onClose={() => setEditing(null)} onSave={save} />
          : (
            <BudgetSheet
              category={editing}
              onClose={() => setEditing(null)}
              onSave={save}
              onDelete={remove}
            />
          )
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

type BudgetFields = { name: string; budget: number; color: string; icon: IconName; rolloverEnabled: boolean }

/** Lo que se gastó de media en una categoría en los 3 meses enteros anteriores. */
function useAverageSpend(categoryId: string): number {
  const transactions = useFinance(s => s.transactions)
  return useMemo(() => {
    const now = new Date()
    const keys = [1, 2, 3].map(k => {
      const d = new Date(now.getFullYear(), now.getMonth() - k, 1)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    const total = transactions
      .filter(tx => tx.type === 'expense' && keys.includes(tx.date.slice(0, 7)))
      .reduce((sum, tx) => sum + amountForCategory(tx, categoryId), 0)
    return Math.round(total / 3 / 100) * 100
  }, [transactions, categoryId])
}

/*
 * P2 · CAMBIAR UN PRESUPUESTO SABIENDO LO QUE GASTAS.
 *
 * Tocar una categoría abría «Editar categoría»: nombre, monto, color, doce
 * iconos y un interruptor, para cambiar un número. Ahora: el monto en grande,
 * un deslizador con una marca en lo que sueles gastar y un botón para usar
 * esa cifra. Nombre, color e icono siguen ahí, plegados.
 */
function BudgetSheet({ category, onClose, onSave, onDelete }: {
  category: Category
  onClose: () => void
  onSave: (f: BudgetFields) => void
  onDelete: (c: Category) => void
}) {
  const { currency } = useFinance()
  const t = useT()
  const initialName = useCategoryName(category)
  const avg = useAverageSpend(category.id)
  const [name, setName] = useState(initialName)
  const [budget, setBudget] = useState(category.budget)
  const [color, setColor] = useState(category.color)
  const [icon, setIcon] = useState<IconName>(category.icon)
  const [rolloverEnabled, setRolloverEnabled] = useState(category.rolloverEnabled ?? false)
  const [amountSheet, setAmountSheet] = useState(false)
  const [look, setLook] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const step = Math.max(100, Math.round(Math.max(avg, budget, 1000) / 50 / 100) * 100)
  const max = Math.max(step * 10, Math.ceil((Math.max(avg, budget) * 1.8) / step) * step)
  const save = () => onSave({ name, budget, color, icon, rolloverEnabled })

  return (
    <>
      <NxSheet
        title={initialName}
        onClose={onClose}
        footer={(
          <>
            {avg > 0 && avg !== budget && <button className="nx-btn" onClick={() => setBudget(avg)}>{t('nxbUseAvg').replace('{amount}', fmtCompact(avg, currency))}</button>}
            <button className="nx-btn pri" onClick={save}>{t('save')}</button>
          </>
        )}
      >
        <button className="nxb-amount" onClick={() => setAmountSheet(true)}>
          <span className="nx-big">{budget > 0 ? fmt(budget, currency, { decimals: 0 }) : t('noLimitLabel')}</span>
          {budget > 0 && <em>{t('nxbPerMonth')}</em>}
        </button>
        <div className="nxb-slider">
          <input
            id={`budget-${category.id}`}
            type="range"
            min={0}
            max={max}
            step={step}
            value={Math.min(budget, max)}
            aria-label={t('monthlyBudget')}
            onChange={e => setBudget(Number(e.target.value))}
          />
          {avg > 0 && <i className="nxb-avg" style={{ left: `${Math.min(100, (avg / max) * 100)}%` }} aria-hidden="true" />}
        </div>
        {avg > 0 && (
          <p className="nx-note">
            {t('nxbAvgNote').replace('{amount}', fmt(avg, currency, { decimals: 0 }))}
            {budget > 0 && avg > budget && ` ${t('nxbAvgOver')}`}
          </p>
        )}
        <div className="nx-list nxb-opts">
          <NxRow label={t('rolloverLabel')} hint={t('rolloverDesc')} value={rolloverEnabled ? t('yes') : t('no')} onTap={() => setRolloverEnabled(v => !v)} />
          <NxRow label={t('noLimitLabel')} value={budget === 0 ? t('yes') : t('no')} onTap={() => setBudget(budget === 0 ? Math.max(avg, step) : 0)} />
          <NxRow label={t('nxbLook')} value={look ? '−' : '+'} onTap={() => setLook(v => !v)} />
        </div>
        {look && (
          <div className="nxb-look">
            <label className="mbud-field">
              <span>{t('name')}</span>
              <input className="mbud-input" type="text" value={name} placeholder={t('egCategoryName')} autoCapitalize="words" onChange={e => setName(e.target.value)} />
            </label>
            <div className="mbud-color-strip">
              {COLORS.map(c => (
                <button key={c} className={`mbud-color-dot${color === c ? ' on' : ''}`} aria-label={t('colorOption').replace('{c}', c)} aria-pressed={color === c} style={{ background: c, color: c }} onClick={() => setColor(c)} />
              ))}
            </div>
            <div className="mbud-icon-grid-sheet">
              {ALL_ICONS.map(ic => (
                <button key={ic} className={`mbud-icon-btn-sheet${icon === ic ? ' on' : ''}`} aria-label={t('iconOption').replace('{ic}', ic)} aria-pressed={icon === ic} style={icon === ic ? { color, background: `color-mix(in oklab, ${color} 18%, transparent)` } : {}} onClick={() => setIcon(ic)}>
                  <Icon name={ic} size={20} />
                </button>
              ))}
            </div>
          </div>
        )}
        {!confirmDel ? (
          <button className="nx-link nxb-del" onClick={() => setConfirmDel(true)}>{t('deleteCategory')}</button>
        ) : (
          <div className="mbud-confirm-del">
            <p>{t('deleteCategoryConfirm').replace('{name}', initialName)}</p>
            <div>
              <button onClick={() => setConfirmDel(false)}>{t('cancel')}</button>
              <button className="danger" onClick={() => onDelete(category)}><Icon name="trash" size={16} /> {t('delete')}</button>
            </div>
          </div>
        )}
      </NxSheet>
      {amountSheet && (
        <MobileAmountSheet
          title={t('monthlyBudget')}
          value={budget}
          currency={currency}
          onDone={v => { setBudget(v); setAmountSheet(false) }}
          onClose={() => setAmountSheet(false)}
        />
      )}
    </>
  )
}

/** Un presupuesto nuevo, en una frase (B1): «Quiero gastar como máximo RD$X al mes en Y». */
function NewBudgetSheet({ onClose, onSave }: { onClose: () => void; onSave: (f: BudgetFields) => void }) {
  const { currency, categories } = useFinance()
  const t = useT()
  const [name, setName] = useState('')
  const [budget, setBudget] = useState(0)
  const [sub, setSub] = useState<'amount' | 'name' | null>(null)
  const usados = new Set(categories.map(c => c.color))
  const color = COLORS.find(c => !usados.has(c)) ?? COLORS[0]
  const missing = !name.trim()
  return (
    <>
      <NxSheet
        title={t('newCategory')}
        sub={t('nxPhraseHint')}
        onClose={onClose}
        footer={(
          <button className={`nx-btn pri${missing ? ' form-save-missing' : ''}`} onClick={() => (missing ? setSub('name') : onSave({ name, budget, color, icon: 'tag', rolloverEnabled: false }))}>
            {missing ? t('missingFieldLabel').replace('{field}', t('fieldName')) : t('create')}
          </button>
        )}
      >
        <Phrase parts={[
          t('nxbPhrase1'),
          { key: 'amount', text: budget > 0 ? fmt(budget, currency, { decimals: 0 }) : '', hint: t('nxbPhraseNoLimit'), onTap: () => setSub('amount'), active: sub === 'amount' },
          t('nxbPhrase2'),
          { key: 'name', text: name, hint: t('nxbPhraseName'), onTap: () => setSub('name'), active: sub === 'name' },
          '.',
        ]} />
      </NxSheet>
      {sub === 'amount' && (
        <MobileAmountSheet title={t('monthlyBudget')} value={budget} currency={currency} onDone={v => { setBudget(v); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'name' && (
        <MobileTextSheet title={t('name')} value={name} placeholder={t('egCategoryName')} onDone={v => { setName(v); setSub(null) }} onClose={() => setSub(null)} />
      )}
    </>
  )
}
