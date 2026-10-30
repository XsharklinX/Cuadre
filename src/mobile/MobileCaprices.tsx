import { useMemo, useState } from 'react'
import { IconTile, NxSheet } from '@/components/ui/Phrase'
import { toast } from '@/components/ui/Toast'
import { capricesSummary, isSettled, monthsAtCurrentPace, pace, progress, recovered, recoveredInYear, remaining, sortCaprices } from '@/data/caprices'
import { WAIT_DAYS, daysLeft, savedInYear, sortWishes, wishState, type Wish } from '@/data/wishes'
import { dateLocale, fmt, localToday } from '@/data/helpers'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { playConfirmSound, playSoftHaptic } from '@/lib/sound'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useWishes } from '@/store/wishes'
import type { ViewProps } from '@/types'
import { PayCapriceSheet } from './caprices/PayCapriceSheet'
import { SkipSheet } from './caprices/SkipSheet'
import { WishSheet } from './caprices/WishSheet'
import { WinsTab } from './caprices/WinsTab'

/*
 * C1 · CAPRICHOS EN UNA PANTALLA.
 *
 * Eran tres pestañas (Antojos, El bote, Logros), la del bote casi vacía, y el
 * título decía «Perfil». Ahora es una sola pantalla que se lee de arriba
 * abajo: un frasco que se llena con lo que ya devolviste y la cifra que
 * falta; los caprichos por recuperar en filas con su barra fina; los antojos
 * en espera con el día en que puedes decidir; y lo ya cerrado, plegado. Los
 * logros son una línea al final que abre su detalle.
 */
