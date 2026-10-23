import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ACCENT_COLORS } from '@/constants'
import { deleteWithUndo } from '@/lib/undoDelete'
import { translateCategoryName, useT } from '@/i18n'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { IconName } from '@/types'
import { BizSheet, Field } from './shared'

/**
 * UN NEGOCIO.
 *
 * Declara qué categorías son sus cobros y qué categorías son sus costes; la
 * ganancia sale de ahí. NO guarda dinero — ver el comentario largo en
 * `data/business.ts` sobre por qué no hay un saldo paralelo.
 *
 * ── LAS PALABRAS ──────────────────────────────────────────────────────
 * Lo que para uno es «cliente» para otro es estudiante, inquilino, paciente o
 * socio. Son solo etiquetas y no cambian nada del comportamiento, pero una app
 * que llama «cliente» al alumno al que le das clases se siente prestada, y eso
 * basta para que alguien no la use.
 */

const ICONS: IconName[] = [
  'briefcase', 'play', 'laptop', 'book', 'graduation', 'building', 'cart',
  'tool', 'brush', 'camera', 'headphones', 'car', 'home', 'heart', 'scissors', 'package',
]

export function BusinessSheet({ businessId, onClose }: { businessId: string | null; onClose: () => void }) {
  const t = useT()
  const { categories, accounts } = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const { businesses, services, clients, addBusiness, updateBusiness, deleteBusiness } = useBusiness()
  const existente = businessId ? businesses.find(b => b.id === businessId) : null

  const [name, setName] = useState(existente?.name ?? '')
  const [color, setColor] = useState(existente?.color ?? ACCENT_COLORS[0] ?? '#35d0a2')
  const [icon, setIcon] = useState<IconName>(existente?.icon ?? 'briefcase')
  const [incomeIds, setIncomeIds] = useState<string[]>(existente?.incomeCategoryIds ?? [])
  const [expenseIds, setExpenseIds] = useState<string[]>(existente?.expenseCategoryIds ?? [])
  const [setAside, setSetAside] = useState(String(existente?.setAsidePct ?? ''))
  const [setAsideAccountId, setSetAsideAccountId] = useState(existente?.setAsideAccountId ?? '')
  const [labelClient, setLabelClient] = useState(existente?.labels?.client ?? '')
  const [labelService, setLabelService] = useState(existente?.labels?.service ?? '')
  const [labelSlot, setLabelSlot] = useState(existente?.labels?.slot ?? '')
  const [showLabels, setShowLabels] = useState(false)

  const incomeCats = categories.filter(c => c.type === 'income')
  const expenseCats = categories.filter(c => c.type === 'expense')
  const canSave = name.trim().length > 0

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const save = () => {
    if (!canSave) return
    const pct = Number(setAside)
    const labels = (labelClient.trim() || labelService.trim() || labelSlot.trim())
      ? {
          client: labelClient.trim() || undefined,
          service: labelService.trim() || undefined,
          slot: labelSlot.trim() || undefined,
        }
      : undefined
    const fields = {
      name: name.trim(),
      color,
      icon,
      labels,
      incomeCategoryIds: incomeIds,
      expenseCategoryIds: expenseIds,
      setAsidePct: Number.isFinite(pct) && pct > 0 ? Math.min(100, pct) : undefined,
      // Sin porcentaje, la cuenta sobra: guardarla dejaría un destino
      // apuntando a nada que luego nadie entiende de dónde salió.
      setAsideAccountId: Number.isFinite(pct) && pct > 0 ? (setAsideAccountId || undefined) : undefined,
    }
    if (existente) updateBusiness(existente.id, fields)
    else addBusiness(fields)
    onClose()
  }

  const borrar = () => {
    if (!existente) return
    const copia = { ...existente }
    const suyos = services.filter(s => s.businessId === existente.id)
    const enganchados = clients.filter(c => c.businessId === existente.id).map(c => ({ ...c }))
    onClose()
    deleteWithUndo({
      message: t('bizBusinessDeleted'),
      onDelete: () => deleteBusiness(copia.id),
      onRestore: () => useBusiness.setState(s => ({
        businesses: [...s.businesses, copia],
        services: [...s.services, ...suyos.filter(v => !s.services.some(x => x.id === v.id))],
        // Los clientes no se borraron: solo quedaron sin agrupar, así que se
        // les devuelve su negocio y su servicio.
        clients: s.clients.map(c => {
          const antes = enganchados.find(e => e.id === c.id)
          return antes ? { ...c, businessId: antes.businessId, serviceId: antes.serviceId } : c
        }),
      })),
    })
  }

  return (
    <BizSheet
      title={existente ? existente.name : t('bizNewBusiness')}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      onDelete={existente ? borrar : undefined}
      deleteLabel={t('bizDeleteBusiness')}
    >
      <Field label={t('name')}>
        <input
          className="mbizs-input"
          value={name}
          autoCapitalize="words"
          placeholder={t('bizBusinessNamePlaceholder')}
          onChange={e => setName(e.target.value)}
        />
      </Field>

      <Field label={t('icon')}>
        <div className="mbizs-icons">
          {ICONS.map(name2 => (
            <button
              key={name2}
              type="button"
              className={icon === name2 ? 'on' : ''}
              aria-pressed={icon === name2}
              onClick={() => setIcon(name2)}
            >
              <Icon name={name2} size={18} />
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('color')}>
        <div className="mbizs-colors">
          {ACCENT_COLORS.map(c => (
            <button
              key={c}
              type="button"
              className={color === c ? 'on' : ''}
              aria-pressed={color === c}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </Field>

      {/* De aquí sale la ganancia: sin categorías marcadas, el negocio no sabe
          qué movimientos son suyos y la ganancia sería cero. */}
      <Field label={t('bizIncomeCats')} hint={t('bizIncomeCatsHint')}>
        <div className="mbizs-chips">
          {incomeCats.map(c => (
            <button
              key={c.id}
              type="button"
              className={incomeIds.includes(c.id) ? 'on' : ''}
              aria-pressed={incomeIds.includes(c.id)}
              onClick={() => toggle(incomeIds, setIncomeIds, c.id)}
            >
              {translateCategoryName(c, lang)}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('bizExpenseCats')} hint={t('bizExpenseCatsHint')}>
        <div className="mbizs-chips">
          {expenseCats.map(c => (
            <button
              key={c.id}
              type="button"
              className={expenseIds.includes(c.id) ? 'on' : ''}
              aria-pressed={expenseIds.includes(c.id)}
              onClick={() => toggle(expenseIds, setExpenseIds, c.id)}
            >
              {translateCategoryName(c, lang)}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t('bizSetAsidePct')} hint={t('bizSetAsidePctHint')}>
        <input
          className="mbizs-input mbizs-input-sm"
          type="number"
          min={0}
          max={100}
          inputMode="numeric"
          value={setAside}
          placeholder="0"
          onChange={e => setSetAside(e.target.value)}
        />
      </Field>

      {/*
        A DONDE VA LO APARTADO.
        Sin cuenta, apartar es un consejo: la hoja de cobro decia «aparta 500»
        y el dinero se quedaba donde estaba. Un porcentaje que nadie mueve no
        protege de nada — llega el trimestre de los impuestos y ya se gasto.
        Con una cuenta, cada cobro hace la transferencia de verdad.
      */}
      {Number(setAside) > 0 && (
        <Field label={t('bizSetAsideTo')} hint={t('bizSetAsideToHint')}>
          <select
            className="mbizs-input"
            value={setAsideAccountId}
            onChange={e => setSetAsideAccountId(e.target.value)}
          >
            <option value="">{t('bizSetAsideToNone')}</option>
            {accounts.filter(a => a.type !== 'credit').map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </Field>
      )}

      {/* Las palabras van plegadas: la mayoría no las toca, y un formulario que
          pide tres sinónimos antes de dejarte guardar espanta. */}
      <button type="button" className="mbizs-more" onClick={() => setShowLabels(v => !v)} aria-expanded={showLabels}>
        <Icon name="tag" size={14} /> {t('bizLabelsTitle')}
        <Icon name={showLabels ? 'arrowUp' : 'arrowDn'} size={12} />
      </button>

      {showLabels && (
        <>
          <p className="mbizs-field-hint">{t('bizLabelsHint')}</p>
          <Field label={t('bizLabelClient')}>
            <input
              className="mbizs-input"
              value={labelClient}
              placeholder={t('bizLabelClientPlaceholder')}
              onChange={e => setLabelClient(e.target.value)}
            />
          </Field>
          <Field label={t('bizLabelService')}>
            <input
              className="mbizs-input"
              value={labelService}
              placeholder={t('bizLabelServicePlaceholder')}
              onChange={e => setLabelService(e.target.value)}
            />
          </Field>
          <Field label={t('bizLabelSlot')}>
            <input
              className="mbizs-input"
              value={labelSlot}
              placeholder={t('bizLabelSlotPlaceholder')}
              onChange={e => setLabelSlot(e.target.value)}
            />
          </Field>
        </>
      )}
    </BizSheet>
  )
}
