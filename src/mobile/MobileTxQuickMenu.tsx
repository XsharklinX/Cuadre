import { useState } from 'react'
import { createPortal } from 'react-dom'
import { sheetRoot } from './SheetPortal'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { dateLocale, fmt } from '@/data/helpers'
import { translateCategoryName, useT } from '@/i18n'
import { playSoftHaptic } from '@/lib/sound'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { IconName, Transaction } from '@/types'
import { MobileDatePicker } from './MobileDatePicker'
import { AccountPickSheet } from './goals/GoalBits'
import { setTxFormIntent, type TxFormIntent } from './txFormIntent'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/*
 * MANTENER PULSADO UN MOVIMIENTO.
 *
 * Lo que más se corrige de un movimiento es la fecha, la categoría o la
 * cuenta, y para eso había que abrir el formulario entero, bajar y guardar.
 * Ahora sale un menú con esos tres arriba, en grande, y el resto debajo.
 *
 * Cada cambio rápido deja un «Deshacer» de 5 s, como al borrar: un atajo que
 * no se puede deshacer da miedo usarlo.
 *
 * Antes la pulsación larga entraba directo en selección múltiple; ahora esa
 * opción vive en este menú («Seleccionar varios»).
 */
export function MobileTxQuickMenu({ tx, onClose, onEdit, onDuplicate, onDelete, onSelectMany }: {
  tx: Transaction
  onClose: () => void
  onEdit: (tx: Transaction) => void
  onDuplicate?: (tx: Transaction) => void
  onDelete?: (id: string) => void
  onSelectMany?: (id: string) => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const { accounts, categories, currency } = useFinance()
  const [sub, setSub] = useState<'date' | 'category' | 'account' | null>(null)
  useMobileBackDismiss(sub === null, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, sub === null)
  const isTransfer = tx.type === 'transfer'
  const hasSplits = !!tx.splits && tx.splits.length >= 2

  const changeField = useTxFieldChange()
  const change = <K extends 'date' | 'categoryId' | 'accountId'>(field: K, value: Transaction[K], message: string) => {
    if (changeField(tx, field, value, message)) onClose()
  }

  const openForm = (intent: TxFormIntent | null) => {
    setTxFormIntent(intent)
    onClose()
    onEdit(tx)
  }

  const cat = categories.find(c => c.id === tx.categoryId)
  const acct = accounts.find(a => a.id === tx.accountId)
  const dateText = new Date(`${tx.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })
  const big: { key: 'date' | 'category' | 'account'; icon: IconName; label: string; value: string; disabled?: boolean }[] = [
    { key: 'date', icon: 'calendar', label: t('date'), value: dateText },
    ...(!isTransfer ? [
      { key: 'category' as const, icon: 'tag' as IconName, label: t('category'), value: hasSplits ? t('splitShort') : cat ? translateCategoryName(cat, lang as 'es') : '—', disabled: hasSplits },
      { key: 'account' as const, icon: 'wallet' as IconName, label: t('account'), value: acct?.name ?? '—' },
    ] : []),
  ]

  return createPortal(
    <>
      <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('movementActionsLabel')} onClick={onClose}>
        <section className="mgn-sheet mtq-sheet" onClick={e => e.stopPropagation()}>
          <div className="mgn-sheet-head">
            <span className="mtq-title">
              <b>{isTransfer ? t('transfer') : tx.note}</b>
              <small className={tx.type}>{tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{fmt(tx.amount, currency)}</small>
            </span>
            <button className="mgn-sheet-x" aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </div>
          <div className="mtq-big">
            {big.map(b => (
              <button key={b.key} disabled={b.disabled} onClick={() => setSub(b.key)}>
                <Icon name={b.icon} size={20} />
                <span>{b.label}</span>
                <small>{b.value}</small>
              </button>
            ))}
          </div>
          <div className="mgn-menu-list">
            {!isTransfer && onDuplicate && (
              <button className="mgn-menu-row" onClick={() => { onDuplicate(tx); onClose() }}>
                <Icon name="copy" size={18} /><span>{t('duplicateForToday')}</span>
              </button>
            )}
            {tx.type === 'expense' && !hasSplits && (
              <button className="mgn-menu-row" onClick={() => openForm('split')}>
                <Icon name="scissors" size={18} /><span>{t('splitToggleLabel')}</span>
              </button>
            )}
            {!isTransfer && !tx.recurring && (
              <button className="mgn-menu-row" onClick={() => openForm('recurring')}>
                <Icon name="repeat" size={18} /><span>{t('makeRecurring')}</span>
              </button>
            )}
            <button className="mgn-menu-row" onClick={() => openForm(null)}>
              <Icon name="edit" size={18} /><span>{t('editEverything')}</span>
            </button>
            {onSelectMany && (
              <button className="mgn-menu-row" onClick={() => { onClose(); onSelectMany(tx.id) }}>
                <Icon name="check" size={18} /><span>{t('selectMany')}</span>
              </button>
            )}
            {onDelete && (
              <button className="mgn-menu-row danger" onClick={() => { onClose(); onDelete(tx.id) }}>
                <Icon name="trash" size={18} /><span>{t('delete')}</span>
              </button>
            )}
          </div>
        </section>
      </div>

      {sub === 'date' && (
        <MobileDatePicker
          value={tx.date}
          onChange={v => {
            setSub(null)
            if (v !== tx.date) change('date', v, t('dateChangedTo').replace('{date}', new Date(`${v}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })))
          }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'account' && (
        <AccountPickSheet
          title={t('selectAccount')}
          accounts={accounts}
          value={tx.accountId ?? ''}
          onPick={id => { if (id !== tx.accountId) change('accountId', id, t('accountChangedTo').replace('{name}', accounts.find(a => a.id === id)?.name ?? '')) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'category' && (
        <CategoryPickSheet
          type={tx.type === 'income' ? 'income' : 'expense'}
          value={tx.categoryId ?? ''}
          onPick={id => {
            setSub(null)
            const c = categories.find(x => x.id === id)
            if (id !== tx.categoryId) change('categoryId', id, t('categoryChangedTo').replace('{name}', c ? translateCategoryName(c, lang as 'es') : ''))
          }}
          onClose={() => setSub(null)}
        />
      )}
    </>,
    sheetRoot(),
  )
}

