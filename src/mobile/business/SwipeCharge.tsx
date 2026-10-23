import { Icon } from '@/components/ui/Icon'
import { useT } from '@/i18n'
import { useSwipeAction } from '@/hooks/useSwipeAction'

/**
 * UNA FILA DE COBRO QUE SE DESLIZA.
 *
 * ── LO QUE ENVUELVE ───────────────────────────────────────────────────
 * La fila de siempre, sin tocarla. Detrás pone el fondo verde con «me pagó»,
 * que asoma a medida que el dedo cruza.
 *
 * ── POR QUÉ NO COBRA DIRECTAMENTE ─────────────────────────────────────
 * Cobrar necesita decidir el monto y la cuenta, y un cobro parcial es normal.
 * Así que el gesto abre la hoja con todo listo en vez de dar el cobro por
 * hecho: es un atajo al formulario, no un atajo que se salta el formulario.
 * La diferencia importa porque esto crea un movimiento en el libro.
 */
export function SwipeCharge({
  onCollect, children, disabled,
}: {
  onCollect: () => void
  children: React.ReactNode
  disabled?: boolean
}) {
  const t = useT()
  const ref = useSwipeAction<HTMLDivElement>(onCollect, !disabled)

  return (
    <div className="mbiz-swipe">
      {/* El fondo, que se ve conforme la fila se aparta. */}
      <span className="mbiz-swipe-bg" aria-hidden="true">
        <Icon name="check" size={15} />
        {t('bizSwipePaid')}
      </span>
      <div ref={ref} className="mbiz-swipe-row">
        {children}
      </div>
    </div>
  )
}
