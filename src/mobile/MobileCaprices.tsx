import { useMemo, useState } from 'react'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { capricesSummary, isSettled, progress, recovered, remaining, sortCaprices } from '@/data/caprices'
import { dateLocale, fmt } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playConfirmSound, playSoftHaptic } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { ViewProps } from '@/types'
import { PayCapriceSheet } from './caprices/PayCapriceSheet'

/**
 * EL BOTE DE LOS CAPRICHOS.
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

  const [verDetalle, setVerDetalle] = useState(false)
  const [pagarId, setPagarId] = useState<string | null>(null)

  const resumen = useMemo(() => capricesSummary(items), [items])
  const lista = useMemo(() => sortCaprices(items), [items])
  const txNote = (txId: string) => transactions.find(tx => tx.id === txId)?.note ?? ''

  if (items.length === 0) {
    return (
      <div className="mcap-screen">
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
