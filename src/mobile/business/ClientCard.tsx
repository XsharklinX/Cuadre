import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { CYCLE_KEY } from '@/data/billing'
import { chargeState, clientPerMonth, clientServices, lastPriceChange, nextDueDate, outstanding } from '@/data/clients'
import { exportReceiptPdf, exportStatementPdf } from '@/data/businessExport'
import { clientHistory, groupCharges } from '@/data/collectFocus'
import { dateLocale, fmt, localToday, shortMonth } from '@/data/helpers'
import { averageDelay } from '@/data/receivables'
import { useT, type LangKey } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { BizSheet } from './shared'
import { ClientSheet } from './ClientSheet'
import { NewChargeSheet } from './NewChargeSheet'

/**
 * LA FICHA DE UN CLIENTE.
 *
 * ── POR QUÉ ESTO EXISTE ───────────────────────────────────────────────
 * Tocar un cliente abría su FORMULARIO de editar: el gesto natural de «ver con
 * quién estoy tratando» te ponía delante de catorce campos de configuración.
 * La app ya tenía todos los datos —cuánto te ha pagado, con qué puntualidad,
 * qué le queda pendiente— y ninguna pantalla donde verlos.
 *
 * Es la diferencia entre una lista de contactos y un cliente.
 *
 * ── EL ORDEN DE LA FICHA ──────────────────────────────────────────────
 * Primero lo que importa para actuar hoy (qué debe, cuándo toca), luego lo que
 * importa para decidir (cuánto te ha dejado, si paga puntual), y editar es un
 * botón, no la pantalla. Lo que antes era la pantalla ahora es una acción.
 */
