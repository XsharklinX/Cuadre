import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { dateLocale, fmt } from '@/data/helpers'
import { WAIT_DAYS, daysLeft, sortWishes, waitProgress, wishState, wishesSummary } from '@/data/wishes'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playSoftHaptic } from '@/lib/sound'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useWishes } from '@/store/wishes'
import type { Wish } from '@/data/wishes'
import { SkipSheet } from './SkipSheet'
import { WishSheet } from './WishSheet'

/**
 * ANTOJOS: LO QUE TODAVÍA NO COMPRASTE.
 *
 * ── LA VUELTA AL CONCEPTO ─────────────────────────────────────────────
 * Caprichos solo miraba atrás. Un antojo se apunta ANTES y espera siete días.
 * Si al séptimo lo sigues queriendo, se compra sin culpa; si se te pasaron
 * las ganas, no lo compraste — y esa es la mejor forma de recuperar el dinero
 * de una compra innecesaria.
 *
 * ── LO QUE LA PANTALLA PIDE, Y LO QUE SOLO ESTÁ ───────────────────────
 * Solo los que tocan HOY piden una decisión, y son los únicos con botones.
 * Los que esperan solo están, con su barra. Una lista que pide una decisión
 * cada día deja de pedirla el día que importa.
 */
export function WishesTab() {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { currency } = useFinance()
  const items = useWishes(s => s.items)
  const buy = useWishes(s => s.buy)
  const remove = useWishes(s => s.remove)

  const [creando, setCreando] = useState(false)
  const [descartando, setDescartando] = useState<Wish | null>(null)

  const ahora = Date.now()
  const lista = useMemo(() => sortWishes(items, ahora), [items, ahora])
  const resumen = useMemo(() => wishesSummary(items, ahora), [items, ahora])
  const abiertos = lista.filter(w => !w.resolution)
  const resueltos = lista.filter(w => !!w.resolution).slice(0, 12)

  return (
    <div className="mcap-wishes">
      {/* Lo ahorrado por no comprar: la prueba de que esperar funciona. */}
      {resumen.skipped > 0 && (
        <div className="mcap-saved">
          <small>{t('wishNotBought').replace('{n}', String(resumen.skipped))}</small>
          <strong className="income">{fmt(resumen.saved, currency, { decimals: moneyDecimals })}</strong>
        </div>
      )}

      <button className="mcap-add" onClick={() => { playSoftHaptic(); setCreando(true) }}>
        <Icon name="plus" size={15} /> {t('wishNew')}
      </button>

      {abiertos.length === 0 ? (
        <p className="mcap-note">{t('wishEmpty').replace('{n}', String(WAIT_DAYS))}</p>
      ) : (
        <div className="m-stagger">
          {abiertos.map(w => {
            const estado = wishState(w, ahora)
            const faltan = daysLeft(w, ahora)
            const pct = Math.round(waitProgress(w, ahora) * 100)
            return (
              <article key={w.id} className={`mcap-wish ${estado}`}>
                <div className="mcap-wish-top">
                  <span className="mcap-wish-id">
                    <b>{w.name}</b>
                    <small>
                      {estado === 'ready'
                        ? t('wishDecideToday')
                        : t('wishDaysLeft').replace('{n}', String(faltan))}
                    </small>
                  </span>
                  <b className="mcap-wish-amount">
                    {fmt(w.amount, currency, { decimals: moneyDecimals })}
                  </b>
                </div>

                {w.note && <p className="mcap-wish-note">{w.note}</p>}

                {estado === 'waiting' && (
                  <div className="mcap-wish-bar"><i style={{ width: `${pct}%` }} /></div>
                )}

                {/* Solo el día de decidir hay botones: los demás días el
                    antojo solo está. */}
                {estado === 'ready' && (
                  <div className="mcap-wish-acts">
                    <button
                      onClick={() => {
                        buy(w.id)
                        playSoftHaptic()
                        toast(t('wishBought'), { icon: 'check', type: 'ok' })
                      }}
                    >
                      {t('wishBuy')}
                    </button>
                    <button className="ghost" onClick={() => setDescartando(w)}>
                      {t('wishSkip')}
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {resueltos.length > 0 && (
        <>
          <div className="mbizs-field-label">{t('bizGroupDone')}</div>
          <div className="mcap-done">
            {resueltos.map(w => (
              <div key={w.id} className={`mcap-done-row ${w.resolution}`}>
                <span>
                  <b>{w.name}</b>
                  <small>
                    {new Date(w.resolvedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
                  </small>
                </span>
                <em>{t(w.resolution === 'skipped' ? 'wishWasSkipped' : 'wishWasBought')}</em>
                <b>{fmt(w.amount, currency, { decimals: moneyDecimals })}</b>
                <button
                  aria-label={t('delete')}
                  onClick={() => { remove(w.id); toast(t('wishRemoved'), { icon: 'trash' }) }}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {creando && <WishSheet onClose={() => setCreando(false)} />}
      {descartando && (
        <SkipSheet wish={descartando} onClose={() => setDescartando(null)} />
      )}
    </div>
  )
}
