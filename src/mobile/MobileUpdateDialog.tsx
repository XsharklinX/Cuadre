import { useEffect, useRef, useState } from 'react'
import { BrandMark } from '@/components/ui/BrandMark'
import { Icon } from '@/components/ui/Icon'
import { toast } from '@/components/ui/Toast'
import { installUpdate, onUpdateProgress, startUpdate } from '@/lib/inAppUpdate'
import { snoozed } from '@/data/updatePrompt'
import { useSettings } from '@/store/settings'
import { useT } from '@/i18n'
import type { UpdateOffer } from '@/hooks/useUpdateCheck'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { useDialogA11y } from './useDialogA11y'
import { SheetPortal } from './SheetPortal'

/**
 * «HAY UNA VERSIÓN NUEVA».
 *
 * Antes este botón abría la ficha de Google Play y ahí terminaba nuestro
 * trabajo: la persona tenía que encontrar el botón «Actualizar» dentro de la
 * tienda. Cada paso que se le deja por hacer a alguien es gente que se cae por
 * el camino, y actualizar es justo lo que no podemos permitirnos que se caiga
 * — es como llegan los arreglos de saldos a quien los necesita.
 *
 * Ahora la descarga ocurre AQUÍ. Tres estados y nada más:
 *
 *   1. ofrecer   → «Actualizar»
 *   2. bajando   → barra de progreso, y la app se sigue usando
 *   3. instalar  → «Reiniciar e instalar»
 *
 * El reinicio se PIDE, nunca se hace solo: reiniciar a alguien a media frase
 * mientras escribe un gasto es perderle el gasto y la confianza a la vez.
 */
export function MobileUpdateDialog({ offer, onDismiss }: {
  offer: UpdateOffer
  onDismiss: () => void
}) {
  const t = useT()
  const setUpdateSnooze = useSettings(s => s.setUpdateSnooze)
  const updateSnooze = useSettings(s => s.updateSnooze)

  const [phase, setPhase] = useState<'offer' | 'downloading' | 'ready'>(
    offer.decision.mode === 'install' ? 'ready' : 'offer',
  )
  const [progress, setProgress] = useState(0)
  const unlisten = useRef<(() => void) | null>(null)

  /*
   * En modo obligado no hay «ahora no» ni se puede cerrar tocando fuera: la
   * copia lleva semanas de retraso y se está perdiendo arreglos que afectan a
   * su dinero. Es el único caso en que quitamos la salida, y por eso el umbral
   * es alto.
   */
  const forced = offer.decision.mode === 'immediate'

  const later = () => {
    setUpdateSnooze(snoozed(offer.status, updateSnooze, Date.now()))
    onDismiss()
  }

  useMobileBackDismiss(!forced, later)
  const dialogRef = useDialogA11y<HTMLDivElement>(forced ? () => {} : later, !forced)

  // El oyente del progreso se suelta al desmontar: uno que sobrevive al
  // diálogo sigue recibiendo eventos y escribiendo en un estado que ya no
  // existe.
  useEffect(() => () => { unlisten.current?.() }, [])

  const begin = async () => {
    if (forced) {
      // Pantalla completa de Google: toma el control y reinicia la app sola.
      const ok = await startUpdate(true)
      if (!ok) toast(t('updateCouldNotStart'), { icon: 'alert' })
      return
    }

    setPhase('downloading')
    unlisten.current = await onUpdateProgress(p => {
      const pct = p.totalBytesToDownload > 0
        ? Math.round((p.bytesDownloaded / p.totalBytesToDownload) * 100)
        : 0
      setProgress(pct)
      if (p.downloaded) setPhase('ready')
    })

    const ok = await startUpdate(false)
    if (!ok) {
      unlisten.current?.()
      setPhase('offer')
      toast(t('updateCouldNotStart'), { icon: 'alert' })
    }
  }

  const finish = async () => {
    const ok = await installUpdate()
    if (!ok) toast(t('updateCouldNotInstall'), { icon: 'alert' })
  }

  return (
    <SheetPortal>
      <div
        className="mobile-detail-sheet centered"
        role="dialog"
        aria-modal="true"
        aria-label={t('updateAvailableTitle')}
        onClick={forced ? undefined : later}
      >
        <section ref={dialogRef} className="mup-card" onClick={e => e.stopPropagation()}>
          {!forced && phase === 'offer' && (
            <button className="mup-close" aria-label={t('close')} onClick={later}>
              <Icon name="close" size={16} />
            </button>
          )}

          <BrandMark size={56} className="mup-brand" />
          <h2>{phase === 'ready' ? t('updateReadyTitle') : t('updateAvailableTitle')}</h2>

          <p>
            {phase === 'ready' ? t('updateReadyDesc')
              : forced ? t('updateForcedDesc')
              : t('updateAvailableDescShort')}
          </p>

          {phase === 'downloading' && (
            <div className="mup-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <i style={{ width: `${Math.max(4, progress)}%` }} />
            </div>
          )}

          {phase === 'offer' && (
            <button className="mup-cta" onClick={() => void begin()}>
              <Icon name="download" size={16} /> {t('updateNow')}
            </button>
          )}

          {phase === 'downloading' && (
            <>
              <span className="mup-progress-label">
                {t('updateDownloading').replace('{pct}', String(progress))}
              </span>
              {/* Se puede cerrar mientras baja: la descarga sigue de fondo. Si
                  no se pudiera, el modo "flexible" no sería flexible. */}
              {!forced && (
                <button className="mup-later" onClick={onDismiss}>{t('updateKeepUsing')}</button>
              )}
            </>
          )}

          {phase === 'ready' && (
            <button className="mup-cta" onClick={() => void finish()}>
              <Icon name="check" size={16} /> {t('updateRestartInstall')}
            </button>
          )}

          {!forced && phase === 'offer' && (
            <button className="mup-later" onClick={later}>{t('remindLater')}</button>
          )}
        </section>
      </div>
    </SheetPortal>
  )
}
