import { describe, expect, it } from 'vitest'
import { buildNudges, nextDueDate } from '@/data/nudges'
import { parseQuickItem } from '@/data/notes'
import { projectCashflow, type CashflowProjection } from '@/data/cashflowProjection'
import { simulatePayoff, type Debt } from '@/store/debt'
import type { Wish } from '@/data/wishes'

/*
 * 2.7: la lógica que hay debajo de las pantallas nuevas. Listas (L1),
 * avisos puntuales (C2/D3/F2), cuotas en el flujo (F1) y la línea de tiempo
 * de deudas (D1).
 */
describe('L1 · añadir escribiendo «3 pollo 380»', () => {
  it('cantidad delante y precio detrás', () => {
    expect(parseQuickItem('3 pollo 380')).toEqual({ text: 'Pollo', qty: 3, price: 380 })
  })
  it('acepta «2x», RD$ y separador de miles', () => {
    expect(parseQuickItem('2x arroz RD$1,250')).toEqual({ text: 'Arroz', qty: 2, price: 1250 })
  })
  it('decimales con coma o punto', () => {
    expect(parseQuickItem('leche 12,5').price).toBe(12.5)
    expect(parseQuickItem('leche 12.50').price).toBe(12.5)
  })
  it('sin números entra tal cual, con mayúscula', () => {
    expect(parseQuickItem('  pan  ')).toEqual({ text: 'Pan' })
  })
  it('un número solo no se come el texto', () => {
    expect(parseQuickItem('380').text).toBe('380')
  })
})

describe('D3 · próximo día de pago', () => {
  it('hoy cuenta', () => expect(nextDueDate(29, '2026-10-29')).toBe('2026-10-29'))
  it('si ya pasó, el mes que viene', () => expect(nextDueDate(5, '2026-10-29')).toBe('2026-11-05'))
  it('el 31 se recorta al último día del mes', () => expect(nextDueDate(31, '2026-11-02')).toBe('2026-11-30'))
  it('cruza el año', () => expect(nextDueDate(3, '2026-12-20')).toBe('2027-01-03'))
})

describe('avisos puntuales', () => {
  const t = {
    wishTitle: '¿Todavía quieres {name}?', wishText: '{name} · {amount}',
    debtTitle: '{name} vence el {day}', debtText: 'Cuota de {amount}',
    cashTitle: 'Rojo el {day}', cashText: '{amount} el {day}',
  }
  const base = { today: '2026-10-29', now: new Date('2026-10-29T12:00:00').getTime(), money: (n: number) => `RD$${n}`, dayLabel: (d: string) => d, t }

  it('un antojo listo avisa; uno en espera o resuelto, no', () => {
    const wishes = [
      { id: 'a', name: 'Tenis', amount: 4000, decideAt: base.now - 1000 },
      { id: 'b', name: 'Audífonos', amount: 2500, decideAt: base.now + 86_400_000 },
      { id: 'c', name: 'Reloj', amount: 9000, decideAt: base.now - 1000, resolvedAt: base.now, resolution: 'skipped' },
    ] as unknown as Wish[]
    const out = buildNudges({ ...base, wishes, debts: [], cashflow: null })
    expect(out.map(n => n.id)).toEqual(['wish:a'])
    expect(out[0].text).toBe('Tenis · RD$4000')
  })

  it('la cuota avisa dos días antes, con un id por vencimiento', () => {
    const out = buildNudges({ ...base, wishes: [], cashflow: null, debts: [
      { id: 'd1', name: 'Préstamo', balance: 50000, minPayment: 3000, dueDay: 5, owed: true },
      { id: 'd2', name: 'Primo', balance: 2000, minPayment: 0, dueDay: 5, owed: false },
      { id: 'd3', name: 'Saldada', balance: 0, minPayment: 500, dueDay: 5, owed: true },
    ] })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 'debtdue:d1:2026-11-05', date: '2026-11-03', type: 'debt', text: 'Cuota de RD$3000' })
  })

  it('sin mínimo, la cuota es el saldo', () => {
    const out = buildNudges({ ...base, wishes: [], cashflow: null, debts: [
      { id: 'd', name: 'Tienda', balance: 1200, minPayment: 0, dueDay: 10, owed: true },
    ] })
    expect(out[0].text).toBe('Cuota de RD$1200')
  })

  it('el flujo en rojo avisa una vez por fecha; en positivo no', () => {
    const cf = { startBalance: 0, endBalance: 0, minBalance: -800, minDate: '2026-11-14', days: [], series: [] } as CashflowProjection
    expect(buildNudges({ ...base, wishes: [], debts: [], cashflow: cf }).map(n => n.id)).toEqual(['cashlow:2026-11-14'])
    expect(buildNudges({ ...base, wishes: [], debts: [], cashflow: { ...cf, minBalance: 300 } })).toEqual([])
  })
})

describe('F1 · las cuotas entran al flujo', () => {
  it('una cuota por mes en su día, hasta el horizonte', () => {
    const p = projectCashflow([], [], [], '2026-12-31', '2026-10-29', undefined, undefined, [
      { id: 'd', name: 'Préstamo', amount: 3000, dueDay: 15 },
    ])
    const cuotas = p.days.flatMap(d => d.events).filter(e => e.kind === 'debt')
    expect(cuotas.map(e => e.date)).toEqual(['2026-11-15', '2026-12-15'])
    expect(cuotas.every(e => e.amount === -3000)).toBe(true)
    expect(p.endBalance).toBe(-6000)
  })
})

describe('D1 · cuándo termina cada deuda', () => {
  it('simulatePayoff da el mes de cada una y la última coincide con el total', () => {
    const debts = [
      { id: 'a', name: 'Pequeña', balance: 1000, rate: 0, minPayment: 500, color: '' },
      { id: 'b', name: 'Grande', balance: 6000, rate: 0, minPayment: 1000, color: '' },
    ] as Debt[]
    const r = simulatePayoff(debts, 0, 'snowball')
    expect(r.finishedAt?.a).toBe(2)
    expect(r.finishedAt?.b).toBeGreaterThan(2)
    expect(Math.max(...Object.values(r.finishedAt ?? {}))).toBe(r.months)
  })
})
