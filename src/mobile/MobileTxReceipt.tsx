import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { NxRow } from '@/components/ui/Phrase'
import { remaining } from '@/data/caprices'
import { getCurrencyMeta } from '@/data/currencies'
import { dateLocale, fmt, prevMonthKey } from '@/data/helpers'
import { translateCategoryName, useT } from '@/i18n'
import { playDeleteHaptic, playSoftHaptic } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { Transaction } from '@/types'
import { AccountPickSheet } from './goals/GoalBits'
import { MobileDatePicker } from './MobileDatePicker'
import { MobileDescriptionSheet } from './MobileDescriptionSheet'
import { MobileTextSheet } from './MobileTextSheet'
import { CategoryPickSheet, useTxFieldChange } from './MobileTxQuickMenu'
import { sheetRoot } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/*
 * T1 · LA FICHA COMO UN RECIBO QUE SE EDITA EN EL SITIO.
 *
 * Antes: un icono en un cuadro, el nombre, el monto, un botón gordo de
 * «Marcar como capricho» y una tabla de filas de solo lectura; para cambiar
 * la fecha había que ir a «Editar» y bajar. Ahora se lee como un recibo:
 * qué y cuándo en pequeño, el comercio, la cifra grande, y cada dato en una
 * fila de línea fina que se toca y cambia ahí mismo (con deshacer). Debajo,
 * la historia de ese sitio este mes, y las acciones en una fila de texto.
 */
