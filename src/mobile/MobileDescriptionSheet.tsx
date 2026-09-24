import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { MAX_DESCRIPTION } from '@/store/finance'
import { useT } from '@/i18n'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'

/**
 * LA DESCRIPCIÓN LARGA DE UN MOVIMIENTO.
 *
 * El concepto (`note`) es lo que se ve en la lista: corto, de una línea.
 * Esto es lo demás — con quién fuiste, qué incluía, el número de factura, por
 * qué se pagó. A los tres meses suele ser lo único que explica un gasto.
 *
 * Va en su propia hoja y no en el formulario principal a propósito: es
 * OPCIONAL, y un campo de párrafo siempre visible convierte «apuntar un gasto»
 * en «rellenar un formulario». Quien apunta en la fila del supermercado no
 * escribe un párrafo, y pedírselo es como se consigue que deje de apuntar.
 */
export function MobileDescriptionSheet({ value, onDone, onClose }: {
  value: string
  onDone: (value: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  // El foco se pide con retraso: pedirlo durante la animación de entrada hace
  // que Android abra el teclado a mitad del movimiento y la hoja salte.
  useEffect(() => {
    const id = setTimeout(() => {
      ref.current?.focus()
      // El cursor al FINAL, no al principio: quien reabre esto viene a añadir
      // algo, no a escribir por delante de lo que ya puso.
      const end = ref.current?.value.length ?? 0
      ref.current?.setSelectionRange(end, end)
    }, 80)
    return () => clearTimeout(id)
  }, [])

  const save = () => onDone(text.trim().slice(0, MAX_DESCRIPTION))
  const left = MAX_DESCRIPTION - text.length

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet" role="dialog" aria-modal="true"
        aria-label={t('descriptionLabel')} onClick={onClose}>
        <section className="mdesc-sheet" onClick={e => e.stopPropagation()}>
          <header>
            <span>{t('descriptionLabel')}</span>
            <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
          </header>

          <div className="mdesc-body">
            <textarea
              ref={ref}
              className="mdesc-input"
              value={text}
              maxLength={MAX_DESCRIPTION}
              placeholder={t('descriptionPlaceholder')}
              autoCapitalize="sentences"
              autoCorrect="on"
              rows={6}
              onChange={e => setText(e.target.value)}
            />
            {/* El contador solo aparece cerca del tope. Enseñarlo siempre
                convierte un campo libre en un examen. */}
            {left <= 200 && <span className="mdesc-count">{left}</span>}
          </div>

          <div className="mdesc-actions">
            <button className="mdesc-cancel" onClick={onClose}>{t('cancel')}</button>
            <button className="mdesc-save" onClick={save}>{t('save')}</button>
          </div>
        </section>
      </div>
    </SheetPortal>
  )
}
