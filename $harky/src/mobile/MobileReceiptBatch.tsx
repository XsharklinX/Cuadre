import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { accountCurrency, fmt, localToday } from '@/data/helpers'
import { recognizeReceipt } from '@/lib/receiptOcr'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useT } from '@/i18n'
import { CURRENCIES } from '@/data/seed'
import type { IconName } from '@/types'
import { MobileAmountSheet } from './MobileAmountSheet'
import { MobileDatePicker } from './MobileDatePicker'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'

const ACCT_ICONS: Record<string, IconName> = {
  cash: 'wallet', debit: 'cards', savings: 'piggy', credit: 'cards',
}

/**
 * `amount`/`date`/`cardLast4`/`merchant` vienen presentes cuando el recibo se
 * capturó con la cámara nativa (Fase 4/6 del roadmap) — ya trae la extracción
 * hecha, así que este ítem se salta `recognizeReceipt()` por completo.
 */
export interface BatchReceiptInput {
  dataUrl: string
  name: string
  amount?: number | null
  date?: string | null
  cardLast4?: string | null
  merchant?: string | null
}

interface BatchItem {
  id: string
  dataUrl: string
  name: string
  status: 'scanning' | 'done' | 'error'
  included: boolean
  amount: number
  date: string
  categoryId: string
  accountId: string
  note: string
  /** La cuenta se ubicó sola por los últimos 4 dígitos impresos en el recibo. */
  accountAutoMatched?: boolean
}

type EditingField = { itemId: string; field: 'amount' | 'date' | 'category' | 'account' } | null

