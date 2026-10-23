import { useMemo, useState } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { capricesSummary, isSettled, monthsAtCurrentPace, pace, progress, recovered, remaining, sortCaprices } from '@/data/caprices'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playConfirmSound, playSoftHaptic } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { ViewProps } from '@/types'
import { PayCapriceSheet } from './caprices/PayCapriceSheet'
import { WishesTab } from './caprices/WishesTab'
import { WinsTab } from './caprices/WinsTab'

type CapTab = 'wishes' | 'jar' | 'wins'

/**
 * CAPRICHOS: ANTOJOS, EL BOTE Y LOS LOGROS.
 *
 * ── UN SOLO NOMBRE ────────────────────────────────────────────────────
 * La pantalla se llamaba «El bote» y la función «Caprichos»: dos nombres para
 * una cosa es la forma más barata de que parezca dos y no se encuentre
 * ninguna. Ahora el bote es una SECCIÓN de Caprichos, que es lo que era.
 *
 * ── LAS TRES MIRAN EN TRES DIRECCIONES ────────────────────────────────
 * · **Antojos** mira adelante: lo que todavía no compraste.
 * · **El bote** mira el presente: lo que falta por recuperar.
 * · **Logros** mira atrás: en qué caes y cuánto llevas recuperado.
 *
 * Son tres momentos distintos y por eso son tres pestañas y no una lista
 * larga: nadie entra a las tres a la vez.
 *
 * ── POR QUÉ YA NO VIVE EN NEGOCIO ─────────────────────────────────────
 * Estuvo una versión como tercera pestaña de Negocio y no pegaba: Negocio
 * contesta «¿cuánto me deja esto?» y un capricho es lo contrario —disciplina
 * personal, no rentabilidad—. Compartían pantalla por comodidad al construirlo,
 * no por ninguna razón buena. Ahora vive con Presupuestos y Metas, que son las
 * otras dos herramientas de la misma familia.
 *
 * ── UN SOLO NÚMERO, NO UNA LISTA DE CULPAS ────────────────────────────
 * Con tres caprichos una lista está bien. Con quince es un muro de cosas que
 * hiciste mal, y eso es exactamente lo que esta función no debe ser. Así que
 * manda el total y el detalle va detrás, plegado.
 *
 * Y lo que no hace, que importa tanto como lo que hace: no cuenta cuántos
 * llevas, no puntúa tu autocontrol, no avisa de nada. Tú decides qué fue un
 * capricho, y cerrar un bote no es un fracaso.
 */
