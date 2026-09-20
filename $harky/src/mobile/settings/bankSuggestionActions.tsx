import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { guessCategoryId } from '@/data/bankCsv'
import { resolveDetectedAccount } from '@/data/bankIngest'
import { accountCurrency, fmtCompact, visibleAccounts } from '@/data/helpers'
import { useBankSuggestions, type BankSuggestion } from '@/store/bankSuggestions'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useT } from '@/i18n'
import type { Account, AccountType, Category, CurrencyCode, IconName } from '@/types'
import { SheetPortal } from '../SheetPortal'
import { useDialogA11y } from '../useDialogA11y'
import { useMobileBackDismiss } from '../useMobileBackDismiss'

export const ACCT_ICONS: Record<AccountType, IconName> = {
  cash: 'wallet', debit: 'cards', savings: 'piggy', credit: 'cards',
}

/**
 * Acciones compartidas para convertir una transacción detectada por aviso
 * bancario (`BankSuggestion`) en un movimiento real. Lo usan tanto la campanita
 * (MobileNotificationCenter) como Ajustes > Detección de transacciones, para no
 * duplicar el flujo de "elegir cuenta + agregar".
 *
 *  - `resolveFor(item)`  → la cuenta que le corresponde por el mapeo recordado
 *    del paquete de la app bancaria (o `undefined` si aún no se ha elegido una).
 *  - `handleAdd(item)`   → si ya hay cuenta resuelta, agrega el movimiento de
 *    una; si no, abre el selector de cuenta.
 *  - `openPicker(item)`  → abre el selector de cuenta para el aviso.
 *  - `pickerNode`        → el sheet del selector (renderízalo una vez en el árbol).
 */
export function useBankSuggestionActions() {
  const { accounts, categories, addTx, updateAccount, currency } = useFinance()
  const bankStore = useBankSuggestions()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const t = useT()
  const [pickerItem, setPickerItem] = useState<BankSuggestion | null>(null)
  const [catPickerItem, setCatPickerItem] = useState<BankSuggestion | null>(null)
  // El usuario puede corregir la categoría sugerida antes de agregar; se recuerda
  // por aviso hasta que se agrega o descarta.
  const [categoryOverrides, setCategoryOverrides] = useState<Record<string, string>>({})

  const resolveFor = (item: BankSuggestion): Account | undefined =>
    resolveDetectedAccount(accounts, bankStore.packageAccountMap, item.cardLast4, item.pkg)

  /** Categoría sugerida (o corregida) para un aviso, ya resuelta a un objeto. */
  const categoryFor = (item: BankSuggestion): Category | undefined => {
    const id = categoryOverrides[item.id] ?? guessCategoryId(item.note, categories, item.type, false)
    return id ? categories.find(c => c.id === id) : undefined
  }

  const addFromSuggestion = (item: BankSuggestion, account: Account) => {
    // Categoría: la corrección del usuario manda; si no, la sugerida por comercio
    // (`allowFallback=false`: sin coincidencia se deja SIN categoría en vez de
    // adivinar mal). Al guardar categorizando, la app aprende la regla.
    const categoryId = categoryOverrides[item.id] ?? guessCategoryId(item.note, categories, item.type, false)
    addTx({
      type: item.type,
      amount: item.amount,
      date: item.date,
      note: item.note,
      accountId: account.id,
      categoryId,
    })
    bankStore.remove(item.id)
    setCategoryOverrides(({ [item.id]: _drop, ...rest }) => rest)
    toast(categoryId ? t('movementAddedCategorized') : t('movementAdded'), { icon: 'check', type: 'ok' })
  }

  const handleAdd = (item: BankSuggestion) => {
    const account = resolveFor(item)
    if (account) {
      addFromSuggestion(item, account)
    } else {
      setPickerItem(item)
    }
  }

  const openPicker = (item: BankSuggestion) => setPickerItem(item)
  const openCategoryPicker = (item: BankSuggestion) => setCatPickerItem(item)

  const closePicker = () => setPickerItem(null)

  const chooseAccount = (item: BankSuggestion, account: Account) => {
    // Si el aviso traía los 4 dígitos y la cuenta elegida aún no los tiene, se
    // los guardamos: a partir de ahí ese last4 la resuelve sola (es justo lo que
    // pidió el usuario, "que funcione de una vez por todas"). No se sobreescribe
    // un last4 ya puesto ni se toca si otra cuenta ya usa esos dígitos.
    if (item.cardLast4 && !account.last4 && !accounts.some(a => a.last4 === item.cardLast4)) {
      updateAccount(account.id, { last4: item.cardLast4 })
    }
    // Recuerda además el mapeo por app, como respaldo para avisos sin last4.
    bankStore.rememberAccountForPackage(item.pkg, account.id)
    addFromSuggestion(item, account)
    closePicker()
  }

  const chooseCategory = (item: BankSuggestion, category: Category) => {
    setCategoryOverrides(prev => ({ ...prev, [item.id]: category.id }))
    setCatPickerItem(null)
  }

  const pickerNode = (
    <>
      <AccountPickerSheet
        item={pickerItem}
        accounts={visibleAccounts(accounts)}
        currency={currency as CurrencyCode}
        onChoose={chooseAccount}
        onClose={closePicker}
      />
      <CategoryPickerSheet
        item={catPickerItem}
        categories={categories.filter(c => c.type === (catPickerItem?.type ?? 'expense'))}
        lang={lang}
        onChoose={chooseCategory}
        onClose={() => setCatPickerItem(null)}
      />
    </>
  )

  return { handleAdd, openPicker, openCategoryPicker, categoryFor, resolveFor, pickerNode }
}

function CategoryPickerSheet({ item, categories, lang, onChoose, onClose }: {
  item: BankSuggestion | null
  categories: Category[]
  lang: 'en' | 'es'
  onChoose: (item: BankSuggestion, category: Category) => void
  onClose: () => void
}) {
  const t = useT()
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !!item, false)
  useMobileBackDismiss(!!item, onClose)

  if (!item) return null

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" style={{ zIndex: 440 }} role="dialog" aria-modal="true" onClick={onClose}>
        <section onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('selectCategory')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          <div className="mobile-picker-list">
            {categories.map(category => (
              <button key={category.id} className="mobile-picker-row" onClick={() => onChoose(item, category)}>
                <span style={{ color: category.color }}>
                  <Icon name={category.icon} size={22} />
                </span>
                <b>{translateCategoryName(category, lang)}</b>
              </button>
            ))}
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}

function AccountPickerSheet({ item, accounts, currency, onChoose, onClose }: {
  item: BankSuggestion | null
  accounts: Account[]
  currency: CurrencyCode
  onChoose: (item: BankSuggestion, account: Account) => void
  onClose: () => void
}) {
  const t = useT()
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, !!item, false)
  useMobileBackDismiss(!!item, onClose)

  if (!item) return null

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true" onClick={onClose}>
        <section onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('chooseAccountForLabel').replace('{note}', item.note)}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          {accounts.length === 0 ? (
            <div className="mobile-picker-list" style={{ padding: '24px', textAlign: 'center', color: 'var(--text-dim)' }}>
              {t('noAccountsYet')}
            </div>
          ) : (
            <div className="mobile-picker-list">
              {accounts.map(account => (
                <button key={account.id} className="mobile-picker-row" onClick={() => onChoose(item, account)}>
                  <span style={{ color: account.color }}>
                    <Icon name={ACCT_ICONS[account.type] ?? 'wallet'} size={22} />
                  </span>
                  <b>{account.name}</b>
                  <small>{fmtCompact(account.balance, accountCurrency(account, currency))}</small>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </SheetPortal>
  )
}
