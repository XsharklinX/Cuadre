import { useState } from 'react'
import { matchBrand } from '@/data/brandMatch'
import { SUBSCRIPTION_CATALOG } from '@/data/subscriptionCatalog'
import { BrandTile } from '@/components/ui/BrandTile'
import { playSoftHaptic } from '@/lib/sound'
import { CYCLE_KEY, prepaySaving, prepaySavingPct } from '@/data/billing'
import { serviceCostPerMonth } from '@/data/business'
import { fmt } from '@/data/helpers'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import type { BillingCycle } from '@/data/billing'
import type { CurrencyCode } from '@/types'
import { BizSheet, CurrencyPicker, CyclePicker, Field } from './shared'
import { BigAmount, FormNote, FormRow, FormRows } from './ShortForm'
import { NxSheet } from '@/components/ui/Phrase'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { MobileTextSheet } from '../MobileTextSheet'

/**
 * ALGO QUE REVENDES O ALQUILAS.
 *
 * ── EL CASO QUE OBLIGA A QUE EL CICLO SEA CONFIGURABLE ────────────────
 * Mucha gente compra las suscripciones ANUALES porque salen más baratas. Si el
 * coste se tratara como mensual, pagar RD$ 6,000 de golpe daría un mes de
 * −6,000 y once de ganancia pura: la ganancia mensual sería mentira doce veces
 * al año. Lo que cuesta de verdad al mes es 500, y es la cifra con la que se
 * compara el margen.
 *
 * Y el ahorro de haber pagado por adelantado se dice, porque es justo el motivo
 * de haberlo hecho así.
 */
