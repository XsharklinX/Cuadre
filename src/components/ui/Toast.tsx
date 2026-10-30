import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from './Icon'
import type { IconName } from '@/types'
import { tt } from '@/i18n'

interface ToastAction {
  label:   string
  onClick: () => void
}

interface ToastItem {
  id:       string
  msg:      string
  icon?:    IconName
  type?:    'ok' | 'warn' | 'error'
  duration?: number
  action?:  ToastAction     // ← botón de acción (ej. "Deshacer")
}

type ToastFn = (msg: string, opts?: Omit<ToastItem, 'id' | 'msg'>) => void

const EXIT_MS = 220
const GROUP_ID = '__grouped__'
/** El shell escucha este evento para abrir la campanita desde un aviso agrupado. */
export const OPEN_NOTIFICATIONS_EVENT = 'cuadre:open-notifications'

let _fn: ToastFn | null = null

export const toast: ToastFn = (msg, opts) => _fn?.(msg, opts ?? {})

let _onScreen = 0
/** Cuántos avisos hay en pantalla ahora. Para no apilar uno nuevo encima. */
export const toastsOnScreen = () => _onScreen

// Cuando no se pasa `type` explícito, se infiere del icono: la mayoría de los
// más de 50 llamados a toast() en la app solo pasan icon:'alert' para errores
// y nunca marcaron type:'warn' — inferirlo aquí da color correcto sin tocar
// cada call site.
function toneOf(item: ToastItem): 'ok' | 'warn' | 'error' | 'neutral' {
  if (item.type) return item.type
  if (item.icon === 'alert') return 'error'
  if (item.icon === 'check') return 'ok'
  return 'neutral'
}

function ToastRow({ item, leaving, onDismiss }: { item: ToastItem; leaving: boolean; onDismiss: (id: string) => void }) {
  const startX = useRef(0)
  const [dragX, setDragX] = useState(0)
  const tone = toneOf(item)

  return (
    <div
      className={`toast toast-${tone}${item.action ? ' has-action' : ''}${leaving ? ' leaving' : ''}`}
      style={dragX ? { transform: `translateX(${dragX}px)`, opacity: Math.max(0, 1 - Math.abs(dragX) / 120) } : undefined}
      onTouchStart={e => { startX.current = e.touches[0]?.clientX ?? 0 }}
      onTouchMove={e => {
        const delta = (e.touches[0]?.clientX ?? 0) - startX.current
        setDragX(delta)
      }}
      onTouchEnd={() => {
        if (Math.abs(dragX) > 70) onDismiss(item.id)
        else setDragX(0)
      }}
    >
      <span className="toast-icon">
        <Icon name={item.icon ?? 'brand'} size={15} />
      </span>
      <span className="toast-msg">{item.msg}</span>
      {item.action && (
        <button
          className="toast-action"
          onClick={() => { item.action!.onClick(); onDismiss(item.id) }}>
          {item.action.label}
        </button>
      )}
      <button className="toast-close" aria-label="Close" onClick={() => onDismiss(item.id)}>
        <Icon name="close" size={12} />
      </button>
    </div>
  )
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([])
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set())

  // Lo que hay en pantalla, leído sin esperar al render (para agrupar).
  const itemsRef = useRef<ToastItem[]>([])
  const put = useCallback((next: ToastItem[]) => { itemsRef.current = next; _onScreen = next.length; setItems(next) }, [])

  const dismiss = useCallback((id: string) => {
    setLeavingIds(x => new Set(x).add(id))
    setTimeout(() => {
      put(itemsRef.current.filter(i => i.id !== id))
      setLeavingIds(x => { const n = new Set(x); n.delete(id); return n })
    }, EXIT_MS)
  }, [put])

  /*
   * B3 · LOS AVISOS NO SE AMONTONAN.
   *
   * Al abrir la app podían llegar cinco seguidos («4 movimientos recurrentes
   * generados», «Vas al 93 % de Comida», «Superaste el presupuesto de…») y
   * tapaban media pantalla, justo lo que el usuario acababa de abrir. A partir
   * del tercer aviso informativo que coincide en pantalla se juntan en uno:
   * «5 avisos · Ver», que abre la campanita. Los que llevan acción (Deshacer)
   * nunca se juntan: esa acción solo vale unos segundos.
   */
  const grouped = useRef<string[]>([])
  const groupTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const fire = useCallback<ToastFn>((msg, opts = {}) => {
    const x = itemsRef.current
    const hayGrupo = x.some(i => i.id === GROUP_ID)
    const sueltos = x.filter(i => !i.action && i.id !== GROUP_ID)
    if (opts.action || (sueltos.length < 2 && !hayGrupo)) {
      const id  = Math.random().toString(36).slice(2)
      const dur = opts.duration ?? (opts.action ? 5000 : 2800)
      put([...x, { id, msg, ...opts }])
      setTimeout(() => dismiss(id), dur)
      return
    }
    grouped.current = [...(hayGrupo ? grouped.current : sueltos.map(i => i.msg)), msg]
    const group: ToastItem = {
      id: GROUP_ID,
      msg: tt('toastGrouped', { n: grouped.current.length, first: grouped.current[0] }),
      icon: 'bell',
      action: { label: tt('toastSeeAll'), onClick: () => window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATIONS_EVENT)) },
    }
    setLeavingIds(l => { const n = new Set(l); n.delete(GROUP_ID); return n })
    put([...x.filter(i => i.action && i.id !== GROUP_ID), group])
    clearTimeout(groupTimer.current)
    groupTimer.current = setTimeout(() => { grouped.current = []; dismiss(GROUP_ID) }, 6000)
  }, [dismiss, put])

  useEffect(() => {
    _fn = fire
    return () => { _fn = null }
  }, [fire])

  return (
    <div className="toast-host">
      {items.map(i => (
        <ToastRow key={i.id} item={i} leaving={leavingIds.has(i.id)} onDismiss={dismiss} />
      ))}
    </div>
  )
}
