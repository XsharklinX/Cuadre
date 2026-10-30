import { useMemo, useState } from 'react'
import { IconTile, NxSheet, Phrase } from '@/components/ui/Phrase'
import { projectCashflow, safeToSpend, type CashflowEvent } from '@/data/cashflowProjection'
import { dateLocale, fmtCompact, localToday } from '@/data/helpers'
import { useBusiness } from '@/store/business'
import { isOwed, useDebt } from '@/store/debt'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { useFmt } from '@/hooks/useFmt'
import { useT } from '@/i18n'
import { playSoftHaptic } from '@/lib/sound'
import { MobileAmountSheet } from './MobileAmountSheet'
import { MobileDatePicker } from './MobileDatePicker'

type Horizon = 'month' | '30d' | '60d'

function horizonDate(horizon: Horizon, today: string): string {
  const d = new Date(`${today}T00:00:00`)
  if (horizon === 'month') d.setMonth(d.getMonth() + 1, 0)
  else d.setDate(d.getDate() + (horizon === '30d' ? 30 : 60))
  return localToday(d)
}

/*
 * F1 · TU SALDO DÍA A DÍA, CON LO QUE ENTRA Y SALE MARCADO.
 *
 * Antes: «Puedes gastar tranquilo RD$87,400» (el saldo entero, que no ayuda a
 * decidir nada), tres rectángulos verdes y un gráfico casi vacío. Ahora la
 * cifra de arriba es la que sirve —cuánto puedes gastar AL DÍA hasta el
 * próximo ingreso—, la curva marca cada cobro y pago, y debajo lo que viene
 * se lee como un estado de cuenta, con el saldo después de cada uno.
 *
 * Las cuotas de las deudas con día de pago ya entran en la cuenta.
 */
/** Cada tipo de movimiento previsto con su icono y su color, como en el resto de la app. */
const KIND_ICON: Record<CashflowEvent['kind'], Parameters<typeof IconTile>[0]['icon']> = {
  income: 'trend', expense: 'repeat', goal: 'piggy', charge: 'briefcase', debt: 'dollar',
}
const KIND_COLOR: Record<CashflowEvent['kind'], string> = {
  income: 'var(--m-income)', expense: 'var(--m-expense)', goal: '#ffd60a', charge: '#5bc0ff', debt: '#6366f1',
}

