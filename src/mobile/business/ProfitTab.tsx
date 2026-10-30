import { useMemo, useRef, useState } from 'react'
import { clientProfit, freeSlotsValue } from '@/data/bizToday'
import { AnimatedMoney } from '@/components/ui/AnimatedMoney'
import { BrandTile } from '@/components/ui/BrandTile'
import { EmptyArt } from '@/components/ui/EmptyArt'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { businessMonth, businessRunRate, businessYear, runRateSeries, serviceAccounts } from '@/data/business'
import { makeOwner, serviceBreakdown } from '@/data/attribution'
import { upcomingPayments } from '@/data/autopay'
import { businessForecast, weakestMonth } from '@/data/businessForecast'
import { businessInvestment } from '@/data/investment'
import { clientPerMonth, type Client } from '@/data/clients'
import { marginPct } from '@/data/collectFocus'
import { alsoIn, toView, viewOptions } from '@/data/businessCurrency'
import { referralDiscount, referralRules, referralSummary } from '@/data/referrals'
import { similarBusinesses } from '@/data/serviceMerge'
import { exportElementPng } from '@/data/imageExport'
import { convertTxAmountsToBase, currentMonthKey, dateLocale, fmt, localToday, monthLabel, shortMonth } from '@/data/helpers'
import { getCurrencyMeta } from '@/data/currencies'
import { useT } from '@/i18n'
import { useMoneyDecimals } from '@/hooks/useFmt'
import { mergeBusinesses, unmergeBusinesses } from '@/lib/businessOps'
import { playSoftHaptic } from '@/lib/sound'
import { useBusiness } from '@/store/business'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import type { CurrencyCode } from '@/types'
import { BizSheet } from './shared'
import { IconTile, NxRow, NxSheet } from '@/components/ui/Phrase'

/**
 * GANANCIA.
 *
 * ── G1 · DE DÓNDE SALE ────────────────────────────────────────────────
 * Cada movimiento sabe de quién es (ver `attribution.ts`): un cobro, del
 * negocio de su cliente; un pago de servicio, del negocio de su servicio; lo
 * viejo sin marca, por categoría como siempre. Por eso mover un servicio se
 * lleva su dinero, y cada negocio se puede abrir servicio por servicio.
 *
 * ── LO QUE SE AÑADE ───────────────────────────────────────────────────
 *  · G2 · Si dos negocios venden la misma marca, se propone unirlos.
 *  · Por pagar este mes: lo que viene, para tener el saldo listo.
 *  · G4 · Los próximos meses, con los pagos anuales en su mes.
 *  · Las estrellas: lo que te traen los recomendados contra lo que cuestan
 *    sus descuentos.
 */
