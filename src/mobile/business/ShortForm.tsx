import { Icon } from '@/components/ui/Icon'
import { IconTile } from '@/components/ui/Phrase'
import type { IconName } from '@/types'

/*
 * LA HOJA CORTA (2.8 · N2–N5, U4).
 *
 * El molde de «Aportar» en Metas, que es el formulario mejor resuelto de la
 * app: el monto en grande arriba, una tarjeta con filas que se tocan (cada una
 * abre su teclado o su lista) y, debajo, una tarjeta que dice lo que
 * significa. Sustituye a las columnas de campos con su etiqueta en mayúscula
 * y a las filas de chips de moneda y de ciclo.
 */

/** El monto en grande, que se toca para cambiarlo. */
export function BigAmount({ label, value, sub, missing, empty, onTap }: {
  label: string
  value: string
  sub?: React.ReactNode
  missing?: boolean
  /** Sin monto todavía: el «toca para escribirlo» va en pequeño, no como cifra. */
  empty?: boolean
  onTap: () => void
}) {
  return (
    <div className={`f28-amount${missing || empty ? ' missing' : ''}`}>
      <span className="f28-label">{label}</span>
      <button type="button" onClick={onTap}>{value}</button>
      {sub && <small>{sub}</small>}
    </div>
  )
}

/** La tarjeta de filas. */
export function FormRows({ children }: { children: React.ReactNode }) {
  return <div className="f28-rows">{children}</div>
}

/** Una fila: qué es, a la izquierda; su valor y la flecha, a la derecha. */
export function FormRow({ label, value, placeholder, onTap, missing, tone }: {
  label: string
  value?: React.ReactNode
  placeholder?: string
  onTap?: () => void
  missing?: boolean
  tone?: 'ok' | 'bad'
}) {
  const empty = value === undefined || value === null || value === ''
  return (
    <button type="button" className={`f28-row${missing ? ' missing' : ''}`} onClick={onTap} disabled={!onTap}>
      <span className="f28-row-k">{label}</span>
      <span className={`f28-row-v${empty ? ' empty' : ''}${tone ? ` ${tone}` : ''}`}>{empty ? placeholder : value}</span>
      {onTap && <Icon name="arrowUp" size={12} style={{ transform: 'rotate(90deg)' }} />}
    </button>
  )
}

/** La tarjeta de aviso que dice lo que significa lo que estás llenando. */
export function FormNote({ icon = 'check', color = 'var(--m-income)', title, sub }: {
  icon?: IconName
  color?: string
  title: React.ReactNode
  sub?: React.ReactNode
}) {
  return (
    <div className="f28-note">
      <IconTile icon={icon} color={color} size={34} />
      <span><b>{title}</b>{sub && <small>{sub}</small>}</span>
    </div>
  )
}
