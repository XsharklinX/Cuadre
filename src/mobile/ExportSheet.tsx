import { useState } from 'react'
import { APP_NAME } from '@/data/release'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { exportElementPng } from '@/data/imageExport'
import { exportCsv, exportExcel, exportMonthlyPdf } from '@/data/professionalExport'
import { dateLocale, monthLabel } from '@/data/helpers'
import { useT } from '@/i18n'
import { useFinance } from '@/store/finance'
import { useSettings } from '@/store/settings'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * Colores de los formatos de exportacion. Son CATEGORICOS (distinguir PDF de
 * Excel de CSV), no semanticos: no significan bueno ni malo.
 */
const EXPORT_COLORS = {
  pdf:    '#e8b13d',
  excel:  '#35a06f',
  csv:    '#4a80c4',
  import: '#8b6fd4',
} as const

function exportIcon(color: string): React.CSSProperties {
  return { background: `color-mix(in oklab, ${color} 13%, transparent)`, color }
}

/*
 * EXPORTAR E IMPORTAR, EN UNA HOJA QUE SE ABRE DESDE DONDE SEA.
 *
 * Vivía dentro de Análisis, al final de los acordeones. Desde la 2.6 se abre
 * también desde el menú ☰ (Utilidades), que es donde se busca. La opción de
 * «compartir como imagen» solo sale cuando hay una pantalla que fotografiar
 * (`captureId`), es decir, desde Análisis.
 */
export function ExportSheet({ mkey, captureId, captureName, onImport, onClose, preview }: {
  mkey: string
  /**
   * A10 · Lo que se va a mandar, visto antes de mandarlo (2.8). Recibe si se
   * ocultan los montos; la imagen se saca de este mismo bloque (`captureId`).
   */
  preview?: (hideAmounts: boolean) => React.ReactNode
  captureId?: string
  captureName?: string
  onImport?: () => void
  onClose: () => void
}) {
  const t = useT()
  const finance = useFinance()
  const lang = (useSettings(s => s.language) ?? 'es') as 'en' | 'es'
  const ownerName = useSettings(s => s.displayName) || APP_NAME
  const [exporting, setExporting] = useState<'pdf' | 'excel' | 'csv' | 'png' | null>(null)
  const [hideAmounts, setHideAmounts] = useState(false)
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)

  const run = async (kind: 'pdf' | 'excel' | 'csv' | 'png') => {
    setExporting(kind)
    try {
      if (kind === 'png') {
        const el = captureId ? document.getElementById(captureId) : null
        if (el) {
          await exportElementPng(el, captureName ?? `cuadre-${mkey}`)
          toast(t('reportExportedAsImage'), { icon: 'download', type: 'ok' })
        }
      } else if (kind === 'pdf') {
        await exportMonthlyPdf(finance, mkey, ownerName, lang)
        toast(t('pdfExportedFor').replace('{month}', monthLabel(mkey, dateLocale(lang))), { icon: 'download', type: 'ok' })
      } else if (kind === 'excel') {
        await exportExcel(finance)
        toast(t('excelExported'), { icon: 'download', type: 'ok' })
      } else {
        await exportCsv(finance)
        toast(t('csvExported'), { icon: 'download', type: 'ok' })
      }
      onClose()
    } catch {
      toast(t(kind === 'pdf' ? 'pdfExportError' : kind === 'excel' ? 'excelExportError' : 'csvExportError'), { icon: 'alert' })
    } finally {
      setExporting(null)
    }
  }

  return (
    <SheetPortal>
      <div ref={ref} className="mobile-detail-sheet" role="dialog" aria-modal="true" aria-label={t('exportData')} onClick={onClose}>
        <section className="man-export-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('exportData')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>
          {preview && (
            <div className="an28-share-preview">
              {preview(hideAmounts)}
              <div className="an28-share-toggle" role="tablist">
                <button role="tab" aria-selected={!hideAmounts} className={!hideAmounts ? 'on' : ''} onClick={() => setHideAmounts(false)}>{t('an28WithAmounts')}</button>
                <button role="tab" aria-selected={hideAmounts} className={hideAmounts ? 'on' : ''} onClick={() => setHideAmounts(true)}>{t('an28OnlyPct')}</button>
              </div>
            </div>
          )}
          {captureId && (
            <button className="man-export-row" disabled={exporting !== null} onClick={() => void run('png')}>
              <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.import)}><Icon name="camera" size={20} /></span>
              <div><b>{t('exportImageLabel')}</b><small>{exporting === 'png' ? t('generatingImageEllipsis') : t('shareAsImageHint')}</small></div>
            </button>
          )}
          <button className="man-export-row" disabled={exporting !== null} onClick={() => void run('pdf')}>
            <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.pdf)}><Icon name="book" size={20} /></span>
            <div><b>{t('monthStatementPdf')}</b><small>{exporting === 'pdf' ? t('generatingPdf') : monthLabel(mkey, dateLocale(lang))}</small></div>
          </button>
          <button className="man-export-row" disabled={exporting !== null} onClick={() => void run('excel')}>
            <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.excel)}><Icon name="trend" size={20} /></span>
            <div><b>{t('fullReportExcelTitle')}</b><small>{exporting === 'excel' ? t('generatingExcel') : t('movementsAccountsCategories')}</small></div>
          </button>
          <button className="man-export-row" disabled={exporting !== null} onClick={() => void run('csv')}>
            <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.csv)}><Icon name="fileJson" size={20} /></span>
            <div><b>{t('fullReportCsvTitle')}</b><small>{exporting === 'csv' ? t('generatingCsv') : t('csvReportReady')}</small></div>
          </button>
          {onImport && (
            <button className="man-export-row" onClick={() => { onClose(); onImport() }}>
              <span className="man-export-ic" style={exportIcon(EXPORT_COLORS.import)}><Icon name="upload" size={20} /></span>
              <div><b>{t('importBankStatement')}</b><small>{t('csvOfxFromBanks')}</small></div>
            </button>
          )}
        </section>
      </div>
    </SheetPortal>
  )
}
