import { accountSavingsRate, amountForCategory, byCategory, dateLocale, fmt, getAccount, getCategory, localToday, monthLabel, monthlySeries, savingsBalance, totalBalanceInBase, totals, transactionsForTotals, txForMonth } from './helpers'
import type { FinanceState } from '@/store/finance'
import { saveFile } from '@/hooks/useTauri'
import { tt } from '@/i18n'

const downloadName = (prefix: string, extension: string) => `${prefix}-${localToday()}.${extension}`

export interface ReportExecutiveSummary {
  income: number
  expense: number
  net: number
  savingsRate: number
  topCategory?: string
  topCategoryAmount: number
  headline: string
}

export function createExecutiveSummary(state: FinanceState, month?: string): ReportExecutiveSummary {
  const visTx = transactionsForTotals(state.transactions, state.accounts, state.currency)
  const rows = month ? txForMonth(visTx, month) : visTx
  const summary = totals(rows)
  const topCategory = byCategory(rows, 'expense', state.categories)[0]
  const savingsRate = accountSavingsRate(state.accounts)
  const savedAmount = savingsBalance(state.accounts)
  const headline = summary.net < 0
    ? tt('reportHeadlineNegative')
    : savedAmount > 0 && savingsRate >= 20
      ? tt('reportHeadlineGreatSavings')
      : savedAmount > 0
        ? tt('reportHeadlinePositive')
        : tt('reportHeadlineNoIncome')
  return {
    income: summary.income,
    expense: summary.expense,
    net: summary.net,
    savingsRate,
    topCategory: topCategory?.category.name,
    topCategoryAmount: topCategory?.amount ?? 0,
    headline,
  }
}

export async function exportExcel(state: FinanceState): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = '$harky'
  wb.created = new Date()
  wb.subject = 'Reporte financiero personal'
  wb.title = '$harky - Reporte financiero'

  const addSheet = (name: string, rows: Record<string, string | number | undefined>[]) => {
    const ws = wb.addWorksheet(name)
    if (!rows.length) return
    ws.columns = Object.keys(rows[0]).map(key => ({ header: key, key, width: Math.max(16, key.length + 4) }))
    ws.addRows(rows)
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172033' } }
    ws.eachRow(row => row.eachCell(cell => {
      if (typeof cell.value === 'number') cell.numFmt = '#,##0.00;[Red]-#,##0.00'
    }))
  }

  const executive = createExecutiveSummary(state)
  addSheet('Resumen ejecutivo', [
    { Indicador: 'Ingresos totales', Valor: executive.income, Nota: '' },
    { Indicador: 'Gastos totales', Valor: executive.expense, Nota: executive.topCategory ? `Categoria principal: ${executive.topCategory}` : '' },
    { Indicador: 'Ahorro neto', Valor: executive.net, Nota: executive.headline },
    { Indicador: 'Ahorro en cuentas', Valor: savingsBalance(state.accounts), Nota: `Tasa ahorro: ${Number(executive.savingsRate.toFixed(2))}%` },
    { Indicador: 'Categoria top', Valor: executive.topCategoryAmount, Nota: executive.topCategory ?? 'Sin datos' },
  ])

  const visTx = transactionsForTotals(state.transactions, state.accounts, state.currency)
  const years = Array.from(new Set(visTx.map(tx => Number(tx.date.slice(0, 4))))).sort()
  const annualRows = years.flatMap(year =>
    monthlySeries(visTx, year).map(m => ({
      Ano: year,
      Mes: m.label,
      Ingresos: m.income,
      Gastos: m.expense,
      Ahorro: m.net,
      'Flujo neto %': m.income ? Number((m.net / m.income * 100).toFixed(2)) : 0,
    }))
  )
  addSheet('Resumen anual', annualRows)

  const categoryRows = state.categories.map(c => {
    const amount = state.transactions
      .filter(tx => tx.type === c.type)
      .reduce((sum, tx) => sum + amountForCategory(tx, c.id), 0)
    return {
      Categoria: c.name,
      Tipo: c.type === 'expense' ? 'Gasto' : 'Ingreso',
      Total: amount,
      Presupuesto: c.budget,
      'Presupuesto semanal': c.weeklyBudget ?? 0,
      'Presupuesto anual': c.annualBudget ?? 0,
    }
  })
  addSheet('Por categoria', categoryRows)

  const accountRows = state.accounts.map(account => ({
    Cuenta: account.name,
    Etiqueta: account.short,
    Tipo: account.type,
    Balance: account.balance,
    Limite: account.limit ?? 0,
    Politica: account.overdraftPolicy ?? 'global',
  }))
  addSheet('Por cuenta', accountRows)

  const months = Array.from(new Set(state.transactions.map(tx => tx.date.slice(0, 7)))).sort().reverse()
  months.forEach(month => {
    const rows = txForMonth(state.transactions, month).map(tx => ({
      Fecha: tx.date,
      Tipo: tx.type === 'income' ? 'Ingreso' : tx.type === 'expense' ? 'Gasto' : 'Transferencia',
      Categoria: getCategory(tx.categoryId, state.categories)?.name ?? '',
      Cuenta: tx.type === 'transfer'
        ? `${getAccount(tx.fromAccount, state.accounts)?.name ?? ''} -> ${getAccount(tx.toAccount, state.accounts)?.name ?? ''}`
        : getAccount(tx.accountId, state.accounts)?.name ?? '',
      Descripcion: tx.note,
      Tags: (tx.tags ?? []).join(', '),
      Monto: tx.type === 'expense' ? -tx.amount : tx.amount,
    }))
    if (rows.length) addSheet(month.slice(0, 31), rows)
  })

  const buffer   = await wb.xlsx.writeBuffer()
  const filename  = downloadName('sharky-finanzas', 'xlsx')
  const mimeType  = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  const blob      = new Blob([buffer], { type: mimeType })
  await saveFile(blob, filename, 'Reporte de $harky', ['xlsx'])
}

