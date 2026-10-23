import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { cycleMonths } from '@/data/billing'
import { clientPerMonth, nextDueDate } from '@/data/clients'
import { nameAlreadyUsed } from '@/data/duplicateClients'
import { fmt, localToday } from '@/data/helpers'
import { translateCategoryName, useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { deleteWithUndo } from '@/lib/undoDelete'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { BillingCycle } from '@/data/billing'
import type { CurrencyCode } from '@/types'
import { BizSheet, CurrencyPicker, CyclePicker, DayPicker, Field, WeekdayPicker } from './shared'

/**
 * LA FICHA DE UN CLIENTE.
 *
 * Guarda lo que hace falta para no volver a teclearlo nunca: cuánto te paga,
 * cada cuánto, qué día, a qué cuenta deposita y en qué categoría entra. Con eso
 * registrar un pago pasa a ser un toque en vez de un formulario.
 *
 * El nombre es lo único obligatorio. Todo lo demás se puede dejar para después:
 * un formulario que exige nueve campos para guardar un contacto es un
 * formulario que nadie rellena.
 */
export function ClientSheet({ clientId, onClose }: { clientId: string | null; onClose: () => void }) {
  const t = useT()
  const { accounts, categories, currency } = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const moneyDecimals = useMoneyDecimals()
  const { clients, businesses, services, charges, addClient, updateClient, deleteClient } = useBusiness()
  const existente = clientId ? clients.find(c => c.id === clientId) : null

  const incomeCats = categories.filter(c => c.type === 'income')
  const usableAccounts = accounts.filter(a => a.type !== 'credit')

  const [name, setName] = useState(existente?.name ?? '')
  const [phone, setPhone] = useState(existente?.phone ?? '')
  const [concept, setConcept] = useState(existente?.concept ?? '')
  const [amount, setAmount] = useState(String(existente?.amount ?? ''))
  const [variable, setVariable] = useState(existente?.variableAmount ?? false)
  const [cycle, setCycle] = useState<BillingCycle>(existente?.cycle ?? 'monthly')
  const [customMonths, setCustomMonths] = useState(existente?.customMonths ?? 2)
  const [dueDay, setDueDay] = useState(existente?.dueDay ?? 1)
  const [startDate, setStartDate] = useState(existente?.startDate ?? localToday())
  const [cur, setCur] = useState<CurrencyCode | undefined>(existente?.currency)
  const [accountId, setAccountId] = useState(existente?.accountId ?? usableAccounts[0]?.id ?? '')
  const [categoryId, setCategoryId] = useState(existente?.categoryId ?? incomeCats[0]?.id ?? '')
  const [businessId, setBusinessId] = useState(existente?.businessId ?? '')
  const [serviceId, setServiceId] = useState(existente?.serviceId ?? '')
  /*
   * VARIOS SERVICIOS, CADA UNO CON SU PRECIO.
   *
   * Un cliente puede comprarte Netflix Y Disney. Antes había que inventarse un
   * segundo cliente con el mismo nombre, y su historial quedaba partido en dos
   * personas que no existen.
   *
   * Se guarda el precio de cada uno y no un reparto del total porque Netflix a
   * 250 y Disney a 150 no son 200 y 200: repartir a partes iguales sería
   * inventarse el dato con el que luego se calcula si el servicio compensa.
   */
  const [shares, setShares] = useState<Array<{ serviceId: string; amount: number }>>(
    existente?.serviceShares?.length ? existente.serviceShares : [],
  )
  const [varios, setVarios] = useState((existente?.serviceShares?.length ?? 0) > 0)
  const [active, setActive] = useState(existente?.active ?? true)
  const [notes, setNotes] = useState(existente?.notes ?? '')

  const monto = Number(amount) || 0
  // Con varios servicios, lo que se le cobra es la SUMA, no el campo de
  // arriba: quien genera los cobros usa esta cifra (ver clientTotalAmount).
  const totalShares = Math.round(shares.reduce((sum, v) => sum + v.amount, 0) * 100) / 100
  // Solo el nombre es obligatorio; el resto se puede completar luego.
  const canSave = name.trim().length > 0

  // Semanal y quincenal usan día de la semana y ancla; los de meses usan día
  // del mes. Enseñar los tres campos siempre confundiría más que ayudar.
  const meses = cycleMonths(cycle, customMonths)
  const usaDiaDelMes = meses !== null && meses >= 1
  const usaAncla = cycle === 'biweekly' || cycle === 'once' || (meses !== null && meses > 1)

  const serviciosDelNegocio = services.filter(s => s.businessId === businessId)

  /*
   * MEJOR QUE DETECTARLOS ES NO TENERLOS.
   *
   * Avisa mientras escribes. Y enseña de paso que un cliente puede tener
   * VARIOS servicios — que es justo lo que la gente no sabía que podía hacer,
   * y la razón por la que hay duplicados.
   */
  const yaExiste = existente ? null : nameAlreadyUsed(name, clients)

  const save = () => {
    if (!canSave) return
    const fields = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      concept: concept.trim(),
      amount: variable ? monto : monto,
      variableAmount: variable || undefined,
      currency: cur,
      cycle,
      customMonths: cycle === 'custom' ? customMonths : undefined,
      dueDay: usaDiaDelMes ? dueDay : (cycle === 'weekly' ? dueDay : 1),
      startDate: usaAncla ? startDate : undefined,
      accountId,
      categoryId,
      businessId: businessId || undefined,
      // Las dos formas no conviven: con varios, `serviceId` sobra y dejarlo
      // haría que `clientServices` tuviera dos respuestas para lo mismo.
      serviceId: varios ? undefined : (serviceId || undefined),
      serviceShares: varios ? shares.filter(v => v.serviceId && v.amount > 0) : undefined,
      active,
      notes: notes.trim() || undefined,
    }
    if (existente) updateClient(existente.id, fields)
    else addClient(fields)
    onClose()
  }

  const borrar = () => {
    if (!existente) return
    const copia = { ...existente }
    const suyos = charges.filter(c => c.clientId === existente.id)
    onClose()
    deleteWithUndo({
      message: t('bizClientDeleted'),
      onDelete: () => deleteClient(copia.id),
      onRestore: () => {
        // Se reinserta tal cual, con sus cobros pendientes: `deleteClient` solo
        // se lleva los que nadie había pagado.
        useBusiness.setState(s => ({
          clients: [...s.clients, copia],
          charges: [...s.charges, ...suyos.filter(c => !s.charges.some(x => x.id === c.id))],
        }))
      },
    })
  }

  const proxima = existente ? nextDueDate({ ...existente, cycle, dueDay, startDate, customMonths }, localToday()) : null

  return (
    <BizSheet
      title={existente ? existente.name : t('bizNewClient')}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      onDelete={existente ? borrar : undefined}
      deleteLabel={t('bizDeleteClient')}
    >
      <Field label={t('name')}>
        <input
          className="mbizs-input"
          value={name}
          autoCapitalize="words"
          placeholder={t('bizClientNamePlaceholder')}
          onChange={e => setName(e.target.value)}
        />
        {yaExiste && (
          <small className="mbizs-dup-warn">
            {t('bizNameTaken').replace('{name}', yaExiste.name)}
          </small>
        )}
      </Field>

      <Field label={t('bizConcept')} hint={t('bizConceptHint')}>
        <input
          className="mbizs-input"
          value={concept}
          placeholder={t('bizConceptPlaceholder')}
          onChange={e => setConcept(e.target.value)}
        />
      </Field>

      <Field label={t('bizPhone')} hint={t('bizPhoneHint')}>
        <input
          className="mbizs-input"
          value={phone}
          type="tel"
          inputMode="tel"
          placeholder="809 000 0000"
          onChange={e => setPhone(e.target.value)}
        />
      </Field>

      <Field label={t('amount')}>
        <input
          className="mbizs-input"
          type="number"
          inputMode="decimal"
          value={amount}
          placeholder="0"
          onChange={e => setAmount(e.target.value)}
        />
      </Field>

      <Field label={t('currency')}>
        <CurrencyPicker value={cur} base={currency} onChange={setCur} />
      </Field>

      {/* Monto variable: para quien factura por proyecto y nunca cobra lo
          mismo dos veces. Sin esto, media app quedaría fuera. */}
      <button type="button" className={`mbizs-toggle${variable ? ' on' : ''}`} onClick={() => setVariable(v => !v)}>
        <span>
          <b>{t('bizVariableAmount')}</b>
          <small>{t('bizVariableAmountHint')}</small>
        </span>
        <i />
      </button>

      <Field label={t('bizCycle')}>
        <CyclePicker value={cycle} onChange={setCycle} months={customMonths} onMonths={setCustomMonths} />
      </Field>

      {cycle === 'weekly' && (
        <Field label={t('bizWeekday')}>
          <WeekdayPicker value={dueDay} onChange={setDueDay} />
        </Field>
      )}

      {usaDiaDelMes && cycle !== 'weekly' && (
        <Field label={t('bizDueDay')}>
          <DayPicker value={dueDay} onChange={setDueDay} />
        </Field>
      )}

      {usaAncla && (
        <Field label={t('bizStartDate')} hint={cycle === 'once' ? t('bizOnceHint') : t('bizAnchorHint')}>
          <input
            className="mbizs-input mbizs-input-sm"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
          />
        </Field>
      )}

      <Field label={t('bizDepositsTo')}>
        <select className="mbizs-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
          <option value="">{t('selectAccount')}</option>
          {usableAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      <Field label={t('bizEntersAs')} hint={t('bizEntersAsHint')}>
        <select className="mbizs-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
          <option value="">{t('category')}</option>
          {incomeCats.map(c => <option key={c.id} value={c.id}>{translateCategoryName(c, lang)}</option>)}
        </select>
      </Field>

      {businesses.length > 0 && (
        <Field label={t('bizBusiness')}>
          <select
            className="mbizs-input"
            value={businessId}
            onChange={e => { setBusinessId(e.target.value); setServiceId('') }}
          >
            <option value="">{t('bizNoBusiness')}</option>
            {businesses.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      )}

      {serviciosDelNegocio.length > 0 && !varios && (
        <Field label={t('bizService')} hint={t('bizServiceHint')}>
          <select className="mbizs-input" value={serviceId} onChange={e => setServiceId(e.target.value)}>
            <option value="">{t('bizNoService')}</option>
            {serviciosDelNegocio.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}

      {/* El interruptor solo con DOS servicios o más: con uno, ofrecer «varios»
          es ofrecer una complicación que no resuelve nada. */}
      {serviciosDelNegocio.length > 1 && (
        <button
          type="button"
          className={`mbizs-toggle${varios ? ' on' : ''}`}
          onClick={() => {
            const siguiente = !varios
            setVarios(siguiente)
            // Al encender, se arranca con el que ya tenía y su precio: nadie
            // quiere volver a escribir lo que ya estaba puesto.
            if (siguiente && !shares.length && serviceId) {
              setShares([{ serviceId, amount: monto }])
            }
          }}
        >
          <span>
            <b>{t('bizMultiService')}</b>
            <small>{t('bizMultiServiceHint')}</small>
          </span>
          <i />
        </button>
      )}

      {varios && (
        <div className="mbizs-shares">
          {serviciosDelNegocio.map(svc => {
            const actual = shares.find(v => v.serviceId === svc.id)
            return (
              <label key={svc.id} className={`mbizs-share${actual ? ' on' : ''}`}>
                <input
                  type="checkbox"
                  checked={!!actual}
                  onChange={e => setShares(prev => e.target.checked
                    ? [...prev, { serviceId: svc.id, amount: 0 }]
                    : prev.filter(v => v.serviceId !== svc.id))}
                />
                <span>{svc.name}</span>
                <input
                  className="mbizs-input mbizs-share-amount"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  disabled={!actual}
                  value={actual?.amount || ''}
                  onChange={e => {
                    const valor = Math.max(0, Number(e.target.value) || 0)
                    setShares(prev => prev.map(v => v.serviceId === svc.id ? { ...v, amount: valor } : v))
                  }}
                />
              </label>
            )
          })}
          {/* El total manda sobre el campo de arriba, y se dice: si no, el
              usuario ve dos cifras distintas y no sabe cuál se le cobra. */}
          <p className="mbizs-calc strong">
            {t('bizSharesTotal').replace('{amount}', fmt(totalShares, cur ?? currency, { decimals: moneyDecimals }))}
          </p>
        </div>
      )}

      <Field label={t('bizNotes')}>
        <textarea
          className="mbizs-input mbizs-textarea"
          value={notes}
          rows={2}
          onChange={e => setNotes(e.target.value)}
        />
      </Field>

      <button type="button" className={`mbizs-toggle${active ? ' on' : ''}`} onClick={() => setActive(v => !v)}>
        <span>
          <b>{t('bizActive')}</b>
          <small>{t('bizActiveHint')}</small>
        </span>
        <i />
      </button>

      {/* El equivalente mensual, dicho siempre que el ciclo no sea mensual: es
          la cifra con la que este cliente se compara contra un coste. */}
      {monto > 0 && cycle !== 'monthly' && cycle !== 'once' && (
        <p className="mbizs-calc">
          {t('bizPerMonthIs').replace('{amount}', fmt(
            clientPerMonth({ amount: monto, cycle, customMonths, currency: cur } as never),
            cur ?? currency,
            { decimals: moneyDecimals },
          ))}
        </p>
      )}

      {proxima && (
        <p className="mbizs-calc">
          <Icon name="calendar" size={12} /> {t('bizNextDue').replace('{date}', proxima)}
        </p>
      )}

      {existente && phone.trim() && (
        <button
          type="button"
          className="mbizs-wa"
          onClick={() => {
            // Los enlaces externos pueden no abrir en algunos entornos; el
            // número se deja copiable en vez de prometer que se abrió.
            void navigator.clipboard?.writeText(phone.trim())
              .then(() => toast(t('bizPhoneCopied'), { icon: 'check', type: 'ok' }))
              .catch(() => toast(phone.trim(), { icon: 'info' }))
          }}
        >
          <Icon name="phone" size={15} /> {t('bizCopyPhone')}
        </button>
      )}
    </BizSheet>
  )
}