export function MobileCaprices({ onEditTx }: ViewProps) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const decimals = useMoneyDecimals()
  const { transactions, currency } = useFinance()
  const items = useCaprices(s => s.items)
  const close = useCaprices(s => s.close)
  const remove = useCaprices(s => s.remove)
  const setTarget = useCaprices(s => s.setTarget)
  const wishes = useWishes(s => s.items)
  const buy = useWishes(s => s.buy)
  const removeWish = useWishes(s => s.remove)

  const [abierto, setAbierto] = useState<string | null>(null)
  const [pagarId, setPagarId] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)
  const [descartando, setDescartando] = useState<Wish | null>(null)
  const [verCerrados, setVerCerrados] = useState(false)
  const [logros, setLogros] = useState(false)

  const hoy = localToday()
  const ahora = Date.now()
  const money = (n: number) => fmt(n, currency, { decimals })
  const resumen = useMemo(() => capricesSummary(items), [items])
  const lista = useMemo(() => sortCaprices(items), [items])
  const abiertos = lista.filter(c => !c.closed && !isSettled(c))
  const cerrados = lista.filter(c => c.closed || isSettled(c))
  const antojos = useMemo(() => sortWishes(wishes, ahora), [wishes, ahora])
  const enEspera = antojos.filter(w => !w.resolution)
  const resueltos = antojos.filter(w => !!w.resolution).slice(0, 12)
  const year = new Date().getFullYear()
  const recuperadoAnio = useMemo(() => recoveredInYear(items, year), [items, year])
  const resistido = useMemo(() => savedInYear(wishes, year), [wishes, year])
  const resistidos = wishes.filter(w => w.resolution === 'skipped' && new Date(w.resolvedAt).getFullYear() === year).length
  const txNote = (txId: string) => transactions.find(tx => tx.id === txId)?.note ?? ''
  const fill = resumen.total > 0 ? Math.round((resumen.recovered / resumen.total) * 100) : 0

  const detalle = (cap: typeof items[number]) => {
    const cerrado = cap.closed || isSettled(cap)
    return (
      <div className="nxk-detail">
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
                return <small>{t('capPace').replace('{amount}', money(ritmo.perMonth)).replace('{n}', t('monthsOnly').replace('{m}', String(ritmo.months)))}</small>
              }
              const meses = monthsAtCurrentPace(cap, Date.now())
              return <small>{meses !== null ? t('capPaceNow').replace('{n}', String(meses)) : t('capTargetHint')}</small>
            })()}
          </div>
        )}
        {cap.payments.length > 0 && (
          <div className="nx-list">
            {cap.payments.map(p => (
              <div key={p.txId} className="nx-row">
                <span className="nx-row-k">{txNote(p.txId) || t('capPayment')}<small>{new Date(p.at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</small></span>
                <span className="nx-row-v ok">+{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="nx-actions">
          {!cerrado && <button onClick={() => setPagarId(cap.id)}>{t('capPayFrom')}</button>}
          <button onClick={() => { const tx = transactions.find(x => x.id === cap.txId); if (tx) onEditTx(tx) }}>{t('capSeeExpense')}</button>
          <button onClick={() => { close(cap.id, !cap.closed); playConfirmSound() }}>{cap.closed ? t('capReopen') : t('capClose')}</button>
          <button className="danger" onClick={() => { remove(cap.id); toast(t('capRemoved'), { icon: 'trash' }) }}>{t('capForget')}</button>
        </div>
      </div>
    )
  }

  const filaCapricho = (cap: typeof items[number]) => {
    const cerrado = cap.closed || isSettled(cap)
    const open = abierto === cap.id
    return (
      <div key={cap.id} className={`nxk-item${open ? ' open' : ''}`}>
        <button className="nxk-row" aria-expanded={open} onClick={() => { setAbierto(open ? null : cap.id); playSoftHaptic() }}>
          <IconTile icon="piggy" color={cerrado ? 'var(--m-income)' : '#ff9a3d'} />
          <span className="nxk-row-main">
            <b>{cap.note || txNote(cap.txId) || t('capUntitled')}</b>
            <span className="nx-thin"><i className={cerrado ? 'ok' : 'warn'} style={{ width: `${Math.round(progress(cap) * 100)}%` }} /></span>
            <small>
              {cerrado ? t('capSettled') : t('nxkOf').replace('{amount}', money(cap.amount))}
              {' · '}{new Date(cap.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
            </small>
          </span>
          <span className={`nxk-amt${cerrado ? ' ok' : ''}`}>{cerrado ? money(cap.amount) : money(remaining(cap))}</span>
        </button>
        {open && detalle(cap)}
      </div>
    )
  }

  const vacio = items.length === 0 && wishes.length === 0

  return (
    <div className="mcap-screen nx">
      {vacio ? (
        <div className="nx-hero">
          <span className="nx-serif nxk-empty-title">{t('capNoneTitle')}</span>
          <p className="nx-note">{t('capNoneText')}</p>
          <p className="nx-note">{t('capHowToMark')}</p>
        </div>
      ) : (
        <div className="nxk-hero">
          <span className="nxk-jar" aria-hidden="true"><i style={{ height: `${fill}%` }} /></span>
          <span className="nxk-hero-text">
            <small>{resumen.outstanding > 0 ? t('capOutstanding') : t('nxkAllBack')}</small>
            <span className="nx-big">{money(resumen.outstanding)}</span>
            {resumen.total > 0 && <small>{t('nxkOfTotal').replace('{amount}', money(resumen.total))}</small>}
          </span>
        </div>
      )}

      {abiertos.length > 0 && (
        <button className="nx-btn pri nxk-pay" onClick={() => { playSoftHaptic(); setPagarId(abiertos[0].id) }}>{t('capPayWithMovement')}</button>
      )}

      {abiertos.length > 0 && (
        <>
          <p className="nx-label">{t('nxkToRecover')}</p>
          <div className="nx-list">{abiertos.map(filaCapricho)}</div>
        </>
      )}

      <p className="nx-label">
        {t('nxkWishes')}
        <button onClick={() => { playSoftHaptic(); setCreando(true) }}>+ {t('nxkWishNew')}</button>
      </p>
      {enEspera.length === 0 ? (
        <p className="nx-note">{t('wishEmpty').replace('{n}', String(WAIT_DAYS))}</p>
      ) : (
        <div className="nx-list">
          {enEspera.map(w => {
            const listo = wishState(w, ahora) === 'ready'
            const dia = new Date(w.decideAt).toLocaleDateString(locale, { weekday: 'long' })
            return (
              <div key={w.id} className="nxk-wish">
                <div className="nxk-row">
                  <IconTile icon="clock" color={listo ? 'var(--m-primary)' : '#a78bfa'} />
                  <span className="nxk-row-main">
                    <b>{w.name}</b>
                    <small className={listo ? 'nxk-ready' : ''}>
                      {listo ? t('nxkDecideNow') : t('nxkDecideOn').replace('{day}', dia).replace('{n}', String(daysLeft(w, ahora)))}
                    </small>
                  </span>
                  <span className="nxk-amt">{money(w.amount)}</span>
                </div>
                {w.note && <p className="nx-note">{w.note}</p>}
                {/* C2 · Al cumplirse la espera, se decide en un toque. */}
                {listo && (
                  <div className="nx-actions">
                    <button onClick={() => { buy(w.id); playSoftHaptic(); toast(t('wishBought'), { icon: 'check', type: 'ok' }) }}>{t('nxkBuy')}</button>
                    <button onClick={() => setDescartando(w)}>{t('nxkSkip')}</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {(cerrados.length > 0 || resueltos.length > 0) && (
        <>
          <p className="nx-label">
            {t('nxkClosed').replace('{n}', String(cerrados.length + resueltos.length))}
            <button onClick={() => setVerCerrados(v => !v)}>{verCerrados ? t('nxkHide') : t('nxkShow')}</button>
          </p>
          {verCerrados && (
            <div className="nx-list">
              {cerrados.map(filaCapricho)}
              {resueltos.map(w => (
                <div key={w.id} className="nx-row">
                  <span className="nx-row-k">{w.name}<small>{t(w.resolution === 'skipped' ? 'wishWasSkipped' : 'wishWasBought')} · {new Date(w.resolvedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</small></span>
                  <span className={`nx-row-v${w.resolution === 'skipped' ? ' ok' : ''}`}>{money(w.amount)}</span>
                  <button className="nx-link" aria-label={t('delete')} onClick={() => { removeWish(w.id); toast(t('wishRemoved'), { icon: 'trash' }) }}>×</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {(recuperadoAnio > 0 || resistido > 0) && (
        <button className="nxk-wins" onClick={() => setLogros(true)}>
          {t('nxkWinsLine')
            .replace('{year}', String(year))
            .replace('{recovered}', money(recuperadoAnio))
            .replace('{n}', String(resistidos))
            .replace('{saved}', money(resistido))}
          <span>{t('nxkWinsSee')}</span>
        </button>
      )}

      {pagarId && (
        <PayCapriceSheet
          capriceId={pagarId}
          onClose={() => setPagarId(null)}
          onPaid={amount => toast(t('capAssignedAmount').replace('{amount}', money(amount)), { icon: 'check', type: 'ok' })}
        />
      )}
      {creando && <WishSheet onClose={() => setCreando(false)} />}
      {descartando && <SkipSheet wish={descartando} onClose={() => setDescartando(null)} />}
      {logros && <NxSheet title={t('capTabWins')} onClose={() => setLogros(false)}><WinsTab /></NxSheet>}
    </div>
  )
}

/** Lo recuperado, reexportado para quien lo necesite sin importar el módulo. */
export { recovered }
