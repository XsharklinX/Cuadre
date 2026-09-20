import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { parseBackup } from '@/data/backup'
import { QrTransferReceiver, decompressPayload } from '@/data/qrTransfer'
import { useFinance } from '@/store/finance'
import { useNotes } from '@/store/notes'
import { useT } from '@/i18n'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'

export function MobileQrImport({ onClose }: { onClose: () => void }) {
  const t = useT()
  const finance = useFinance()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const receiverRef = useRef(new QrTransferReceiver())
  const rafRef = useRef<number | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const doneRef = useRef(false)

  const [received, setReceived] = useState(0)
  const [total, setTotal] = useState(0)
  const [cameraError, setCameraError] = useState(false)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  useEffect(() => {
    let cancelled = false

    const scanLoop = async () => {
      const { default: jsQR } = await import('jsqr')
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return

      const tick = () => {
        if (cancelled || doneRef.current) return
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          const result = jsQR(imageData.data, imageData.width, imageData.height)
          if (result?.data) {
            const added = receiverRef.current.addFrame(result.data)
            if (added) {
              setReceived(receiverRef.current.receivedCount)
              setTotal(receiverRef.current.totalCount)
              if (receiverRef.current.isComplete) {
                doneRef.current = true
                void finishImport()
                return
              }
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    const finishImport = async () => {
      const compressed = receiverRef.current.assemble()
      stopCamera()
      if (!compressed) {
        toast(t('qrImportInvalidData'), { icon: 'alert' })
        onClose()
        return
      }
      try {
        const payload = await decompressPayload(compressed)
        const data = parseBackup(payload)
        finance.restoreBackup(data)
        useNotes.getState().importNotes(data.notes ?? [])
        toast(t('qrImportSuccessToast'), { icon: 'check', type: 'ok' })
        onClose()
      } catch (error) {
        toast(error instanceof Error ? error.message : t('qrImportInvalidData'), { icon: 'alert' })
        onClose()
      }
    }

    const stopCamera = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      streamRef.current?.getTracks().forEach(track => track.stop())
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        void scanLoop()
      } catch {
        if (!cancelled) setCameraError(true)
      }
    })()

    return () => {
      cancelled = true
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" style={{ zIndex: 420 }} role="dialog" aria-modal="true" aria-label={t('qrImportTitle')} onClick={onClose}>
        <section className="mqr-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('qrImportTitle')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>

          <div className="mqr-body">
            {cameraError ? (
              <div className="mqr-camera-error">
                <Icon name="alert" size={32} />
                <p>{t('qrImportCameraError')}</p>
              </div>
            ) : (
              <>
                <div className="mqr-video-frame">
                  <video ref={videoRef} muted playsInline autoPlay />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div className="mqr-video-reticle" />
                </div>
                <p className="mqr-hint">{total > 1 ? t('qrImportProgress').replace('{received}', String(received)).replace('{total}', String(total)) : t('qrImportWaiting')}</p>
                {total > 1 && (
                  <div className="mqr-progress-track">
                    <div className="mqr-progress-fill" style={{ width: `${(received / total) * 100}%` }} />
                  </div>
                )}
                <p className="mqr-overwrite-warning">{t('qrImportOverwriteWarning')}</p>
              </>
            )}
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}
