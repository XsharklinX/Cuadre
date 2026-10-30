import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { accountOccupancy, placeClients, serviceAccounts, type Service, type ServiceAccount } from '@/data/business'
import { accountProfits } from '@/data/attribution'
import { isOnService } from '@/data/clients'
import { fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import type { CurrencyCode } from '@/types'
import { avatarInitials, avatarStyle } from './avatar'
import { BizSheet, DayPicker, Field } from './shared'

/**
 * S2 · LAS CUENTAS DE UN SERVICIO, Y QUIÉN OCUPA CADA PLAZA.
 *
 * ── EL FALLO QUE ARREGLA ──────────────────────────────────────────────
 * Las cuentas contaban solo a los clientes con cuenta asignada, y los que ya
 * tenías no la tenían: la Cuenta 1 salía vacía con cuatro personas dentro.
 * Ahora se colocan solos (ver `placeClients`) y, al abrir esta pantalla, esa
 * colocación se guarda: mover a uno después no baraja a los demás.
 *
 * ── LO QUE SE PUEDE HACER ─────────────────────────────────────────────
 *  · Tocar una cuenta: cambiarle el nombre, lo que cuesta, las plazas y el día
 *    que se paga, o cerrarla diciendo a dónde van sus clientes.
 *  · Tocar una cara: pasar a esa persona a otra cuenta.
 *  · Tocar un hueco: meter ahí a alguien de este servicio.
 *  · G3: cada cuenta dice lo que te deja; una con huecos, lo que pagas tú.
 */
export function ServiceAccounts({ service, currency }: { service: Service; currency: CurrencyCode }) {
  const t = useT()
  const moneyDecimals = useMoneyDecimals()
  const { clients, updateService, updateClient, assignAccounts } = useBusiness()
  const [llenando, setLlenando] = useState<string | null>(null)
  const [editando, setEditando] = useState<ServiceAccount | null>(null)
  const [moviendo, setMoviendo] = useState<string | null>(null)
  const svcCur = service.currency ?? currency
  const dinero = (n: number) => fmt(n, svcCur, { decimals: moneyDecimals })

  const cuentas = serviceAccounts(service)
  const dondeEsta = useMemo(() => placeClients(service, clients), [service, clients])
  const ocupacion = accountOccupancy(service, clients)
  // En la divisa de la app: el coste puede estar en dólares y lo que cobras en
  // pesos, y restarlos en crudo daba «te deja 1,035» sobre 14.99.
  const ganancia = useMemo(() => new Map(accountProfits(service, clients, currency).map(a => [a.accountId, a])), [service, clients, currency])
  const delServicio = clients.filter(c => c.active && !c.deletedAt && isOnService(c, service.id))

  /*
   * GUARDAR LA COLOCACIÓN AL ABRIR.
   * Solo los que no tenían cuenta (o la suya se cerró), y solo una vez por
   * cambio: así, si añades una cuenta, los que ya estaban no se reparten de
   * nuevo por su cuenta.
   */
  const sinGuardar = useMemo(() => {
    const ids = new Set(cuentas.map(a => a.id))
    const fuera = new Map<string, string>()
    for (const c of delServicio) {
      if (!c.serviceAccountId || !ids.has(c.serviceAccountId)) {
        const destino = dondeEsta.get(c.id)
        if (destino) fuera.set(c.id, destino)
      }
    }
    return fuera
  }, [cuentas, delServicio, dondeEsta])

  useEffect(() => {
    if (!sinGuardar.size) return
    assignAccounts(sinGuardar)
    toast(t('svcPlacedN').replace('{n}', String(sinGuardar.size)), { icon: 'check', type: 'ok' })
    // Se reacciona a cuántos hay que colocar, no a la identidad del mapa: el
    // mapa se rehace en cada render y volvería a disparar sin cambios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinGuardar.size])

  const añadir = () => {
    const ultima = cuentas[cuentas.length - 1]
    const nueva: ServiceAccount = {
      id: `${service.id}:${Date.now().toString(36)}`,
      // Otra igual a la anterior: es lo que pasa el 99% de las veces.
      cost: ultima?.cost ?? service.cost,
      capacity: ultima?.capacity ?? service.capacity,
    }
    // Materializar la implícita con SU id, para que nadie quede apuntando a
    // una cuenta que deja de existir.
    const base = service.accounts?.length ? service.accounts : cuentas
    updateService(service.id, { accounts: [...base, nueva] })
    playSoftHaptic()
  }

  const nombre = (a: ServiceAccount, i: number) => a.label?.trim() || t('svcAccountN').replace('{n}', String(i + 1))

  return (
    <div className="msvc-accs">
      {ocupacion.map(({ account, free, full }, i) => {
        const suyos = delServicio.filter(c => dondeEsta.get(c.id) === account.id)
        const g = ganancia.get(account.id)
        return (
          <div key={account.id} className={`msvc-acc${full ? ' full' : ''}`}>
            <button type="button" className="msvc-acc-top" onClick={() => { playSoftHaptic(); setEditando(account) }}>
              <b>{nombre(account, i)}</b>
              <small>
                {dinero(account.cost)}
                {(account.payDay ?? service.payDay) ? ` · ${t('svcPaysOn').replace('{n}', String(account.payDay ?? service.payDay))}` : ''}
              </small>
              {free === null
                ? <em>{t('svcNoLimit')}</em>
                : full
                  ? <em className="full">{t('svcFull')}</em>
                  : <em className="free">{t('svcNFree').replace('{n}', String(free))}</em>}
              <Icon name="edit" size={13} />
            </button>

            <div className="msvc-slots">
              {suyos.slice(0, 12).map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="msvc-slot"
                  title={c.name}
                  aria-label={t('svcMoveFace').replace('{name}', c.name)}
                  style={avatarStyle(c.id)}
                  onClick={() => { playSoftHaptic(); setMoviendo(c.id) }}
                >
                  {avatarInitials(c.name)}
                </button>
              ))}
              {free !== null && Array.from({ length: Math.min(free, 8) }).map((_, k) => (
                <button
                  key={`libre-${k}`}
                  type="button"
                  className="msvc-slot free"
                  aria-label={t('svcFillSlot')}
                  onClick={() => { playSoftHaptic(); setLlenando(llenando === account.id ? null : account.id) }}
                >
                  +
                </button>
              ))}
            </div>

            {/* G3 · Lo que te deja esta cuenta: con huecos, lo pagas tú. */}
            {g && (
              <p className={`msvc-acc-profit${g.profit < 0 ? ' neg' : ''}`}>
                {t(g.profit < 0 ? 'svcAccLoses' : 'svcAccLeaves').replace('{amount}', fmt(Math.abs(g.profit), currency, { decimals: moneyDecimals }))}
              </p>
            )}

            {llenando === account.id && (
              <div className="msvc-pick">
                {delServicio
                  .filter(c => dondeEsta.get(c.id) !== account.id)
                  .map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        updateClient(c.id, { serviceAccountId: account.id })
                        playSoftHaptic()
                        setLlenando(null)
                      }}
                    >
                      <b>{c.name}</b>
                      <small>{t('svcMoveHere')}</small>
                    </button>
                  ))}
                {delServicio.every(c => dondeEsta.get(c.id) === account.id) && (
                  <p className="mbizs-calc">{t('svcNobodyToMove')}</p>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button type="button" className="msvc-add-acc" onClick={añadir}>
        <Icon name="plus" size={14} /> {t('svcBuyAnother')}
      </button>

      {ocupacion.some(o => o.free === null) && (
        <p className="mbizs-calc">{t('svcNoLimitHint')}</p>
      )}

      {editando && (
        <EditAccountSheet
          service={service}
          account={editando}
          index={cuentas.findIndex(a => a.id === editando.id)}
          onClose={() => setEditando(null)}
        />
      )}

      {moviendo && (() => {
        const quien = clients.find(c => c.id === moviendo)
        if (!quien) return null
        return (
          <BizSheet title={t('svcMoveFaceTitle').replace('{name}', quien.name)} onClose={() => setMoviendo(null)}>
            {cuentas.map((a, i) => {
              const aqui = dondeEsta.get(quien.id) === a.id
              const occ = ocupacion.find(o => o.account.id === a.id)
              return (
                <button
                  key={a.id}
                  type="button"
                  className={`mmerge-pick${aqui ? ' on' : ''}`}
                  disabled={aqui}
                  onClick={() => {
                    updateClient(quien.id, { serviceAccountId: a.id })
                    playSoftHaptic()
                    toast(t('svcMovedTo').replace('{name}', quien.name).replace('{account}', nombre(a, i)), { icon: 'check', type: 'ok' })
                    setMoviendo(null)
                  }}
                >
                  <span>
                    <b>{nombre(a, i)}</b>
                    <small>
                      {occ?.free === null || occ?.free === undefined
                        ? t('svcNoLimit')
                        : occ.full ? t('svcFull') : t('svcNFree').replace('{n}', String(occ.free))}
                    </small>
                  </span>
                  {aqui && <Icon name="check" size={16} />}
                </button>
              )
            })}
          </BizSheet>
        )
      })()}
    </div>
  )
}

/**
 * Editar una cuenta: cómo se llama, lo que cuesta, las plazas y el día que
 * se paga. Y cerrarla, diciendo a dónde van sus clientes: cerrar una cuenta
 * con gente dentro sin preguntarlo los dejaría fuera de todas.
 */
function EditAccountSheet({ service, account, index, onClose }: {
  service: Service
  account: ServiceAccount
  index: number
  onClose: () => void
}) {
  const t = useT()
  const { clients, updateAccount, closeAccount } = useBusiness()
  const [label, setLabel] = useState(account.label ?? '')
  const [cost, setCost] = useState(String(account.cost))
  const [capacity, setCapacity] = useState(account.capacity ? String(account.capacity) : '')
  const [day, setDay] = useState<number | undefined>(account.payDay)
  const [cerrando, setCerrando] = useState(false)
  const otras = serviceAccounts(service).filter(a => a.id !== account.id)
  const dentro = clients.filter(c => c.serviceAccountId === account.id && c.active).length

  const guardar = () => {
    updateAccount(service.id, account.id, {
      label: label.trim() || undefined,
      cost: Math.max(0, Number(cost) || 0),
      capacity: Number(capacity) > 0 ? Math.round(Number(capacity)) : undefined,
      payDay: day,
    })
    playSoftHaptic()
    onClose()
  }

  return (
    <BizSheet
      title={account.label?.trim() || t('svcAccountN').replace('{n}', String(index + 1))}
      onClose={onClose}
      onSave={guardar}
    >
      <Field label={t('name')} hint={t('svcAccLabelHint')}>
        <input className="mbizs-input" value={label} placeholder={t('svcAccLabelPlaceholder')} onChange={e => setLabel(e.target.value)} />
      </Field>
      <Field label={t('bizCost')}>
        <input className="mbizs-input" type="number" inputMode="decimal" value={cost} onChange={e => setCost(e.target.value)} />
      </Field>
      <Field label={t('bizSlots')} hint={t('bizCapacityHint')}>
        <input className="mbizs-input mbizs-input-sm" type="number" inputMode="numeric" min={0} value={capacity} placeholder={t('bizNoLimit')} onChange={e => setCapacity(e.target.value)} />
      </Field>
      <Field label={t('svcAccPayDay')} hint={t('svcAccPayDayHint')}>
        <div className="mbizs-chips" role="group">
          <button type="button" className={day === undefined ? 'on' : ''} aria-pressed={day === undefined} onClick={() => setDay(undefined)}>
            {t('svcAccSameDay')}
          </button>
        </div>
        <DayPicker value={day ?? 0} onChange={setDay} />
      </Field>

      {otras.length > 0 && !cerrando && (
        <button type="button" className="mbizs-danger-link" onClick={() => setCerrando(true)}>
          <Icon name="trash" size={14} /> {t('svcAccClose')}
        </button>
      )}
      {cerrando && (
        <div className="mdel-opts">
          <p className="mbizs-calc">
            {dentro ? t('svcAccCloseWhere').replace('{n}', String(dentro)) : t('svcAccCloseEmpty')}
          </p>
          {otras.map(a => (
            <button key={a.id} type="button" onClick={() => {
              closeAccount(service.id, account.id, a.id)
              toast(t('svcAccClosed'), { icon: 'check', type: 'ok' })
              onClose()
            }}>
              <b>{dentro ? t('svcAccMoveTo').replace('{account}', a.label?.trim() || t('svcAccountN').replace('{n}', String(serviceAccounts(service).indexOf(a) + 1))) : t('svcAccClose')}</b>
            </button>
          ))}
        </div>
      )}
    </BizSheet>
  )
}
