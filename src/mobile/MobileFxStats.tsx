import { useMemo, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { getCurrencyMeta } from '@/data/currencies'
import { readFxHistory } from '@/data/exchangeRates'
import { changeOver, enoughToChart, seriesFor, toPath } from '@/data/fxHistory'
import { dateLocale } from '@/data/helpers'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { SheetPortal } from './SheetPortal'
import type { CurrencyCode } from '@/types'

/**
 * CÓMO SE HA MOVIDO ESTA MONEDA.
 *
 * La serie no se descarga: se construye con las tasas que la app ya baja cada
 * 12h, porque ninguna fuente gratuita publica el histórico del peso
 * dominicano (el porqué está en `fxHistory.ts`).
 *
 * De ahí la regla que gobierna esta pantalla: **nunca dibujar más de lo que
 * se sabe**. Con menos de dos días no hay línea, hay un aviso que explica que
 * se irá llenando. Una curva inventada sobre un punto sería una afirmación
 * sobre el dinero de alguien que la app no puede sostener.
 */

const RANGOS = [7, 30, 90] as const
type Rango = typeof RANGOS[number]

const W = 300
const H = 92

export function MobileFxStats({ code, onClose }: { code: CurrencyCode; onClose: () => void }) {
  const t = useT()
  const lang = useSettings(s => s.language) ?? 'es'
  const [rango, setRango] = useState<Rango>(30)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  // Se lee una vez al abrir: la serie solo cambia cuando se descargan tasas,
  // y eso no pasa mientras esta hoja esta abierta.
  const history = useMemo(() => readFxHistory(), [])
  const puntos = useMemo(() => seriesFor(history, code, rango), [history, code, rango])
  const cambio = changeOver(puntos)
  const meta = getCurrencyMeta(code)
  const hayLinea = enoughToChart(puntos)

  const fmtRate = (n: number) => n.toLocaleString(dateLocale(lang), {
    minimumFractionDigits: 2, maximumFractionDigits: n < 10 ? 4 : 2,
  })

  return (
    <SheetPortal>
      <div
        ref={dialogRef}
        className="mobile-detail-sheet mfx-overlay"
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <section className="mfx-sheet" onClick={e => e.stopPropagation()}>
          <header className="mfx-header">
            <span>
              <b>{meta.flag} {code}</b>
              <small>{t('fxPerDollar')}</small>
            </span>
            <button aria-label={t('close')} onClick={onClose}>
              <Icon name="close" size={18} />
            </button>
          </header>

          {hayLinea && cambio ? (
            <>
              {/* La cifra de hoy manda; el cambio del tramo va debajo, que es
                  la pregunta real: ¿esta mas cara que antes? */}
              <div className="mfx-figure">
                <strong>{fmtRate(cambio.last)}</strong>
                <span className={`mfx-delta ${cambio.direction}`}>
                  <Icon
                    name={cambio.direction === 'up' ? 'arrowUp' : cambio.direction === 'down' ? 'arrowDn' : 'circleDot'}
                    size={13}
                  />
                  {cambio.percent > 0 ? '+' : ''}{cambio.percent.toFixed(2)}%
                  <em>{t('fxInRange').replace('{n}', String(puntos.length))}</em>
                </span>
              </div>

              <svg
                className={`mfx-chart ${cambio.direction}`}
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label={t('fxChartLabel')
                  .replace('{code}', code)
                  .replace('{pct}', cambio.percent.toFixed(2))}
              >
                {/* El relleno hace legible la direccion de un vistazo, sin
                    tener que seguir la linea con el ojo. */}
                <path className="mfx-area" d={`${toPath(puntos, W, H - 10)} L${W},${H} L0,${H} Z`} />
                <path className="mfx-line" d={toPath(puntos, W, H - 10)} />
              </svg>

              <div className="mfx-scale">
                <span>{puntos[0].day}</span>
                <span>{puntos[puntos.length - 1].day}</span>
              </div>

              <dl className="mfx-stats">
                <div><dt>{t('fxMin')}</dt><dd>{fmtRate(cambio.min)}</dd></div>
                <div><dt>{t('fxMax')}</dt><dd>{fmtRate(cambio.max)}</dd></div>
                <div>
                  <dt>{t('fxChangeLabel')}</dt>
                  <dd className={cambio.direction}>
                    {cambio.delta > 0 ? '+' : ''}{fmtRate(cambio.delta)}
                  </dd>
                </div>
              </dl>
            </>
          ) : (
            /*
              NO se dibuja una curva de un punto. La serie se construye con el
              uso, asi que al principio no hay nada que enseñar — y decirlo es
              mas honesto que una linea recta que parece un dato.
            */
            <div className="mfx-empty">
              <Icon name="trend" size={26} />
              <strong>{t('fxNotEnoughTitle')}</strong>
              <p>{t('fxNotEnoughBody')}</p>
              {puntos.length === 1 && (
                <span className="mfx-today">
                  {t('fxTodayOnly').replace('{rate}', fmtRate(puntos[0].rate))}
                </span>
              )}
            </div>
          )}

          <div className="mfx-ranges" role="group" aria-label={t('fxRangeLabel')}>
            {RANGOS.map(r => (
              <button
                key={r}
                className={rango === r ? 'on' : ''}
                aria-pressed={rango === r}
                onClick={() => setRango(r)}
              >
                {t('fxRangeDays').replace('{n}', String(r))}
              </button>
            ))}
          </div>

          <p className="mfx-note">
            <Icon name="info" size={12} />
            {t('fxHistoryNote')}
          </p>
        </section>
      </div>
    </SheetPortal>
  )
}
