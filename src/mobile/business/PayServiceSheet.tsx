import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY } from '@/data/billing'
import { alreadyPaid, servicePayment } from '@/data/investment'
import { convertCurrency } from '@/data/currencies'
import { fmt, localToday, prevMonthKey } from '@/data/helpers'
import { newId } from '@/data/seed'
import { advanceRecurrenceDate } from '@/hooks/useRecurring'
import { translateCategoryName, useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playExpenseSound } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useSettings } from '@/store/settings'
import { useFinance } from '@/store/finance'
import { useJuice } from '@/store/juice'
import { BizSheet, Field } from './shared'

/**
 * PAGAR UN SERVICIO DESDE NEGOCIO.
 *
 * ── QUÉ FALTABA ───────────────────────────────────────────────────────
 * Negocio sabía lo que cuesta un servicio y no había forma de pagarlo. Tienes
 * el dinero en tus cuentas, toca la suscripción, y había que salir al
 * formulario de gastos de siempre y acordarse de elegir la categoría correcta
 * para que el negocio contara ese gasto. Si te equivocabas de categoría, el
 * negocio decía que no te costaba nada.
 *
 * ── LO QUE CREA ───────────────────────────────────────────────────────
 * Un GASTO NORMAL del libro, por `addTx`. No hay un registro de pagos aparte:
 * el gasto es el pago, y el negocio lo cuenta porque su categoría es una de
 * las suyas. Misma regla que todo el módulo — se deriva, no se duplica.
 *
 * Y puede quedar programado como recurrente, usando la maquinaria que la app
 * ya tiene: así una suscripción anual se paga sola el año que viene.
 */
