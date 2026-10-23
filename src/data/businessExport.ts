import { APP_NAME } from '@/data/release'
import { saveFile } from '@/hooks/useTauri'
import { tt } from '@/i18n'
import { chargeState, type Charge, type Client } from './clients'
import { chargeRows, clientStatement, receiptFor, type Receipt, type Statement } from './clientStatement'
import { dateLocale, fmt, localToday, shortMonth } from './helpers'
import type { CurrencyCode } from '@/types'

/**
 * LOS PAPELES DE NEGOCIO: comprobante, estado de cuenta y la lista de cobros.
 *
 * ── POR QUÉ HACEN FALTA ───────────────────────────────────────────────
 * Hasta aquí todo lo que la app sabía de un cliente se quedaba dentro de la
 * app. Pero cobrar tiene una parte que ocurre fuera: mandarle el comprobante
 * al que pagó, enseñarle a quien dice que ya pagó lo que pagó de verdad, o
 * pasarle a un contable los cobros del año.
 *
 * ── LO QUE ESTE ARCHIVO NO DECIDE ─────────────────────────────────────
 * Qué dice cada papel está en `clientStatement.ts`, sin jsPDF y sin DOM, para
 * poder probarlo. Aquí solo se dibuja. Un comprobante que diga «pagado 250»
 * cuando pagó 200 es un problema con un cliente delante; una coordenada mal
 * puesta es un píxel.
 */

const TINTA = [23, 32, 51] as const
const GRIS = [102, 112, 133] as const
const FONDO = [244, 247, 251] as const

const nombreArchivo = (prefijo: string, ext: string) =>
  `${prefijo.replace(/[^\w-]+/g, '-').toLowerCase()}-${localToday()}.${ext}`

/** La cabecera que comparten los tres papeles. */
function cabecera(doc: import('jspdf').jsPDF, titulo: string, subtitulo: string): number {
  doc.setFillColor(...TINTA)
  doc.roundedRect(16, 14, 18, 18, 4, 4, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.text('$', 23, 26)

  doc.setTextColor(...TINTA)
  doc.setFontSize(18)
  doc.text(titulo, 40, 25)
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(subtitulo, 40, 31)
  return 46
}

/** El pie, con la fecha en que se generó. Un papel sin fecha no sirve de nada. */
function pie(doc: import('jspdf').jsPDF, locale: string): void {
  const generado = new Date().toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
  const total = doc.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    doc.setPage(page)
    doc.setFontSize(8)
    doc.setTextColor(150, 158, 173)
    doc.text(tt('pdfGeneratedOn', { date: generado }), 16, 290)
    doc.text(tt('pdfPage', { page, total }), 178, 290)
  }
}

/**
 * EL COMPROBANTE DE UN PAGO.
 *
 * Lo que se le manda al cliente cuando paga. Es un papel corto a propósito:
 * quién, cuánto, cuándo y de qué. Todo lo demás —su historial, lo que debe de
 * otros meses— es asunto tuyo, no suyo, y meterlo en el comprobante que le
 * mandas por WhatsApp sería enseñarle tus cuentas.
 */
