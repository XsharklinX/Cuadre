import { useState } from 'react'
import { toast } from '@/components/ui/Toast'
import { cycleMonths } from '@/data/billing'
import { serviceAccounts, type PayMode } from '@/data/business'
import { serviceDueDates } from '@/data/autopay'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { BizSheet, DayPicker, Field, WeekdayPicker } from './shared'
import { AccountChips, CategoryChips } from './Pickers'

/**
 * P4 · CÓMO SE PAGA ESTE SERVICIO: solo, con aviso o a mano.
 *
 * Se elige servicio por servicio porque no todos son iguales: Netflix nunca
 * falla y se puede dejar solo; un hosting que cambia de precio mejor que
 * pregunte; lo que se paga por proyecto, a mano.
 *
 * Lo que hace falta para automatizar es poco y se pide una vez: el día, de
 * qué cuenta sale y en qué categoría entra. La línea de abajo dice cuándo
 * será el próximo, para que no haya que fiarse.
 */
export function PayConfigSheet({ serviceId, onClose }: { serviceId: string; onClose: () => void }) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const moneyDecimals = useMoneyDecimals()
  const { currency, accounts } = useFinance()
  const { services, businesses, updateService } = useBusiness()
  const service = services.find(s => s.id === serviceId)
  const negocio = service ? businesses.find(b => b.id === service.businessId) : null
  const hoy = localToday()

  const [mode, setMode] = useState<PayMode>(service?.payMode ?? 'auto')
  const [day, setDay] = useState(service?.payDay ?? Number(hoy.slice(8, 10)))
  const [anchor, setAnchor] = useState(service?.payAnchor ?? hoy)
  const [accountId, setAccountId] = useState(service?.payAccountId ?? accounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(service?.payCategoryId ?? negocio?.expenseCategoryIds[0] ?? '')

  if (!service) return null

  const meses = cycleMonths(service.costCycle, service.costCustomMonths)
  const semanal = service.costCycle === 'weekly'
  // Los de varios meses y el quincenal necesitan saber CUÁNDO empezó: un
  // anual de marzo y uno de octubre tienen el mismo día 15.
  const conAncla = service.costCycle === 'biweekly' || (meses !== null && meses > 1)
  const sinCiclo = meses === null && service.costCycle !== 'biweekly'
  const automatico = mode !== 'manual'
  const canSave = !automatico || (!!accountId && !!categoryId)

  const borrador = {
    ...service,
    payMode: mode,
    payDay: conAncla ? Number(anchor.slice(8, 10)) : day,
    payAnchor: conAncla ? anchor : undefined,
  }
  const proximo = automatico
    ? serviceAccounts(borrador)
      .flatMap(a => serviceDueDates(borrador, a, hoy, `${Number(hoy.slice(0, 4)) + 2}-12-31`))
      .sort()[0]
    : undefined

  const guardar = () => {
    if (!canSave) return
    updateService(service.id, {
      payMode: mode,
      payDay: borrador.payDay,
      payAnchor: borrador.payAnchor,
      payAccountId: accountId || undefined,
      payCategoryId: categoryId || undefined,
      /*
       * DESDE HOY, nunca antes.
       * Si ya estaba configurado se respeta su fecha: cambiar de cuenta no
       * puede volver a rellenar meses ya resueltos. Si es nuevo, hoy.
       */
      payFrom: service.payFrom ?? hoy,
    })
    playSoftHaptic()
    toast(t(mode === 'manual' ? 'payCfgSavedManual' : 'payCfgSaved'), { icon: 'check', type: 'ok' })
    onClose()
  }

  const MODOS: Array<{ id: PayMode; key: 'payModeAuto' | 'payModeAsk' | 'payModeManual'; hint: 'payModeAutoHint' | 'payModeAskHint' | 'payModeManualHint' }> = [
    { id: 'auto', key: 'payModeAuto', hint: 'payModeAutoHint' },
    { id: 'ask', key: 'payModeAsk', hint: 'payModeAskHint' },
    { id: 'manual', key: 'payModeManual', hint: 'payModeManualHint' },
  ]

  return (
    <BizSheet title={t('payCfgTitle').replace('{name}', service.name)} onClose={onClose} onSave={guardar} canSave={canSave}>
      <div className="mpay-modes" role="radiogroup" aria-label={t('payCfgTitle').replace('{name}', service.name)}>
        {MODOS.map(m => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            className={mode === m.id ? 'on' : ''}
            onClick={() => { setMode(m.id); playSoftHaptic() }}
          >
            <b>{t(m.key)}</b>
            <small>{t(m.hint)}</small>
          </button>
        ))}
      </div>

      {sinCiclo && automatico && <p className="mbizs-calc warn">{t('payCfgNoCycle')}</p>}

      {automatico && !sinCiclo && (
        <>
          {conAncla ? (
            <Field label={t('payCfgFirst')} hint={t('payCfgFirstHint')}>
              <input className="mbizs-input mbizs-input-sm" type="date" value={anchor} onChange={e => setAnchor(e.target.value || hoy)} />
            </Field>
          ) : semanal ? (
            <Field label={t('bizWeekday')}>
              <WeekdayPicker value={day} onChange={setDay} />
            </Field>
          ) : (
            <Field label={t('payCfgDay')}>
              <DayPicker value={day} onChange={setDay} />
            </Field>
          )}

          <Field label={t('invPaidFrom')}>
            <AccountChips value={accountId} onChange={setAccountId} allowCredit />
          </Field>

          <Field label={t('invCategory')} hint={t('invCategoryHint')}>
            <CategoryChips
              type="expense"
              value={categoryId}
              onChange={setCategoryId}
              only={negocio?.expenseCategoryIds}
              businessId={negocio?.id}
              emptyHint={t('payCfgNoCats')}
            />
          </Field>

          {proximo && (
            <p className="mbizs-calc strong">
              {t(mode === 'auto' ? 'payCfgNextAuto' : 'payCfgNextAsk')
                .replace('{date}', new Date(`${proximo}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' }))
                .replace('{amount}', fmt(serviceAccounts(service).reduce((s, a) => s + a.cost, 0), service.currency ?? currency, { decimals: moneyDecimals }))}
            </p>
          )}
          <p className="mbizs-calc">{t('payCfgNoDouble')}</p>
        </>
      )}
    </BizSheet>
  )
}
