import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { ACCENT_COLORS } from '@/constants'
import { newId } from '@/data/seed'
import { translateCategoryName, useT } from '@/i18n'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { AccountType, Category } from '@/types'
import { BizSheet, Field } from './shared'

/**
 * K1 · K2 · ELEGIR, Y SI FALTA, CREARLO AHÍ MISMO.
 *
 * ── LO QUE PASABA ─────────────────────────────────────────────────────
 * Al pagar un servicio de un negocio sin categoría de gasto, la lista salía
 * vacía y Guardar no se encendía, sin decir por qué. Había que salir, ir al
 * negocio, marcarle una, volver y empezar otra vez. Igual con las cuentas y
 * con las categorías de un cliente.
 *
 * ── LO QUE HAY AHORA ──────────────────────────────────────────────────
 * Cada lista termina en «＋ Nueva». Se crea en una hoja ENCIMA, con lo mínimo
 * para guardar, y al volver ya está elegida. Si es para un negocio, queda
 * añadida a ese negocio: crearla y luego tener que ir a marcarla sería el
 * mismo viaje de antes con un paso menos.
 */

/** Las categorías como botones, con «＋ Nueva» al final. */
export function CategoryChips({
  type, value, onChange, only, businessId, emptyHint,
}: {
  type: 'income' | 'expense'
  value: string
  onChange: (id: string) => void
  /** Solo estas, si hay alguna. Vacío o ausente = todas las de ese tipo. */
  only?: string[]
  /** Si la nueva se crea para un negocio, se le añade a él. */
  businessId?: string
  /** Lo que se dice cuando no hay ninguna que ofrecer. */
  emptyHint?: string
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const categories = useFinance(s => s.categories)
  const [creando, setCreando] = useState(false)
  const delTipo = categories.filter(c => c.type === type)
  const lista = only?.length ? delTipo.filter(c => only.includes(c.id)) : delTipo

  return (
    <>
      {lista.length === 0 && emptyHint && <p className="mbizs-calc warn">{emptyHint}</p>}
      <div className="mbizs-chips mcf-dots" role="group">
        {lista.map(c => (
          <button
            key={c.id}
            type="button"
            className={value === c.id ? 'on' : ''}
            aria-pressed={value === c.id}
            onClick={() => onChange(c.id)}
          >
            <i style={{ background: c.color }} />{translateCategoryName(c, lang)}
          </button>
        ))}
        <button type="button" className="mpick-add" onClick={() => { playSoftHaptic(); setCreando(true) }}>
          <Icon name="plus" size={12} /> {t('pickNewCategory')}
        </button>
      </div>
      {creando && (
        <NewCategorySheet
          type={type}
          businessId={businessId}
          onClose={() => setCreando(false)}
          onCreated={id => { onChange(id); setCreando(false) }}
        />
      )}
    </>
  )
}

export function NewCategorySheet({
  type, businessId, suggestedName = '', onClose, onCreated,
}: {
  type: 'income' | 'expense'
  businessId?: string
  suggestedName?: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const t = useT()
  const ensureCategory = useFinance(s => s.ensureCategory)
  const negocio = useBusiness(s => s.businesses.find(b => b.id === businessId))
  const [name, setName] = useState(suggestedName)
  const [color, setColor] = useState<string>(type === 'income' ? '#35d0a2' : '#ff6b8a')
  // Lo mismo que pide el almacén al crear una: un nombre con alguna letra.
  const valido = /\p{L}/u.test(name)

  const crear = () => {
    if (!valido) return
    const nueva: Category = {
      id: newId('cat_'), name: name.trim(), type, color, budget: 0,
      icon: type === 'income' ? 'handCoins' : 'receipt',
    }
    const id = ensureCategory(nueva)
    if (negocio) {
      const campo = type === 'income' ? 'incomeCategoryIds' : 'expenseCategoryIds'
      useBusiness.getState().updateBusiness(negocio.id, { [campo]: [...negocio[campo], id] })
    }
    toast(t('pickCategoryCreated').replace('{name}', nueva.name), { icon: 'check', type: 'ok' })
    onCreated(id)
  }

  return (
    <BizSheet
      title={type === 'income' ? t('pickNewIncomeCat') : t('pickNewExpenseCat')}
      onClose={onClose}
      onSave={crear}
      canSave={valido}
      saveLabel={t('pickCreateUse')}
    >
      <Field label={t('name')}>
        <input className="mbizs-input" value={name} autoFocus onChange={e => setName(e.target.value)} />
      </Field>
      <Field label={t('color')}>
        <div className="mpick-colors" role="group">
          {ACCENT_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={color === c ? 'on' : ''}
              aria-pressed={color === c}
              aria-label={c}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </Field>
      {negocio && (
        <p className="mbizs-calc">{t('pickAddsToBusiness').replace('{name}', negocio.name)}</p>
      )}
    </BizSheet>
  )
}

/** Las cuentas como botones con su color, con «＋ Cuenta» al final. */
export function AccountChips({
  value, onChange, allowCredit = false,
}: {
  value: string
  onChange: (id: string) => void
  /** Una suscripción se paga con tarjeta; un cobro no entra a una tarjeta. */
  allowCredit?: boolean
}) {
  const t = useT()
  const accounts = useFinance(s => s.accounts)
  const [creando, setCreando] = useState(false)
  const lista = accounts.filter(a => allowCredit || a.type !== 'credit')
  return (
    <>
      <div className="mbizs-chips mcf-dots" role="group">
        {lista.map(a => (
          <button
            key={a.id}
            type="button"
            className={value === a.id ? 'on' : ''}
            aria-pressed={value === a.id}
            onClick={() => onChange(a.id)}
          >
            <i style={{ background: a.color }} />{a.name}
          </button>
        ))}
        <button type="button" className="mpick-add" onClick={() => { playSoftHaptic(); setCreando(true) }}>
          <Icon name="plus" size={12} /> {t('pickNewAccount')}
        </button>
      </div>
      {creando && (
        <NewAccountSheet
          onClose={() => setCreando(false)}
          onCreated={id => { onChange(id); setCreando(false) }}
        />
      )}
    </>
  )
}

export function NewAccountSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useT()
  const addAccount = useFinance(s => s.addAccount)
  const yaHayEfectivo = useFinance(s => s.accounts.some(a => a.type === 'cash'))
  const [name, setName] = useState('')
  const [type, setType] = useState<AccountType>('debit')
  const [color, setColor] = useState<string>(ACCENT_COLORS[1] ?? '#5bc0ff')
  const valido = name.trim().length > 0

  const crear = () => {
    if (!valido) return
    const antes = new Set(useFinance.getState().accounts.map(a => a.id))
    try {
      addAccount({
        name: name.trim(),
        short: name.trim().slice(0, 2).toUpperCase(),
        type,
        color,
        balance: 0,
        last4: null,
        includeInTotal: true,
      })
    } catch (error) {
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
      return
    }
    // `addAccount` no devuelve el id: es la que no estaba antes.
    const nueva = useFinance.getState().accounts.find(a => !antes.has(a.id))
    if (nueva) onCreated(nueva.id)
  }

  const TIPOS: Array<{ id: AccountType; key: 'pickAccDebit' | 'pickAccSavings' | 'pickAccCash' | 'pickAccCredit' }> = [
    { id: 'debit', key: 'pickAccDebit' },
    { id: 'savings', key: 'pickAccSavings' },
    ...(yaHayEfectivo ? [] : [{ id: 'cash' as const, key: 'pickAccCash' as const }]),
    { id: 'credit', key: 'pickAccCredit' },
  ]

  return (
    <BizSheet title={t('pickNewAccountTitle')} onClose={onClose} onSave={crear} canSave={valido} saveLabel={t('pickCreateUse')}>
      <Field label={t('name')}>
        <input className="mbizs-input" value={name} autoFocus placeholder={t('pickAccountPlaceholder')} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label={t('pickAccountType')}>
        <div className="mbizs-chips" role="group">
          {TIPOS.map(x => (
            <button key={x.id} type="button" className={type === x.id ? 'on' : ''} aria-pressed={type === x.id} onClick={() => setType(x.id)}>
              {t(x.key)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t('color')}>
        <div className="mpick-colors" role="group">
          {ACCENT_COLORS.map(c => (
            <button key={c} type="button" className={color === c ? 'on' : ''} aria-pressed={color === c} aria-label={c} style={{ background: c }} onClick={() => setColor(c)} />
          ))}
        </div>
      </Field>
      <p className="mbizs-calc">{t('pickAccountStartsAtZero')}</p>
    </BizSheet>
  )
}
