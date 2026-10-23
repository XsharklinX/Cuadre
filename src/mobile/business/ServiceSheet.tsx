import { useState } from 'react'
import { prepaySaving, prepaySavingPct } from '@/data/billing'
import { serviceCostPerMonth, serviceMargin } from '@/data/business'
import { fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import type { BillingCycle } from '@/data/billing'
import type { CurrencyCode } from '@/types'
import { BizSheet, CurrencyPicker, CyclePicker, Field } from './shared'

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
  businessId, serviceId, onClose,
}: {
  businessId: string
  serviceId: string | null
  onClose: () => void
}) {
  const t = useT()
  const { currency } = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const { services, clients, businesses, addService, updateService, deleteService } = useBusiness()
  const existente = serviceId ? services.find(s => s.id === serviceId) : null
  const negocio = businesses.find(b => b.id === businessId)
  const slotLabel = negocio?.labels?.slot?.trim() || t('bizSlots')

  const [name, setName] = useState(existente?.name ?? '')
  const [cost, setCost] = useState(String(existente?.cost ?? ''))
  const [cycle, setCycle] = useState<BillingCycle>(existente?.costCycle ?? 'monthly')
  const [customMonths, setCustomMonths] = useState(existente?.costCustomMonths ?? 2)
  const [cur, setCur] = useState<CurrencyCode | undefined>(existente?.currency)
  const [listPrice, setListPrice] = useState(String(existente?.monthlyListPrice ?? ''))
  const [capacity, setCapacity] = useState(String(existente?.capacity ?? ''))

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
  const margen = existente ? serviceMargin(borrador, clients, currency) : null
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
    }
    if (existente) updateService(existente.id, fields)
    else addService(fields)
    onClose()
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

  return (
    <BizSheet
      title={existente ? existente.name : t('bizNewService')}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      onDelete={existente ? borrar : undefined}
      deleteLabel={t('bizDeleteService')}
    >
      <Field label={t('name')}>
        <input
          className="mbizs-input"
          value={name}
          autoCapitalize="words"
          placeholder={t('bizServiceNamePlaceholder')}
          onChange={e => setName(e.target.value)}
        />
      </Field>

      <Field label={t('bizCost')} hint={t('bizCostHint')}>
        <input
          className="mbizs-input"
          type="number"
          inputMode="decimal"
          value={cost}
          placeholder="0"
          onChange={e => setCost(e.target.value)}
        />
      </Field>

      <Field label={t('currency')}>
        <CurrencyPicker value={cur} base={currency} onChange={setCur} />
      </Field>

      <Field label={t('bizCostCycle')}>
        <CyclePicker value={cycle} onChange={setCycle} months={customMonths} onMonths={setCustomMonths} />
      </Field>

      {/* El equivalente mensual, en cuanto el ciclo no es mensual. Es la cifra
          con la que se compara el margen, y sin decirla parece salida de la
          nada. */}
      {monto > 0 && cycle !== 'monthly' && (
        <p className="mbizs-calc strong">
          {t('bizCostPerMonthIs').replace('{amount}', fmt(alMes, currency, { decimals: moneyDecimals }))}
        </p>
      )}

      <Field label={t('bizListPrice')} hint={t('bizListPriceHint')}>
        <input
          className="mbizs-input mbizs-input-sm"
          type="number"
          inputMode="decimal"
          value={listPrice}
          placeholder="0"
          onChange={e => setListPrice(e.target.value)}
        />
      </Field>

      {/*
        EL AHORRO DE PAGAR POR ADELANTADO.
        Crunchyroll, HBO y Disney tienen precio mensual y precio anual, y el
        anual sale mas barato: es el motivo de comprarlo asi. La app tenia el
        calculo desde el principio y lo enseñaba en una linea perdida al final,
        con un campo llamado «precio mensual suelto» que no decia lo que era.
        Ahora es un bloque con las tres cifras que importan: lo que te ahorras
        al año, el porcentaje —que es como lo anuncian— y a cuanto te sale el
        mes de verdad.
      */}
      {monto > 0 && (
        <div className="mbizs-summary">
          <div className="total" style={{ borderTop: 0, marginTop: 0, paddingTop: 0 }}>
            <span>{t('svcEffective').replace('{amount}', '').trim()}</span>
            <b>{fmt(alMes, currency, { decimals: moneyDecimals })}</b>
          </div>
          {!borrador.monthlyListPrice ? (
            <p>{t('svcSavingHintEmpty')}</p>
          ) : ahorro > 0 ? (
            <>
              <div>
                <span>{t('svcSavingTitle')}</span>
                <b className="income">
                  {t('svcSavingPerYear').replace('{amount}', fmt(ahorro, cur ?? currency, { decimals: moneyDecimals }))}
                </b>
              </div>
              <div>
                <span>{t('svcSavingPct').replace('{pct}', String(ahorroPct))}</span>
                <b className="income">{ahorroPct}%</b>
              </div>
            </>
          ) : (
            // Decirlo tambien cuando NO se ahorra: hay servicios cuyo plan
            // anual no sale mas barato, y eso es justo lo que conviene saber
            // antes de pagar un año por delante.
            <p>{t('svcNoSaving')}</p>
          )}
        </div>
      )}

      <Field label={slotLabel} hint={t('bizCapacityHint')}>
        <input
          className="mbizs-input mbizs-input-sm"
          type="number"
          min={0}
          inputMode="numeric"
          value={capacity}
          placeholder={t('bizNoLimit')}
          onChange={e => setCapacity(e.target.value)}
        />
      </Field>

      {margen && (
        <div className="mbizs-summary">
          <div><span>{t('bizCostMonthly')}</span><b className="expense">−{fmt(margen.cost, currency, { decimals: moneyDecimals })}</b></div>
          <div><span>{t('bizRevenueMonthly')}</span><b className="income">+{fmt(margen.revenue, currency, { decimals: moneyDecimals })}</b></div>
          <div className="total">
            <span>{t('bizMargin')}</span>
            <b className={margen.margin < 0 ? 'expense' : 'income'}>
              {margen.margin < 0 && '−'}{fmt(Math.abs(margen.margin), currency, { decimals: moneyDecimals })}
            </b>
          </div>
          {/* Lo que ninguna hoja de cálculo dice sin pelearse. */}
          {margen.breakEven !== null && (
            <p>{t('bizBreakEvenLong').replace('{n}', String(margen.breakEven))}</p>
          )}
        </div>
      )}
    </BizSheet>
  )
}
