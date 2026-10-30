import { describe, expect, it } from 'vitest'
import { biggestExpense, merchantTotals, normalWeekExpense, priciestMonth } from '@/data/analyticsQuestions'
import { groupByMerchant, monthsBackKeys } from '@/data/searchGroups'
import { buildNudges } from '@/data/nudges'
import { detectSubscriptions } from '@/data/financeIntelligence'
import { suggestBusinessIcon } from '@/mobile/business/BusinessSheet'
import { priceHistory } from '@/mobile/MobileSubscriptions'
import type { Transaction } from '@/types'

/*
 * 2.8: la lógica debajo de Análisis, el buscador, Negocio y Suscripciones.
 */
let n = 0
const tx = (date: string, amount: number, note: string, type: Transaction['type'] = 'expense', extra: Partial<Transaction> = {}): Transaction =>
  ({ id: `t${++n}`, type, amount, date, note, categoryId: 'c', accountId: 'a', ...extra }) as Transaction

describe('A5 · preguntas rápidas', () => {
  const txs = [
    tx('2026-01-05', 300, 'Uber'), tx('2026-02-05', 450, 'uber '), tx('2026-03-05', 250, 'Uber'),
    tx('2026-03-10', 5000, 'Supermercado'), tx('2026-06-02', 18000, 'Seguro del carro'), tx('2026-06-20', 900, 'Farmacia'),
    tx('2025-12-01', 99999, 'Uber'), tx('2026-04-01', 65000, 'Salario', 'income'),
  ]
  it('suma por comercio en el año, sin importar mayúsculas ni espacios', () => {
    const uber = merchantTotals(txs, 2026)[0]
    expect(uber).toMatchObject({ note: 'Uber', count: 3, total: 1000 })
  })
  it('el mes más caro y el gasto que lo explica', () => {
    expect(priciestMonth(txs, 2026)).toEqual({ mkey: '2026-06', expense: 18900 })
    expect(biggestExpense(txs, '2026-06')?.note).toBe('Seguro del carro')
    expect(priciestMonth(txs, 2024)).toBeNull()
  })
})

describe('A9 · la semana normal', () => {
  it('es la media de las semanas anteriores con movimientos', () => {
    const txs = [
      tx('2026-10-14', 1000, 'a'), tx('2026-10-08', 3000, 'b'), tx('2026-10-01', 2000, 'c'),
    ]
    expect(normalWeekExpense(txs, '2026-10-19')).toBe(2000)
  })
  it('sin historia suficiente no inventa', () => {
    expect(normalWeekExpense([tx('2026-10-14', 1000, 'a')], '2026-10-19')).toBeNull()
  })
})

describe('S1 · el buscador agrupa por comercio', () => {
  it('junta el mismo comercio escrito distinto y suma gasto e ingreso aparte', () => {
    const g = groupByMerchant([
      tx('2026-09-01', 500, 'Supermercado Nacional'), tx('2026-10-01', 700, 'supermercado  nacional'),
      tx('2026-10-02', 200, 'Súper Pola'), tx('2026-10-03', 100, 'x', 'transfer'),
    ])
    expect(g[0]).toMatchObject({ count: 2, expense: 1200, months: 2, categoryId: 'c' })
    expect(g).toHaveLength(2)
  })
  it('las claves de meses van hacia atrás desde el actual', () => {
    expect(monthsBackKeys('2026-01', 3)).toEqual(['2026-01', '2025-12', '2025-11'])
  })
})

describe('N4 · el icono del negocio sale del nombre', () => {
  it.each([
    ['Pantallas RD', 'tv'], ['Uñas de Mari', 'scissors'], ['Colmado El Primo', 'bag'],
    ['Picapollo', 'food'], ['Clases de inglés', 'graduation'],
  ])('%s → %s', (name, icon) => expect(suggestBusinessIcon(name)).toBe(icon))
  it('si nada coincide, no propone', () => expect(suggestBusinessIcon('Proyecto X')).toBeNull())
})

describe('U3 · la historia de precio de una suscripción', () => {
  it('un tramo por cada cambio de precio', () => {
    const plantilla = tx('2025-01-03', 900, 'Netflix', 'expense', { recurring: 'monthly', recurringStart: '2025-01-03', recurringNext: '2099-01-03' })
    const h = priceHistory([
      tx('2025-01-03', 650, 'Netflix'), tx('2025-02-03', 650, 'Netflix'),
      tx('2025-06-03', 750, 'netflix'), tx('2026-03-03', 900, 'Netflix'),
    ], plantilla)
    expect(h.map(x => x.amount)).toEqual([650, 750, 900])
    expect(h[2].since).toBe('2026-03-03')
  })
})

describe('U3 · «Avísame antes» de una suscripción', () => {
  it('avisa dos días antes del cobro', () => {
    const out = buildNudges({
      today: '2026-10-29', now: 0, wishes: [], debts: [], cashflow: null,
      subs: [{ id: 's1', name: 'Netflix', amount: 900, next: '2026-11-03' }],
      money: v => `RD$${v}`, dayLabel: d => d,
      t: { wishTitle: '', wishText: '', debtTitle: '', debtText: '', cashTitle: '', cashText: '', subTitle: '{name} el {day}', subText: '{amount}' },
    })
    expect(out).toEqual([{ id: 'subdue:s1:2026-11-03', date: '2026-11-01', title: 'Netflix el 2026-11-03', text: 'RD$900', type: 'subscription' }])
  })
})

describe('F1 · el súper ya no sale como suscripción', () => {
  it('varias compras al mes no son una suscripción, aunque los montos se parezcan', () => {
    const txs: Transaction[] = []
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
      txs.push(tx(`${m}-03`, 2000, 'Supermercado Nacional'), tx(`${m}-12`, 2050, 'Supermercado Nacional'), tx(`${m}-24`, 1980, 'Supermercado Nacional'))
    }
    expect(detectSubscriptions(txs, '2026-09').map(s => s.merchant)).not.toContain('supermercado nacional')
  })
  it('un cobro igual una vez al mes sí lo es', () => {
    const txs = ['2026-06', '2026-07', '2026-08', '2026-09'].map(m => tx(`${m}-04`, 600, 'Netflix Premium'))
    expect(detectSubscriptions(txs, '2026-09')).toHaveLength(1)
  })
})
