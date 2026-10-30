import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { ACCENT_COLORS } from '@/constants'
import { toast } from '@/components/ui/Toast'
import { newId } from '@/data/seed'
import { DEFAULT_REFERRAL, referralRules } from '@/data/referrals'
import { NewCategorySheet } from './Pickers'
import { currentMonthKey, fmt } from '@/data/helpers'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { deleteWithUndo } from '@/lib/undoDelete'
import { translateCategoryName, useT } from '@/i18n'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { IconName } from '@/types'
import { BizSheet, Field } from './shared'
import { FormNote } from './ShortForm'
import { IconTile } from '@/components/ui/Phrase'

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

export function BusinessSheet({ businessId, onClose, onCreated }: {
  businessId: string | null
  onClose: () => void
  /** K2 · El recién creado, para quien lo creó desde otra hoja. */
  onCreated?: (id: string) => void
}) {
  const t = useT()
  const { categories, accounts, transactions, currency, ensureCategory } = useFinance()
  const moneyDecimals = useMoneyDecimals()
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
  /* K1 · Una categoría nueva, creada sin salir. */
  const [nuevaCat, setNuevaCat] = useState<'income' | 'expense' | null>(null)
  /*
   * LAS ESTRELLAS: cuánto baja cada una y hasta dónde.
   * Encendido por defecto con las de siempre, porque es lo que hace que el
   * negocio crezca, y se apaga con un toque.
   */
  const reglas = referralRules(existente)
  const [starsOn, setStarsOn] = useState(reglas.pctPerStar > 0)
  const [pctStar, setPctStar] = useState(reglas.pctPerStar > 0 ? reglas.pctPerStar : DEFAULT_REFERRAL.pctPerStar)
  const [maxPct, setMaxPct] = useState(reglas.maxPct > 0 ? reglas.maxPct : DEFAULT_REFERRAL.maxPct)
  const [expires, setExpires] = useState(reglas.expiresMonths ?? 0)

  /*
   * C2 · TRES PASOS, NO UN MURO.
   *
   * Pide nombre, icono entre dieciséis, color entre seis, categorías de
   * cobro entre trece y de coste entre doce —todo de golpe, en una hoja que
   * no llega abajo— y «Guardar» apagado hasta que adivines qué falta.
   *
   * Ninguna opción desaparece: se reparten en tres pantallas cortas donde
   * cada una pregunta una cosa. Al EDITAR no hay pasos: quien abre un negocio
   * que ya existe viene a cambiar algo concreto.
   */
  const [paso, setPaso] = useState<1 | 2 | 3>(1)
  void setPaso
  /*
   * LO QUE TRAERÍA ESA ELECCIÓN.
   *
   * Los ingresos reales de este mes en las categorías marcadas. Sin esto,
   * «sin ninguna marcada la ganancia es cero» hay que creérselo; con esto se
   * comprueba antes de guardar.
   */
  const cobradoPrevisto = useMemo(() => {
    const marcadas = new Set(incomeIds)
    const mes = currentMonthKey()
    return Math.round(transactions
      .filter(tx => tx.type === 'income' && tx.categoryId && marcadas.has(tx.categoryId)
        && tx.date.startsWith(mes))
      .reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100
  }, [incomeIds, transactions])
  const porPasos = false
  const nuevo = !existente
  const [verLook, setVerLook] = useState(false)
  const [iconoTocado, setIconoTocado] = useState(!!existente)

  const incomeCats = categories.filter(c => c.type === 'income')
  const expenseCats = categories.filter(c => c.type === 'expense')
  const canSave = name.trim().length > 0

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => {
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  /*
   * N4 · EL ICONO SALE DEL NOMBRE (2.8): «Pantallas» → tele, «Uñas» →
   * tijeras, «Colmado» → tienda. Mientras no lo toques, sigue al nombre.
   */
  useEffect(() => {
    if (iconoTocado) return
    const sugerido = suggestBusinessIcon(name)
    if (sugerido) setIcon(sugerido)
  }, [name, iconoTocado])

  const save = () => {
    if (!canSave) return
    // Al crear, sus dos categorías propias se crean solas: sin ellas la
    // ganancia sería cero hasta que alguien adivinara que hay que marcarlas.
    if (nuevo && !incomeIds.length && propuesta) {
      const ingreso = ensureCategory({ id: newId('cat_'), name: propuesta.income, type: 'income', color, budget: 0, icon: 'handCoins' })
      const gasto = ensureCategory({ id: newId('cat_'), name: propuesta.expense, type: 'expense', color: '#ff6b8a', budget: 0, icon: 'receipt' })
      const id = addBusiness({ name: name.trim(), color, icon, incomeCategoryIds: [ingreso], expenseCategoryIds: [gasto], referral: { pctPerStar: pctStar, maxPct: Math.max(pctStar, maxPct) } })
      if (onCreated) onCreated(id)
      else onClose()
      return
    }
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
      referral: starsOn
        ? { pctPerStar: pctStar, maxPct: Math.max(pctStar, maxPct), expiresMonths: expires || undefined }
        : { pctPerStar: 0, maxPct: 0 },
    }
    if (existente) { updateBusiness(existente.id, fields); onClose(); return }
    const id = addBusiness(fields)
    if (onCreated) onCreated(id)
    else onClose()
  }

  /*
   * K3 · SUS PROPIAS CATEGORÍAS, PROPUESTAS.
   *
   * Lo que salió mal en la 2.2.0: marcarle al negocio tus categorías de
   * siempre («Entretenimiento») mezclaba tus gastos personales con los del
   * negocio, y «Has puesto» sumaba tu Claude Pro. Con categorías propias del
   * negocio no se pueden mezclar.
   */
  const nombreLimpio = name.trim()
  const propuesta = porPaso(nombreLimpio)
  const yaExisten = propuesta
    ? categories.some(c => c.name.toLowerCase() === propuesta.income.toLowerCase())
    : true
  const crearPropias = () => {
    if (!propuesta) return
    const ingreso = ensureCategory({ id: newId('cat_'), name: propuesta.income, type: 'income', color, budget: 0, icon: 'handCoins' })
    const gasto = ensureCategory({ id: newId('cat_'), name: propuesta.expense, type: 'expense', color: '#ff6b8a', budget: 0, icon: 'receipt' })
    setIncomeIds(v => [...new Set([...v, ingreso])])
    setExpenseIds(v => [...new Set([...v, gasto])])
    playSoftHaptic()
    toast(t('bizOwnCatsCreated'), { icon: 'check', type: 'ok' })
  }

  /** Los nombres de las dos categorías propias. */
  function porPaso(nombre: string): { income: string; expense: string } | null {
    if (!nombre) return null
    return {
      income: t('bizOwnCatIncome').replace('{name}', nombre),
      expense: t('bizOwnCatExpense').replace('{name}', nombre),
    }
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
      onSave={porPasos && paso < 3 ? () => { setPaso((paso + 1) as 2 | 3); playSoftHaptic() } : save}
      saveLabel={porPasos && paso < 3 ? t('next') : undefined}
      canSave={porPasos && paso === 1 ? name.trim().length > 0 : canSave}
      missing={!name.trim() ? t('fieldName') : null}
      onDelete={existente ? borrar : undefined}
      deleteLabel={t('bizDeleteBusiness')}
    >
      {/* La barra de progreso: tres pantallas cortas, no un muro. */}
      {porPasos && (
        <div className="mbizs-steps">
          <div className="mbizs-steps-bar"><i style={{ width: `${paso / 3 * 100}%` }} /></div>
          <small>{t('bizStepOf').replace('{n}', String(paso)).replace('{total}', '3')}</small>
        </div>
      )}

      {(!porPasos || paso === 1) && (<>

      <Field label={t('name')} needs={!name.trim()}>
        <input
          className="mbizs-input"
          value={name}
          autoCapitalize="words"
          placeholder={t('bizBusinessNamePlaceholder')}
          onChange={e => setName(e.target.value)}
        />
      </Field>

      {nuevo && (
        <>
          <button type="button" className="f28-look" onClick={() => setVerLook(v => !v)} aria-expanded={verLook}>
            <IconTile icon={icon} color={color} size={46} />
            <span><b>{name.trim() || t('bizNewBusiness')}</b><small>{t('n28LookHint')}</small></span>
            <Icon name={verLook ? 'arrowUp' : 'arrowDn'} size={13} />
          </button>
          {propuesta && !yaExisten && (
            <FormNote icon="check" title={t('n28OwnCats')} sub={`${propuesta.income} · ${propuesta.expense}`} />
          )}
        </>
      )}

      {(!nuevo || verLook) && (<>
      <Field label={t('icon')}>
        <div className="mbizs-icons">
          {ICONS.map(name2 => (
            <button
              key={name2}
              type="button"
              className={icon === name2 ? 'on' : ''}
              aria-pressed={icon === name2}
              onClick={() => { setIcon(name2); setIconoTocado(true) }}
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

      </>)}
      {/* De aquí sale la ganancia: sin categorías marcadas, el negocio no sabe
          qué movimientos son suyos y la ganancia sería cero. */}
      </>)}

      {!nuevo && (!porPasos || paso === 2) && (<>

      {propuesta && !yaExisten && (
        <div className="mbizs-propose">
          <b>{t('bizOwnCatsTitle')}</b>
          <span><i className="in">↓</i>{propuesta.income}<small>{t('bizOwnCatsIn')}</small></span>
          <span><i className="out">↑</i>{propuesta.expense}<small>{t('bizOwnCatsOut')}</small></span>
          <p>{t('bizOwnCatsWhy')}</p>
          <button type="button" onClick={crearPropias}>{t('bizOwnCatsCreate')}</button>
        </div>
      )}

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
          <button type="button" className="mpick-add" onClick={() => setNuevaCat('income')}>
            <Icon name="plus" size={12} /> {t('pickNewCategory')}
          </button>
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
          <button type="button" className="mpick-add" onClick={() => setNuevaCat('expense')}>
            <Icon name="plus" size={12} /> {t('pickNewCategory')}
          </button>
        </div>
      </Field>

      {/*
        LO QUE TRAERÍA ESA ELECCIÓN.
        Es la única forma de saber si marcaste bien antes de guardar: sin
        esto, «sin ninguna marcada la ganancia es cero» hay que creerselo.
      */}
      {porPasos && paso === 2 && (
        <p className={`mbizs-calc${incomeIds.length ? ' strong' : ' warn'}`}>
          {incomeIds.length
            ? t('bizStepWouldBring').replace('{amount}', fmt(cobradoPrevisto, currency, { decimals: moneyDecimals }))
            : t('bizStepNoCats')}
        </p>
      )}

      </>)}

      {!nuevo && (!porPasos || paso === 3) && (<>

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
          <div className="mbizs-chips mcf-dots" role="group">
            <button type="button" className={!setAsideAccountId ? 'on' : ''} aria-pressed={!setAsideAccountId} onClick={() => setSetAsideAccountId('')}>
              {t('bizSetAsideToNone')}
            </button>
            {accounts.filter(a => a.type !== 'credit').map(a => (
              <button key={a.id} type="button" className={setAsideAccountId === a.id ? 'on' : ''} aria-pressed={setAsideAccountId === a.id} onClick={() => setSetAsideAccountId(a.id)}>
                <i style={{ background: a.color }} />{a.name}
              </button>
            ))}
          </div>
        </Field>
      )}

      {/*
        LAS ESTRELLAS DE ESTE NEGOCIO.
        Cada cliente que te trae a otro gana una, y cada una le baja el
        precio. Con tope, y si se quiere, con caducidad: así siguen
        recomendando en vez de cobrar para siempre por una de hace dos años.
      */}
      <section className="mbizs-stars">
        <button type="button" className={`mbizs-toggle${starsOn ? ' on' : ''}`} onClick={() => setStarsOn(v => !v)}>
          <span>
            <b>★ {t('bizStarsTitle')}</b>
            <small>{t('bizStarsHint')}</small>
          </span>
          <i />
        </button>
        {starsOn && (
          <>
            <Field label={t('bizStarsPer')}>
              <div className="mbizs-chips" role="group">
                {[5, 10, 15, 20].map(n => (
                  <button key={n} type="button" className={pctStar === n ? 'on' : ''} aria-pressed={pctStar === n} onClick={() => setPctStar(n)}>{n}%</button>
                ))}
              </div>
            </Field>
            <Field label={t('bizStarsMax')}>
              <div className="mbizs-chips" role="group">
                {[15, 25, 50, 100].filter(n => n >= pctStar).map(n => (
                  <button key={n} type="button" className={maxPct === n ? 'on' : ''} aria-pressed={maxPct === n} onClick={() => setMaxPct(n)}>
                    {n === 100 ? t('bizStarsFree') : `${n}%`}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('bizStarsExpire')}>
              <div className="mbizs-chips" role="group">
                {[0, 6, 12].map(n => (
                  <button key={n} type="button" className={expires === n ? 'on' : ''} aria-pressed={expires === n} onClick={() => setExpires(n)}>
                    {n === 0 ? t('bizStarsNever') : t('bizStarsMonths').replace('{n}', String(n))}
                  </button>
                ))}
              </div>
            </Field>
            <p className="mbizs-calc strong">
              {t('bizStarsExample')
                .replace('{n}', String(Math.ceil(Math.max(pctStar, maxPct) / pctStar)))
                .replace('{max}', String(Math.max(pctStar, maxPct)))
                .replace('{pct}', String(pctStar))}
            </p>
          </>
        )}
      </section>

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
      </>)}

      {nuevaCat && (
        <NewCategorySheet
          type={nuevaCat}
          suggestedName={nombreLimpio ? (nuevaCat === 'income' ? t('bizOwnCatIncome') : t('bizOwnCatExpense')).replace('{name}', nombreLimpio) : ''}
          onClose={() => setNuevaCat(null)}
          onCreated={id => {
            if (nuevaCat === 'income') setIncomeIds(v => [...v, id])
            else setExpenseIds(v => [...v, id])
            setNuevaCat(null)
          }}
        />
      )}
    </BizSheet>
  )
}

/*
 * N4 · El icono que corresponde al nombre de un negocio. Palabras de cómo se
 * llaman los negocios de verdad en RD; si nada coincide, se deja el que hay.
 */
const ICON_WORDS: Array<[RegExp, IconName]> = [
  [/pantall|netflix|stream|tv|disney|hbo|iptv|cable/, 'tv'],
  [/uña|unas|salon|salón|belleza|pelo|barber|peluq|cejas|pestañ/, 'scissors'],
  [/colmado|tienda|bodega|minimarket|super|venta|ropa|boutique/, 'bag'],
  [/comida|pica|pollo|chimi|empanad|repost|bizcoch|dulce|cocina|restaur|food/, 'food'],
  [/carro|taxi|uber|motor|transporte|delivery|envío|envio|mensaj/, 'car'],
  [/clase|tutor|tarea|curso|profe|enseñ/, 'graduation'],
  [/alquiler|renta|apartamento|casa|habitaci/, 'home'],
  [/foto|video|diseñ|disen|arte/, 'camera'],
  [/repar|técnic|tecnic|celular|computad|plomer|electric/, 'tool'],
  [/gym|gimnas|entren|fitness/, 'gym'],
  [/préstamo|prestamo|san\b|financ/, 'handCoins'],
]
export function suggestBusinessIcon(name: string): IconName | null {
  const n = name.trim().toLowerCase()
  if (!n) return null
  for (const [re, icon] of ICON_WORDS) if (re.test(n)) return icon
  return null
}