export function PayServiceSheet({
  serviceId, onClose,
}: {
  serviceId: string
  onClose: () => void
}) {
  const t = useT()
  const { accounts, categories, currency, transactions, addTx } = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const markLanded = useJuice(s => s.markLanded)
  const { services, businesses } = useBusiness()

  const service = services.find(s => s.id === serviceId)
  const negocio = service ? businesses.find(b => b.id === service.businessId) : null

  const pago = service ? servicePayment(service, currency) : null
  // Todas las cuentas, tarjetas incluidas: una suscripcion se paga con tarjeta
  // mas a menudo que con efectivo.

  /*
   * La categoría por defecto es la PRIMERA de gasto del negocio.
   *
   * Es lo que hace que el pago cuente: si cae en otra categoría, el negocio no
   * lo ve y su ganancia sale inflada. Por eso se elige aquí y no se deja al
   * azar del formulario general.
   */
  const catsDelNegocio = categories.filter(c =>
    c.type === 'expense' && negocio?.expenseCategoryIds.includes(c.id))
  const [categoryId, setCategoryId] = useState(catsDelNegocio[0]?.id ?? '')
  const [amount, setAmount] = useState(String(pago?.amount ?? ''))
  const [date, setDate] = useState(localToday())
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')
  const [repetir, setRepetir] = useState(true)
  const [guardando, setGuardando] = useState(false)

  if (!service || !pago) return null

  /*
   * La recurrencia que la app sabe repetir, o `null`.
   *
   * Solo semanal y mensual: son las dos que `RecurrenceFrequency` admite. Un
   * ciclo trimestral o anual no se puede programar sin inventarse ocurrencias,
   * asi que no se programa y se le dice al usuario.
   */
  const recurrencia = service.costCycle === 'weekly'
    ? 'weekly' as const
    : service.costCycle === 'monthly'
      ? 'monthly' as const
      : null

  const monto = Number(amount) || 0
  const cuenta = accounts.find(a => a.id === accountId)
  const canSave = monto > 0 && !!cuenta && !!categoryId && !guardando

  /*
   * ¿Ya se pagó en el plazo que cubre?
   *
   * Con una suscripción anual es muy fácil pagarla dos veces: no te acuerdas de
   * si lo hiciste en marzo. Se avisa, no se bloquea — puede haber un segundo
   * pago legítimo (una cuenta más).
   */
  const desde = pago.perMonth > 0 && service.costCycle !== 'monthly'
    ? `${new Date().getFullYear()}-01-01`
    : `${prevMonthKey(localToday().slice(0, 7))}-28`
  const yaPagado = alreadyPaid(pago, negocio?.expenseCategoryIds ?? [], transactions, desde)

  const pagar = () => {
    if (!canSave || !cuenta) return
    setGuardando(true)
    try {
      // El libro guarda SIEMPRE en la divisa de la cuenta. Si el servicio está
      // en otra, se convierte y se deja la memoria de lo que se pagó de verdad.
      const cuentaCur = cuenta.currency ?? currency
      const servicioCur = pago.currency ?? currency
      const enCuenta = servicioCur === cuentaCur
        ? monto
        : Math.round(convertCurrency(monto, servicioCur, cuentaCur) * 100) / 100
      const tasa = servicioCur === cuentaCur ? undefined : Math.round((enCuenta / monto) * 10_000) / 10_000

      const txId = newId()
      addTx({
        id: txId,
        type: 'expense',
        date,
        amount: enCuenta,
        note: service.name,
        categoryId,
        accountId: cuenta.id,
        ...(tasa ? { originalAmount: monto, originalCurrency: servicioCur, fxRate: tasa } : {}),
        /*
         * Programado SOLO si el ciclo es uno que la app sabe repetir.
         *
         * `RecurrenceFrequency` es 'weekly' | 'monthly' y nada mas. Marcar un
         * pago anual como «mensual» le propondria al usuario pagar Netflix
         * doce veces al año, que es peor que no programarlo: en vez de un
         * olvido tendria once gastos inventados.
         *
         * Para los ciclos largos no se programa y se dice por que.
         */
        ...(repetir && recurrencia
          ? {
              recurring: recurrencia,
              recurringStart: date,
              recurringNext: advanceRecurrenceDate(date, recurrencia),
            }
          : {}),
      })
      markLanded(txId)
      playExpenseSound()
      toast(t('invPaidToast').replace('{name}', service.name), { icon: 'check', type: 'ok' })
      onClose()
    } catch (error) {
      setGuardando(false)
      toast(error instanceof Error ? error.message : t('couldNotSave'), { icon: 'alert' })
    }
  }

  return (
    <BizSheet
      title={t('invPayTitle').replace('{name}', service.name)}
      onClose={onClose}
      onSave={pagar}
      canSave={canSave}
      saveLabel={t('invPayAction')}
    >
      <div className="mbizs-hero">
        <small>{t('invToPay')}</small>
        <strong>{fmt(pago.amount, pago.currency ?? currency, { decimals: moneyDecimals })}</strong>
        <span>
          {t(CYCLE_KEY[service.costCycle] as LangKey)}
          {pago.accountCount > 1 && ` · ${t('invNAccounts').replace('{n}', String(pago.accountCount))}`}
        </span>
      </div>

      {/* El equivalente mensual, cuando el ciclo no es mensual: es la cifra con
          la que se compara el margen, y el pago no se le parece. */}
      {service.costCycle !== 'monthly' && pago.perMonth > 0 && (
        <p className="mbizs-calc strong">
          {t('bizCostPerMonthIs').replace('{amount}', fmt(pago.perMonth, currency, { decimals: moneyDecimals }))}
        </p>
      )}

      {yaPagado && (
        <p className="mbizs-calc warn">
          <Icon name="alert" size={12} />
          {' '}
          {t('invAlreadyPaid').replace('{date}', yaPagado.date)}
        </p>
      )}

      <Field label={t('amount')}>
        <input
          className="mbizs-input"
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
      </Field>

      <Field label={t('date')}>
        <input
          className="mbizs-input mbizs-input-sm"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
        />
      </Field>

      <Field label={t('invPaidFrom')}>
        <select className="mbizs-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">{t('selectAccount')}</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      {/* La categoría es lo que hace que el negocio CUENTE este gasto. Si cae
          en otra, el negocio dice que no le cuesta nada. */}
      <Field label={t('invCategory')} hint={t('invCategoryHint')}>
        <select className="mbizs-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">{t('category')}</option>
          {catsDelNegocio.map(c => (
            <option key={c.id} value={c.id}>{translateCategoryName(c, lang)}</option>
          ))}
        </select>
      </Field>

      {catsDelNegocio.length === 0 && (
        <p className="mbizs-calc warn">{t('invNoCategoriesWarn')}</p>
      )}

      {recurrencia ? (
        <button type="button" className={`mbizs-toggle${repetir ? ' on' : ''}`} onClick={() => setRepetir(v => !v)}>
          <span>
            <b>{t('invRepeat')}</b>
            <small>{t('invRepeatHint')}</small>
          </span>
          <i />
        </button>
      ) : service.costCycle !== 'once' && service.costCycle !== 'none' ? (
        // Se dice en vez de callarlo: el usuario esperaria que un pago anual
        // se programara, y conviene que sepa que tendra que acordarse.
        <p className="mbizs-calc">{t('invNoRecurring')}</p>
      ) : null}

      {cuenta && (pago.currency ?? currency) !== (cuenta.currency ?? currency) && monto > 0 && (
        <p className="mbizs-calc">
          {t('invLeavesAs').replace('{amount}', fmt(
            Math.round(convertCurrency(monto, pago.currency ?? currency, cuenta.currency ?? currency) * 100) / 100,
            cuenta.currency ?? currency,
            { decimals: moneyDecimals },
          ))}
        </p>
      )}
    </BizSheet>
  )
}