export function MobileCashflow() {
  const t = useT()
  const fmtVal = useFmt()
  const lang = useSettings(s => s.language)
  const locale = dateLocale(lang)
  const { transactions, accounts, goals, currency } = useFinance()
  const buffer = useSettings(s => s.cashflowBuffer)
  const setBuffer = useSettings(s => s.setCashflowBuffer)
  const debts = useDebt(s => s.debts)
  const clients = useBusiness(s => s.clients)
  const charges = useBusiness(s => s.charges)
  const [horizon, setHorizon] = useState<Horizon>('30d')
  const [bufferSheet, setBufferSheet] = useState(false)
  const [simOpen, setSimOpen] = useState(false)
  const [sim, setSim] = useState<{ amount: number; date: string } | null>(null)

  const today = localToday()
  const receivables = useMemo(() => ({ charges, clients }), [charges, clients])
  const installments = useMemo(() => debts
    .filter(d => isOwed(d) && d.balance > 0 && d.dueDay)
    .map(d => ({ id: d.id, name: d.name, amount: Math.min(d.minPayment || d.balance, d.balance), dueDay: d.dueDay })), [debts])

  const projection = useMemo(
    () => projectCashflow(transactions, accounts, goals, horizonDate(horizon, today), today, currency, receivables, installments),
    [transactions, accounts, goals, horizon, today, currency, receivables, installments],
  )
  const safe = useMemo(() => safeToSpend(projection, buffer), [projection, buffer])
  const perDay = safe.daysUntilIncome && safe.daysUntilIncome > 0 ? Math.max(0, safe.amount) / safe.daysUntilIncome : null

  // F3 · La curva con el gasto de prueba, sin guardar nada.
  const simSeries = useMemo(() => {
    if (!sim) return null
    return projection.series.map(p => ({ ...p, balance: p.balance - (p.date >= sim.date ? sim.amount : 0) }))
  }, [projection.series, sim])
  const simMin = simSeries ? simSeries.reduce((m, p) => (p.balance < m.balance ? p : m), simSeries[0]) : null

  const day = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(locale, opts)
  const money = (n: number) => fmtCompact(n, currency)

  // El gráfico, a mano: más ligero que una librería y con los puntos donde toca.
  const W = 320, H = 132, padY = 12
  const vals = [...projection.series.map(p => p.balance), ...(simSeries?.map(p => p.balance) ?? [])]
  const hi = Math.max(...vals), lo = Math.min(...vals)
  // El cero entra en la escala solo si está cerca o se cruza; si no, la curva
  // se quedaba plana arriba con media gráfica vacía debajo.
  const withZero = lo <= 0 || lo < hi * 0.35
  const max = Math.max(hi, withZero ? 0 : hi), min = withZero ? Math.min(lo, 0) : lo - (hi - lo) * 0.25
  const span = max - min || Math.max(1, Math.abs(max) * 0.1)
  const n = projection.series.length
  const X = (i: number) => (i / Math.max(1, n - 1)) * W
  const Y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2)
  const path = (arr: { balance: number }[]) => arr.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.balance).toFixed(1)}`).join(' ')
  const idxOf = new Map(projection.series.map((p, i) => [p.date, i]))
  const dots = projection.days.flatMap(d => {
    const i = idxOf.get(d.date)
    if (i === undefined) return []
    const big = [...d.events].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))[0]
    return [{ i, balance: d.balance, ev: big }]
  })
  // Hasta tres etiquetas, las de los movimientos más grandes, sin pisarse.
  const labeled = new Set<number>()
  for (const d of [...dots].sort((a, b) => Math.abs(b.ev.amount) - Math.abs(a.ev.amount))) {
    if (labeled.size >= 3) break
    if ([...labeled].some(i => Math.abs(X(i) - X(d.i)) < 70)) continue
    labeled.add(d.i)
  }

  // Lo que viene, con el saldo DESPUÉS de cada movimiento.
  const rows = useMemo(() => {
    let bal = projection.startBalance
    const out: { key: string; date: string; ev: CashflowEvent; after: number }[] = []
    for (const d of projection.days) {
      for (const ev of [...d.events].sort((a, b) => b.amount - a.amount)) {
        bal += ev.amount
        out.push({ key: `${d.date}-${ev.sourceId}-${ev.amount}`, date: d.date, ev, after: bal })
      }
    }
    return out
  }, [projection])

  return (
    <div className="mcash-root nx">
      <div className="nxc-horizons" role="tablist" aria-label={t('cashflowTitle')}>
        {(['month', '30d', '60d'] as Horizon[]).map(h => (
          <button key={h} role="tab" aria-selected={horizon === h} className={horizon === h ? 'on' : ''} onClick={() => { setHorizon(h); playSoftHaptic() }}>
            {h === 'month' ? t('cashflowHorizonMonth') : h === '30d' ? t('cashflowHorizon30') : t('cashflowHorizon60')}
          </button>
        ))}
      </div>

      <div className="nx-hero">
        {perDay !== null && safe.nextIncome ? (
          <>
            <small>{t('nxcUntil').replace('{day}', day(safe.nextIncome.date, { day: 'numeric', month: 'long' }))}</small>
            <span className={`nx-big${safe.amount < 0 ? ' bad' : ''}`}>{fmtVal(perDay, currency)}<em>{t('nxcPerDay')}</em></span>
          </>
        ) : (
          <>
            <small>{t('nxcCanSpend')}</small>
            <span className={`nx-big${safe.amount < 0 ? ' bad' : ''}`}>{fmtVal(Math.max(0, safe.amount), currency)}</span>
          </>
        )}
        <small>
          {perDay !== null && safe.nextIncome && <>{t('nxcTotal').replace('{amount}', money(Math.max(0, safe.amount)))}{' · '}</>}
          <button className="nx-link nxc-inline" onClick={() => setBufferSheet(true)}>
            {buffer > 0 ? t('nxcBuffer').replace('{amount}', money(buffer)) : t('nxcAddBuffer')}
          </button>
        </small>
      </div>

      {/* F2 · El día más justo, con tiempo. */}
      {projection.minBalance < 0 && (
        <p className="nxc-warn">
          {t('nxcLow').replace('{day}', day(projection.minDate, { weekday: 'long', day: 'numeric' })).replace('{amount}', money(projection.minBalance))}
        </p>
      )}

      <div className="nxc-chart-card">
      <svg className="nxc-chart" viewBox={`0 0 ${W} ${H + 14}`} width="100%" role="img" aria-label={t('cashflowTitle')}>
        {min < 0 && max > 0 && <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} className="nxc-zero" />}
        <path d={path(projection.series)} className="nxc-line" />
        {simSeries && <path d={path(simSeries)} className="nxc-sim" />}
        {dots.map(d => (
          <g key={d.i}>
            <circle cx={X(d.i)} cy={Y(d.balance)} r={3.4} className={d.ev.amount > 0 ? 'nxc-in' : 'nxc-out'} />
            {labeled.has(d.i) && (
              <text x={Math.min(W - 4, Math.max(4, X(d.i)))} y={Y(d.balance) + (d.ev.amount > 0 ? -8 : 14)} textAnchor={X(d.i) > W - 40 ? 'end' : X(d.i) < 40 ? 'start' : 'middle'} className="nxc-tag">
                {d.ev.note.length > 14 ? `${d.ev.note.slice(0, 13)}…` : d.ev.note}
              </text>
            )}
          </g>
        ))}
        <text x={0} y={H + 12} className="nxc-axis">{day(today)}</text>
        <text x={W} y={H + 12} textAnchor="end" className="nxc-axis">{day(projection.series[n - 1]?.date ?? today)}</text>
      </svg>

      {sim && simMin ? (
        <p className="nx-note">
          {t('nxcSimResult')
            .replace('{amount}', money(sim.amount))
            .replace('{min}', money(simMin.balance))
            .replace('{day}', day(simMin.date))}
          {' '}<button className="nx-link nxc-inline" onClick={() => setSim(null)}>{t('nxcSimClear')}</button>
        </p>
      ) : (
        <button className="nx-link nxc-try" onClick={() => setSimOpen(true)}>{t('nxcSimOpen')}</button>
      )}
      </div>

      <p className="nx-label">{t('nxcComing')}</p>
      {rows.length === 0 ? (
        <p className="nx-note">{t('nxcNothing')}</p>
      ) : (
        <div className="nx-list">
          {rows.map(r => (
            <div key={r.key} className="nxc-row">
              <IconTile icon={KIND_ICON[r.ev.kind]} color={KIND_COLOR[r.ev.kind]} size={36} />
              <span className="nxc-what">
                <b>{r.ev.note}</b>
                <small>
                  {day(r.date)}
                  {r.ev.kind === 'debt' && ` · ${t('nxcDebtKind')}`}
                  {r.ev.kind === 'charge' && ` · ${t('nxcChargeKind')}`}
                  {r.ev.kind === 'goal' && ` · ${t('nxcGoalKind')}`}
                </small>
              </span>
              <span className="nxc-money">
                <span className={`nxc-amt ${r.ev.amount > 0 ? 'ok' : 'bad'}`}>{r.ev.amount > 0 ? '+' : '−'}{money(Math.abs(r.ev.amount))}</span>
                <span className={`nxc-after${r.after < 0 ? ' bad' : ''}`}>{money(r.after)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="nx-note">{t('cashflowFootnote')}</p>

      {bufferSheet && (
        <MobileAmountSheet
          title={t('cashflowBufferTitle')}
          value={buffer}
          currency={currency}
          onDone={v => { setBuffer(v); setBufferSheet(false) }}
          onClose={() => setBufferSheet(false)}
        />
      )}
      {simOpen && (
        <SimSheet
          initial={sim}
          currency={currency}
          onClose={() => setSimOpen(false)}
          onApply={v => { setSim(v); setSimOpen(false) }}
        />
      )}
    </div>
  )
}

/** F3 · «¿Y si gasto RD$15,000 el día 10?», en una frase. No guarda nada. */
function SimSheet({ initial, currency, onClose, onApply }: {
  initial: { amount: number; date: string } | null
  currency: Parameters<typeof fmtCompact>[1]
  onClose: () => void
  onApply: (v: { amount: number; date: string }) => void
}) {
  const t = useT()
  const lang = useSettings(s => s.language)
  const [amount, setAmount] = useState(initial?.amount ?? 0)
  const [date, setDate] = useState(initial?.date ?? localToday())
  const [sub, setSub] = useState<'amount' | 'date' | null>(null)
  return (
    <>
      <NxSheet
        title={t('nxcSimTitle')}
        sub={t('nxcSimSub')}
        onClose={onClose}
        footer={<button className="nx-btn pri" disabled={!amount} onClick={() => onApply({ amount, date })}>{t('nxcSimApply')}</button>}
      >
        <Phrase parts={[
          t('nxcSimPhrase1'),
          { key: 'a', text: amount > 0 ? fmtCompact(amount, currency) : '', hint: t('fieldAmount'), onTap: () => setSub('amount'), active: sub === 'amount' },
          t('nxcSimPhrase2'),
          { key: 'd', text: new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'long' }), onTap: () => setSub('date'), active: sub === 'date' },
          '?',
        ]} />
      </NxSheet>
      {sub === 'amount' && <MobileAmountSheet title={t('nxcSimTitle')} value={amount} currency={currency} onDone={v => { setAmount(v); setSub(null) }} onClose={() => setSub(null)} />}
      {sub === 'date' && <MobileDatePicker value={date} onChange={v => { setDate(v); setSub(null) }} onClose={() => setSub(null)} />}
    </>
  )
}