export function ClientCard({ clientId, onClose, onCollect, onDuplicated }: {
  clientId: string
  onClose: () => void
  onCollect: (chargeId: string) => void
  /** El clon recién creado, para abrirlo y ponerle su nombre. */
  onDuplicated: (clientId: string) => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { currency } = useFinance()
  const { clients, charges, businesses, services, duplicateClient } = useBusiness()

  const [editando, setEditando] = useState(false)
  const [cobroNuevo, setCobroNuevo] = useState(false)
  // Un papel tarda en generarse lo suficiente como para que, sin esto, el
  // usuario pulse dos veces y reciba dos archivos.
  const [generando, setGenerando] = useState(false)
  const [verHistorial, setVerHistorial] = useState(false)

  const today = localToday()
  const client = clients.find(c => c.id === clientId)

  /*
   * Si lo borran desde el formulario de editar, la ficha deja de describir a
   * nadie y se cierra sola.
   *
   * No basta con dejar de pintarla: el borrado va con deshacer, así que el
   * cliente desaparece un rato DESPUÉS de cerrarse ese formulario, y sin esto
   * la pantalla se quedaría con una hoja invisible abierta por encima.
   */
  useEffect(() => { if (!client) onClose() }, [client, onClose])

  const suyos = useMemo(() => charges.filter(c => c.clientId === clientId), [charges, clientId])
  const hist = useMemo(() => clientHistory(clientId, charges, today), [charges, clientId, today])
  const grupos = useMemo(() => groupCharges(suyos, today), [suyos, today])

  if (!client) return null

  const cur = client.currency ?? currency
  const negocio = client.businessId ? businesses.find(b => b.id === client.businessId) : null
  const servicio = client.serviceId ? services.find(s => s.id === client.serviceId) : null
  const retraso = averageDelay(suyos)
  const sus = clientServices(client)
  /*
   * EL PRECIO DE ANTES.
   *
   * Un precio que lleva dos anos sin tocarse es dinero que se pierde sin que
   * nadie lo note, y la app tenia el dato y no lo ensenaba en ningun sitio.
   */
  const antes = lastPriceChange(client)
  const proximo = nextDueDate(client, today)
  const alMes = clientPerMonth(client, currency)

  /* Pendientes y atrasados juntos, lo más urgente arriba: en una ficha son la
     misma pregunta («¿qué le queda?»), no dos listas. */
  const abiertos = [...grupos.late, ...grupos.week, ...grupos.later]
  const tope = Math.max(1, ...hist.byMonth.map(m => m.amount))

  return (
    <BizSheet title={client.name} onClose={onClose}>
      {/* ── LO QUE IMPORTA AHORA ───────────────────────────── */}
      <div className="mcli-top">
        <div className={`mcli-owes${hist.owes > 0 ? ' due' : ''}`}>
          <small>{t('bizCliOwes')}</small>
          <strong>{fmt(hist.owes, cur, { decimals: moneyDecimals })}</strong>
        </div>
        <div className="mcli-next">
          <small>{t('bizCliNext')}</small>
          <strong>
            {proximo
              ? new Date(`${proximo}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
              : '—'}
          </strong>
        </div>
      </div>

      {!client.active && <p className="mbizs-calc warn">{t('bizCliPaused')}</p>}

      {antes && (
        <p className="mcli-price-was">
          {t('bizPriceWas')
            .replace('{amount}', fmt(antes.amount, cur, { decimals: moneyDecimals }))
            .replace('{date}', new Date(antes.at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }))}
        </p>
      )}

      <div className="mcli-meta">
        <span>
          {fmt(client.amount, cur, { decimals: moneyDecimals })}
          {' · '}{t(CYCLE_KEY[client.cycle] as LangKey)}
        </span>
        {/* El equivalente al mes solo si no es mensual: con un cliente mensual
            las dos cifras son la misma y repetirla hace dudar de cuál es. */}
        {client.cycle !== 'monthly' && alMes > 0 && (
          <span>{t('bizPerMonthIs').replace('{amount}', fmt(alMes, cur, { decimals: moneyDecimals }))}</span>
        )}
        {client.concept && <span>{client.concept}</span>}
        {negocio && <span><Icon name={negocio.icon} size={12} /> {negocio.name}</span>}
        {/* Sus servicios con lo que paga por cada uno. Con uno solo se dice
            el nombre y ya: repetir el precio que esta dos lineas mas arriba
            no anade nada. */}
        {sus.length === 1 && servicio && <span>{servicio.name}</span>}
        {sus.length > 1 && sus.map(({ serviceId, amount }) => {
          const svc = services.find(v => v.id === serviceId)
          if (!svc) return null
          return (
            <span key={serviceId}>
              {svc.name} {fmt(amount, cur, { decimals: moneyDecimals })}
            </span>
          )
        })}
        {/* La puntualidad en datos y sin juicios: sirve para decidir precios,
            no para acusar a nadie. */}
        {retraso !== null && retraso >= 1 && (
          <span className="late">{t('bizAvgDelay').replace('{n}', String(retraso))}</span>
        )}
      </div>

      {/* ── LO QUE IMPORTA PARA DECIDIR ────────────────────── */}
      <div className="mcli-paid">
        <small>{t('bizCliPaidYou')}</small>
        <strong className="income">{fmt(hist.totalPaid, cur, { decimals: moneyDecimals })}</strong>
        <em>
          {hist.paidCount === 1
            ? t('bizCliOnce')
            : t('bizCliTimes').replace('{n}', String(hist.paidCount))}
          {hist.streak >= 1 && ` · ${hist.streak === 1
            ? t('bizCliStreakOne')
            : t('bizCliStreak').replace('{n}', String(hist.streak))}`}
        </em>
      </div>

      {hist.totalPaid === 0 ? (
        <p className="mbizs-calc">{t('bizCliNoHistory')}</p>
      ) : (
        <>
          <div className="mbizs-field-label">
            {t('bizCliYear').replace('{year}', today.slice(0, 4))}
          </div>
          {/* Doce meses, sin ejes: lo que se lee de un vistazo es el ritmo —si
              paga todos los meses o a rachas—, no el valor exacto de cada uno. */}
          <div className="mcli-chart" aria-hidden="true">
            {hist.byMonth.map(m => (
              <span key={m.mkey} className={`mcli-chart-col${m.amount > 0 ? ' on' : ''}`}>
                <i style={{ height: `${Math.round(m.amount / tope * 100)}%` }} />
                <u>{shortMonth(m.mkey, locale).slice(0, 1)}</u>
              </span>
            ))}
          </div>
        </>
      )}

      {/* ── SUS COBROS ─────────────────────────────────────── */}
      {abiertos.length > 0 && (
        <>
          <div className="mbizs-field-label">{t('bizTabCollect')}</div>
          <div className="mcli-charges">
            {abiertos.map(charge => {
              const estado = chargeState(charge, today)
              return (
                <button key={charge.id} className={`mcli-charge ${estado}`} onClick={() => { playSoftHaptic(); onCollect(charge.id) }}>
                  <span>{new Date(`${charge.dueDate}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                  <b>{fmt(outstanding(charge), cur, { decimals: moneyDecimals })}</b>
                  {estado === 'late' && <em className="late">{t('bizGroupLate')}</em>}
                  {estado === 'today' && <em className="due">{t('bizDueToday')}</em>}
                  {estado === 'partial' && <em className="due">{t('bizPartial')}</em>}
                  {charge.note && <u>{charge.note}</u>}
                </button>
              )
            })}
          </div>
        </>
      )}

      {/*
        LO COBRADO, CON SU COMPROBANTE.
        Plegado detrás de su cabecera porque no es una tarea: lo que hay que
        hacer está arriba. Pero es donde se viene cuando alguien dice «yo ya
        te pagué», y hasta ahora no había dónde mirarlo.
      */}
      {grupos.done.length > 0 && (
        <>
          <button
            className="mcli-history-head"
            onClick={() => { playSoftHaptic(); setVerHistorial(v => !v) }}
            aria-expanded={verHistorial}
          >
            <span>{t('bizGroupDone')}</span>
            <b>{grupos.done.length}</b>
            <Icon name={verHistorial ? 'arrowUp' : 'arrowDn'} size={14} />
          </button>
          {verHistorial && (
            <div className="mcli-charges">
              {grupos.done.slice(0, 24).map(charge => (
                <div key={charge.id} className="mcli-charge done">
                  <span>
                    {new Date(`${charge.dueDate}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </span>
                  <b>{fmt(charge.paid, cur, { decimals: moneyDecimals })}</b>
                  {/* El comprobante solo de lo que tiene un movimiento detrás:
                      un papel que diga «recibido» sin esa prueba es justo el
                      que no se puede emitir a la ligera. */}
                  {charge.txIds.length > 0 && charge.paid > 0 && !charge.waived && (
                    <button
                      className="mcli-receipt"
                      disabled={generando}
                      aria-label={t('rcptAction')}
                      onClick={async () => {
                        setGenerando(true)
                        try {
                          const ok = await exportReceiptPdf(charge, client, currency, lang)
                          if (!ok) toast(t('rcptNeedsPayment'), { icon: 'alert' })
                        } finally { setGenerando(false) }
                      }}
                    >
                      <Icon name="receipt" size={14} />
                    </button>
                  )}
                  {charge.waived && <em>{t('bizWaived')}</em>}
                  {charge.note && <u>{charge.note}</u>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── ACCIONES ───────────────────────────────────────── */}
      <div className="mcli-actions">
        <button onClick={() => { playSoftHaptic(); setCobroNuevo(true) }}>
          <Icon name="plus" size={14} /> {t('bizNewCharge')}
        </button>
        <button onClick={() => { playSoftHaptic(); setEditando(true) }}>
          <Icon name="edit" size={14} /> {t('bizCliEdit')}
        </button>
        {/*
          «Otro igual»: con doce clientes del mismo servicio al mismo precio,
          añadir el trece era reescribir ocho campos ya escritos doce veces.
          Se abre el formulario del nuevo en el acto, porque lo único que le
          falta es el nombre.
        */}
        <button onClick={() => {
          const nuevo = duplicateClient(client.id)
          if (!nuevo) return
          playSoftHaptic()
          toast(t('bizCliDuplicated'), { icon: 'check', type: 'ok' })
          onDuplicated(nuevo)
        }}>
          <Icon name="cards" size={14} /> {t('bizCliDuplicate')}
        </button>
        {/* El estado de cuenta del año: lo que un cliente pide cuando quiere
            saber qué pagó, y lo que hace falta para cobrarle a alguien que
            dice que ya pagó. */}
        <button
          disabled={generando}
          onClick={async () => {
            setGenerando(true)
            try {
              playSoftHaptic()
              await exportStatementPdf(client, charges, Number(today.slice(0, 4)), currency, lang)
            } finally { setGenerando(false) }
          }}
        >
          <Icon name="fileJson" size={14} /> {t('stmtAction')}
        </button>
        {client.phone && (
          <button onClick={() => {
            navigator.clipboard.writeText(client.phone!)
              .then(() => toast(t('bizPhoneCopied'), { icon: 'check', type: 'ok' }))
              // Sin portapapeles, el teléfono se ENSEÑA: copiar es una
              // comodidad, verlo es el objetivo.
              .catch(() => toast(client.phone!, { icon: 'info' }))
          }}>
            <Icon name="phone" size={14} /> {t('bizCopyPhone')}
          </button>
        )}
      </div>

      {/* Editar y cobrar se abren ENCIMA de la ficha: al cerrarlos vuelves a
          donde estabas, no a la lista. */}
      {editando && (
        <ClientSheet clientId={client.id} onClose={() => setEditando(false)} />
      )}
      {cobroNuevo && <NewChargeSheet clientId={client.id} onClose={() => setCobroNuevo(false)} />}
    </BizSheet>
  )
}
