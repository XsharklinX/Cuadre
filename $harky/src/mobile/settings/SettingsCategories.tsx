import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { fmtCompact } from '@/data/helpers'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { CAT_COLORS } from '@/constants'
import { clearCategoryRules, deleteCategoryRule, listCategoryRules, type CategoryRule } from '@/data/bankCsv'
import { translateCategoryName, useCategoryName, useT } from '@/i18n'
import { playConfirmSound, playDeleteSound } from '@/lib/sound'
import type { Category, CurrencyCode, IconName } from '@/types'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { useDialogA11y } from '../useDialogA11y'
import { SheetPortal } from '../SheetPortal'
import { SettingsRow, SettingsSheet, type SheetProps } from './shared'

type CatTab = 'expense' | 'income' | 'rules'

const CAT_ICONS: IconName[] = [
  'cart','food','car','bolt','heart','home','bag','book','wallet','laptop','trend','play',
  'music','coffee','phone','gym','bus','building','gamepad','gift','scissors','baby','paw','pill',
  'plane','briefcase','shirt','pizza','star','fuel','flame','soda',
  'tree','sun','bike','train','tv','monitor','headphones','clock','key','tool',
  'brush','graduation','stethoscope','salad','wine','crown','trophy','shield','map','package',
]

export function SettingsCategories({ activeSheet, onOpen, onClose }: SheetProps) {
  const finance = useFinance()
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const currency = finance.currency
  const [tab, setTab] = useState<CatTab>('expense')
  const [editingCat, setEditingCat] = useState<Category | 'new-expense' | 'new-income' | null>(null)
  const [rules, setRules] = useState<CategoryRule[]>(() => listCategoryRules())

  const sheetOpen = activeSheet === 'categories' || activeSheet === 'categoryRules'
  // Al abrir, sitúa la pestaña correcta (Reglas si se entró por "reglas") y
  // refresca la lista de reglas aprendidas.
  useEffect(() => {
    if (activeSheet === 'categoryRules') { setTab('rules'); setRules(listCategoryRules()) }
    else if (activeSheet === 'categories') { setTab('expense'); setRules(listCategoryRules()) }
  }, [activeSheet])

  const expenseCats = finance.categories.filter(c => c.type === 'expense')
  const incomeCats = finance.categories.filter(c => c.type === 'income')

  const removeRule = (pattern: string) => {
    deleteCategoryRule(pattern)
    setRules(listCategoryRules())
    toast(t('categoryRuleDeletedToast'), { icon: 'trash' })
  }

  const removeAllRules = () => {
    clearCategoryRules()
    setRules([])
    toast(t('categoryRulesCleared'), { icon: 'trash' })
  }

  useMobileBackDismiss(!!editingCat, () => setEditingCat(null))

  const saveCategory = (fields: { name: string; type: 'expense' | 'income'; budget: number; color: string; icon: IconName }) => {
    if (!fields.name.trim()) { toast(t('enterCategoryName'), { icon: 'alert' }); return }
    try {
      if (editingCat === 'new-expense' || editingCat === 'new-income') {
        finance.addCategory({ name: fields.name.trim(), type: fields.type, budget: fields.budget, color: fields.color, icon: fields.icon })
        playConfirmSound()
        toast(t('categoryCreatedSimple'), { icon: 'check', type: 'ok' })
      } else if (editingCat) {
        finance.updateCategory(editingCat.id, { name: fields.name.trim(), budget: fields.budget, color: fields.color, icon: fields.icon })
        playConfirmSound()
        toast(t('categoryUpdated'), { icon: 'check', type: 'ok' })
      }
      setEditingCat(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('couldNotSaveCategory'), { icon: 'alert' })
    }
  }

  const removeCategory = (cat: Category) => {
    try {
      finance.deleteCategory(cat.id)
      playDeleteSound()
      toast(t('categoryDeleted'), { icon: 'trash' })
      setEditingCat(null)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('couldNotDelete'), { icon: 'alert' })
    }
  }

  const activeCats = tab === 'income' ? incomeCats : expenseCats

  return (
    <>
      <div className="mset-card">
        <SettingsRow icon="tag" iconColor="#c084fc" label={t('categorySettings')}
          value={String(finance.categories.length)}
          onClick={() => onOpen('categories')} />
      </div>

      {sheetOpen && (
        <SettingsSheet title={t('categoriesTitle')} onClose={onClose}>
          <div className="mset-sheet-body mset-cat-sheet">
            <div className="mobile-segment mset-cat-seg" role="tablist">
              <button role="tab" aria-selected={tab === 'expense'} className={tab === 'expense' ? 'on' : ''} onClick={() => setTab('expense')}>
                {t('expenses')} <span className="mset-cat-seg-count">{expenseCats.length}</span>
              </button>
              <button role="tab" aria-selected={tab === 'income'} className={tab === 'income' ? 'on' : ''} onClick={() => setTab('income')}>
                {t('incomes')} <span className="mset-cat-seg-count">{incomeCats.length}</span>
              </button>
              <button role="tab" aria-selected={tab === 'rules'} className={tab === 'rules' ? 'on' : ''} onClick={() => setTab('rules')}>
                {t('rulesTabLabel')} <span className="mset-cat-seg-count">{rules.length}</span>
              </button>
            </div>

            {tab === 'rules' ? (
              <div className="mset-cat-panel">
                <p className="mset-cat-intro">{t('categoryRulesIntro')}</p>
                {rules.length === 0 ? (
                  <div className="mset-cat-empty-state">
                    <span><Icon name="sliders" size={26} /></span>
                    <strong>{t('noCategoryRulesYet')}</strong>
                    <p>{t('categoryRulesEmptyHint')}</p>
                  </div>
                ) : (
                  <>
                    <div className="mset-cat-items">
                      {rules.map(rule => {
                        const category = finance.categories.find(c => c.id === rule.categoryId)
                        return (
                          <div key={rule.pattern} className="mset-cat-item">
                            <span className="mset-cat-item-icon" style={{
                              background: `color-mix(in oklab, ${category?.color ?? '#7a8296'} 16%, transparent)`,
                              color: category?.color ?? '#7a8296',
                            }}>
                              <Icon name={category?.icon ?? 'tag'} size={18} />
                            </span>
                            <span className="mset-cat-item-body">
                              <b>{rule.pattern}</b>
                              <small>{t('rulePointsTo').replace('{category}', category ? translateCategoryName(category, lang) : rule.categoryId)}</small>
                            </span>
                            <button className="mset-cat-item-del" aria-label={t('delete')} onClick={() => removeRule(rule.pattern)}>
                              <Icon name="close" size={16} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <button className="mset-cat-clear" onClick={removeAllRules}>
                      <Icon name="trash" size={15} /> {t('clearAllRulesLabel')}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="mset-cat-panel">
                {activeCats.length === 0 ? (
                  <div className="mset-cat-empty-state">
                    <span style={{ color: tab === 'income' ? '#35d0a2' : '#ff6b8a' }}>
                      <Icon name={tab === 'income' ? 'wallet' : 'cart'} size={26} />
                    </span>
                    <strong>{tab === 'income' ? t('noIncomeCategories') : t('noExpenseCategories')}</strong>
                  </div>
                ) : (
                  <div className="mset-cat-items">
                    {activeCats.map(cat => (
                      <CategoryListRow key={cat.id} cat={cat} currency={currency} onEdit={c => setEditingCat(c)} />
                    ))}
                  </div>
                )}
                <button className="mset-cat-add" onClick={() => setEditingCat(tab === 'income' ? 'new-income' : 'new-expense')}>
                  <Icon name="plus" size={16} /> {tab === 'income' ? t('newIncomeCategory') : t('newExpenseCategory')}
                </button>
              </div>
            )}
          </div>
        </SettingsSheet>
      )}

      {editingCat !== null && (
        <CategoryEditor
          category={typeof editingCat === 'string' ? undefined : editingCat}
          type={editingCat === 'new-income' ? 'income' : editingCat === 'new-expense' ? 'expense' : editingCat.type}
          onClose={() => setEditingCat(null)}
          onSave={saveCategory}
          onDelete={typeof editingCat !== 'string' ? removeCategory : undefined}
        />
      )}
    </>
  )
}

function CategoryListRow({ cat, currency, onEdit }: { cat: Category; currency: CurrencyCode; onEdit: (c: Category) => void }) {
  const t = useT()
  const name = useCategoryName(cat)
  const hasBudget = cat.type === 'expense' && cat.budget > 0
  return (
    <button className="mset-cat-item" onClick={() => onEdit(cat)}>
      <span className="mset-cat-item-icon" style={{ color: cat.color, background: `color-mix(in oklab, ${cat.color} 16%, transparent)` }}>
        <Icon name={cat.icon} size={18} />
      </span>
      <span className="mset-cat-item-body">
        <b>{name}</b>
        {cat.type === 'expense' && (
          <small>{hasBudget ? t('budgetPerMonth').replace('{amount}', fmtCompact(cat.budget, currency)) : t('noLimitLabel')}</small>
        )}
      </span>
      <Icon name="arrowUp" size={13} className="mset-chevron" />
    </button>
  )
}

function CategoryEditor({ category, type, onClose, onSave, onDelete }: {
  category?: Category
  type: 'expense' | 'income'
  onClose: () => void
  onSave: (f: { name: string; type: 'expense' | 'income'; budget: number; color: string; icon: IconName }) => void
  onDelete?: (c: Category) => void
}) {
  const t = useT()
  const initialName = useCategoryName(category ?? { id: '', name: '' })
  const [name,       setName]       = useState(category ? initialName : '')
  const [budget,     setBudget]     = useState(String(category?.budget ?? ''))
  const [color,      setColor]      = useState(category?.color ?? (CAT_COLORS as readonly string[])[0])
  const [icon,       setIcon]       = useState<IconName>(category?.icon ?? (type === 'income' ? 'wallet' : 'cart'))
  const [confirmDel, setConfirmDel] = useState(false)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  return (
    <SheetPortal>
    <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true"
      style={{ zIndex: 320 }}
      aria-label={category ? t('editCategory') : (type === 'expense' ? t('newExpenseCategory') : t('newIncomeCategory'))} onClick={onClose}>
      <section className="mbud-editor-sheet" onClick={e => e.stopPropagation()}>
        <header>
          <span>{category ? t('editCategory') : (type === 'expense' ? t('newExpenseCategory') : t('newIncomeCategory'))}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>

        <div className="mbud-editor-body">
          <label className="mbud-field">
            <span>{t('name')}</span>
            <input className="mbud-input" type="text" value={name}
              placeholder={t('egCategoryName')} autoCapitalize="words"
              onChange={e => setName(e.target.value)} />
          </label>

          {type === 'expense' && (
            <label className="mbud-field">
              <span>{t('monthlyLimitLabel')}</span>
              <input className="mbud-input" type="number" inputMode="decimal"
                value={budget} placeholder="0" onChange={e => setBudget(e.target.value)} />
            </label>
          )}

          <div className="mbud-field">
            <span>{t('color')}</span>
            <div className="mbud-color-strip">
              {(CAT_COLORS as readonly string[]).map(c => (
                <button key={c} className={`mbud-color-dot${color === c ? ' on' : ''}`}
                  aria-label={`${t('color')} ${c}`} aria-pressed={color === c}
                  style={{ background: c, color: c }} onClick={() => setColor(c)} />
              ))}
            </div>
          </div>

          <div className="mbud-field">
            <span>{t('icon')}</span>
            <div className="mbud-icon-grid-sheet">
              {CAT_ICONS.map(ic => (
                <button key={ic} className={`mbud-icon-btn-sheet${icon === ic ? ' on' : ''}`}
                  aria-label={`${t('icon')} ${ic}`} aria-pressed={icon === ic}
                  style={icon === ic ? { color, background: `color-mix(in oklab, ${color} 18%, transparent)` } : {}}
                  onClick={() => setIcon(ic)}>
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
                <p>{t('deleteCategoryConfirm').replace('{name}', name)}</p>
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
          <button className="mbud-btn-save" style={{ background: color }}
            onClick={() => onSave({ name, type, budget: Number(budget) || 0, color, icon })}>
            {category ? t('save') : t('create')}
          </button>
        </div>
      </section>
    </div>
    </SheetPortal>
  )
}
