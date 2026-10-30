import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from '@/components/ui/Icon'
import { categoryHistory, topConcepts, type DayPoint, type Pace } from '@/data/analyticsViews'
import { amountForCategory, dateLocale, shortMonth } from '@/data/helpers'
import { useFmt } from '@/hooks/useFmt'
import { translateCategoryName, useT } from '@/i18n'
import type { Category, CurrencyCode, Transaction } from '@/types'
import { sheetRoot } from '../SheetPortal'
import { useDialogA11y } from '../useDialogA11y'
import { useMobileBackDismiss } from '../useMobileBackDismiss'

/*
 * LOS SALTOS DE ARRIBA.
 *
 * Análisis dejó de ser cinco cajones cerrados: ahora es una pantalla que se
 * recorre bajando. Esta tira se queda pegada arriba, marca en qué parte estás
 * y lleva a cada una de un toque.
 */
export function JumpStrip({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '')
  const stripRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(entries => {
      const seen = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (seen[0]) setActive(seen[0].target.id.replace('man-sec-', ''))
    }, { rootMargin: '-30% 0px -60% 0px' })
    items.forEach(i => { const el = document.getElementById(`man-sec-${i.id}`); if (el) io.observe(el) })
    return () => io.disconnect()
  }, [items])
  // La pestaña activa se mantiene a la vista dentro de la tira.
  useEffect(() => {
    // A mano y solo en la tira: `scrollIntoView` movía también la pantalla
    // entera hacia el lado si algo la desbordaba.
    const strip = stripRef.current
    const on = strip?.querySelector<HTMLElement>('.on')
    if (strip && on) strip.scrollTo({ left: on.offsetLeft - (strip.clientWidth - on.offsetWidth) / 2, behavior: 'smooth' })
  }, [active])
  return (
    <div ref={stripRef} className="man-jump" role="tablist">
      {items.map(i => (
        <button
          key={i.id}
          role="tab"
          aria-selected={active === i.id}
          className={active === i.id ? 'on' : ''}
          onClick={() => {
            setActive(i.id)
            document.getElementById(`man-sec-${i.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          {i.label}
        </button>
      ))}
    </div>
  )
}

/** Barras de gasto por día (o por mes, en el año) con la media en punteado. */
export function SpendBars({ points, onPick, highlight }: {
  points: { key: string; label: string; value: number; future?: boolean }[]
  onPick?: (key: string) => void
  highlight?: string | null
}) {
  const t = useT()
  const past = points.filter(p => !p.future)
  const max = Math.max(1, ...points.map(p => p.value))
  const avg = past.length ? past.reduce((s, p) => s + p.value, 0) / past.length : 0
  const peak = past.reduce<typeof points[number] | null>((b, p) => (!b || p.value > b.value ? p : b), null)
  const H = 64
  return (
    <div className="man-bars">
      <div className="man-bars-plot" style={{ ['--n' as string]: points.length }}>
        {avg > 0 && <span className="man-bars-avg" style={{ bottom: `${(avg / max) * H}px` }} aria-hidden="true" />}
        {points.map(p => (
          <button
            key={p.key}
            type="button"
            className={`man-bar${p.future ? ' future' : ''}${peak && p.key === peak.key && p.value > 0 ? ' peak' : ''}${highlight === p.key ? ' on' : ''}`}
            style={{ height: `${Math.max(p.future ? 2 : 3, (p.value / max) * H)}px` }}
            disabled={p.future || !onPick || p.value <= 0}
            aria-label={`${p.label}: ${p.value.toFixed(0)}`}
            onClick={() => onPick?.(p.key)}
          />
        ))}
      </div>
      <div className="man-bars-axis">
        <span>{points[0]?.label}</span>
        {avg > 0 && <span>{t('anDailyAvg')}</span>}
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  )
}

/** Ritmo: acumulado de este periodo contra el anterior, con la proyección. */
export function PaceChart({ cur, prev, pace, color = 'var(--m-primary)' }: {
  cur: number[]
  prev: number[]
  pace: Pace
  color?: string
}) {
  const W = 320, H = 130, pad = 6
  const n = Math.max(cur.length, prev.length)
  const max = Math.max(1, ...prev, ...cur.slice(0, pace.day), pace.projected ?? 0)
  const X = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2)
  const Y = (v: number) => H - pad - (v / max) * (H - pad * 2)
  const line = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  const curPart = cur.slice(0, pace.day)
  return (
    <svg className="man-pace" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-hidden="true">
      <line x1={pad} x2={W - pad} y1={Y(0)} y2={Y(0)} className="man-pace-grid" />
      {prev.length > 1 && <path d={line(prev)} className="man-pace-prev" />}
      {curPart.length > 0 && (
        <>
          <path d={`${line(curPart)} L${X(curPart.length - 1)} ${Y(0)} L${X(0)} ${Y(0)} Z`} style={{ fill: `color-mix(in oklab, ${color} 16%, transparent)` }} />
          <path d={line(curPart)} className="man-pace-cur" pathLength={1} style={{ stroke: color }} />
          {pace.projected !== null && (
            <line x1={X(curPart.length - 1)} y1={Y(pace.current)} x2={X(n - 1)} y2={Y(pace.projected)} className="man-pace-proj" style={{ stroke: color }} />
          )}
          <circle cx={X(curPart.length - 1)} cy={Y(pace.current)} r={4} style={{ fill: color }} />
        </>
      )}
    </svg>
  )
}

/** Calendario de calor: cada día, más intenso cuanto más gastaste. */
export function HeatCalendar({ points, lang, onPick, compact }: {
  points: DayPoint[]
  lang: string
  onPick: (date: string) => void
  /** A6 · Más pequeño y sin el número dentro de cada día (se lee al tocar). */
  compact?: boolean
}) {
  const locale = dateLocale(lang)
  const max = Math.max(1, ...points.map(p => p.expense))
  const first = points[0] ? new Date(`${points[0].date}T00:00:00`).getDay() : 0
  const lead = (first + 6) % 7 // la semana empieza en lunes
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' }))
  return (
    <div className={`man-heat${compact ? ' compact' : ''}`} role="grid">
      {heads.map((h, i) => <b key={`h${i}`}>{h}</b>)}
      {Array.from({ length: lead }, (_, i) => <span key={`e${i}`} />)}
      {points.map(p => {
        const v = p.future ? 0 : Math.round((p.expense / max) * 100)
        return (
          <button
            key={p.date}
            type="button"
            className={`man-heat-day${p.future ? ' future' : ''}${p.expense > 0 ? '' : ' zero'}`}
            style={{ ['--v' as string]: `${Math.max(v, p.expense > 0 ? 12 : 0)}%` }}
            disabled={p.future || p.expense <= 0}
            aria-label={`${p.day}: ${p.expense.toFixed(0)}`}
            onClick={() => onPick(p.date)}
          >
            {compact ? null : p.day}
          </button>
        )
      })}
    </div>
  )
}

/*
 * Una hoja que lista movimientos: la de un día (tocar una barra o un día del
 * calendario) o la de una categoría. Tocar uno lo abre para editar.
 */
function TxList({ txs, currency, lang, onEditTx, categoryId }: {
  txs: Transaction[]
  currency: CurrencyCode
  lang: string
  onEditTx?: (tx: Transaction) => void
  categoryId?: string
}) {
  const fmtVal = useFmt()
  return (
    <div className="man-txlist">
      {txs.map(tx => {
        const amount = categoryId ? amountForCategory(tx, categoryId) : tx.amount
        return (
          <button key={tx.id} type="button" className="man-txrow" onClick={() => onEditTx?.(tx)} disabled={!onEditTx}>
            <span className="man-txrow-main">
              <b>{tx.note}</b>
              <small>{new Date(`${tx.date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' })}</small>
            </span>
            <strong className={tx.type}>{tx.type === 'income' ? '+' : tx.type === 'expense' ? '−' : ''}{fmtVal(amount, currency)}</strong>
          </button>
        )
      })}
    </div>
  )
}

function SheetShell({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <section className="man-sheet" onClick={e => e.stopPropagation()}>
        <header className="man-sheet-head">
          <span>
            <b>{title}</b>
            {sub && <small>{sub}</small>}
          </span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        {children}
      </section>
    </div>,
    sheetRoot(),
  )
}

export function DaySheet({ date, txs, currency, lang, onClose, onEditTx }: {
  date: string
  txs: Transaction[]
  currency: CurrencyCode
  lang: string
  onClose: () => void
  onEditTx?: (tx: Transaction) => void
}) {
  const t = useT()
  const fmtVal = useFmt()
  const dayTx = txs.filter(tx => tx.date === date && tx.type !== 'transfer').sort((a, b) => b.amount - a.amount)
  const spent = dayTx.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0)
  const title = new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale(lang), { weekday: 'long', day: 'numeric', month: 'long' })
  return (
    <SheetShell title={title} sub={t('anDaySpent').replace('{amount}', fmtVal(spent, currency))} onClose={onClose}>
      {dayTx.length ? <TxList txs={dayTx} currency={currency} lang={lang} onEditTx={tx => { onClose(); onEditTx?.(tx) }} /> : <p className="man-empty">{t('noExpensesToAnalyze')}</p>}
    </SheetShell>
  )
}

