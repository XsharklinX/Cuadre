import { useState, useRef } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { useFinance } from '@/store/finance'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import type { TxType } from '@/types'

// ── CSV parser ────────────────────────────────────────────────────────────────

function detectDelimiter(header: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of header) if (ch in counts) counts[ch]++
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

function parseLine(line: string, delim: string): string[] {
  const result: string[] = []
  let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ }
    else if (ch === delim && !inQ) { result.push(cur.trim()); cur = '' }
    else { cur += ch }
  }
  result.push(cur.trim())
  return result
}

function parseCSV(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []
  const delim = detectDelimiter(lines[0])
  return lines.map(l => parseLine(l, delim))
}

// ── Column auto-detection ─────────────────────────────────────────────────────

// Palabras clave genéricas: entre más bancos dominicanos se agreguen aquí, más
// fiable es la auto-detección para TODOS (no hay perfil por banco — un solo
// detector amplio). Banesco, APAP y Qik añadidos junto a los ya cubiertos
// (Banreservas, Popular, Scotiabank, BHD).
const DATE_KEYS  = ['fecha', 'date', 'f.transacción', 'fecha transacción', 'fecha de transacción', 'fecha movimiento', 'fecha operacion', 'fecha operación']
const DESC_KEYS  = ['descripcion', 'descripción', 'description', 'detalle', 'concepto', 'narration', 'referencia', 'transaccion', 'transacción', 'comercio', 'establecimiento']
const DEBIT_KEYS = ['debito', 'débito', 'cargo', 'debit', 'retiro', 'egreso', 'monto débito', 'monto debito', 'envio', 'envío', 'pago enviado']
const CREDIT_KEYS= ['credito', 'crédito', 'abono', 'credit', 'deposito', 'depósito', 'ingreso', 'monto crédito', 'monto credito', 'recibido', 'pago recibido']
const AMOUNT_KEYS= ['monto', 'amount', 'importe', 'valor', 'transaccion', 'monto transaccion', 'monto transacción']

function matchCol(headers: string[], keys: string[]): number {
  return headers.findIndex(h => keys.includes(h.toLowerCase().trim()))
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  const clean = raw.replace(/[^\d,.-]/g, '')
  // Handle both 1.000,50 and 1,000.50 formats
  const s = clean.includes(',') && clean.includes('.')
    ? (clean.lastIndexOf(',') > clean.lastIndexOf('.') ? clean.replace(/\./g, '').replace(',', '.') : clean.replace(/,/g, ''))
    : clean.replace(',', '.')
  return Math.abs(parseFloat(s) || 0)
}