export function MobileReceiptBatch({
  receipts,
  onDone,
  onCancel,
}: {
  receipts: BatchReceiptInput[]
  onDone: () => void
  onCancel: () => void
}) {
  const t = useT()
  const { accounts, categories, currency, addTx } = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const expenseCategories = categories.filter(c => c.type === 'expense')
  const defaultCategoryId = expenseCategories[0]?.id ?? ''
  const defaultAccountId = accounts[0]?.id ?? ''

  const [items, setItems] = useState<BatchItem[]>(() => receipts.map((r, i) => {
    const id = `receipt_${i}_${Date.now()}`
    const hasPreExtracted = r.amount != null || r.date != null || r.cardLast4 != null || r.merchant != null
    if (hasPreExtracted) {
      // Cámara nativa: ya viene con la extracción hecha, se salta el OCR.
      const cardMatches = r.cardLast4 ? accounts.filter(a => a.last4 === r.cardLast4) : []
      return {
        id,
        dataUrl: r.dataUrl,
        name: r.name,
        status: 'done',
        included: true,
        amount: r.amount ?? 0,
        date: r.date ?? localToday(),
        categoryId: defaultCategoryId,
        accountId: cardMatches.length === 1 ? cardMatches[0].id : defaultAccountId,
        accountAutoMatched: cardMatches.length === 1,
        note: r.merchant ?? t('scanReceipt'),
      }
    }
    return {
      id,
      dataUrl: r.dataUrl,
      name: r.name,
      status: 'scanning',
      included: true,
      amount: 0,
      date: localToday(),
      categoryId: defaultCategoryId,
      accountId: defaultAccountId,
      note: t('scanReceipt'),
    }
  }))
  const [scanIndex, setScanIndex] = useState(0)
  const [editing, setEditing] = useState<EditingField>(null)
  const [saving, setSaving] = useState(false)
  const started = useRef(false)

  useMobileBackDismiss(!!editing, () => setEditing(null))
  useMobileBackDismiss(!editing, onCancel)
  const dialogRef = useDialogA11y<HTMLDivElement>(onCancel, !editing)

  // Escanea los recibos uno por uno (no en paralelo — cada llamada crea/destruye
  // su propio worker de Tesseract, hacerlo en paralelo saturaría memoria).
  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      for (let i = 0; i < items.length; i++) {
        setScanIndex(i)
        const item = items[i]
        if (item.status !== 'scanning') continue // ya vino resuelto de la cámara nativa
        try {
          const result = await recognizeReceipt(item.dataUrl)
          // Últimos 4 dígitos de la tarjeta impresos en el recibo → ubica sola
          // la cuenta correcta, igual que en el flujo de un solo movimiento.
          const cardMatches = result.cardLast4 ? accounts.filter(a => a.last4 === result.cardLast4) : []
          setItems(prev => prev.map(it => it.id === item.id ? {
            ...it,
            status: 'done',
            amount: result.amount ?? 0,
            date: result.date ?? it.date,
            accountId: cardMatches.length === 1 ? cardMatches[0].id : it.accountId,
            accountAutoMatched: cardMatches.length === 1,
            note: result.merchant ?? it.note,
          } : it))
        } catch {
          setItems(prev => prev.map(it => it.id === item.id ? { ...it, status: 'error' } : it))
        }
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scanning = items.some(item => item.status === 'scanning')
  const includedItems = items.filter(item => item.included)
  const readyCount = includedItems.filter(item => item.amount > 0).length

  const updateItem = (id: string, fields: Partial<BatchItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...fields } : item))
  }

  const removeItem = (id: string) => updateItem(id, { included: false })

  const confirmAll = () => {
    const toSave = includedItems.filter(item => item.amount > 0)
    if (toSave.length === 0) { toast(t('scanNothingFound'), { icon: 'alert' }); return }
    setSaving(true)
    let created = 0
    for (const item of toSave) {
      try {
        addTx({
          type: 'expense',
          amount: item.amount,
          date: item.date,
          note: item.note.trim() || t('scanReceipt'),
          categoryId: item.categoryId,
          accountId: item.accountId,
        })
        created++
      } catch {
        // Se salta el recibo que falló y sigue con el resto del lote.
      }
    }
    setSaving(false)
    toast(t('receiptBatchSavedToast').replace('{n}', String(created)), { icon: 'check', type: 'ok' })
    onDone()
  }

  const editingItem = editing ? items.find(item => item.id === editing.itemId) : undefined

  return (
    <>
      <SheetPortal>
        <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('receiptBatchTitle')} onClick={onCancel}>
          <section className="mrb-sheet" onClick={e => e.stopPropagation()}>
            <header>
              <span>{t('receiptBatchTitle').replace('{n}', String(items.length))}</span>
              <button aria-label={t('close')} onClick={onCancel}><Icon name="close" size={18} /></button>
            </header>

            {scanning && (
              <div className="mrb-progress">
                <div className="mrb-progress-spinner" />
                <span>{t('receiptBatchScanning').replace('{current}', String(scanIndex + 1)).replace('{total}', String(items.length))}</span>
              </div>
            )}

            <div className="mrb-list">
              {items.filter(item => item.included).map(item => {
                const category = categories.find(c => c.id === item.categoryId)
                const account = accounts.find(a => a.id === item.accountId)
                return (
                  <div key={item.id} className="mrb-card">
                    <div className="mrb-card-top">
                      <img className="mrb-thumb" src={item.dataUrl} alt={item.name} />
                      <div className="mrb-card-info">
                        <input
                          className="mrb-note-input"
                          value={item.note}
                          onChange={e => updateItem(item.id, { note: e.target.value })}
                          placeholder={t('notePlaceholder')}
                        />
                        {item.status === 'scanning' ? (
                          <small className="mrb-status">{t('receiptBatchItemScanning')}</small>
                        ) : item.status === 'error' ? (
                          <small className="mrb-status warn">{t('scanFailed')}</small>
                        ) : item.amount <= 0 ? (
                          <small className="mrb-status warn">{t('receiptBatchNoAmount')}</small>
                        ) : null}
                      </div>
                      <button className="mrb-remove" aria-label={t('delete')} onClick={() => removeItem(item.id)}>
                        <Icon name="close" size={14} />
                      </button>
                    </div>

                    <div className="mrb-card-fields">
                      <button className="mrb-field" onClick={() => setEditing({ itemId: item.id, field: 'amount' })}>
                        <span className="mrb-field-label">{t('amount')}</span>
                        <strong className={item.amount > 0 ? '' : 'mrb-field-empty'}>
                          {item.amount > 0 ? fmt(item.amount, currency) : `${CURRENCIES[currency].symbol} 0`}
                        </strong>
                      </button>
                      <button className="mrb-field" onClick={() => setEditing({ itemId: item.id, field: 'date' })}>
                        <span className="mrb-field-label">{t('date')}</span>
                        <strong>{new Date(`${item.date}T00:00:00`).toLocaleDateString(lang === 'en' ? 'en-US' : 'es-DO', { day: 'numeric', month: 'short' })}</strong>
                      </button>
                    </div>
                    <div className="mrb-card-fields">
                      <button className="mrb-field" onClick={() => setEditing({ itemId: item.id, field: 'category' })}>
                        <span className="mrb-field-label">{t('category')}</span>
                        <strong>{category ? translateCategoryName(category, lang) : t('selectLabel')}</strong>
                      </button>
                      <button className="mrb-field" onClick={() => setEditing({ itemId: item.id, field: 'account' })}>
                        <span className="mrb-field-label">
                          {t('account')}
                          {item.accountAutoMatched && <Icon name="check" size={10} className="mrb-auto-badge" />}
                        </span>
                        <strong>{account?.name ?? t('selectLabel')}</strong>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mrb-actions">
              <button className="mrb-btn-cancel" onClick={onCancel}>{t('cancel')}</button>
              <button className="mrb-btn-save" disabled={saving || scanning || readyCount === 0} onClick={confirmAll}>
                {t('receiptBatchConfirmLabel').replace('{n}', String(readyCount))}
              </button>
            </div>
          </section>
        </div>
      </SheetPortal>

      {editing?.field === 'amount' && editingItem && (
        <MobileAmountSheet
          title={t('amount')}
          value={editingItem.amount}
          currency={currency}
          onDone={v => { updateItem(editingItem.id, { amount: v }); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}

      {editing?.field === 'date' && editingItem && (
        <MobileDatePicker
          value={editingItem.date}
          onChange={v => { updateItem(editingItem.id, { date: v }); setEditing(null) }}
          onClose={() => setEditing(null)}
        />
      )}

      {editing?.field === 'category' && editingItem && (
        <SheetPortal>
          <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setEditing(null)}>
            <section onClick={e => e.stopPropagation()}>
              <header>
                <span>{t('selectCategory')}</span>
                <button aria-label={t('close')} onClick={() => setEditing(null)}><Icon name="close" size={18} /></button>
              </header>
              <div className="mobile-picker-list">
                {expenseCategories.map(category => (
                  <button
                    key={category.id}
                    className={`mobile-picker-row${category.id === editingItem.categoryId ? ' active' : ''}`}
                    onClick={() => { updateItem(editingItem.id, { categoryId: category.id }); setEditing(null) }}
                  >
                    <span style={{ color: category.color }}><Icon name={category.icon} size={22} /></span>
                    <b>{translateCategoryName(category, lang)}</b>
                    {category.id === editingItem.categoryId && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </SheetPortal>
      )}

      {editing?.field === 'account' && editingItem && (
        <SheetPortal>
          <div className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" onClick={() => setEditing(null)}>
            <section onClick={e => e.stopPropagation()}>
              <header>
                <span>{t('selectAccount')}</span>
                <button aria-label={t('close')} onClick={() => setEditing(null)}><Icon name="close" size={18} /></button>
              </header>
              <div className="mobile-picker-list">
                {accounts.map(account => (
                  <button
                    key={account.id}
                    className={`mobile-picker-row${account.id === editingItem.accountId ? ' active' : ''}`}
                    onClick={() => { updateItem(editingItem.id, { accountId: account.id }); setEditing(null) }}
                  >
                    <span style={{ color: account.color }}><Icon name={ACCT_ICONS[account.type]} size={22} /></span>
                    <b>{account.name}</b>
                    <small>{fmt(account.balance, accountCurrency(account, currency))}</small>
                    {account.id === editingItem.accountId && <Icon name="check" size={16} style={{ color: 'var(--accent, #ffdd3d)', marginLeft: 4 }} />}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </SheetPortal>
      )}
    </>
  )
}
