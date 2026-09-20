import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { createBackup } from '@/data/backup'
import { MAX_FRAME_CHARS, buildTransferFrames, compressPayload } from '@/data/qrTransfer'
import { saveBackup } from '@/hooks/useTauri'
import { useFinance } from '@/store/finance'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'

/**
 * Migración por QR: un ÚNICO código estático. Nada de partes que cambian solas
 * — eso era imposible de escanear. Se comprime (gzip) el backup y, si cabe en un
 * solo código, se muestra fijo con un botón para regenerarlo (refresh). Si los
 * datos son demasiado grandes para un solo QR, no se cae en el modo cíclico:
 * se ofrece migrar por archivo de respaldo, que no tiene límite de tamaño.
 */
export function MobileQrExport({ onClose }: { onClose: () => void }) {
  const t = useT()
  const finance = useFinance()
  const [qrImg, setQrImg] = useState<string | null>(null)
  const [frame, setFrame] = useState<string | null>(null)
  const [tooLarge, setTooLarge] = useState(false)
  const [building, setBuilding] = useState(true)
  // Cambiar este contador rehace la instantánea desde los datos actuales.
  const [refreshTick, setRefreshTick] = useState(0)
  const [savingFile, setSavingFile] = useState(false)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  // Comprime el backup y decide: ¿cabe en un solo código? Se recalcula al abrir
  // y cada vez que el usuario pulsa "actualizar".
  useEffect(() => {
    let cancelled = false
    setBuilding(true)
    setQrImg(null)
    void (async () => {
      const payload = JSON.stringify(createBackup(finance))
      const compressed = await compressPayload(payload)
      const transferId = Math.random().toString(36).slice(2, 8)
      const frames = buildTransferFrames(compressed, MAX_FRAME_CHARS, transferId)
      if (cancelled) return
      if (frames.length === 1) {
        setFrame(frames[0])
        setTooLarge(false)
      } else {
        setFrame(null)
        setTooLarge(true)
      }
      setBuilding(false)
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick])

  // Renderiza el código a imagen. `generation` descarta resultados de un frame
  // anterior si llega tarde tras un refresh.
  const generation = useRef(0)
  useEffect(() => {
    if (!frame) return
    let cancelled = false
    const myGen = ++generation.current
    void (async () => {
      const QRCode = (await import('qrcode')).default
      const dataUrl = await QRCode.toDataURL(frame, { errorCorrectionLevel: 'L', margin: 1, width: 300 })
      if (!cancelled && generation.current === myGen) setQrImg(dataUrl)
    })()
    return () => { cancelled = true }
  }, [frame])

  const saveFile = async () => {
    if (savingFile) return
    setSavingFile(true)
    try {
      const json = JSON.stringify(createBackup(finance), null, 2)
      const ok = await saveBackup(json)
      if (ok) toast(t('qrExportFileSaved'), { icon: 'check', type: 'ok' })
    } finally {
      setSavingFile(false)
    }
  }

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" aria-label={t('qrExportTitle')} onClick={onClose}>
        <section className="mqr-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('qrExportTitle')}</span>
            <div className="mqr-header-actions">
              {!tooLarge && (
                <button className="mqr-refresh" aria-label={t('qrExportRefreshLabel')} disabled={building} onClick={() => setRefreshTick(n => n + 1)}>
                  <Icon name="refresh" size={17} />
                </button>
              )}
              <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
            </div>
          </header>

          <div className="mqr-body">
            {tooLarge ? (
              <div className="mqr-toolarge">
                <span className="mqr-toolarge-icon"><Icon name="alert" size={26} /></span>
                <strong>{t('qrExportTooLargeTitle')}</strong>
                <p>{t('qrExportTooLargeDesc')}</p>
                <button className="mset-sheet-confirm" disabled={savingFile} onClick={() => void saveFile()}>
                  <Icon name="download" size={16} style={{ marginRight: 8 }} />
                  {savingFile ? t('qrExportSavingFile') : t('qrExportSaveFileBtn')}
                </button>
              </div>
            ) : (
              <>
                <p className="mqr-hint">{t('qrExportHintSingle')}</p>
                <div className="mqr-frame">
                  {qrImg
                    ? <img src={qrImg} alt={t('qrExportTitle')} />
                    : <div className="mqr-frame-loading" />}
                </div>
                <p className="mqr-static-note">
                  <Icon name="refresh" size={12} /> {t('qrExportRefreshHint')}
                </p>
              </>
            )}
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}
