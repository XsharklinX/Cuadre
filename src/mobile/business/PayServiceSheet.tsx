import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY } from '@/data/billing'
import { serviceAccounts } from '@/data/business'
import { isScheduled } from '@/data/autopay'
import { alreadyPaid, servicePayment } from '@/data/investment'
import { convertCurrency } from '@/data/currencies'
import { dateLocale, fmt, localToday, prevMonthKey } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { newId } from '@/data/seed'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playExpenseSound } from '@/lib/sound'
import { settleManualPayment } from '@/lib/businessOps'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useJuice } from '@/store/juice'
import { BizSheet } from './shared'
import { CategoryChips } from './Pickers'
import { BigAmount, FormNote, FormRow, FormRows } from './ShortForm'
import { NxSheet } from '@/components/ui/Phrase'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { MobileDatePicker } from '../MobileDatePicker'
import { AccountPickSheet } from '../goals/GoalBits'

/**
 * PAGAR UN SERVICIO DESDE NEGOCIO.
 *
 * Crea un GASTO NORMAL del libro, por `addTx`, marcado con el servicio y la
 * cuenta que paga (ver `paidService` y `paidAccount`). Si el servicio se paga
 * solo, el pago automático de esas fechas queda resuelto: así no se registra
 * dos veces.
 *
 * ── LO QUE CAMBIÓ ─────────────────────────────────────────────────────
 *  · K1: si el negocio no tiene categoría de gasto, se crea aquí mismo. Antes
 *    la lista salía vacía y Guardar no se encendía, sin decir por qué.
 *  · P1: «que se registre solo» deja el servicio en automático con el día, la
 *    cuenta y la categoría de este pago. Sustituye al «repetir» de antes, que
 *    creaba un recurrente del libro: con los pagos solos, los dos a la vez
 *    habrían registrado Netflix dos veces al mes. Y ese solo sabía de meses y
 *    semanas; esto sabe de años.
 */