export async function exportReceiptPdf(
  charge: Charge,
  client: Client,
  currency: CurrencyCode,
  lang: 'en' | 'es' = 'es',
): Promise<boolean> {
  const datos = receiptFor(charge, client)
  // Sin movimiento detrás no hay comprobante que emitir: quien llama ya
  // debería haber escondido el botón, pero esto no se delega.
  if (!datos) return false

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const locale = dateLocale(lang)
  const cur = client.currency ?? currency
  const money = (n: number) => fmt(n, cur, { neverMask: true })

  let y = cabecera(doc, tt('rcptTitle'), APP_NAME)

  doc.setFillColor(...FONDO)
  doc.roundedRect(16, y, 178, 34, 4, 4, 'F')
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(tt('rcptReceivedFrom'), 24, y + 10)
  doc.setFontSize(15)
  doc.setTextColor(...TINTA)
  doc.text(datos.clientName, 24, y + 20)
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  if (datos.concept) doc.text(datos.concept, 24, y + 28)

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(tt('rcptAmount'), 130, y + 10)
  doc.setFontSize(19)
  doc.setTextColor(...TINTA)
  doc.text(money(datos.paid), 130, y + 21)

  y += 46
  const fila = (etiqueta: string, valor: string) => {
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text(etiqueta, 16, y)
    doc.setTextColor(...TINTA)
    doc.text(valor, 100, y)
    y += 8
  }

  fila(tt('rcptPaidOn'), datos.paidAt > 0
    ? new Date(datos.paidAt).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : '—')
  fila(tt('rcptDueDate'), datos.dueDate)

  /*
   * Un pago PARCIAL lo dice el papel, en su propia línea.
   *
   * Redondearlo a «pagado» es lo que provoca justo la discusión que un
   * comprobante existe para evitar: el cliente guarda un papel que dice que
   * saldó, y la app dice que debe 50.
   */
  if (datos.outstanding > 0) {
    fila(tt('rcptExpected'), money(datos.expected))
    doc.setTextColor(...GRIS)
    doc.setFontSize(9)
    doc.text(tt('rcptPartial', { amount: money(datos.outstanding) }), 16, y)
    y += 10
  }

  if (datos.note) {
    doc.setFontSize(9)
    doc.setTextColor(...GRIS)
    doc.text(doc.splitTextToSize(datos.note, 178), 16, y + 2)
  }

  pie(doc, locale)
  await saveFile(doc.output('blob'), nombreArchivo(`comprobante-${client.name}`, 'pdf'), tt('rcptTitle'), ['pdf'])
  return true
}

/**
 * EL ESTADO DE CUENTA DE UN AÑO.
 *
 * Lo que un cliente pide cuando quiere saber qué pagó, y lo que hace falta
 * para cobrarle a alguien que dice que ya pagó. Doce filas, lo facturado
 * contra lo pagado, y el saldo.
 */
export async function exportStatementPdf(
  client: Client,
  charges: Charge[],
  year: number,
  currency: CurrencyCode,
  lang: 'en' | 'es' = 'es',
): Promise<Statement> {
  const datos = clientStatement(client, charges, year, localToday())
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const locale = dateLocale(lang)
  const cur = client.currency ?? currency
  const money = (n: number) => fmt(n, cur, { neverMask: true })

  let y = cabecera(doc, tt('stmtTitle', { year }), client.name)

  doc.setFillColor(...FONDO)
  doc.roundedRect(16, y, 178, 24, 4, 4, 'F')
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(tt('stmtBilled'), 24, y + 8)
  doc.text(tt('stmtPaid'), 83, y + 8)
  doc.text(tt('stmtOwed'), 142, y + 8)
  doc.setFontSize(12)
  doc.setTextColor(...TINTA)
  doc.text(money(datos.totalBilled), 24, y + 17)
  doc.text(money(datos.totalPaid), 83, y + 17)
  doc.text(money(datos.stillOwed), 142, y + 17)

  y += 36
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(tt('stmtMonth'), 16, y)
  doc.text(tt('stmtBilled'), 100, y)
  doc.text(tt('stmtPaid'), 150, y)
  y += 3
  doc.setDrawColor(220, 226, 234)
  doc.line(16, y, 194, y)
  y += 7

  for (const row of datos.rows) {
    // Un mes sin nada no se imprime: doce filas de «0 / 0» en un año que
    // empezó en septiembre son once líneas que no dicen nada.
    if (row.billed === 0 && row.paid === 0) continue
    doc.setTextColor(...TINTA)
    doc.setFontSize(9)
    doc.text(shortMonth(row.mkey, locale), 16, y)
    doc.text(money(row.billed), 100, y)
    doc.text(money(row.paid), 150, y)
    y += 7
    if (y > 270) { doc.addPage(); y = 24 }
  }

  y += 6
  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(tt('stmtClosed', { paid: datos.paidCount, total: datos.chargeCount }), 16, y)
  if (datos.avgDelay !== null) {
    y += 7
    doc.text(tt('stmtAvgDelay', { n: datos.avgDelay }), 16, y)
  }

  pie(doc, locale)
  await saveFile(
    doc.output('blob'),
    nombreArchivo(`estado-${client.name}-${year}`, 'pdf'),
    tt('stmtTitle', { year }),
    ['pdf'],
  )
  return datos
}

