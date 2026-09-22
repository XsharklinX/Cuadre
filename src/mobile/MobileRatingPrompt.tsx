import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { playStoreUrls } from '@/data/ratingPrompt'
import { useT } from '@/i18n'
import { playSoftHaptic, playSuccessHaptic } from '@/lib/sound'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

const PACKAGE_NAME = 'com.sharky.miapp'

/**
 * Abre la ficha de Play Store en el diálogo de valoración. Intenta primero el
 * esquema `market://`, que abre la app de Play directamente; si no hay Play
 * instalado (emulador, dispositivo sin GMS), cae al navegador.
 */
async function openStoreReview(): Promise<void> {
  const { app, web } = playStoreUrls(PACKAGE_NAME)
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    try {
      await openUrl(app)
      return
    } catch {
      await openUrl(web)
      return
    }
  } catch {
    // Fuera de Tauri (web/PWA): el navegador se encarga.
    window.open(web, '_blank', 'noopener')
  }
}

type Step = 'asking' | 'happy' | 'unhappy'

/**
 * VALORAR LA APP — en dos pasos, nunca en uno.
 *
 * El primer paso pregunta cómo le va al usuario; solo si la respuesta es buena
 * se le ofrece ir a la tienda. Mandar a Play a alguien molesto es pedirle que
 * escriba su queja donde no se puede responder ni arreglar: esa reseña se
 * queda ahí para siempre.
 *
 * Si la respuesta es mala, el diálogo se convierte en una vía para contar qué
 * falló. Es la misma pregunta, pero llevada a donde sí se puede hacer algo.
 */
export function MobileRatingPrompt({
  onRated,
  onSnooze,
  onFeedback,
}: {
  onRated: () => void
  onSnooze: () => void
  /** Abre el canal de comentarios de la app. */
  onFeedback?: () => void
}) {
  const t = useT()
  const [step, setStep] = useState<Step>('asking')

  // Cerrar con el botón atrás cuenta como "ahora no", nunca como valorado.
  useMobileBackDismiss(true, onSnooze)
  const dialogRef = useDialogA11y<HTMLDivElement>(onSnooze)

  const goToStore = async () => {
    playSuccessHaptic()
    await openStoreReview()
    // Se marca como valorado al ENVIARLO a la tienda, no al volver: no hay
    // forma de saber si de verdad valoró, y preguntar otra vez a quien ya fue
    // es peor que no contarlo.
    onRated()
  }

  return (
    <SheetPortal>
      <div
        ref={dialogRef}
        className="mobile-detail-sheet mrate-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mrate-title"
        onClick={onSnooze}
      >
        <section className="mrate-sheet" onClick={e => e.stopPropagation()}>
          {/* El tiburón, grande y centrado. Es el único sitio de la app donde
              la marca se muestra por sí misma. */}
          <div className="mrate-art" aria-hidden="true">
            <span className="mrate-glow" />
            <span className="mrate-mark"><Icon name="brand" size={44} /></span>
            <span className="mrate-stars">
              {[0, 1, 2, 3, 4].map(i => (
                <i key={i} style={{ animationDelay: `${i * 70}ms` }}><Icon name="star" size={16} /></i>
              ))}
            </span>
          </div>

          {step === 'asking' && (
            <>
              <h2 className="mrate-title" id="mrate-title">{t('rateHowIsItGoing')}</h2>
              <p className="mrate-body">{t('rateHowIsItGoingBody')}</p>
              <div className="mrate-actions">
                <button
                  className="mrate-primary"
                  onClick={() => { playSoftHaptic(); setStep('happy') }}
                >
                  <Icon name="heart" size={16} />
                  {t('rateGoingWell')}
                </button>
                <button
                  className="mrate-secondary"
                  onClick={() => { playSoftHaptic(); setStep('unhappy') }}
                >
                  {t('rateCouldBeBetter')}
                </button>
              </div>
              <button className="mrate-dismiss" onClick={onSnooze}>{t('rateNotNow')}</button>
            </>
          )}

          {step === 'happy' && (
            <>
              <h2 className="mrate-title" id="mrate-title">{t('rateThanksTitle')}</h2>
              <p className="mrate-body">{t('rateStoreBody')}</p>
              <div className="mrate-actions">
                <button className="mrate-primary" onClick={() => void goToStore()}>
                  <Icon name="star" size={16} />
                  {t('rateOnPlayStore')}
                </button>
              </div>
              <button className="mrate-dismiss" onClick={onSnooze}>{t('rateNotNow')}</button>
            </>
          )}

          {step === 'unhappy' && (
            <>
              <h2 className="mrate-title" id="mrate-title">{t('rateSorryTitle')}</h2>
              <p className="mrate-body">{t('rateSorryBody')}</p>
              <div className="mrate-actions">
                {onFeedback && (
                  <button
                    className="mrate-primary"
                    onClick={() => { onSnooze(); onFeedback() }}
                  >
                    <Icon name="edit" size={16} />
                    {t('rateTellUs')}
                  </button>
                )}
              </div>
              <button className="mrate-dismiss" onClick={onSnooze}>{t('close')}</button>
            </>
          )}
        </section>
      </div>
    </SheetPortal>
  )
}