/*
 * LA CATEGORÍA CUENTA SU HISTORIA.
 *
 * Seis meses en barras, cómo va contra el mes pasado y su presupuesto, en qué
 * se fue (los conceptos que más pesan) y sus movimientos del periodo.
 */
export function CategorySheet({ category, allTx, periodTx, mkey, currency, lang, onClose, onEditTx }: {
  category: Category
  allTx: Transaction[]
  periodTx: Transaction[]
  mkey: string
  currency: CurrencyCode
  lang: 'es' | 'en'
  onClose: () => void
  onEditTx?: (tx: Transaction) => void
}) {
  const t = useT()
  const fmtVal = useFmt()
  const history = useMemo(() => categoryHistory(allTx, category.id, mkey, 6), [allTx, category.id, mkey])
  const concepts = useMemo(() => topConcepts(periodTx, category.id), [periodTx, category.id])
  const txs = useMemo(
    () => periodTx.filter(tx => tx.type === 'expense' && amountForCategory(tx, category.id) > 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    [periodTx, category.id],
  )
  /*
   * A4 · QUÉ LA MOVIÓ (2.8): el concepto que más subió frente al mes
   * anterior. «3 pagos en Ferretería Ochoa suman RD$6,900» explica la subida
   * mejor que seis barras.
   */
  const movedBy = useMemo(() => {
    const [y, m] = mkey.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    const prevKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const before = new Map(topConcepts(allTx.filter(tx => tx.date.startsWith(prevKey)), category.id, 200).map(c => [c.note.toLowerCase(), c.amount]))
    let top: { note: string; amount: number; count: number; up: number } | null = null
    for (const c of topConcepts(periodTx, category.id, 200)) {
      const up = c.amount - (before.get(c.note.toLowerCase()) ?? 0)
      if (up > 0 && (!top || up > top.up)) top = { ...c, up }
    }
    return top
  }, [allTx, periodTx, category.id, mkey])
  const now = history[history.length - 1]?.amount ?? 0
  const before = history[history.length - 2]?.amount ?? 0
  const delta = now - before
  const max = Math.max(1, ...history.map(h => h.amount))
  const name = translateCategoryName(category, lang)
  const budgetPct = category.budget > 0 ? Math.round((now / category.budget) * 100) : null
  return (
    <SheetShell
      title={`${name} · ${fmtVal(now, currency)}`}
      sub={[
        budgetPct !== null ? t('pctOfBudget').replace('{pct}', String(budgetPct)) : null,
        before > 0 || now > 0 ? `${delta >= 0 ? '+' : '−'}${fmtVal(Math.abs(delta), currency)} ${t('anVsPrevMonth')}` : null,
      ].filter(Boolean).join(' · ')}
      onClose={onClose}
    >
      {movedBy && delta > 0 && (
        <p className="man-movedby">
          {t('anMovedBy')
            .replace('{note}', movedBy.note)
            .replace('{n}', String(movedBy.count))
            .replace('{amount}', fmtVal(movedBy.amount, currency))}
        </p>
      )}
      <div className="man-cathist" aria-hidden="true">
        {history.map((h, i) => (
          <div key={h.mkey} className={`man-cathist-col${i === history.length - 1 ? ' now' : ''}`}>
            <span style={{ height: `${Math.max(3, (h.amount / max) * 72)}px`, background: category.color }} />
            <small>{shortMonth(h.mkey, dateLocale(lang))}</small>
          </div>
        ))}
      </div>
      {concepts.length > 0 && (
        <>
          <p className="man-sheet-sub">{t('anWhereItWent')}</p>
          <div className="man-concepts">
            {concepts.map(c => (
              <div key={c.note} className="man-concept">
                <span>{c.note}</span>
                <small>{t('txCountShort').replace('{n}', String(c.count))}</small>
                <b>{fmtVal(c.amount, currency)}</b>
              </div>
            ))}
          </div>
        </>
      )}
      <p className="man-sheet-sub">{t('anItsMovements')}</p>
      <TxList txs={txs} currency={currency} lang={lang} categoryId={category.id} onEditTx={tx => { onClose(); onEditTx?.(tx) }} />
    </SheetShell>
  )
}
