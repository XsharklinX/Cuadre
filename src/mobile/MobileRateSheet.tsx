import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { useRating } from '@/store/rating'
import { useT } from '@/i18n'
import { playSoftHaptic, playSuccessHaptic } from '@/lib/sound'
import { openStoreReview } from './MobileRatingPrompt'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * VALORAR CUADRE — a voluntad, desde Ajustes.
 *
 * La app ya sabía pedir una valoración, pero SOLO por su cuenta: aparecía sola
 * tras un tiempo de uso y, una vez respondida, no había forma de volver a ella.
 * A quien le gusta la app y quiere dejar cinco estrellas no le quedaba ningún
 * camino salvo buscarla a mano en Play.
 *
 * LAS ESTRELLAS DECIDEN A DÓNDE VA.
 *
 * Con 4 o 5 se abre Play. Con 3 o menos se abre el formulario de comentarios,
 * que llega a un correo que se puede leer y contestar. No es para maquillar la
 * nota: es que una queja en Play se queda ahí para siempre y no se puede ni
 * responder ni arreglar, mientras que por correo sí. Quien insista en dejarla
 * en la tienda puede ir igual — el enlace está siempre debajo.
 */
const GOES_TO_STORE_FROM = 4

export function MobileRateSheet({ onClose, onFeedback }: {
  onClose: () => void
  /** Abre el formulario de comentarios de la app. */
  onFeedback: () => void
}) {
  const t = useT()
  const markRated = useRating(s => s.markRated)
  const [picked, setPicked] = useState(0)
  const [hover, setHover] = useState(0)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const choose = async (stars: number) => {
    setPicked(stars)
    playSoftHaptic()
    // Pequeña pausa para que se vea la estrella encenderse antes de saltar:
    // sin ella, tocar y que la pantalla cambie de golpe se siente como un error.
    await new Promise(r => setTimeout(r, 260))

    if (stars >= GOES_TO_STORE_FROM) {
      playSuccessHaptic()
      await openStoreReview()
      markRated()
      onClose()
      return
    }
    onClose()
    onFeedback()
  }

  const shown = hover || picked

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet centered" role="dialog" aria-modal="true"
        aria-labelledby="mrs-title" onClick={onClose}>
        <section className="mrs-sheet" onClick={e => e.stopPropagation()}>
          <button className="mrs-close" aria-label={t('close')} onClick={onClose}>
            <Icon name="close" size={16} />
          </button>

          <span className="mrs-mark"><Icon name="brand" size={40} /></span>
          <h2 className="mrs-title" id="mrs-title">{t('rateAppTitle')}</h2>
          <p className="mrs-body">{t('rateAppBody')}</p>

          <div className="mrs-stars" role="radiogroup" aria-label={t('rateAppTitle')}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                role="radio"
                aria-checked={picked === n}
                aria-label={t('rateStarsAria').replace('{n}', String(n))}
                className={`mrs-star${n <= shown ? ' on' : ''}`}
                onPointerEnter={() => setHover(n)}
                onPointerLeave={() => setHover(0)}
                onClick={() => void choose(n)}
              >
                <Icon name="star" size={30} />
              </button>
            ))}
          </div>

          {/* Siempre visible: quien quiera ir a la tienda directamente, sin
              pasar por las estrellas, no tiene por qué dar un rodeo. */}
          <button className="mrs-direct" onClick={() => { void openStoreReview(); markRated(); onClose() }}>
            {t('rateOpenStore')}
          </button>
        </section>
      </div>
    </SheetPortal>
  )
}