export function PayServiceSheet({ serviceId, onClose }: { serviceId: string; onClose: () => void }) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const { accounts, categories, currency, transactions, addTx } = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const markLanded = useJuice(s => s.markLanded)
  const { services, businesses, updateService } = useBusiness()

  const service = services.find(s => s.id === serviceId)
  const negocio = service ? businesses.find(b => b.id === service.businessId) : null
  const pago = service ? servicePayment(service, currency) : null
  const cuentasServicio = service ? serviceAccounts(service) : []

  const [categoryId, setCategoryId] = useState(service?.payCategoryId ?? negocio?.expenseCategoryIds[0] ?? '')
  /*
   * CON VARIAS CUENTAS se paga una: Netflix con dos cuentas son dos pagos,
   * a veces en días distintos. Se propone el total de todas, y al elegir una
   * se cambia al de esa.
   */
  const [cualCuenta, setCualCuenta] = useState<string>('all')
  const [amount, setAmount] = useState(String(pago?.amount ?? ''))
  const [date, setDate] = useState(localToday())
  const [accountId, setAccountId] = useState(service?.payAccountId ?? accounts[0]?.id ?? '')
  const [solo, setSolo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hoja, setHoja] = useState<'amount' | 'date' | 'account' | 'cat' | 'which' | null>(null)

  if (!service || !pago) return null

  const programado = isScheduled(service) && (service.payMode ?? 'manual') !== 'manual'
  const monto = Number(amount) || 0
  const cuenta = accounts.find(a => a.id === accountId)
  const canSave = monto > 0 && !!cuenta && !!categoryId && !guardando

  const desde = pago.perMonth > 0 && service.costCycle !== 'monthly'
    ? `${new Date().getFullYear()}-01-01`
    : `${prevMonthKey(localToday().slice(0, 7))}-28`
  const yaPagado = alreadyPaid(pago, negocio?.expenseCategoryIds ?? [], transactions, desde)

  const elegirCuenta = (id: string) => {
    setCualCuenta(id)
    const c = cuentasServicio.find(a => a.id === id)
    setAmount(String(c ? c.cost : pago.amount))
  }

  const pagar = () => {
    if (!canSave || !cuenta) return
    setGuardando(true)
    try {
      const cuentaCur = cuenta.currency ?? currency
      const servicioCur = pago.currency ?? currency
      const enCuenta = servicioCur === cuentaCur
        ? monto
        : Math.round(convertCurrency(monto, servicioCur, cuentaCur) * 100) / 100
      const tasa = servicioCur === cuentaCur ? undefined : Math.round((enCuenta / monto) * 10_000) / 10_000
      const una = cualCuenta === 'all' ? (cuentasServicio.length === 1 ? cuentasServicio[0].id : undefined) : cualCuenta

      const txId = newId()
      addTx({
        id: txId,
        type: 'expense',
        date,
        amount: enCuenta,
        note: service.name,
        categoryId,
        accountId: cuenta.id,
        paidService: service.id,
        ...(una ? { paidAccount: una } : {}),
        ...(tasa ? { originalAmount: monto, originalCurrency: servicioCur, fxRate: tasa } : {}),
      })

      // Lo que tocaba pagar cerca de esta fecha queda resuelto. Pagando todas
      // las cuentas de una vez, todas.
      for (const a of una ? [una] : cuentasServicio.map(x => x.id)) settleManualPayment(service, a, date)

      /*
       * P1 · QUE SE REGISTRE SOLO desde el siguiente.
       * `payFrom` es el día después de este pago, para que el pago automático
       * no vuelva a crear justo el que se acaba de hacer a mano.
       */
      if (solo && !programado) {
        const manana = new Date(`${date}T00:00:00`)
        manana.setDate(manana.getDate() + 1)
        updateService(service.id, {
          payMode: 'auto',
          payDay: Number(date.slice(8, 10)),
          payAnchor: date,
          payAccountId: cuenta.id,
          payCategoryId: categoryId,
          payFrom: localToday(manana),
        })
      }

      markLanded(txId)
      playExpenseSound()
      toast(t('invPaidToast').replace('{name}', service.name), { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      setGuardando(false)
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
    }
  }

  const fechaYa = yaPagado ? new Date(`${yaPagado.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' }) : ''
  const nombreCuentaSvc = (id: string) => {
    const i = cuentasServicio.findIndex(a => a.id === id)
    return i < 0 ? '' : (cuentasServicio[i].label?.trim() || t('svcAccountN').replace('{n}', String(i + 1)))
  }
  const categoria = categories.find(c => c.id === categoryId)

  return (
    <BizSheet
      title={t('invPayTitle').replace('{name}', service.name)}
      onClose={onClose}
      onSave={pagar}
      canSave={canSave}
      saveLabel={yaPagado ? t('n28PayAgain') : t('invPayAction')}
    >
      {/* N5 · Si ya se pagó este ciclo, se dice primero y con la fecha en palabras. */}
      {yaPagado && (
        <FormNote icon="alert" color="#f59e0b" title={t('n28AlreadyPaid').replace('{date}', fechaYa)} sub={t('n28AlreadyPaidSub')} />
      )}

      <BigAmount
        label={t('invToPay')}
        value={fmt(monto || pago.amount, pago.currency ?? currency, { decimals: moneyDecimals })}
        sub={<>
          {t(CYCLE_KEY[service.costCycle] as LangKey)}
          {pago.accountCount > 1 && ` · ${t('invNAccounts').replace('{n}', String(pago.accountCount))}`}
          {service.costCycle !== 'monthly' && pago.perMonth > 0 && ` · ${t('bizCostPerMonthIs').replace('{amount}', fmt(pago.perMonth, currency, { decimals: moneyDecimals }))}`}
        </>}
        onTap={() => setHoja('amount')}
      />

      <FormRows>
        {cuentasServicio.length > 1 && (
          <FormRow label={t('payWhichAccount')} value={cualCuenta === 'all' ? t('payAllAccounts') : nombreCuentaSvc(cualCuenta)} onTap={() => setHoja('which')} />
        )}
        <FormRow label={t('date')} value={new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' })} onTap={() => setHoja('date')} />
        <FormRow label={t('invPaidFrom')} value={cuenta?.name ?? ''} placeholder={t('noAccountLabel')} missing={!cuenta} onTap={() => setHoja('account')} />
        <FormRow label={t('invCategory')} value={categoria?.name ?? ''} placeholder={t('payNoCatsYet')} missing={!categoryId} onTap={() => setHoja('cat')} />
        {programado ? (
          <FormRow label={t('n28PaysAlone')} value={t(service.payMode === 'auto' ? 'payIsAuto' : 'payIsAsk')} />
        ) : service.costCycle !== 'once' && service.costCycle !== 'none' ? (
          <FormRow label={t('n28PayAlone')} value={solo ? t('yes') : t('no')} tone={solo ? 'ok' : undefined} onTap={() => setSolo(v => !v)} />
        ) : null}
      </FormRows>

      {cuenta && (pago.currency ?? currency) !== (cuenta.currency ?? currency) && monto > 0 && (
        <p className="mbizs-calc">
          {t('invLeavesAs').replace('{amount}', fmt(
            Math.round(convertCurrency(monto, pago.currency ?? currency, cuenta.currency ?? currency) * 100) / 100,
            cuenta.currency ?? currency,
            { decimals: moneyDecimals },
          ))}
        </p>
      )}

      {hoja === 'amount' && (
        <MobileAmountSheet title={t('amount')} value={monto} currency={pago.currency ?? currency} onDone={v => { setAmount(String(v)); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'date' && (
        <MobileDatePicker value={date} onChange={v => { setDate(v); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'account' && (
        <AccountPickSheet title={t('invPaidFrom')} accounts={accounts} value={accountId} onPick={id => { setAccountId(id); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'cat' && (
        <NxSheet title={t('invCategory')} sub={t('invCategoryHint')} onClose={() => setHoja(null)} footer={<button className="nx-btn pri" onClick={() => setHoja(null)}>{t('done')}</button>}>
          <CategoryChips
            type="expense"
            value={categoryId}
            onChange={id => { setCategoryId(id); setHoja(null) }}
            only={negocio?.expenseCategoryIds}
            businessId={negocio?.id}
            emptyHint={t('payNoCatsYet')}
          />
        </NxSheet>
      )}
      {hoja === 'which' && (
        <NxSheet title={t('payWhichAccount')} onClose={() => setHoja(null)}>
          <div className="nx-list">
            <button type="button" className="an28-pick" onClick={() => { elegirCuenta('all'); setHoja(null) }}>
              <span className="an28-row-main"><b>{t('payAllAccounts')}</b></span>
              {cualCuenta === 'all' && <Icon name="check" size={16} />}
            </button>
            {cuentasServicio.map(a => (
              <button key={a.id} type="button" className="an28-pick" onClick={() => { elegirCuenta(a.id); setHoja(null) }}>
                <span className="an28-row-main"><b>{nombreCuentaSvc(a.id)}</b><small>{fmt(a.cost, pago.currency ?? currency, { decimals: moneyDecimals })}</small></span>
                {cualCuenta === a.id && <Icon name="check" size={16} />}
              </button>
            ))}
          </div>
        </NxSheet>
      )}
    </BizSheet>
  )
}
