import { useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { localToday } from '@/data/helpers'
import { noteSuggestions, normalizeNote } from '@/data/noteSuggestions'
import { useFinance } from '@/store/finance'

/**
 * Lo que ya escribiste antes, listo para tocar.
 *
 * Vive en un componente propio porque se usa en los DOS sitios donde se
 * teclea un concepto: la fila rápida de "Añadir" y la hoja de texto de las
 * suscripciones. Copiarla habría sido repetir el error del selector de
 * cuentas, que estaba clonado en tres pantallas con tres formatos distintos.
 *
 * Se pinta SIEMPRE encima del campo, nunca debajo: debajo está el teclado, y
 * una lista que aparece bajo el dedo se toca sin querer.
 */
export function NoteSuggestionList({ query, categoryId, onPick }: {
  /** Lo que el usuario lleva tecleado. */
  query: string
  /** Categoría activa: lo escrito en ella va primero. */
  categoryId?: string
  onPick: (text: string) => void
}) {
  const transactions = useFinance(s => s.transactions)

  const items = useMemo(() => {
    const all = noteSuggestions({ transactions, categoryId, query, today: localToday() })
    // Lo que ya está escrito entero no se ofrece: sería una fila que al
    // tocarla no hace nada.
    return all.filter(s => normalizeNote(s.text) !== normalizeNote(query))
  }, [transactions, categoryId, query])

  if (items.length === 0) return null

  return (
    <ul className="mnotesug" role="listbox">
      {items.map(item => (
        <li key={item.text}>
          {/* `onMouseDown` + preventDefault: sin esto el campo pierde el foco
              ANTES de que llegue el click, la lista se desmonta y tocar una
              sugerencia no hace nada. */}
          <button
            type="button"
            role="option"
            aria-selected={false}
            onMouseDown={e => e.preventDefault()}
            onClick={() => onPick(item.text)}
          >
            <Icon name="repeat" size={13} className="mnotesug-ico" />
            <span>{item.text}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
