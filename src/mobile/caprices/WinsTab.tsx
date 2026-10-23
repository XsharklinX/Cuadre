import { useMemo } from 'react'
import { capricesByCategory, recoveredInYear } from '@/data/caprices'
import { dateLocale, fmt, shortMonth } from '@/data/helpers'
import { savedInYear } from '@/data/wishes'
import { translateCategoryName, useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { useCaprices } from '@/store/caprices'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useWishes } from '@/store/wishes'

/**
 * LOGROS: EN QUÉ CAES, Y CUÁNTO LLEVAS RECUPERADO.
 *
 * ── POR QUÉ NO ES UN INFORME MÁS ──────────────────────────────────────
 * Es el único sitio de la app que mira el gasto que TÚ marcaste como
 * innecesario. Saber que llevas 9,200 en comida a domicilio este año cambia
 * más conductas que cualquier presupuesto, porque no lo dijo una regla
 * automática: lo dijiste tú, un capricho a la vez.
 *
 * ── LAS DOS CIFRAS SON DISTINTAS Y VAN SEPARADAS ──────────────────────
 * Lo RECUPERADO son aportes con movimiento detrás: dinero que se movió.
 * Lo AHORRADO son antojos que no compraste: dinero que no se movió nunca.
 * Sumarlas daría un número más grande y menos cierto.
 */
export function WinsTab() {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { transactions, categories, currency } = useFinance()
  const caprices = useCaprices(s => s.items)
  const wishes = useWishes(s => s.items)

  const year = new Date().getFullYear()
  const recuperado = useMemo(() => recoveredInYear(caprices, year), [caprices, year])
  const ahorrado = useMemo(() => savedInYear(wishes, year), [wishes, year])

  /** Lo recuperado mes a mes, por fecha del aporte. */
  const porMes = useMemo(() => {
    const meses = Array.from({ length: 12 }, () => 0)
    for (const c of caprices) {
      for (const p of c.payments) {
        const d = new Date(p.at)
        if (d.getFullYear() === year) meses[d.getMonth()] += p.amount
      }
    }
    return meses.map((amount, i) => ({
      mkey: `${year}-${String(i + 1).padStart(2, '0')}`,
      amount: Math.round(amount * 100) / 100,
    }))
  }, [caprices, year])

  const tope = Math.max(1, ...porMes.map(m => m.amount))
  const mesActual = new Date().getMonth()

  /*
   * EN QUÉ CAES: por la categoría del gasto que abrió cada bote.
   *
   * La categoría sale del movimiento, no de un campo nuevo: es un dato que ya
   * existe, y duplicarlo daría dos respuestas en cuanto alguien editara el
   * gasto.
   */
  const porCategoria = useMemo(() => {
    const catDe = (txId: string) => transactions.find(tx => tx.id === txId)?.categoryId
    return capricesByCategory(caprices, catDe).slice(0, 5)
  }, [caprices, transactions])

  const topeCat = Math.max(1, ...porCategoria.map(c => c.amount))
  const vacio = recuperado === 0 && ahorrado === 0 && porCategoria.length === 0

  if (vacio) {
    return <p className="mcap-note">{t('capWinsEmpty')}</p>
  }

  return (
    <div className="mcap-wins">
      <div className="mcap-wins-two">
        <div className="mcap-wins-card">
          <small>{t('capRecoveredYear').replace('{year}', String(year))}</small>
          <strong className="income">{fmt(recuperado, currency, { decimals: moneyDecimals })}</strong>
        </div>
        {/* Aparte a propósito: no se gastó nunca, así que no es lo mismo que
            recuperar y sumarlas daría un número menos cierto. */}
        <div className="mcap-wins-card">
          <small>{t('capNotSpentYear')}</small>
          <strong>{fmt(ahorrado, currency, { decimals: moneyDecimals })}</strong>
        </div>
      </div>

      {recuperado > 0 && (
        <>
          <div className="mbizs-field-label">{t('capByMonth')}</div>
          <div className="mcap-chart">
            {porMes.map((m, i) => (
              <span key={m.mkey} className={`mcap-chart-col${i === mesActual ? ' now' : ''}`}>
                <i style={{ height: `${Math.round(m.amount / tope * 100)}%` }} />
                <u aria-hidden="true">{shortMonth(m.mkey, locale).slice(0, 1)}</u>
              </span>
            ))}
          </div>
        </>
      )}

      {porCategoria.length > 0 && (
        <>
          <div className="mbizs-field-label">{t('capWhereYouFall')}</div>
          <div className="mcap-cats">
            {porCategoria.map(({ categoryId, amount, count }) => {
              const cat = categories.find(c => c.id === categoryId)
              if (!cat) return null
              return (
                <div key={categoryId} className="mcap-cat">
                  <div className="mcap-cat-row">
                    <span>{translateCategoryName(cat, lang)}</span>
                    <b>{fmt(amount, currency, { decimals: moneyDecimals })}</b>
                  </div>
                  <div className="mcap-cat-bar">
                    <i style={{ width: `${Math.round(amount / topeCat * 100)}%`, background: cat.color }} />
                  </div>
                  <small>{t('capNTimes').replace('{n}', String(count))}</small>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
