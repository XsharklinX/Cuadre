import { useMemo, useState } from 'react'
import { SheetSelect } from '@/components/ui/SheetSelect'
import { Icon } from '@/components/ui/Icon'
import { compareCategoryTotals } from '@/data/comparisons'
import { dateLocale, fmt as fmtRaw, monthLabel, totals, txForMonth } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { translateCategoryName, useT } from '@/i18n'
import type { Category, CurrencyCode, Transaction } from '@/types'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * A3 · DOS MESES, LADO A LADO.
 *
 * Análisis solo comparaba contra el mes de antes, y la pregunta de verdad
 * suele ser otra: «¿gasté más que en diciembre?», «¿este octubre o el del año
 * pasado?». Aquí eliges los dos, y cada fila pone uno al lado del otro con la
 * diferencia al final. Las categorías salen ordenadas por lo que más cambió,
 * que es lo que se viene a buscar.
 */
export function CompareMonthsSheet({ txns, categories, currency, initialA, initialB, onClose }: {
  txns: Transaction[]
  categories: Category[]
  currency: CurrencyCode
  initialA: string
  initialB: string
  onClose: () => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)

  // Solo los meses que tienen algo: un mes vacío compara contra nada.
  const meses = useMemo(() => {
    const set = new Set(txns.map(tx => tx.date.slice(0, 7)))
    set.add(initialA)
    set.add(initialB)
    return [...set].sort((a, b) => b.localeCompare(a))
  }, [txns, initialA, initialB])

  const [a, setA] = useState(initialA)
  const [b, setB] = useState(initialB)

  const txA = useMemo(() => txForMonth(txns, a), [txns, a])
  const txB = useMemo(() => txForMonth(txns, b), [txns, b])
  const sumA = totals(txA)
  const sumB = totals(txB)
  const filas = useMemo(
    () => compareCategoryTotals(txA, txB, categories, 'expense').filter(r => Math.abs(r.delta) > 0.005).slice(0, 8),
    [txA, txB, categories],
  )

  const nombre = (mk: string) => monthLabel(mk, dateLocale(lang))
  // Sin centavos: son tres cifras por fila y con decimales no cabían en un móvil pequeño.
  const dinero = (n: number) => fmtRaw(n, currency, { decimals: 0 })
  const diff = (n: number, goodWhenUp: boolean) => {
    if (Math.abs(n) < 0.005) return <span className="man-cmp-diff">=</span>
    const bueno = goodWhenUp ? n > 0 : n < 0
    return <span className={`man-cmp-diff ${bueno ? 'good' : 'bad'}`}>{n > 0 ? '+' : '−'}{dinero(Math.abs(n))}</span>
  }

  const selector = (valor: string, cambiar: (v: string) => void, etiqueta: string) => (
    <div className="man-cmp-pick">
      <small>{etiqueta}</small>
      <SheetSelect title={etiqueta} value={valor} onChange={cambiar} options={meses.map(mk => ({ value: mk, label: nombre(mk) }))} />
    </div>
  )

  const totalesFilas: Array<{ label: string; a: number; b: number; goodWhenUp: boolean }> = [
    { label: t('incomes'), a: sumA.income, b: sumB.income, goodWhenUp: true },
    { label: t('expenses'), a: sumA.expense, b: sumB.expense, goodWhenUp: false },
    { label: t('netLabel'), a: sumA.net, b: sumB.net, goodWhenUp: true },
  ]

  return (
    <SheetPortal>
      <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('anCompareTitle')} onClick={onClose}>
        <section className="man-export-sheet man-cmp" onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('anCompareTitle')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>

          <div className="man-cmp-picks">
            {selector(a, setA, t('anCompareThis'))}
            {selector(b, setB, t('anCompareAgainst'))}
          </div>

          {a === b ? (
            <p className="man-cmp-same">{t('anCompareSame')}</p>
          ) : (
            <>
              <div className="man-cmp-table">
                <div className="man-cmp-row head">
                  <span />
                  <span>{nombre(a)}</span>
                  <span>{nombre(b)}</span>
                  <span>{t('anCompareDiff')}</span>
                </div>
                {totalesFilas.map(f => (
                  <div key={f.label} className="man-cmp-row">
                    <b>{f.label}</b>
                    <span>{dinero(f.a)}</span>
                    <span>{dinero(f.b)}</span>
                    {diff(f.a - f.b, f.goodWhenUp)}
                  </div>
                ))}
              </div>

              <p className="man-cmp-sub">{t('anCompareByCategory')}</p>
              {filas.length === 0 ? (
                <p className="man-cmp-same">{t('anCompareNoChange')}</p>
              ) : (
                /*
                 * A8 · BARRAS, NO UNA TABLA. Cuatro columnas de cifras obligaban a
                 * leer y restar. Dos barras por categoría (el otro mes en gris,
                 * este en su color) dicen de un vistazo dónde subió y dónde bajó.
                 */
                <div className="man-cmp-bars">
                  <div className="man-cmp-bars-key">
                    <span><i className="a" />{nombre(a)}</span>
                    <span><i className="b" />{nombre(b)}</span>
                  </div>
                  {filas.map(r => {
                    const max = Math.max(1, ...filas.map(f => Math.max(f.current, f.previous)))
                    return (
                      <div key={r.category.id} className="man-cmp-bar">
                        <div className="man-cmp-bar-head">
                          <b><i style={{ background: r.category.color }} />{translateCategoryName(r.category, lang)}</b>
                          {diff(r.delta, false)}
                        </div>
                        <span className="man-cmp-bar-a" style={{ width: `${(r.current / max) * 100}%`, background: r.category.color }} title={dinero(r.current)} />
                        <span className="man-cmp-bar-b" style={{ width: `${(r.previous / max) * 100}%` }} title={dinero(r.previous)} />
                        <small>{dinero(r.current)} · {dinero(r.previous)}</small>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </SheetPortal>
  )
}