export function ServiceSheet({
  businessId, serviceId, onClose, onCreated,
}: {
  businessId: string
  serviceId: string | null
  onClose: () => void
  /** K2 · El recién creado, para quien lo creó desde otra hoja. */
  onCreated?: (id: string) => void
}) {
  const t = useT()
  const { currency } = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const { services, clients, businesses, addService, updateService, deleteService } = useBusiness()
  const existente = serviceId ? services.find(s => s.id === serviceId) : null
  /*
   * Lo que se MIRA de un servicio —sus cuentas, sus pagos, lo que te deja,
   * moverlo o unirlo— vive en su pantalla (ver `ServiceScreen`). Aquí queda lo
   * que se configura, y por eso cabe en una hoja que se lee entera.
   */
  const negocio = businesses.find(b => b.id === businessId)
  const slotLabel = negocio?.labels?.slot?.trim() || t('bizSlots')

  const [name, setName] = useState(existente?.name ?? '')
  const [cost, setCost] = useState(String(existente?.cost ?? ''))
  const [cycle, setCycle] = useState<BillingCycle>(existente?.costCycle ?? 'monthly')
  const [customMonths, setCustomMonths] = useState(existente?.costCustomMonths ?? 2)
  const [cur, setCur] = useState<CurrencyCode | undefined>(existente?.currency)
  const [listPrice, setListPrice] = useState(String(existente?.monthlyListPrice ?? ''))
  const [capacity, setCapacity] = useState(String(existente?.capacity ?? ''))
  const [slotPrice, setSlotPrice] = useState(String(existente?.slotPrice ?? ''))
  /* La marca que parece ser, mientras se escribe el nombre. */
  const marca = matchBrand(name)

  const monto = Number(cost) || 0
  const canSave = name.trim().length > 0

  const borrador = {
    id: existente?.id ?? 'draft',
    businessId,
    name: name.trim(),
    cost: monto,
    costCycle: cycle,
    costCustomMonths: cycle === 'custom' ? customMonths : undefined,
    currency: cur,
    monthlyListPrice: Number(listPrice) > 0 ? Number(listPrice) : undefined,
    capacity: Number(capacity) > 0 ? Math.round(Number(capacity)) : undefined,
    createdAt: existente?.createdAt ?? Date.now(),
  }

  const alMes = serviceCostPerMonth(borrador, currency)
  // Con todas las plazas llenas al precio por plaza: solo si hay las dos cifras.
  const precioPlaza = Number(slotPrice) > 0 ? Number(slotPrice) : 0
  const llenas = borrador.capacity && precioPlaza > 0
    ? Math.round((borrador.capacity * precioPlaza - alMes) * 100) / 100
    : null
  const ahorro = borrador.monthlyListPrice
    ? prepaySaving({ amount: monto, cycle, customMonths }, borrador.monthlyListPrice)
    : 0
  const ahorroPct = borrador.monthlyListPrice
    ? prepaySavingPct({ amount: monto, cycle, customMonths }, borrador.monthlyListPrice)
    : 0

  const save = () => {
    if (!canSave) return
    const fields = {
      businessId,
      name: borrador.name,
      cost: monto,
      costCycle: cycle,
      costCustomMonths: borrador.costCustomMonths,
      currency: cur,
      monthlyListPrice: borrador.monthlyListPrice,
      capacity: borrador.capacity,
      slotPrice: precioPlaza > 0 ? precioPlaza : undefined,
    }
    if (existente) { updateService(existente.id, fields); onClose(); return }
    const id = addService(fields)
    if (onCreated) onCreated(id)
    else onClose()
  }

  const borrar = () => {
    if (!existente) return
    const copia = { ...existente }
    const enganchados = clients.filter(c => c.serviceId === existente.id).map(c => c.id)
    onClose()
    deleteWithUndo({
      message: t('bizServiceDeleted'),
      onDelete: () => deleteService(copia.id),
      onRestore: () => useBusiness.setState(s => ({
        services: [...s.services, copia],
        clients: s.clients.map(c => enganchados.includes(c.id) ? { ...c, serviceId: copia.id } : c),
      })),
    })
  }

  // N2 · Cuál hoja pequeña está abierta: cada fila abre la suya.
  const [sub, setSub] = useState<'name' | 'cost' | 'cycle' | 'cur' | 'cap' | 'slot' | 'list' | null>(null)
  const cicloTxt = cycle === 'custom'
    ? t('n28EveryNMonths').replace('{n}', String(customMonths))
    : t(CYCLE_KEY[cycle] as LangKey)
  const dineroSvc = (n: number) => fmt(n, cur ?? currency, { decimals: moneyDecimals })
  // Desde qué plaza deja de perder: la cuenta que se hacía de cabeza.
  const desde = precioPlaza > 0 && alMes > 0 ? Math.ceil(alMes / precioPlaza) : null

  return (
    <BizSheet
      title={existente ? existente.name : t('bizNewService')}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      missing={!name.trim() ? t('fieldName') : null}
      onDelete={existente ? borrar : undefined}
      deleteLabel={t('bizDeleteService')}
    >
      {/* S5 · Crear tocando su logo: pone el nombre, las plazas y el ciclo. */}
      {!existente && (
        <div className="f28-brands" role="group" aria-label={t('svcPickBrand')}>
          {SUBSCRIPTION_CATALOG.filter(m => m.slots).slice(0, 12).map(m => (
            <button
              key={m.id}
              type="button"
              className={name.trim().toLowerCase() === m.name.toLowerCase() ? 'on' : ''}
              aria-label={m.name}
              onClick={() => {
                setName(m.name)
                setCycle('monthly')
                if (m.slots) setCapacity(String(m.slots))
                playSoftHaptic()
              }}
            >
              <BrandTile name={m.name} size={38} />
            </button>
          ))}
        </div>
      )}

      {!existente && marca && marca.slots && Number(capacity) !== marca.slots && (
        <FormNote
          icon="info"
          color="var(--m-primary)"
          title={t('svcBrandFound').replace('{name}', marca.name)}
          sub={<button type="button" className="f28-link" onClick={() => { setCycle('monthly'); setCapacity(String(marca.slots)); playSoftHaptic() }}>{t('svcBrandSlots').replace('{n}', String(marca.slots))} · {t('svcBrandApply')}</button>}
        />
      )}

      <BigAmount
        label={t('n28CostsYou').replace('{cycle}', cicloTxt.toLowerCase())}
        value={monto > 0 ? dineroSvc(monto) : t('n28TapToWrite')}
        sub={<>
          {cycle !== 'monthly' && monto > 0 ? `${t('bizCostPerMonthIs').replace('{amount}', fmt(alMes, currency, { decimals: moneyDecimals }))} · ` : ''}
          <button type="button" className="f28-link" onClick={() => setSub('cur')}>{cur ?? currency} · {t('n28Change')}</button>
        </>}
        empty={!(monto > 0)}
        onTap={() => setSub('cost')}
      />

      <Field label={t('name')} needs={!name.trim()}>
        <FormRows>
          <FormRow label={t('name')} value={name.trim()} placeholder={t('bizServiceNamePlaceholder')} missing={!name.trim()} onTap={() => setSub('name')} />
          <FormRow label={t('n28HowOften')} value={cicloTxt} onTap={() => setSub('cycle')} />
          <FormRow label={slotLabel} value={borrador.capacity ? String(borrador.capacity) : ''} placeholder={t('bizNoLimit')} onTap={() => setSub('cap')} />
          <FormRow label={t('svcSlotPrice')} value={precioPlaza > 0 ? dineroSvc(precioPlaza) : ''} placeholder={t('n28Optional')} onTap={() => setSub('slot')} />
          <FormRow label={t('bizListPrice')} value={borrador.monthlyListPrice ? dineroSvc(borrador.monthlyListPrice) : ''} placeholder={t('n28Optional')} onTap={() => setSub('list')} />
        </FormRows>
      </Field>

      {llenas !== null && (
        <FormNote
          icon={llenas < 0 ? 'alert' : 'check'}
          color={llenas < 0 ? 'var(--m-expense)' : 'var(--m-income)'}
          title={t(llenas < 0 ? 'svcFullLoses' : 'svcFullLeaves')
            .replace('{n}', String(borrador.capacity))
            .replace('{amount}', fmt(Math.abs(llenas), currency, { decimals: moneyDecimals }))}
          sub={desde !== null && desde <= (borrador.capacity ?? 0) ? t('n28BreakEven').replace('{n}', String(desde)) : undefined}
        />
      )}
      {borrador.monthlyListPrice && monto > 0 ? (
        <FormNote
          icon="piggy"
          color={ahorro > 0 ? 'var(--m-income)' : 'var(--m-muted)'}
          title={ahorro > 0 ? t('svcSavingPerYear').replace('{amount}', fmt(ahorro, cur ?? currency, { decimals: moneyDecimals })) : t('svcNoSaving')}
          sub={ahorro > 0 ? t('svcSavingPct').replace('{pct}', String(ahorroPct)) : undefined}
        />
      ) : null}

      {sub === 'name' && (
        <MobileTextSheet title={t('name')} value={name} placeholder={t('bizServiceNamePlaceholder')} onDone={v => { setName(v); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'cost' && (
        <MobileAmountSheet title={t('bizCost')} value={monto} currency={cur ?? currency} onDone={v => { setCost(String(v)); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'slot' && (
        <MobileAmountSheet title={t('svcSlotPrice')} value={precioPlaza} currency={cur ?? currency} onDone={v => { setSlotPrice(v > 0 ? String(v) : ''); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'list' && (
        <MobileAmountSheet title={t('bizListPrice')} value={Number(listPrice) || 0} currency={cur ?? currency} onDone={v => { setListPrice(v > 0 ? String(v) : ''); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'cap' && (
        <MobileAmountSheet title={slotLabel} value={Number(capacity) || 0} unit={t('n28SeatsUnit')} onDone={v => { setCapacity(v > 0 ? String(Math.round(v)) : ''); setSub(null) }} onClose={() => setSub(null)} />
      )}
      {sub === 'cycle' && (
        <NxSheet title={t('n28HowOften')} sub={t('bizCostHint')} onClose={() => setSub(null)} footer={<button className="nx-btn pri" onClick={() => setSub(null)}>{t('done')}</button>}>
          <CyclePicker value={cycle} onChange={setCycle} months={customMonths} onMonths={setCustomMonths} />
        </NxSheet>
      )}
      {sub === 'cur' && (
        <NxSheet title={t('currency')} onClose={() => setSub(null)} footer={<button className="nx-btn pri" onClick={() => setSub(null)}>{t('done')}</button>}>
          <CurrencyPicker value={cur} base={currency} onChange={c => { setCur(c); setSub(null) }} />
        </NxSheet>
      )}
    </BizSheet>
  )
}