const csvField = (value: string | number): string => {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCsv(state: FinanceState): Promise<void> {
  const header = ['Fecha', 'Tipo', 'Categoria', 'Cuenta', 'Descripcion', 'Tags', 'Monto']
  const rows = state.transactions.map(tx => [
    tx.date,
    tx.type === 'income' ? 'Ingreso' : tx.type === 'expense' ? 'Gasto' : 'Transferencia',
    getCategory(tx.categoryId, state.categories)?.name ?? '',
    tx.type === 'transfer'
      ? `${getAccount(tx.fromAccount, state.accounts)?.name ?? ''} -> ${getAccount(tx.toAccount, state.accounts)?.name ?? ''}`
      : getAccount(tx.accountId, state.accounts)?.name ?? '',
    tx.note,
    (tx.tags ?? []).join(', '),
    tx.type === 'expense' ? -tx.amount : tx.amount,
  ])
  const csv = [header, ...rows].map(row => row.map(csvField).join(',')).join('\r\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' })
  const filename = downloadName('sharky-movimientos', 'csv')
  await saveFile(blob, filename, 'Movimientos de $harky', ['csv'])
}

export async function exportMonthlyPdf(state: FinanceState, month: string, ownerName: string, lang: 'en' | 'es' = 'es'): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const locale = dateLocale(lang)
  const rows = txForMonth(transactionsForTotals(state.transactions, state.accounts, state.currency), month)
  const summary = totals(rows)
  const executive = createExecutiveSummary(state, month)
  const categories = byCategory(rows, 'expense', state.categories)
  let y = 22

  doc.setFillColor(23, 32, 51)
  doc.roundedRect(16, 14, 18, 18, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.text('$', 23, 26)
  doc.setTextColor(23, 32, 51)
  doc.setFontSize(20)
  doc.text('$harky', 40, 25)
  doc.setFontSize(10)
  doc.setTextColor(102, 112, 133)
  doc.text(tt('pdfTagline'), 40, 31)
  doc.text(tt('pdfHolder', { name: ownerName }), 150, 20)
  doc.text(monthLabel(month, locale), 150, 26)

  y = 48
  doc.setFontSize(12)
  doc.setTextColor(23, 32, 51)
  doc.text(tt('pdfExecutiveSummary'), 16, y)
  y += 7
  doc.setFontSize(9)
  doc.setTextColor(102, 112, 133)
  doc.text(doc.splitTextToSize(executive.headline, 178), 16, y)
  y += 16

  doc.setFillColor(244, 247, 251)
  doc.roundedRect(16, y, 178, 24, 4, 4, 'F')
  doc.setTextColor(102, 112, 133)
  doc.text(tt('pdfIncome'), 24, y + 8)
  doc.text(tt('pdfExpense'), 83, y + 8)
  doc.text(tt('pdfSavings'), 142, y + 8)
  doc.setTextColor(23, 32, 51)
  doc.setFontSize(12)
  doc.text(fmt(summary.income, state.currency), 24, y + 17)
  doc.text(fmt(summary.expense, state.currency), 83, y + 17)
  doc.text(fmt(summary.net, state.currency), 142, y + 17)

  y += 38
  if (executive.topCategory) {
    doc.setFontSize(9)
    doc.setTextColor(102, 112, 133)
    doc.text(tt('pdfTopCategory', { name: executive.topCategory, amount: fmt(executive.topCategoryAmount, state.currency) }), 16, y)
    y += 10
  }

  doc.setFontSize(13)
  doc.setTextColor(23, 32, 51)
  doc.text(tt('pdfMovements'), 16, y)
  y += 8
  doc.setFontSize(9)
  doc.setTextColor(102, 112, 133)
  doc.text(tt('pdfDate'), 16, y)
  doc.text(tt('pdfDescription'), 40, y)
  doc.text(tt('pdfCategory'), 116, y)
  doc.text(tt('pdfAmount'), 166, y)
  y += 3
  doc.setDrawColor(220, 226, 234)
  doc.line(16, y, 194, y)
  y += 6

  rows.forEach(tx => {
    if (y > 278) { doc.addPage(); y = 22 }
    doc.setTextColor(23, 32, 51)
    doc.text(tx.date, 16, y)
    doc.text(tx.note.slice(0, 40), 40, y)
    doc.text((getCategory(tx.categoryId, state.categories)?.name ?? tt('transfersLabel')).slice(0, 22), 116, y)
    const signed = tx.type === 'expense' ? -tx.amount : tx.amount
    doc.text(fmt(signed, state.currency), 166, y)
    y += 7
  })

  if (categories.length) {
    if (y > 246) { doc.addPage(); y = 22 }
    y += 6
    doc.setFontSize(13)
    doc.setTextColor(23, 32, 51)
    doc.text(tt('pdfTopExpenseCategories'), 16, y)
    y += 8
    doc.setFontSize(9)
    doc.setTextColor(102, 112, 133)
    categories.slice(0, 5).forEach(category => {
      doc.text(category.category.name, 16, y)
      doc.text(fmt(category.amount, state.currency), 166, y)
      y += 6
    })
  }

  // Cuentas y patrimonio neto
  if (state.accounts.length) {
    if (y > 230) { doc.addPage(); y = 22 }
    y += 6
    doc.setFontSize(13)
    doc.setTextColor(23, 32, 51)
    doc.text(tt('pdfAccountsSection'), 16, y)
    y += 8
    doc.setFontSize(9)
    doc.setTextColor(102, 112, 133)
    doc.text(tt('pdfAccount'), 16, y)
    doc.text(tt('pdfType'), 116, y)
    doc.text(tt('pdfBalance'), 166, y)
    y += 3
    doc.setDrawColor(220, 226, 234)
    doc.line(16, y, 194, y)
    y += 6

    state.accounts.forEach(account => {
      if (y > 278) { doc.addPage(); y = 22 }
      doc.setTextColor(23, 32, 51)
      doc.text(account.name.slice(0, 40), 16, y)
      doc.text(tt(account.type), 116, y)
      doc.text(fmt(account.balance, account.currency ?? state.currency), 166, y)
      y += 7
    })

    const netWorth = totalBalanceInBase(state.accounts, state.currency)
    y += 2
    doc.setDrawColor(220, 226, 234)
    doc.line(16, y, 194, y)
    y += 7
    doc.setFontSize(11)
    doc.setTextColor(23, 32, 51)
    doc.text(tt('pdfNetWorth'), 116, y)
    doc.text(fmt(netWorth, state.currency), 166, y)
  }

  // Pie de pagina: fecha de generacion y numero de pagina
  const totalPages = doc.getNumberOfPages()
  const generatedOn = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(150, 158, 173)
    doc.text(tt('pdfGeneratedOn', { date: generatedOn }), 16, 290)
    doc.text(tt('pdfPage', { page, total: totalPages }), 178, 290)
  }

  const filename  = downloadName(`sharky-estado-${month}`, 'pdf')
  const pdfBlob = doc.output('blob')
  await saveFile(pdfBlob, filename, 'Estado Financiero $harky', ['pdf'])
}
