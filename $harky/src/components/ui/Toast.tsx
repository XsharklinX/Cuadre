import { useState, useEffect, useCallback, useRef } from 'react'
import { Icon } from './Icon'
import type { IconName } from '@/types'

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

let _fn: ToastFn | null = null

export const toast: ToastFn = (msg, opts) => _fn?.(msg, opts ?? {})

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
        <Icon name={item.icon ?? 'shark'} size={15} />
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

  const dismiss = useCallback((id: string) => {
    setLeavingIds(x => new Set(x).add(id))
    setTimeout(() => setItems(x => x.filter(i => i.id !== id)), EXIT_MS)
  }, [])

  const fire = useCallback<ToastFn>((msg, opts = {}) => {
    const id  = Math.random().toString(36).slice(2)
    const dur = opts.duration ?? (opts.action ? 5000 : 2800)
    setItems(x => [...x, { id, msg, ...opts }])
    setTimeout(() => dismiss(id), dur)
  }, [dismiss])

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