export function MobileCaprices({ onEditTx }: ViewProps) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { transactions, currency } = useFinance()
  const items = useCaprices(s => s.items)
  const close = useCaprices(s => s.close)
  const remove = useCaprices(s => s.remove)
  const setTarget = useCaprices(s => s.setTarget)

  const [verDetalle, setVerDetalle] = useState(false)
  const [pagarId, setPagarId] = useState<string | null>(null)
  /*
   * La pestaña de entrada es ANTOJOS.
   *
   * Es la que mira adelante, y la única que puede evitar un capricho antes de
   * que exista. El bote solo se puede mirar cuando ya es tarde.
   */
  const [tab, setTab] = useState<CapTab>('wishes')

  const hoy = localToday()
  const resumen = useMemo(() => capricesSummary(items), [items])
  const lista = useMemo(() => sortCaprices(items), [items])
  const txNote = (txId: string) => transactions.find(tx => tx.id === txId)?.note ?? ''

  const tabs: Array<{ id: CapTab; key: 'capTabWishes' | 'capTabJar' | 'capTabWins' }> = [
    { id: 'wishes', key: 'capTabWishes' },
    { id: 'jar', key: 'capTabJar' },
    { id: 'wins', key: 'capTabWins' },
  ]

  const barra = (
    <div className="mcap-tabs" role="tablist" aria-label={t('capTitle')}>
      {tabs.map(x => (
        <button
          key={x.id}
          role="tab"
          aria-selected={tab === x.id}
          className={tab === x.id ? 'on' : ''}
          onClick={() => { setTab(x.id); playSoftHaptic() }}
        >
          {t(x.key)}
        </button>
      ))}
    </div>
  )

  if (tab === 'wishes') {
    return <div className="mcap-screen">{barra}<WishesTab /></div>
  }

  if (tab === 'wins') {
    return <div className="mcap-screen">{barra}<WinsTab /></div>
  }

  if (items.length === 0) {
    return (
      <div className="mcap-screen">
        {barra}
        <div className="mcap-empty">
          <EmptyArt kind="caprices" />
          <strong>{t('capNoneTitle')}</strong>
          <p>{t('capNoneText')}</p>
          <p className="mcap-how">{t('capHowToMark')}</p>
        </div>
      </div>
    )
  }

  const pct = resumen.total > 0 ? Math.round(resumen.recovered / resumen.total * 100) : 0

  return (
    <div className="mcap-screen">
      {barra}
      {/* EL NÚMERO. Un solo objetivo que sube y baja, no un historial. */}
      <div className="mcap-hero">
        <small>{t('capOutstanding')}</small>
        <strong><AnimatedMoney value={resumen.outstanding} decimals={moneyDecimals} fit /></strong>
        <div className="mcap-bar"><i style={{ width: `${pct}%` }} /></div>
        <span>
          {t('capOfTotal')
            .replace('{total}', fmt(resumen.total, currency, { decimals: moneyDecimals }))
            .replace('{n}', String(resumen.openCount))}
        </span>
      </div>

      {resumen.openCount > 0 && (
        <button className="mcap-pay" onClick={() => { playSoftHaptic(); setPagarId(lista[0]?.id ?? null) }}>
          <Icon name="handCoins" size={16} /> {t('capPayWithMovement')}
        </button>
      )}

      <p className="mcap-note">{t('capHowToPay')}</p>

      <button
        className="mcap-toggle"
        onClick={() => { setVerDetalle(v => !v); playSoftHaptic() }}
        aria-expanded={verDetalle}
      >
        {t('capSeeAll').replace('{n}', String(items.length))}
        <Icon name={verDetalle ? 'arrowUp' : 'arrowDn'} size={13} />
      </button>

      {verDetalle && (
        <div className="mcap-list">
          {lista.map(cap => {
            const cerrado = cap.closed || isSettled(cap)
            return (
              <div key={cap.id} className={`mcap-item${cerrado ? ' done' : ''}`}>
                <div className="mcap-item-head">
                  <span className="mcap-item-id">
                    <b>{cap.note || txNote(cap.txId) || t('capUntitled')}</b>
                    <small>
                      {cerrado
                        ? t('capSettled')
                        : t('capRemaining').replace('{amount}', fmt(remaining(cap), currency, { decimals: moneyDecimals }))}
                      {' · '}
                      {new Date(cap.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                    </small>
                  </span>
                  <span className="mcap-item-amt">{fmt(cap.amount, currency, { decimals: moneyDecimals })}</span>
                </div>
                <div className="mcap-bar sm"><i style={{ width: `${Math.round(progress(cap) * 100)}%` }} /></div>

                {/*
                  EL RITMO.
                  «Te faltan 2,400» no dice que hacer. «Si abonas 600 al mes lo
                  cierras en cuatro» si, y es lo que convierte una barra de
                  progreso en algo accionable.
                */}
                {!cerrado && (
                  <div className="mcap-pace">
                    <input
                      className="mbizs-input mbizs-input-sm"
                      type="date"
                      value={cap.targetDate ?? ''}
                      aria-label={t('capTargetDate')}
                      onChange={e => setTarget(cap.id, e.target.value || undefined)}
                    />
                    {(() => {
                      const ritmo = pace(cap, hoy)
                      if (ritmo) {
                        return (
                          <small>
                            {t('capPace')
                              .replace('{amount}', fmt(ritmo.perMonth, currency, { decimals: moneyDecimals }))
                              .replace('{n}', t('monthsOnly').replace('{m}', String(ritmo.months)))}
                          </small>
                        )
                      }
                      // Sin fecha, lo que se puede decir es el ritmo que ya
                      // lleva: con aportes hay de donde sacarlo.
                      const meses = monthsAtCurrentPace(cap, Date.now())
                      if (meses !== null) {
                        return <small>{t('capPaceNow').replace('{n}', String(meses))}</small>
                      }
                      return <small>{t('capTargetHint')}</small>
                    })()}
                  </div>
                )}

                {cap.payments.length > 0 && (
                  <div className="mcap-pays">
                    {cap.payments.map(p => (
                      <span key={p.txId}>
                        {txNote(p.txId) || t('capPayment')} · {fmt(p.amount, currency, { decimals: moneyDecimals })}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mcap-actions">
                  {!cerrado && (
                    <button onClick={() => setPagarId(cap.id)}>{t('capPayFrom')}</button>
                  )}
                  <button onClick={() => { const tx = transactions.find(x => x.id === cap.txId); if (tx) onEditTx(tx) }}>
                    {t('capSeeExpense')}
                  </button>
                  <button onClick={() => { close(cap.id, !cap.closed); playConfirmSound() }}>
                    {cap.closed ? t('capReopen') : t('capClose')}
                  </button>
                  {/* Quitar del todo: cerrar lo deja en el historial, y hay
                      quien no quiere ni eso. No es un fracaso ninguna de las
                      dos cosas. */}
                  <button onClick={() => { remove(cap.id); toast(t('capRemoved'), { icon: 'trash' }) }}>
                    {t('capForget')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {pagarId && (
        <PayCapriceSheet
          capriceId={pagarId}
          onClose={() => setPagarId(null)}
          onPaid={amount => toast(
            t('capAssignedAmount').replace('{amount}', fmt(amount, currency, { decimals: moneyDecimals })),
            { icon: 'check', type: 'ok' },
          )}
        />
      )}
    </div>
  )
}

/** Lo recuperado, reexportado para quien lo necesite sin importar el módulo. */
export { recovered }