export function CategoryPickSheet({ type, value, onPick, onClose }: {
  type: 'income' | 'expense'
  value: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const categories = useFinance(s => s.categories).filter(c => c.type === type)
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" style={{ zIndex: 440 }} role="dialog" aria-modal="true" aria-label={t('selectCategory')} onClick={onClose}>
      <section onClick={e => e.stopPropagation()}>
        <header>
          <span>{t('selectCategory')}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="mobile-category-grid">
          {categories.map(c => (
            <button key={c.id} className={value === c.id ? 'on' : ''} aria-pressed={value === c.id} onClick={() => onPick(c.id)}>
              <span style={{ color: c.color, background: `color-mix(in oklab, ${c.color} 22%, transparent)` }}>
                <Icon name={c.icon as IconName} size={20} />
              </span>
              <small>{translateCategoryName(c, lang as 'es')}</small>
            </button>
          ))}
        </div>
      </section>
    </div>,
    sheetRoot(),
  )
}

/**
 * Cambia un campo de un movimiento y ofrece deshacerlo 5 s. Lo usan el menú
 * rápido y la ficha del movimiento (T1), que edita en el sitio.
 */
export function useTxFieldChange() {
  const t = useT()
  const updateTx = useFinance(s => s.updateTx)
  return <K extends keyof Transaction>(tx: Transaction, field: K, value: Transaction[K], message: string): boolean => {
    const before = tx[field]
    try {
      updateTx(tx.id, { [field]: value } as Partial<Transaction>)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('couldNotSave'), { icon: 'alert' })
      return false
    }
    playSoftHaptic()
    toast(message, {
      icon: 'check',
      type: 'ok',
      duration: 5000,
      action: {
        label: t('undo'),
        onClick: () => {
          try { updateTx(tx.id, { [field]: before } as Partial<Transaction>) }
          catch (e) { toast(e instanceof Error ? e.message : t('couldNotSave'), { icon: 'alert' }) }
        },
      },
    })
    return true
  }
}