function parseDate(raw: string): string | null {
  if (!raw) return null
  const s = raw.trim()
  // DD/MM/YYYY or DD-MM-YYYY
  const dm = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
  if (dm) return `${dm[3]}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  // MM/DD/YYYY
  const md = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
  if (md) return `${md[3]}-${md[1].padStart(2, '0')}-${md[2].padStart(2, '0')}`
  return null
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ColMap {
  date: number
  desc: number
  mode: 'single' | 'debit_credit'
  amount: number       // used when mode === 'single'
  debit: number        // used when mode === 'debit_credit'
  credit: number       // used when mode === 'debit_credit'
  singleIsExpense: boolean
}

interface ParsedTx {
  date: string
  note: string
  amount: number
  type: TxType
  valid: boolean
}

function buildTxs(rows: string[][], map: ColMap): ParsedTx[] {
  return rows.map(row => {
    const date   = parseDate(row[map.date] ?? '')
    const note   = (row[map.desc] ?? '').replace(/^"|"$/g, '').trim()
    let amount = 0
    let type: TxType = 'expense'

    if (map.mode === 'debit_credit') {
      const debit  = parseAmount(row[map.debit]  ?? '')
      const credit = parseAmount(row[map.credit] ?? '')
      if (credit > 0) { amount = credit; type = 'income' }
      else             { amount = debit;  type = 'expense' }
    } else {
      amount = parseAmount(row[map.amount] ?? '')
      type   = map.singleIsExpense ? 'expense' : 'income'
    }

    return { date: date ?? '', note, amount, type, valid: !!date && amount > 0 }
  })
}

// ── Component ─────────────────────────────────────────────────────────────────

export function MobileCSVImport({ onClose }: { onClose: () => void }) {
  const { accounts, addTx } = useFinance()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]         = useState<'upload' | 'map' | 'confirm'>('upload')
  const [rows, setRows]         = useState<string[][]>([])
  const [headers, setHeaders]   = useState<string[]>([])
  const [colMap, setColMap]     = useState<ColMap>({ date: -1, desc: -1, mode: 'debit_credit', amount: -1, debit: -1, credit: -1, singleIsExpense: true })
  const [accountId, setAccId]   = useState(accounts[0]?.id ?? '')
  const [importing, setImport]  = useState(false)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const loadFile = (text: string) => {
    const parsed = parseCSV(text)
    if (parsed.length < 2) { toast(t('invalidFileNoRows'), { icon: 'alert' }); return }
    const [hdrs, ...data] = parsed
    setHeaders(hdrs)
    setRows(data)
    const map: ColMap = {
      date:  matchCol(hdrs, DATE_KEYS),
      desc:  matchCol(hdrs, DESC_KEYS),
      debit: matchCol(hdrs, DEBIT_KEYS),
      credit:matchCol(hdrs, CREDIT_KEYS),
      amount:matchCol(hdrs, AMOUNT_KEYS),
      mode:  matchCol(hdrs, DEBIT_KEYS) >= 0 && matchCol(hdrs, CREDIT_KEYS) >= 0 ? 'debit_credit' : 'single',
      singleIsExpense: true,
    }
    setColMap(map)
    setStep('map')
  }

  const handleFile = (file: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => loadFile(e.target?.result as string ?? '')
    reader.readAsText(file, 'latin1')
  }

  const txs = step !== 'upload' ? buildTxs(rows, colMap) : []
  const valid = txs.filter(t => t.valid)

  const doImport = async () => {
    if (!accountId) { toast(t('selectAccountPrompt'), { icon: 'alert' }); return }
    setImport(true)
    let count = 0
    for (const tx of valid) {
      addTx({ type: tx.type, amount: tx.amount, date: tx.date, note: tx.note, accountId })
      count++
    }
    toast(t('transactionsImported').replace('{count}', String(count)), { icon: 'check', type: 'ok' })
    setImport(false)
    onClose()
  }

  const pCol = (k: keyof ColMap, v: ColMap[keyof ColMap]) => setColMap(m => ({ ...m, [k]: v }))

  return (
    <div ref={dialogRef} className="mcsv-root" role="dialog" aria-modal="true">
      <header className="mcsv-header">
        <button className="mcsv-back" aria-label={t('back')} onClick={onClose}>
          <Icon name="arrowUp" size={20} style={{ transform: 'rotate(-90deg)' }} />
        </button>
        <strong>{t('importStatementTitle')}</strong>
        <span />
      </header>

      <div className="mcsv-body">

        {/* Step 1 – Upload */}
        {step === 'upload' && (
          <div className="mcsv-upload">
            <div className="mcsv-drop-area" onClick={() => fileRef.current?.click()}>
              <Icon name="fileJson" size={40} style={{ opacity: .3 }} />
              <p>{t('selectBankStatementTitle')}</p>
              <small>{t('formatsCsvOfxTxt')}</small>
              <button className="mcsv-pick-btn">{t('chooseFileLabel')}</button>
            </div>
            <input ref={fileRef} type="file" accept=".csv,.txt,.ofx"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />

            <div className="mcsv-bank-hints">
              <p className="mcsv-bank-label">{t('compatibleBanksLabel')}</p>
              {[
                { name: 'BanReservas', note: t('bankHintBanreservas') },
                { name: 'Banco Popular', note: t('bankHintPopular') },
                { name: 'Scotiabank DR', note: t('bankHintScotia') },
                { name: 'BHD León', note: t('bankHintBhd') },
                { name: 'Banesco', note: t('bankHintBanesco') },
                { name: 'APAP', note: t('bankHintApap') },
                { name: 'Qik', note: t('bankHintQik') },
              ].map(b => (
                <div key={b.name} className="mcsv-bank-row">
                  <b>{b.name}</b>
                  <small>{b.note}</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 – Column mapping */}
        {step === 'map' && (
          <div className="mcsv-map">
            <p className="mcsv-step-label">{t('rowsColumnsDetected').replace('{rows}', String(rows.length)).replace('{cols}', String(headers.length))}</p>

            <div className="mcsv-map-grid">
              <label className="mcsv-map-row">
                <span>{t('date')}</span>
                <select value={colMap.date} onChange={e => pCol('date', Number(e.target.value))}>
                  <option value={-1}>{t('selectPlaceholder')}</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
              <label className="mcsv-map-row">
                <span>{t('descriptionLabel')}</span>
                <select value={colMap.desc} onChange={e => pCol('desc', Number(e.target.value))}>
                  <option value={-1}>{t('selectPlaceholder')}</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </label>
              <label className="mcsv-map-row">
                <span>{t('amountTypeLabel')}</span>
                <select value={colMap.mode}
                  onChange={e => pCol('mode', e.target.value as ColMap['mode'])}>
                  <option value="debit_credit">{t('debitCreditTwoColumns')}</option>
                  <option value="single">{t('singleAmountOption')}</option>
                </select>
              </label>

              {colMap.mode === 'debit_credit' ? (
                <>
                  <label className="mcsv-map-row">
                    <span>{t('debitColumnExpense')}</span>
                    <select value={colMap.debit} onChange={e => pCol('debit', Number(e.target.value))}>
                      <option value={-1}>{t('selectPlaceholder')}</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </label>
                  <label className="mcsv-map-row">
                    <span>{t('creditColumnIncome')}</span>
                    <select value={colMap.credit} onChange={e => pCol('credit', Number(e.target.value))}>
                      <option value={-1}>{t('selectPlaceholder')}</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </label>
                </>
              ) : (
                <>
                  <label className="mcsv-map-row">
                    <span>{t('amountColumnLabel')}</span>
                    <select value={colMap.amount} onChange={e => pCol('amount', Number(e.target.value))}>
                      <option value={-1}>{t('selectPlaceholder')}</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </select>
                  </label>
                  <label className="mcsv-map-row">
                    <span>{t('amountsAreLabel')}</span>
                    <select value={colMap.singleIsExpense ? 'expense' : 'income'}
                      onChange={e => pCol('singleIsExpense', e.target.value === 'expense')}>
                      <option value="expense">{t('expensesDebits')}</option>
                      <option value="income">{t('incomesCredits')}</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {/* Preview first 3 rows */}
            <p className="mcsv-step-label" style={{ marginTop: 16 }}>{t('previewFirst3Rows')}</p>
            <div className="mcsv-preview">
              {txs.slice(0, 3).map((tx, i) => (
                <div key={i} className={`mcsv-preview-row${tx.valid ? '' : ' invalid'}`}>
                  <span className={tx.type === 'income' ? 'mcsv-income' : 'mcsv-expense'}>
                    {tx.type === 'income' ? '+' : '−'}{tx.amount.toLocaleString()}
                  </span>
                  <span className="mcsv-note">{tx.note || '—'}</span>
                  <span className="mcsv-date">{tx.date || t('unknownDateShort')}</span>
                </div>
              ))}
            </div>

            <button className="mcsv-next-btn"
              disabled={colMap.date < 0 || colMap.desc < 0}
              onClick={() => setStep('confirm')}>
              {t('continueValidTransactions').replace('{count}', String(valid.length))}
            </button>
          </div>
        )}

        {/* Step 3 – Confirm */}
        {step === 'confirm' && (
          <div className="mcsv-confirm">
            <div className="mcsv-confirm-hero">
              <strong>{valid.length}</strong>
              <span>{t('transactionsReadyToImport')}</span>
            </div>

            <label className="mcsv-map-row">
              <span>{t('destinationAccount')}</span>
              <select value={accountId} onChange={e => setAccId(e.target.value)}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </label>

            <div className="mcsv-preview" style={{ maxHeight: 260 }}>
              {txs.filter(tx => tx.valid).slice(0, 10).map((tx, i) => (
                <div key={i} className="mcsv-preview-row">
                  <span className={tx.type === 'income' ? 'mcsv-income' : 'mcsv-expense'}>
                    {tx.type === 'income' ? '+' : '−'}{tx.amount.toLocaleString()}
                  </span>
                  <span className="mcsv-note">{tx.note || '—'}</span>
                  <span className="mcsv-date">{tx.date}</span>
                </div>
              ))}
              {valid.length > 10 && (
                <p style={{ textAlign: 'center', color: 'var(--m-muted)', fontSize: 13, padding: '8px 0' }}>
                  {t('moreEllipsis').replace('{count}', String(valid.length - 10))}
                </p>
              )}
            </div>

            <div className="mcsv-confirm-actions">
              <button className="mcsv-back-btn" onClick={() => setStep('map')}>← {t('back')}</button>
              <button className="mcsv-import-btn" disabled={importing || !accountId}
                onClick={doImport}>
                {importing ? t('importingLabel') : t('importCountLabel').replace('{count}', String(valid.length))}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