export function MobileTxReceipt({ tx, receiptUrl, receiptLoading, onOpenReceipt, onClose, onEdit, onDuplicate, onDelete }: {
  tx: Transaction
  receiptUrl: string | null
  receiptLoading: boolean
  onOpenReceipt: () => void
  onClose: () => void
  onEdit: (tx: Transaction) => void
  onDuplicate: (tx: Transaction) => void
  onDelete?: (id: string) => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const locale = dateLocale(lang)
  const { accounts, categories, transactions, currency } = useFinance()
  const caprices = useCaprices(s => s.items)
  const openCaprice = useCaprices(s => s.open)
  const removeCaprice = useCaprices(s => s.remove)
  const change = useTxFieldChange()
  const [sub, setSub] = useState<'date' | 'category' | 'account' | 'note' | 'description' | null>(null)
  useMobileBackDismiss(sub === null, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, sub === null)

  const isTransfer = tx.type === 'transfer'
  const split = !!tx.splits && tx.splits.length >= 2
  const cat = categories.find(c => c.id === tx.categoryId)
  const acct = accounts.find(a => a.id === tx.accountId)
  const bote = caprices.find(c => c.txId === tx.id)
  const kind = tx.type === 'income' ? t('income') : tx.type === 'expense' ? t('expense') : t('transfer')
  const longDate = new Date(`${tx.date}T00:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })

  // La historia de este sitio: lo mismo (por concepto) este mes y el anterior.
  const history = useMemo(() => {
    if (isTransfer) return null
    const key = tx.note.trim().toLowerCase()
    const mk = tx.date.slice(0, 7), pk = prevMonthKey(mk)
    let n = 0, sum = 0, prev = 0
    for (const x of transactions) {
      if (x.type !== tx.type || x.note.trim().toLowerCase() !== key) continue
      if (x.date.startsWith(mk)) { n += 1; sum += x.amount }
      else if (x.date.startsWith(pk)) prev += x.amount
    }
    return n > 1 || prev > 0 ? { n, sum, prev } : null
  }, [transactions, tx, isTransfer])

  const sign = tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''

  return createPortal(
    <>
      <div ref={ref} className="mobile-detail-sheet mobile-transaction-sheet" role="dialog" aria-modal="true" aria-label={tx.note} onClick={onClose}>
        <section className="nx-sheet mtr" onClick={e => e.stopPropagation()}>
          <header className="nx-sheet-head">
            <span>
              <small className="mtr-kind">{kind} · {longDate}</small>
              <b className="mtr-name">{isTransfer ? t('transfer') : tx.note}</b>
            </span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={17} /></button>
          </header>

          <div className="mtr-amount">
            <span className={`nx-big ${tx.type === 'income' ? 'ok' : ''}`}>{sign}{fmt(tx.amount, currency)}</span>
            {tx.hasReceipt && (
              <button className="mtr-thumb" onClick={onOpenReceipt} aria-label={t('receiptLabel')}>
                {receiptUrl ? <img src={receiptUrl} alt="" /> : <Icon name="receipt" size={18} />}
              </button>
            )}
          </div>
          {tx.hasReceipt && !receiptUrl && !receiptLoading && <p className="nx-note">{t('receiptMissing')}</p>}

          {tx.description && <p className="mtr-desc" onClick={() => setSub('description')}>{tx.description}</p>}

          <div className="nx-list">
            {!isTransfer && (
              <NxRow
                label={t('category')}
                value={split
                  ? tx.splits!.map(s => translateCategoryName(categories.find(c => c.id === s.categoryId) ?? { id: '', name: '?' }, lang as 'es')).join(' · ')
                  : cat ? translateCategoryName(cat, lang as 'es') : t('selectLabel')}
                onTap={() => (split ? (onClose(), onEdit(tx)) : setSub('category'))}
              />
            )}
            <NxRow
              label={isTransfer ? t('account') : t('account')}
              value={isTransfer
                ? `${accounts.find(a => a.id === tx.fromAccount)?.name ?? t('origin')} → ${accounts.find(a => a.id === tx.toAccount)?.name ?? t('destination')}`
                : acct?.name ?? t('noAccountLabel')}
              onTap={() => (isTransfer ? (onClose(), onEdit(tx)) : setSub('account'))}
            />
            <NxRow label={t('date')} value={shortDate(tx.date)} onTap={() => setSub('date')} />
            {!isTransfer && <NxRow label={t('conceptLabel')} value={tx.note} onTap={() => setSub('note')} />}
            {!tx.description && <NxRow label={t('descriptionLabel')} value={t('addEllipsis')} tone="muted" onTap={() => setSub('description')} />}
            {tx.originalCurrency && tx.originalAmount !== undefined && (
              <NxRow
                label={t('originalAmountLabel')}
                value={`${getCurrencyMeta(tx.originalCurrency).flag} ${fmt(tx.originalAmount, tx.originalCurrency)}`}
                hint={tx.fxRate ? `1 ${tx.originalCurrency} = ${tx.fxRate.toLocaleString('en-US', { maximumFractionDigits: 4 })}` : undefined}
              />
            )}
            {tx.fees?.length ? <NxRow label={t('bankFeesLabel')} value={tx.fees.map(f => fmt(f.amount, currency)).join(' + ')} /> : null}
            {tx.recurring && <NxRow label={t('repeatsLabel')} value={t(tx.recurring === 'weekly' ? 'weekly' : 'monthly')} />}
            {tx.tags?.length ? <NxRow label={t('tagsLabel')} value={tx.tags.join(' · ')} /> : null}
            {bote && (
              <NxRow
                label={t('capTitle')}
                value={remaining(bote) > 0 ? t('capRemaining').replace('{amount}', fmt(remaining(bote), currency)) : t('capSettled')}
                tone={remaining(bote) > 0 ? undefined : 'ok'}
              />
            )}
          </div>

          {history && (
            <p className="nx-note">
              {t('mtrHistory')
                .replace('{amount}', fmt(history.sum, currency))
                .replace('{n}', String(history.n))}
              {history.prev > 0 && ` ${t('mtrHistoryPrev').replace('{amount}', fmt(history.prev, currency))}`}
            </p>
          )}

          <div className="nx-actions">
            {!isTransfer && <button onClick={() => { onDuplicate(tx); onClose() }}>{t('duplicate')}</button>}
            {tx.type === 'expense' && (
              <button onClick={() => {
                if (bote) { removeCaprice(bote.id); toast(t('capUnmarked'), { icon: 'check' }) }
                else { openCaprice(tx.id, tx.amount, tx.note); playSoftHaptic(); toast(t('capOpened'), { icon: 'piggy', type: 'ok' }) }
              }}>
                {bote ? t('mtrUncaprice') : t('mtrCaprice')}
              </button>
            )}
            <button onClick={() => { onClose(); onEdit(tx) }}>{t('mtrMore')}</button>
            {onDelete && (
              <button className="danger" onClick={() => {
                const id = tx.id
                onClose()
                playDeleteHaptic()
                requestAnimationFrame(() => onDelete(id))
              }}>{t('delete')}</button>
            )}
          </div>
        </section>
      </div>

      {sub === 'date' && (
        <MobileDatePicker
          value={tx.date}
          onChange={v => { setSub(null); if (v !== tx.date) change(tx, 'date', v, t('dateChangedTo').replace('{date}', shortDate(v))) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'account' && (
        <AccountPickSheet
          title={t('selectAccount')}
          accounts={accounts}
          value={tx.accountId ?? ''}
          onPick={id => { if (id !== tx.accountId) change(tx, 'accountId', id, t('accountChangedTo').replace('{name}', accounts.find(a => a.id === id)?.name ?? '')) }}
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
            if (id !== tx.categoryId) change(tx, 'categoryId', id, t('categoryChangedTo').replace('{name}', c ? translateCategoryName(c, lang as 'es') : ''))
          }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'note' && (
        <MobileTextSheet
          title={t('conceptLabel')}
          value={tx.note}
          placeholder={t('notePlaceholder')}
          onDone={v => { setSub(null); if (v.trim() && v.trim() !== tx.note) change(tx, 'note', v.trim(), t('mtrNoteChanged')) }}
          onClose={() => setSub(null)}
        />
      )}
      {sub === 'description' && (
        <MobileDescriptionSheet
          value={tx.description ?? ''}
          onDone={v => { setSub(null); if ((v.trim() || undefined) !== tx.description) change(tx, 'description', v.trim() || undefined, t('mtrNoteChanged')) }}
          onClose={() => setSub(null)}
        />
      )}
    </>,
    sheetRoot(),
  )
}
