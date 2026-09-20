import { describe, expect, it } from 'vitest'
import { analyzeBankCsv, parseBankCsv } from './bankCsv'
import type { Category, Transaction } from '@/types'

const categories: Category[] = [
  { id: 'cat_super', name: 'Supermercado', type: 'expense', color: '#fff', budget: 0, icon: 'cart' },
  { id: 'cat_salario', name: 'Salario', type: 'income', color: '#fff', budget: 0, icon: 'wallet' },
  { id: 'cat_rest', name: 'Restaurantes', type: 'expense', color: '#fff', budget: 0, icon: 'food' },
]

describe('parseBankCsv', () => {
  it('detecta columnas separadas de débito y crédito', () => {
    const rows = parseBankCsv('Fecha;Concepto;Debito;Credito\n31/05/2026;Jumbo;1250;\n30/05/2026;Nomina;;50000', [], categories)
    expect(rows).toMatchObject([{ type: 'expense', amount: 1250, categoryId: 'cat_super' }, { type: 'income', amount: 50000, categoryId: 'cat_salario' }])
  })

  it('marca duplicados por fecha, monto y nota', () => {
    const existing: Transaction[] = [{ id: 'tx', type: 'expense', date: '2026-05-31', amount: 1250, note: 'Jumbo', categoryId: 'cat_super', accountId: 'cash' }]
    expect(parseBankCsv('Fecha,Monto,Descripcion\n31/05/2026,-1250,Jumbo', existing, categories)[0].duplicate).toBe(true)
  })

  it('marca duplicados de tarjeta aunque la fecha de posteo cambie hasta dos dias', () => {
    const existing: Transaction[] = [{
      id: 'tx',
      type: 'expense',
      date: '2026-05-29',
      amount: 808,
      note: 'POS PEDIDOSYA VISA REF 123',
      categoryId: 'cat_rest',
      accountId: 'credit',
    }]
    const rows = parseBankCsv('Fecha consumo,Comercio,Monto consumido\n31/05/2026,PedidosYa,808', existing, categories, 'popularCard')
    expect(rows[0]).toMatchObject({ duplicate: true, type: 'expense', amount: 808, categoryId: 'cat_rest' })
  })

  it('rechaza archivos sin columnas reconocibles', () => {
    expect(() => parseBankCsv('A,B,C\n1,2,3', [], categories)).toThrow('detectar las columnas')
  })

  it('expone perfil versionado y columnas detectadas', () => {
    const analysis = analyzeBankCsv('Fecha;Concepto;Retiro;Deposito\n31/05/2026;Jumbo;1250;', 'banreservas')
    expect(analysis.profile?.version).toBe('banreservas-cuenta-v1')
    expect(analysis.columns).toMatchObject({ date: 'Fecha', note: 'Concepto', debit: 'Retiro', credit: 'Deposito' })
  })

  it('detecta perfiles de tarjeta por encabezados de consumo y comercio', () => {
    const analysis = analyzeBankCsv('Fecha consumo,Comercio,Monto consumido\n31/05/2026,PedidosYa,808', 'auto')
    expect(analysis.profile?.version).toBe('popular-tarjeta-v1')
    expect(analysis.profile?.kind).toBe('credit-card')
    expect(analysis.columns).toMatchObject({ date: 'Fecha consumo', note: 'Comercio', amount: 'Monto consumido' })
  })

  it('parsea cargos y pagos separados de tarjeta BHD', () => {
    const rows = parseBankCsv('Fecha Posteo;Establecimiento;Consumos;Pagos\n31/05/2026;Restaurante Central;950;\n01/06/2026;Pago tarjeta;;2000', [], categories, 'bhdCard')
    expect(rows).toMatchObject([
      { type: 'expense', amount: 950, categoryId: 'cat_rest' },
      { type: 'income', amount: 2000, categoryId: 'cat_salario' },
    ])
  })

  it('permite mapear columnas desconocidas manualmente', () => {
    const rows = parseBankCsv('Dia,Texto,Salida,Entrada\n31/05/2026,Jumbo,1250,', [], categories, 'auto', {
      date: 'Dia',
      note: 'Texto',
      debit: 'Salida',
      credit: 'Entrada',
    })
    expect(rows[0]).toMatchObject({ date: '2026-05-31', note: 'Jumbo', type: 'expense', amount: 1250 })
  })

  it('interpreta parentesis como monto negativo en columnas firmadas', () => {
    const rows = parseBankCsv('Fecha,Monto,Descripcion\n31/05/2026,\"(1,250.00)\",Jumbo', [], categories)
    expect(rows[0]).toMatchObject({ type: 'expense', amount: 1250 })
  })
})