/** Las columnas de la exportación, traducidas donde se llama. */
function etiquetaEstado(): (s: ReturnType<typeof chargeState>) => string {
  const mapa: Record<ReturnType<typeof chargeState>, string> = {
    paid: tt('bizPaid'),
    partial: tt('bizPartial'),
    late: tt('bizGroupLate'),
    today: tt('bizDueToday'),
    upcoming: tt('bizGroupLater'),
    waived: tt('bizWaived'),
  }
  return s => mapa[s]
}

/**
 * LOS COBROS A EXCEL.
 *
 * Para quien lleva la contabilidad fuera, o para quien quiere ver sus cobros
 * de un año en una hoja. Las mismas filas que el PDF, porque dos tablas con
 * columnas distintas serían dos verdades del mismo mes.
 */
export async function exportChargesExcel(charges: Charge[], clients: Client[]): Promise<number> {
  const filas = chargeRows(charges, clients, localToday(), etiquetaEstado())
  if (!filas.length) return 0

  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = APP_NAME
  wb.created = new Date()
  wb.title = tt('bizChargesExport')

  const ws = wb.addWorksheet(tt('bizTabCollect'))
  const columnas: Array<{ header: string; key: keyof typeof filas[0]; width: number }> = [
    { header: tt('bizClients'), key: 'client', width: 24 },
    { header: tt('bizConcept'), key: 'concept', width: 20 },
    { header: tt('bizChargeDue'), key: 'dueDate', width: 14 },
    { header: tt('stmtState'), key: 'state', width: 14 },
    { header: tt('amount'), key: 'amount', width: 14 },
    { header: tt('bizPaid'), key: 'paid', width: 14 },
    { header: tt('bizOwes'), key: 'outstanding', width: 14 },
    { header: tt('bizDaysLateCol'), key: 'daysLate', width: 12 },
    { header: tt('stmtPaidOn'), key: 'paidOn', width: 14 },
    { header: tt('bizChargeNote'), key: 'note', width: 34 },
  ]
  ws.columns = columnas
  ws.addRows(filas)
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF172033' } }

  const buffer = await wb.xlsx.writeBuffer()
  await saveFile(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    nombreArchivo('cobros', 'xlsx'),
    tt('bizChargesExport'),
    ['xlsx'],
  )
  return filas.length
}

/** Los mismos cobros, en PDF, para quien no abre hojas de cálculo. */
export async function exportChargesPdf(
  charges: Charge[],
  clients: Client[],
  currency: CurrencyCode,
  lang: 'en' | 'es' = 'es',
): Promise<number> {
  const filas = chargeRows(charges, clients, localToday(), etiquetaEstado())
  if (!filas.length) return 0

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const locale = dateLocale(lang)
  const money = (n: number) => fmt(n, currency, { neverMask: true })

  let y = cabecera(doc, tt('bizChargesExport'), APP_NAME)

  doc.setFontSize(9)
  doc.setTextColor(...GRIS)
  doc.text(tt('bizClients'), 16, y)
  doc.text(tt('bizChargeDue'), 86, y)
  doc.text(tt('stmtState'), 118, y)
  doc.text(tt('amount'), 150, y)
  doc.text(tt('bizOwes'), 175, y)
  y += 3
  doc.setDrawColor(220, 226, 234)
  doc.line(16, y, 194, y)
  y += 7

  for (const fila of filas) {
    doc.setFontSize(9)
    doc.setTextColor(...TINTA)
    // El nombre se recorta: uno largo se montaría encima de la fecha, y una
    // tabla con las columnas pisadas no se puede leer.
    doc.text(fila.client.slice(0, 28), 16, y)
    doc.text(fila.dueDate, 86, y)
    doc.setTextColor(...GRIS)
    doc.text(fila.state, 118, y)
    doc.setTextColor(...TINTA)
    doc.text(money(fila.amount), 150, y)
    doc.text(money(fila.outstanding), 175, y)
    y += 7
    if (y > 272) { doc.addPage(); y = 24 }
  }

  y += 6
  doc.setDrawColor(220, 226, 234)
  doc.line(16, y, 194, y)
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(...TINTA)
  doc.text(tt('bizOwes'), 118, y)
  doc.text(money(filas.reduce((sum, f) => sum + f.outstanding, 0)), 175, y)

  pie(doc, locale)
  await saveFile(doc.output('blob'), nombreArchivo('cobros', 'pdf'), tt('bizChargesExport'), ['pdf'])
  return filas.length
}

export type { Receipt, Statement }