export function ProfitTab({ onEditBusiness, onOrganize, onOpenService, onNewService, onPayService }: {
  onEditBusiness: (id: 'new' | string) => void
  onOrganize: () => void
  onOpenService: (id: string) => void
  onNewService: (businessId: string) => void
  onPayService: (id: string) => void
}) {
  const t = useT()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const locale = dateLocale(lang)
  const moneyDecimals = useMoneyDecimals()
  const { transactions, accounts, currency } = useFinance()
  const { clients, businesses, services, charges } = useBusiness()
  const mkey = currentMonthKey()
  const anio = Number(mkey.slice(0, 4))
  const today = localToday()

  const [openBizId, setOpenBizId] = useState<string | null>(null)
  const [capa, setCapa] = useState<{ biz: string; kind: 'inv' | 'year' | 'forecast' } | null>(null)
  const [exportando, setExportando] = useState(false)
  const [uniendo, setUniendo] = useState<string[] | null>(null)
  const [verArchivados, setVerArchivados] = useState(false)
  const resumenRef = useRef<HTMLDivElement>(null)

  const divisas = useMemo(
    () => viewOptions(currency, [...services.map(v => v.currency), ...clients.map(c => c.currency)]),
    [currency, services, clients],
  )
  const [vista, setVista] = useState<CurrencyCode>(() => {
    try { return (localStorage.getItem('cuadre-biz-currency') as CurrencyCode) || currency }
    catch { return currency }
  })
  const verEn = divisas.includes(vista) ? vista : currency
  const aVista = (monto: number, desde: CurrencyCode = currency) => toView(monto, desde, verEn)
  const dinero = (n: number) => fmt(aVista(n), verEn, { decimals: moneyDecimals })

  const baseTx = useMemo(() => convertTxAmountsToBase(transactions, accounts, currency), [transactions, accounts, currency])
  const plazas = useMemo(() => freeSlotsValue(services, clients, currency), [services, clients, currency])
  const porCliente = useMemo(() => clientProfit(clients, services, currency), [clients, services, currency])
  /* G1 · De quién es cada movimiento, construido una vez. */
  const owner = useMemo(() => makeOwner({ businesses, services, clients, charges }), [businesses, services, clients, charges])

  const cuentas = useMemo(() => businesses.filter(b => !b.archivedAt).map(biz => {
    const runRate = businessRunRate(biz, services, baseTx, mkey, currency, owner)
    return {
      biz,
      mes: businessMonth(biz, baseTx, mkey, owner),
      year: businessYear(biz, baseTx, anio, owner),
      runRate,
      margen: marginPct(runRate.collected, runRate.profit),
      inv: businessInvestment(biz, baseTx, mkey, runRate.profit, services),
      serie: runRateSeries(biz, services, baseTx, anio, currency, owner),
      desglose: serviceBreakdown(biz, services, clients, baseTx, mkey, owner, currency),
      archivados: services.filter(s => s.businessId === biz.id && s.archivedAt),
    }
  }), [businesses, services, clients, baseTx, mkey, anio, currency, owner])

  const totalProfit = Math.round(cuentas.reduce((s, c) => s + c.runRate.profit, 0) * 100) / 100
  const negocio = useMemo(() => new Map(businesses.map(b => [b.id, b])), [businesses])
  const descuentoDe = (c: Client) => referralDiscount(c, referralRules(c.businessId ? negocio.get(c.businessId) : null))

  /* G2 · Negocios que venden la misma marca. */
  const parecidos = useMemo(() => similarBusinesses(businesses, services), [businesses, services])
  const [g2Ignorados, setG2Ignorados] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('cuadre-g2-ignored') ?? '[]') } catch { return [] }
  })
  const sugerencia = parecidos.find(g => !g2Ignorados.includes(g.map(b => b.id).sort().join('|')))

  /* Por pagar lo que queda de mes. */
  const finDeMes = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate() - Number(today.slice(8, 10))
  const porPagar = useMemo(() => upcomingPayments(services, today, Math.max(0, finDeMes)), [services, today, finDeMes])

  /* G4 · Los próximos seis meses, de todos los negocios. */
  const prevision = useMemo(() => {
    const deNegocio = clients.filter(c => c.businessId && negocio.has(c.businessId))
    return businessForecast(deNegocio, services, transactions, today, 6, currency, descuentoDe)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, services, transactions, today, currency, negocio])
  const flojo = weakestMonth(prevision)
  const topeMes = Math.max(1, ...prevision.map(m => Math.abs(m.net)))

  /* Las estrellas: lo que te traen contra lo que cuestan. */
  const estrellas = useMemo(
    () => referralSummary(clients, c => referralRules(c.businessId ? negocio.get(c.businessId) : null), c => clientPerMonth(c, currency)),
    [clients, negocio, currency],
  )

  if (businesses.length === 0) {
    return (
      <>
        <div className="mbiz-section-head">
          <span>{t('bizBusinesses')}</span>
          <span className="mbiz-head-btns">
            <button className="primary" onClick={() => onEditBusiness('new')}><Icon name="plus" size={13} /> {t('bizAddBusiness')}</button>
          </span>
        </div>
        <div className="mbiz-empty">
          <EmptyArt kind="business" />
          <strong>{t('bizNoBusinessTitle')}</strong>
          <p>{t('bizNoBusinessText')}</p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="mbiz-section-head">
        <span>{t('bizBusinesses')}</span>
        <span className="mbiz-head-btns">
          {businesses.length > 1 && (
            <button onClick={onOrganize}><Icon name="dots" size={13} /> {t('bizReorder')}</button>
          )}
          <button onClick={() => onEditBusiness('new')}><Icon name="plus" size={13} /> {t('bizAddBusiness')}</button>
        </span>
      </div>

      {divisas.length > 1 && (
        <div className="mbiz-cur" role="tablist" aria-label={t('currency')}>
          {divisas.map(c => (
            <button
              key={c}
              role="tab"
              aria-selected={verEn === c}
              className={verEn === c ? 'on' : ''}
              onClick={() => {
                setVista(c)
                playSoftHaptic()
                try { localStorage.setItem('cuadre-biz-currency', c) } catch { /* en privado no se recuerda */ }
              }}
            >
              {getCurrencyMeta(c).symbol || c}
            </button>
          ))}
        </div>
      )}

      {/* ── G2 · TUS VARIOS NETFLIX EN UNO ──────────────────── */}
      {sugerencia && (
        <div className="msvs-suggest">
          <b>{t('bizSimilarTitle').replace('{n}', String(sugerencia.length)).replace('{names}', sugerencia.map(b => b.name).join(', '))}</b>
          <small>{t('bizSimilarHint')}</small>
          <span className="msvs-suggest-acts">
            <button type="button" onClick={() => setUniendo(sugerencia.map(b => b.id))}>{t('svcSeeMerged')}</button>
            <button type="button" className="ghost" onClick={() => {
              const k = sugerencia.map(b => b.id).sort().join('|')
              const n = [...g2Ignorados, k]
              setG2Ignorados(n)
              try { localStorage.setItem('cuadre-g2-ignored', JSON.stringify(n.slice(-20))) } catch { /* nada */ }
            }}>{t('dupNot')}</button>
          </span>
        </div>
      )}

      {cuentas.length > 1 && (
        <section className="mbiz-allsum">
          <small>{t('bizAllBusinesses').replace('{n}', String(cuentas.length))}</small>
          <strong className={totalProfit < 0 ? 'expense' : 'income'}>
            {totalProfit < 0 && '−'}
            <AnimatedMoney value={Math.abs(aVista(totalProfit))} decimals={moneyDecimals} fit />
          </strong>
          {(() => {
            const otra = alsoIn(aVista(totalProfit), verEn, divisas)
            return otra ? <em className="mbiz-also">{fmt(otra.amount, otra.currency, { decimals: moneyDecimals })}</em> : null
          })()}
          {totalProfit > 0 && (
            <div className="mbiz-allsum-bar">
              {cuentas.filter(c => c.runRate.profit > 0).map(c => (
                <i key={c.biz.id} style={{ background: c.biz.color, width: `${Math.round(c.runRate.profit / totalProfit * 100)}%` }} />
              ))}
            </div>
          )}
          <div className="mbiz-allsum-keys">
            {cuentas.map(c => <span key={c.biz.id}><i style={{ background: c.biz.color }} />{c.biz.name}</span>)}
          </div>
        </section>
      )}

      {cuentas.map(({ biz, mes, year, runRate, margen, inv, serie, desglose, archivados }) => {
        // Con un solo negocio todo está a la vista; con varios, cada uno se abre.
        const abierto = cuentas.length === 1 || openBizId === biz.id
        const pctAnillo = Math.max(0, Math.min(100, margen ?? 0))
        return (
          <div key={biz.id} className="n28-biz" style={{ '--biz': biz.color } as React.CSSProperties} ref={abierto ? resumenRef : undefined}>
            {/* N1 · La tarjeta de Metas: el anillo con el margen y lo que te dejó. */}
            <button
              className="n28-hero"
              onClick={() => { if (cuentas.length > 1) { setOpenBizId(abierto ? null : biz.id); playSoftHaptic() } }}
              aria-expanded={abierto}
            >
              <span className="n28-ring" aria-hidden="true">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" className="trk" />
                  <circle cx="32" cy="32" r="26" className={`val${runRate.profit < 0 ? ' neg' : ''}`} strokeDasharray={`${(pctAnillo / 100) * 163.4} 163.4`} />
                </svg>
                <b>{margen !== null ? `${margen}%` : '—'}</b>
              </span>
              <span className="n28-hero-main">
                <small>{biz.name} · {monthLabel(mkey, locale)}</small>
                <b className={runRate.profit < 0 ? 'neg' : ''}>
                  {runRate.profit < 0 && '−'}
                  <AnimatedMoney value={Math.abs(aVista(runRate.profit))} decimals={moneyDecimals} fit />
                </b>
                <small>{t(runRate.profit < 0 ? 'n28LostLine' : 'n28LeftLine').replace('{in}', dinero(runRate.collected)).replace('{out}', dinero(runRate.monthlyCost))}</small>
              </span>
              {cuentas.length > 1 && <Icon name={abierto ? 'arrowUp' : 'arrowDn'} size={14} />}
            </button>

            {abierto && (
              <>
                <p className="n28-title">
                  {labelOf(biz.labels?.service, t('bizServices'))}
                  <button onClick={() => onNewService(biz.id)}>+ {t('add')}</button>
                </p>
                <div className="n28-card">
                  {desglose.rows.map(({ service: svc, monthlyCost, profit }) => {
                    const cuentasSvc = serviceAccounts(svc)
                    const plazasSvc = cuentasSvc.reduce((s, a) => s + (a.capacity ?? 0), 0)
                    const ocupadas = clients.filter(c => c.serviceId === svc.id && c.active && !c.deletedAt).length
                    return (
                      <div key={svc.id} className="n28-svc">
                        <button className="n28-svc-main" onClick={() => onOpenService(svc.id)}>
                          <BrandTile name={svc.name} size={38} color={biz.color} icon={biz.icon} />
                          <span className="n28-svc-id">
                            <b>{svc.name}</b>
                            <small>
                              {plazasSvc > 0 ? t('n28Seats').replace('{n}', String(ocupadas)).replace('{of}', String(plazasSvc)) + ' · ' : ''}
                              {t('n28Costs').replace('{amount}', dinero(monthlyCost))}
                              {svc.payMode && svc.payMode !== 'manual' ? ` · ⟳ ${t(svc.payMode === 'auto' ? 'payModeAuto' : 'payModeAsk')}` : ''}
                            </small>
                          </span>
                          <b className={`n28-svc-v ${profit < 0 ? 'expense' : 'income'}`}>{profit < 0 ? '−' : '+'}{dinero(Math.abs(profit))}</b>
                        </button>
                        <button className="n28-pay" onClick={() => onPayService(svc.id)}>{t('invPayShort')}</button>
                      </div>
                    )
                  })}
                  {desglose.rows.length === 0 && <p className="mbiz-why">{t('profitByServiceHint')}</p>}
                  {desglose.otherCollected > 0 && (
                    <div className="n28-line"><span>{t('profitOtherIncome')}</span><b className="income">{dinero(desglose.otherCollected)}</b></div>
                  )}
                  {runRate.hasNonMonthly && (
                    <div className="n28-line"><span>{t('bizCashOut')}<small>{t('bizCashVsMonthly')}</small></span><b className="expense">−{dinero(mes.costs)}</b></div>
                  )}
                  {biz.setAsidePct ? (
                    <div className="n28-line"><span>{t('bizSetAside').replace('{pct}', String(biz.setAsidePct))}</span><b>{dinero(mes.collected * biz.setAsidePct / 100)}</b></div>
                  ) : null}
                  {archivados.length > 0 && (
                    <button type="button" className="mbiz-archived-link" onClick={() => setVerArchivados(v => !v)}>
                      {t('profitArchivedN').replace('{n}', String(archivados.length))}
                    </button>
                  )}
                  {verArchivados && archivados.map(svc => (
                    <button key={svc.id} type="button" className="n28-svc-main archived" onClick={() => onOpenService(svc.id)}>
                      <BrandTile name={svc.name} size={30} color={biz.color} icon={biz.icon} />
                      <span className="n28-svc-id"><b>{svc.name}</b><small>{t('svcArchived')}</small></span>
                    </button>
                  ))}
                </div>

                {/* «En el año» e «Inversión», filas que abren su detalle. */}
                <div className="n28-card">
                  <button className="n28-row" onClick={() => setCapa({ biz: biz.id, kind: 'year' })}>
                    <IconTile icon="chart" color="var(--m-income)" size={36} />
                    <span className="n28-svc-id"><b>{t('bizYearProfit')}</b><small>{t('bizChartAvg').replace('{amount}', dinero(year.monthlyAvg))}</small></span>
                    <b className={year.profit < 0 ? 'expense' : ''}>{dinero(year.profit)}</b>
                  </button>
                  <button className="n28-row" onClick={() => setCapa({ biz: biz.id, kind: 'inv' })}>
                    <IconTile icon="piggy" color="#ffdd3d" size={36} />
                    <span className="n28-svc-id">
                      <b>{t('invTitle')}</b>
                      <small>{inv.total > 0 ? `${t(inv.isProfitable ? 'invRecovered' : 'invToRecover')} ${dinero(Math.abs(inv.returned))}` : t('invNoneYet')}</small>
                    </span>
                    <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                </div>

                <div className="mbiz-biz-actions">
                  <button className="mbiz-shot" onClick={() => { playSoftHaptic(); onEditBusiness(biz.id) }}>
                    <Icon name="edit" size={14} /> {t('bizEditBusiness')}
                  </button>
                  <button
                    className="mbiz-shot"
                    disabled={exportando}
                    onClick={async () => {
                      const nodo = resumenRef.current
                      if (!nodo) return
                      setExportando(true)
                      try {
                        playSoftHaptic()
                        await exportElementPng(nodo, `cuadre-${biz.name}-${mkey}`)
                        toast(t('bizMonthImageSaved'), { icon: 'check', type: 'ok' })
                      } finally { setExportando(false) }
                    }}
                  >
                    <Icon name="camera" size={14} /> {t('bizMonthImage')}
                  </button>
                </div>

                {capa?.biz === biz.id && capa.kind === 'year' && (
                  <NxSheet title={`${t('bizYearProfit')} · ${biz.name}`} sub={dinero(year.profit)} onClose={() => setCapa(null)}>
                    <ProfitChart
                      points={serie.map(p => ({ ...p, profit: aVista(p.profit) }))}
                      mkey={mkey}
                      locale={locale}
                      currency={verEn}
                      decimals={moneyDecimals}
                      avgLabel={t('bizChartAvg')}
                      bestLabel={t('bizChartBest')}
                      worstLabel={t('bizChartWorst')}
                    />
                  </NxSheet>
                )}
                {capa?.biz === biz.id && capa.kind === 'inv' && (
                  <NxSheet title={`${t('invTitle')} · ${biz.name}`} onClose={() => setCapa(null)}>
                    <div className="nx-list">
                      <NxRow label={t('invPutIn')} value={dinero(inv.total)} tone="bad" />
                      <NxRow label={t('invTaken')} value={dinero(inv.collected)} tone="ok" />
                      <NxRow label={inv.isProfitable ? t('invRecovered') : t('invToRecover')} value={dinero(Math.abs(inv.returned))} tone={inv.isProfitable ? 'ok' : 'bad'} />
                    </div>
                    {inv.monthsToRecover !== null && <p className="nx-note">{t('invMonthsToRecover').replace('{n}', String(inv.monthsToRecover))}</p>}
                    {inv.since && <p className="nx-note">{t('invSince').replace('{date}', inv.since)}</p>}
                  </NxSheet>
                )}
              </>
            )}
          </div>
        )
      })}

      {/* ── N4 · PLAZAS LIBRES: una tarjeta de aviso con su cifra ─── */}
      {plazas.slots > 0 && (
        <div className="n28-aviso">
          <IconTile icon="plus" color="var(--m-primary)" size={38} />
          <span className="n28-svc-id">
            <b>{t('n28FreeSeats').replace('{n}', String(plazas.slots)).replace('{amount}', dinero(plazas.perMonth))}</b>
            <small>{plazas.byService.map(x => `${x.free} ${t('n28In')} ${x.service.name}`).join(' · ')}</small>
          </span>
        </div>
      )}

      {/* ── POR PAGAR ESTE MES ──────────────────────────────── */}
      {porPagar.length > 0 && (
        <>
          <p className="n28-title">{t('profitToPayTitle')}</p>
          <div className="n28-card">
            {porPagar.slice(0, 8).map(p => (
              <button key={`${p.service.id}${p.key}`} type="button" className="n28-row" onClick={() => onOpenService(p.service.id)}>
                <BrandTile name={p.service.name} size={34} />
                <span className="n28-svc-id"><b>{p.service.name}</b><small>{new Date(`${p.date}T00:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}</small></span>
                <b>{fmt(p.amount, p.service.currency ?? currency, { decimals: moneyDecimals })}</b>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── G4 · LOS PRÓXIMOS MESES, en una fila que abre su detalle ─── */}
      {prevision.some(m => m.income > 0 || m.costs > 0) && (
        <div className="n28-card">
          <button className="n28-row" onClick={() => setCapa({ biz: '', kind: 'forecast' })}>
            <IconTile icon="trend" color="#5bc0ff" size={36} />
            <span className="n28-svc-id">
              <b>{t('profitForecastTitle')}</b>
              <small>{t('n28ForecastLine').replace('{amount}', dinero(prevision.reduce((s, m) => s + m.net, 0) / prevision.length))}</small>
            </span>
            <Icon name="arrowUp" size={13} style={{ transform: 'rotate(90deg)' }} />
          </button>
        </div>
      )}
      {capa?.kind === 'forecast' && (
        <NxSheet title={t('profitForecastTitle')} sub={t('profitForecastHint')} onClose={() => setCapa(null)}>
          <div className="mprof-chart" aria-hidden="true">
            {prevision.map(m => (
              <span key={m.mkey} className={m === flojo ? 'weak' : ''}>
                <i className={m.net < 0 ? 'neg' : ''} style={{ height: `${Math.max(4, Math.round(Math.abs(m.net) / topeMes * 100))}%` }} />
                <u>{shortMonth(m.mkey, locale)}</u>
              </span>
            ))}
          </div>
          <div className="mprof-rows">
            {prevision.map(m => (
              <div key={m.mkey} className={m === flojo ? 'weak' : ''}>
                <span>{monthLabel(m.mkey, locale)}</span>
                <small>+{dinero(m.income)} · −{dinero(m.costs)}</small>
                <b className={m.net < 0 ? 'expense' : ''}>{m.net < 0 ? '−' : ''}{dinero(Math.abs(m.net))}</b>
              </div>
            ))}
          </div>
          {flojo && (
            <p className="nx-note">
              {flojo.big.length
                ? t('profitForecastWeakBig')
                  .replace('{month}', monthLabel(flojo.mkey, locale))
                  .replace('{names}', flojo.big.map(b => b.service.name).join(', '))
                  .replace('{amount}', dinero(flojo.net))
                : t('profitForecastWeak').replace('{month}', monthLabel(flojo.mkey, locale)).replace('{amount}', dinero(flojo.net))}
            </p>
          )}
        </NxSheet>
      )}

      {/* ── LAS ESTRELLAS: ¿COMPENSAN? ──────────────────────── */}
      {(estrellas.referred > 0 || estrellas.recommenders > 0) && (
        <section className="mprof-card">
          <div className="mprof-card-head"><Icon name="star" size={14} /> {t('profitStarsTitle')}</div>
          <div className="mcc-trio">
            <div><small>{t('profitStarsReferred')}</small><b>{estrellas.referred}</b></div>
            <div className="paid"><small>{t('profitStarsBring')}</small><b>{dinero(estrellas.referredRevenue)}</b></div>
            <div><small>{t('profitStarsCost')}</small><b className="expense">−{dinero(estrellas.discountPerMonth)}</b></div>
          </div>
          {estrellas.discountPerMonth > 0 && estrellas.referredRevenue > 0 && (
            <p className="mbiz-why">
              {t('profitStarsPays').replace('{n}', String(Math.round(estrellas.referredRevenue / estrellas.discountPerMonth)))}
            </p>
          )}
        </section>
      )}

      {/* ── N5 · QUIÉN TE DEJA MÁS ──────────────────────────── */}
      {porCliente.length > 1 && (
        <section className="mprof-card">
          <div className="mprof-card-head"><Icon name="user" size={14} /> {t('bizWhoPaysMost')}</div>
          <p className="mbiz-why">{t('bizWhoPaysMostHint')}</p>
          <div className="mprof-clients">
            {[...porCliente.slice(0, 5), ...porCliente.slice(5).filter(r => r.profit <= r.pays * 0.15)].map(r => {
              const max = Math.max(1, porCliente[0].profit)
              const poco = r.profit <= r.pays * 0.15
              return (
                <div key={r.client.id} className={`mprof-client${poco ? ' low' : ''}`}>
                  <span>{r.client.name}{poco && <em>{t('bizRaisePrice')}</em>}</span>
                  <i style={{ width: `${Math.max(3, (Math.max(0, r.profit) / max) * 100)}%` }} />
                  <b>{dinero(r.profit)}</b>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {uniendo && <MergeBusinessesSheet ids={uniendo} onClose={() => setUniendo(null)} />}
    </>
  )
}

/**
 * G2 · UNIR NEGOCIOS, con la vista previa delante: cuál queda, y lo que se
 * lleva cada uno. Con deshacer.
 */
function MergeBusinessesSheet({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const t = useT()
  const { businesses, services, clients } = useBusiness()
  const lista = businesses.filter(b => ids.includes(b.id))
  const [queda, setQueda] = useState(lista[0]?.id ?? '')
  const servicios = (id: string) => services.filter(s => s.businessId === id).length
  const gente = (id: string) => clients.filter(c => c.businessId === id && !c.deletedAt).length

  const unir = () => {
    const undo = mergeBusinesses(queda, ids.filter(i => i !== queda))
    if (!undo) return
    playSoftHaptic()
    toast(t('bizMergedToast').replace('{name}', undo.target.name), {
      icon: 'check', type: 'ok', duration: 7000,
      action: { label: t('undo'), onClick: () => unmergeBusinesses(undo) },
    })
    onClose()
  }

  return (
    <BizSheet title={t('bizMergeTitle')} onClose={onClose} onSave={unir} canSave={!!queda} saveLabel={t('svcMergeGo')}>
      <p className="mbizs-calc">{t('bizMergeWhich')}</p>
      {lista.map(b => (
        <button key={b.id} type="button" className={`mmerge-pick${queda === b.id ? ' on' : ''}`} onClick={() => setQueda(b.id)}>
          <span className="mcreate-ico" style={{ background: `color-mix(in oklab, ${b.color} 20%, transparent)`, color: b.color }}>
            <Icon name={b.icon} size={16} />
          </span>
          <span>
            <b>{b.name}</b>
            <small>{t('bizMergeCounts').replace('{s}', String(servicios(b.id))).replace('{c}', String(gente(b.id)))}</small>
          </span>
          {queda === b.id && <Icon name="check" size={16} />}
        </button>
      ))}
      <div className="msvs-preview">
        <b>{t('svcMergeResult').replace('{name}', lista.find(b => b.id === queda)?.name ?? '')}</b>
        <small>
          {t('bizMergeCounts')
            .replace('{s}', String(lista.reduce((s, b) => s + servicios(b.id), 0)))
            .replace('{c}', String(lista.reduce((s, b) => s + gente(b.id), 0)))}
        </small>
        <small>{t('bizMergeWhat')}</small>
      </div>
    </BizSheet>
  )
}

/**
 * La ganancia del año en doce barras. Las pérdidas crecen hacia ABAJO desde
 * la línea del cero; con los meses debajo, la media cruzando y el mejor y el
 * peor mes con su nombre.
 */
function ProfitChart({ points, mkey, locale, currency, decimals, avgLabel, bestLabel, worstLabel }: {
  points: Array<{ mkey: string; profit: number }>
  mkey: string
  locale: string
  currency: CurrencyCode
  decimals: number | undefined
  avgLabel: string
  bestLabel: string
  worstLabel: string
}) {
  const tope = Math.max(1, ...points.map(p => Math.abs(p.profit)))
  // Solo los meses que ya pasaron: los que vienen valen cero y hundirían la media.
  const pasados = points.filter(p => p.mkey <= mkey)
  const media = pasados.length ? pasados.reduce((sum, p) => sum + p.profit, 0) / pasados.length : 0
  const alturaMedia = Math.min(100, Math.round(Math.abs(media) / tope * 100))
  const conDatos = pasados.filter(p => p.profit !== 0)
  const mejor = conDatos.length ? conDatos.reduce((a, b) => (b.profit > a.profit ? b : a)) : null
  const peor = conDatos.length ? conDatos.reduce((a, b) => (b.profit < a.profit ? b : a)) : null

  return (
    <>
      {mejor && peor && mejor.mkey !== peor.mkey && (
        <div className="mbiz-chart-top">
          <span><small>{bestLabel}</small><b className="income">{shortMonth(mejor.mkey, locale)} {fmt(mejor.profit, currency, { decimals })}</b></span>
          <span><small>{worstLabel}</small><b className={peor.profit < 0 ? 'expense' : ''}>{shortMonth(peor.mkey, locale)} {fmt(peor.profit, currency, { decimals })}</b></span>
        </div>
      )}
      <div className="mbiz-chart">
        {points.map(p => {
          const alto = Math.round(Math.abs(p.profit) / tope * 100)
          return (
            <span key={p.mkey} className={`mbiz-chart-col${p.mkey === mkey ? ' now' : ''}`}>
              <i className="up" style={{ height: p.profit > 0 ? `${alto}%` : 0 }} />
              <i className="zero" />
              <i className="down" style={{ height: p.profit < 0 ? `${alto}%` : 0 }} />
              <u aria-hidden="true">{shortMonth(p.mkey, locale).slice(0, 1)}</u>
            </span>
          )
        })}
        {media !== 0 && (
          <span className={`mbiz-chart-avg${media < 0 ? ' neg' : ''}`} style={{ '--h': `${alturaMedia}%` } as React.CSSProperties} aria-hidden="true" />
        )}
      </div>
      <p className="mbiz-chart-legend">{avgLabel.replace('{amount}', fmt(media, currency, { decimals }))}</p>
    </>
  )
}

/** La palabra del negocio, o la de la app si no puso ninguna. */
function labelOf(custom: string | undefined, fallback: string): string {
  return custom?.trim() || fallback
}
