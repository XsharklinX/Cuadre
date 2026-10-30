import { useState } from 'react'
import { BrandTile } from '@/components/ui/BrandTile'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY, cycleMonths } from '@/data/billing'
import { clientPerMonth, nextDueDate } from '@/data/clients'
import { nameAlreadyUsed } from '@/data/duplicateClients'
import { fmt, localToday } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import type { BillingCycle } from '@/data/billing'
import type { CurrencyCode } from '@/types'
import { BizSheet, CurrencyPicker, CyclePicker, DayPicker, Field, WeekdayPicker } from './shared'
import { CategoryChips } from './Pickers'
import { BigAmount, FormNote, FormRow, FormRows } from './ShortForm'
import { NxSheet } from '@/components/ui/Phrase'
import { MobileAmountSheet } from '../MobileAmountSheet'
import { MobileTextSheet } from '../MobileTextSheet'
import { AccountPickSheet } from '../goals/GoalBits'
import { serviceAccounts } from '@/data/business'
import { avatarColor as colorDe, avatarInitials, avatarStyle } from './avatar'
import { ServiceSheet } from './ServiceSheet'
import { BusinessSheet } from './BusinessSheet'

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
export function ClientSheet({ clientId, onClose, defaults }: {
  clientId: string | null
  onClose: () => void
  /** Para crear uno ya dentro de un servicio (desde su pantalla). */
  defaults?: { businessId?: string; serviceId?: string }
}) {
  const t = useT()
  const { accounts, categories, currency } = useFinance()
  const moneyDecimals = useMoneyDecimals()
  const { clients, businesses, services, addClient, updateClient } = useBusiness()
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
  const [businessId, setBusinessId] = useState(existente?.businessId ?? defaults?.businessId ?? '')
  const [serviceId, setServiceId] = useState(existente?.serviceId ?? defaults?.serviceId ?? '')
  /* Quién lo recomendó: al guardar, esa persona gana su estrella sola. */
  const [referredBy, setReferredBy] = useState(existente?.referredBy ?? '')
  const [eligiendoQuien, setEligiendoQuien] = useState(false)
  /* P5 · Se cobra solo, para quien paga por transferencia fija. */
  const [autoCollect, setAutoCollect] = useState(existente?.autoCollect ?? false)
  /* K2 · Lo que falta, creado ahí mismo. */
  const [creandoServicio, setCreandoServicio] = useState(false)
  const [creandoNegocio, setCreandoNegocio] = useState(false)
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
  /*
   * C3 · NOMBRE Y MONTO ARRIBA, LO DEMÁS PLEGADO.
   *
   * Pide catorce campos antes de poder guardar a alguien que te paga 300 al
   * mes. Ninguno desaparece: se reparten entre lo que hace falta para
   * empezar y lo que se puede dejar como viene.
   *
   * Al EDITAR se abre todo: quien entra a una ficha que ya existe viene a
   * cambiar algo concreto, y esconderle la mitad le obliga a un toque para
   * buscar lo que venía a tocar.
   */
  const [masOpciones, setMasOpciones] = useState(false)
  const [hoja, setHoja] = useState<'amount' | 'cur' | 'when' | 'account' | 'phone' | 'service' | null>(null)

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

  const serviciosDelNegocio = services.filter(s => s.businessId === businessId && !s.archivedAt)
  const servicioElegido = serviceId ? services.find(s => s.id === serviceId) : undefined
  /*
   * N3 · QUÉ PLAZA OCUPA. Con el servicio elegido, se dice si entra, si con
   * él se llena o si ya no caben más.
   */
  const plazaInfo = (() => {
    if (!servicioElegido || varios) return null
    const cap = serviceAccounts(servicioElegido).reduce((sum, a) => sum + (a.capacity ?? 0), 0)
    if (!cap) return null
    const ocupadas = clients.filter(c => c.serviceId === servicioElegido.id && c.active && !c.deletedAt && c.id !== existente?.id).length
    const n = ocupadas + 1
    return { name: servicioElegido.name, n, full: n === cap, over: n > cap }
  })()

  /*
   * S5 · EL PRECIO DEL SERVICIO, PUESTO.
   * Si el servicio dice a cuánto vende cada plaza y aquí todavía no hay
   * monto, se pone ese. Si ya había uno, no se toca: ese cliente puede pagar
   * distinto, y es el usuario quien lo sabe.
   */
  const elegirServicio = (id: string) => {
    setServiceId(id)
    const precio = services.find(s => s.id === id)?.slotPrice
    if (precio && !(Number(amount) > 0)) setAmount(String(precio))
  }

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
      referredBy: referredBy || undefined,
      autoCollect: autoCollect || undefined,
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

  /*
   * Borrar ya no está aquí: vive en el menú ⋯ de la ficha, con su nombre y
   * diciendo qué pasa con lo que te pagó (ver `DeleteClientSheet`). Aquí era
   * una papelera sin texto pegada a Cancelar.
   */
  const recomendador = referredBy ? clients.find(c => c.id === referredBy) : null

  const proxima = existente ? nextDueDate({ ...existente, cycle, dueDay, startDate, customMonths }, localToday()) : null
  const divisa = cur ?? currency
  // El avatar se ve mientras escribes el nombre: es lo que hace que esto se
  // sienta como crear a una persona y no rellenar una planilla.
  const avaColor = colorDe(existente?.id ?? (name.trim() || 'nuevo'))

  return (
    <BizSheet
      title={existente ? t('bizCliEdit') : t('bizNewClient')}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      missing={!name.trim() ? t('fieldName') : null}
    >
      {/*
        QUIÉN ES. El avatar con sus iniciales y el nombre en grande, sin caja:
        así empieza una ficha de contacto en cualquier teléfono.
      */}
      <div className="mcf-hero" data-needs={!name.trim() ? 'true' : undefined}>
        <span
          className="mcf-ava"
          style={{ background: `color-mix(in oklab, ${avaColor} 22%, transparent)`, color: avaColor }}
          aria-hidden="true"
        >
          {name.trim() ? avatarInitials(name) : <Icon name="user" size={24} />}
        </span>
        <input
          className="mcf-name"
          value={name}
          autoCapitalize="words"
          aria-label={t('name')}
          placeholder={t('bizClientNamePlaceholder')}
          onChange={e => setName(e.target.value)}
        />
        {yaExiste && (
          <small className="mbizs-dup-warn">
            {t('bizNameTaken').replace('{name}', yaExiste.name)}
          </small>
        )}
      </div>

      {/* N3 · Cuánto te paga, en grande; se toca y sale el teclado de siempre. */}
      <BigAmount
        label={t('n28PaysYou')}
        value={monto > 0 ? fmt(monto, divisa, { decimals: moneyDecimals }) : t('n28TapToWrite')}
        sub={<>
          {variable ? t('cfAmountVariable') : t(CYCLE_KEY[cycle] as never)}
          {monto > 0 && cycle !== 'monthly' && cycle !== 'once' && !variable && (
            <> · {t('bizPerMonthIs').replace('{amount}', fmt(
              clientPerMonth({ amount: monto, cycle, customMonths, currency: cur } as never),
              divisa,
              { decimals: moneyDecimals },
            ))}</>
          )}
          {' · '}<button type="button" className="f28-link" onClick={() => setHoja('cur')}>{divisa} · {t('n28Change')}</button>
        </>}
        empty={!(monto > 0)}
        onTap={() => setHoja('amount')}
      />

      {/* N3 · Por qué, cada cuánto, dónde entra y su WhatsApp: filas que se tocan. */}
      <FormRows>
        <FormRow
          label={t('n28For')}
          value={varios ? t('bizMultiService') : servicioElegido ? servicioElegido.name : ''}
          placeholder={t('bizNoService')}
          onTap={() => setHoja('service')}
        />
        <FormRow
          label={t('n28Every')}
          value={[t(CYCLE_KEY[cycle] as never), usaDiaDelMes && cycle !== 'weekly' ? t('bizDayShort').replace('{n}', String(dueDay)) : null].filter(Boolean).join(' · ')}
          onTap={() => setHoja('when')}
        />
        <FormRow label={t('n28CollectIn')} value={accounts.find(a => a.id === accountId)?.name ?? ''} placeholder={t('noAccountLabel')} onTap={() => setHoja('account')} />
        <FormRow label="WhatsApp" value={phone.trim()} placeholder={t('n28Optional')} onTap={() => setHoja('phone')} />
      </FormRows>
      {plazaInfo && (
        <FormNote
          icon={plazaInfo.full ? 'check' : 'user'}
          color={plazaInfo.over ? 'var(--m-expense)' : 'var(--m-primary)'}
          title={plazaInfo.over
            ? t('n28SeatOver').replace('{name}', plazaInfo.name)
            : plazaInfo.full ? t('n28SeatFull').replace('{name}', plazaInfo.name) : t('n28SeatTakes').replace('{n}', String(plazaInfo.n)).replace('{name}', plazaInfo.name)}
        />
      )}
      <button type="button" className="f28-more" onClick={() => setMasOpciones(v => !v)} aria-expanded={masOpciones}>
        {masOpciones ? t('n28LessOptions') : t('n28MoreOptions')}
        <Icon name={masOpciones ? 'arrowUp' : 'arrowDn'} size={13} />
      </button>

      {masOpciones && (<>

      {/* ── CUÁNDO PAGA ──────────────────────────────────── */}
      <section className="mcf-sec">
        <h4 className="mcf-sec-title"><Icon name="calendar" size={14} />{t('cfWhen')}</h4>

        {/* P5 · Para quien paga por transferencia automática y no falla nunca.
            Apagado por defecto: un ingreso que aparece solo y no llegó es peor
            que uno que hay que marcar. */}
        {!variable && (
          <button type="button" className={`mbizs-toggle${autoCollect ? ' on' : ''}`} onClick={() => setAutoCollect(v => !v)}>
            <span>
              <b>{t('cfAutoCollect')}</b>
              <small>{t('cfAutoCollectHint')}</small>
            </span>
            <i />
          </button>
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

        {/* Monto variable: para quien factura por proyecto y nunca cobra lo
            mismo dos veces. Sin esto, media app quedaría fuera. */}
        <button type="button" className={`mbizs-toggle${variable ? ' on' : ''}`} onClick={() => setVariable(v => !v)}>
          <span>
            <b>{t('bizVariableAmount')}</b>
            <small>{t('bizVariableAmountHint')}</small>
          </span>
          <i />
        </button>

        {proxima && (
          <p className="mcf-next">
            <Icon name="clock" size={13} /> {t('bizNextDue').replace('{date}', proxima)}
          </p>
        )}
      </section>

      {/* ── DÓNDE ENTRA ──────────────────────────────────── */}
      <section className="mcf-sec">
        <h4 className="mcf-sec-title"><Icon name="landmark" size={14} />{t('cfWhere')}</h4>

        <Field label={t('bizEntersAs')} hint={t('bizEntersAsHint')}>
          <CategoryChips type="income" value={categoryId} onChange={setCategoryId} businessId={businessId || undefined} />
        </Field>
      </section>

      {/* ── DE QUÉ NEGOCIO ───────────────────────────────── */}
      {(
        <section className="mcf-sec">
          <h4 className="mcf-sec-title"><Icon name="briefcase" size={14} />{t('cfBusiness')}</h4>

          <div className="mbizs-chips mcf-dots" role="group" aria-label={t('bizBusiness')}>
            <button
              type="button"
              className={!businessId ? 'on' : ''}
              aria-pressed={!businessId}
              onClick={() => { setBusinessId(''); setServiceId('') }}
            >
              {t('bizNoBusiness')}
            </button>
            {businesses.filter(b => !b.archivedAt).map(b => (
              <button
                key={b.id}
                type="button"
                className={businessId === b.id ? 'on' : ''}
                aria-pressed={businessId === b.id}
                onClick={() => { setBusinessId(b.id); setServiceId('') }}
              >
                <i style={{ background: b.color }} />{b.name}
              </button>
            ))}
            <button type="button" className="mpick-add" onClick={() => { playSoftHaptic(); setCreandoNegocio(true) }}>
              <Icon name="plus" size={12} /> {t('cfNewBusiness')}
            </button>
          </div>

          {businessId && !varios && (
            <Field label={t('bizService')} hint={t('bizServiceHint')}>
              <div className="mcf-svcs" role="group" aria-label={t('bizService')}>
                <button
                  type="button"
                  className={!serviceId ? 'on' : ''}
                  aria-pressed={!serviceId}
                  onClick={() => setServiceId('')}
                >
                  <span className="mcf-svc-none"><Icon name="close" size={14} /></span>
                  {t('bizNoService')}
                </button>
                {serviciosDelNegocio.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    className={serviceId === s.id ? 'on' : ''}
                    aria-pressed={serviceId === s.id}
                    onClick={() => elegirServicio(s.id)}
                  >
                    <BrandTile name={s.name} size={26} />
                    {s.name}
                  </button>
                ))}
                <button type="button" className="add" onClick={() => { playSoftHaptic(); setCreandoServicio(true) }}>
                  <Icon name="plus" size={14} /> {t('cfNewService')}
                </button>
              </div>
            </Field>
          )}

          {/* El interruptor solo con DOS servicios o más: con uno, ofrecer
              «varios» es ofrecer una complicación que no resuelve nada. */}
          {serviciosDelNegocio.length > 1 && (
            <button
              type="button"
              className={`mbizs-toggle${varios ? ' on' : ''}`}
              onClick={() => {
                const siguiente = !varios
                setVarios(siguiente)
                // Al encender, se arranca con el que ya tenía y su precio:
                // nadie quiere volver a escribir lo que ya estaba puesto.
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
                    <BrandTile name={svc.name} size={22} />
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
              {/* El total manda sobre el monto de arriba, y se dice: si no, el
                  usuario ve dos cifras distintas y no sabe cuál se le cobra. */}
              <p className="mbizs-calc strong">
                {t('bizSharesTotal').replace('{amount}', fmt(totalShares, divisa, { decimals: moneyDecimals }))}
              </p>
            </div>
          )}
        </section>
      )}

      {/*
        ── CONTACTO Y NOTAS ─────────────────────────────────
        Filas con su icono dentro de una sola tarjeta, como la ficha de un
        contacto: tres campos de texto con su etiqueta encima se leían como
        un formulario de banco.
      */}
      <section className="mcf-sec">
        <h4 className="mcf-sec-title"><Icon name="user" size={14} />{t('cfContact')}</h4>
        <div className="mcf-rows">
          <label className="mcf-row">
            <Icon name="tag" size={16} />
            <span>
              <small>{t('bizConcept')}</small>
              <input
                value={concept}
                placeholder={t('bizConceptPlaceholder')}
                onChange={e => setConcept(e.target.value)}
              />
            </span>
          </label>
          {/* QUIÉN LO RECOMENDÓ. Al guardar, esa persona gana su estrella
              sola: el programa funciona sin tener que acordarse de ponerla. */}
          <button type="button" className="mcf-row mcf-row-btn" onClick={() => { playSoftHaptic(); setEligiendoQuien(true) }}>
            <Icon name="heart" size={16} />
            <span>
              <small>{t('cfReferredBy')}</small>
              <b className={recomendador ? '' : 'empty'}>{recomendador?.name ?? t('cfReferredNobody')}</b>
            </span>
            <Icon name="arrowDn" size={13} />
          </button>
          <label className="mcf-row">
            <Icon name="edit" size={16} />
            <span>
              <small>{t('bizNotes')}</small>
              <textarea
                value={notes}
                rows={2}
                onChange={e => setNotes(e.target.value)}
              />
            </span>
          </label>
        </div>
      </section>

      </>)}

      <button type="button" className={`mbizs-toggle${active ? ' on' : ''}`} onClick={() => setActive(v => !v)}>
        <span>
          <b>{t('bizActive')}</b>
          <small>{t('bizActiveHint')}</small>
        </span>
        <i />
      </button>

      {hoja === 'amount' && (
        <MobileAmountSheet title={t('amount')} value={monto} currency={divisa} onDone={v => { setAmount(v > 0 ? String(v) : ''); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'phone' && (
        <MobileTextSheet title="WhatsApp" value={phone} placeholder="809 000 0000" onDone={v => { setPhone(v); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'account' && (
        <AccountPickSheet title={t('n28CollectIn')} accounts={usableAccounts} value={accountId} onPick={id => { setAccountId(id); setHoja(null) }} onClose={() => setHoja(null)} />
      )}
      {hoja === 'cur' && (
        <NxSheet title={t('currency')} onClose={() => setHoja(null)} footer={<button className="nx-btn pri" onClick={() => setHoja(null)}>{t('done')}</button>}>
          <CurrencyPicker value={cur} base={currency} onChange={c => { setCur(c); setHoja(null) }} />
        </NxSheet>
      )}
      {hoja === 'when' && (
        <NxSheet title={t('cfWhen')} onClose={() => setHoja(null)} footer={<button className="nx-btn pri" onClick={() => setHoja(null)}>{t('done')}</button>}>
          <CyclePicker value={cycle} onChange={setCycle} months={customMonths} onMonths={setCustomMonths} />
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
        </NxSheet>
      )}
      {hoja === 'service' && (
        <NxSheet title={t('bizService')} sub={t('bizServiceHint')} onClose={() => setHoja(null)}>
          <div className="nx-list">
            <button type="button" className="an28-pick" onClick={() => { setServiceId(''); setVarios(false); setHoja(null) }}>
              <span className="an28-row-main"><b>{t('bizNoService')}</b></span>
              {!serviceId && !varios && <Icon name="check" size={16} />}
            </button>
            {businesses.filter(b => !b.archivedAt).flatMap(b => services.filter(sv => sv.businessId === b.id && !sv.archivedAt).map(sv => (
              <button key={sv.id} type="button" className="an28-pick" onClick={() => { setBusinessId(b.id); setVarios(false); elegirServicio(sv.id); setHoja(null) }}>
                <BrandTile name={sv.name} size={34} />
                <span className="an28-row-main"><b>{sv.name}</b><small>{b.name}{sv.slotPrice ? ` · ${fmt(sv.slotPrice, sv.currency ?? currency, { decimals: moneyDecimals })}` : ''}</small></span>
                {serviceId === sv.id && !varios && <Icon name="check" size={16} />}
              </button>
            )))}
          </div>
          {businesses.some(b => !b.archivedAt) ? (
            <button type="button" className="nx-btn" style={{ marginTop: 12 }} onClick={() => { setHoja(null); if (!businessId) setBusinessId(businesses.find(b => !b.archivedAt)!.id); setCreandoServicio(true) }}>+ {t('cfNewService')}</button>
          ) : (
            <button type="button" className="nx-btn" style={{ marginTop: 12 }} onClick={() => { setHoja(null); setCreandoNegocio(true) }}>+ {t('cfNewBusiness')}</button>
          )}
        </NxSheet>
      )}

      {eligiendoQuien && (
        <BizSheet title={t('cfReferredBy')} onClose={() => setEligiendoQuien(false)}>
          <p className="mbizs-calc">{t('cfReferredHint')}</p>
          <div className="mcc-pick">
            <button type="button" className={!referredBy ? 'on' : ''} onClick={() => { setReferredBy(''); setEligiendoQuien(false) }}>
              <span className="mbiz-ava"><Icon name="close" size={13} /></span>
              <span>{t('cfReferredNobody')}</span>
            </button>
            {clients
              .filter(c => c.id !== existente?.id && !c.deletedAt)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(c => (
                <button key={c.id} type="button" className={referredBy === c.id ? 'on' : ''} onClick={() => { setReferredBy(c.id); setEligiendoQuien(false) }}>
                  <span className="mbiz-ava" style={avatarStyle(c.id)}>{avatarInitials(c.name)}</span>
                  <span>{c.name}</span>
                  {(c.stars?.length ?? 0) > 0 && <em>★{c.stars!.length}</em>}
                </button>
              ))}
          </div>
          {existente && <p className="mbizs-calc">{t('cfReferredEditHint')}</p>}
        </BizSheet>
      )}

      {creandoServicio && businessId && (
        <ServiceSheet
          businessId={businessId}
          serviceId={null}
          onClose={() => setCreandoServicio(false)}
          onCreated={id => { elegirServicio(id); setCreandoServicio(false) }}
        />
      )}
      {creandoNegocio && (
        <BusinessSheet
          businessId={null}
          onClose={() => setCreandoNegocio(false)}
          onCreated={id => { setBusinessId(id); setServiceId(''); setCreandoNegocio(false) }}
        />
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
