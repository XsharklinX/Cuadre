import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { sheetRoot } from '../SheetPortal'
import { Icon } from '@/components/ui/Icon'
import { AccountPickerRow } from '@/components/ui/AccountPickerRow'
import { accountCurrency, dateLocale, fmt } from '@/data/helpers'
import type { GoalStatus } from '@/data/goalPlans'
import { playSoftHaptic } from '@/lib/sound'
import { useT } from '@/i18n'
import type { Account, CurrencyCode, IconName } from '@/types'
import { useMobileBackDismiss } from '../useMobileBackDismiss'
import { useDialogA11y } from '../useDialogA11y'

export const GOAL_COLORS = [
  '#ffdd3d', '#ff6b35', '#e8445a', '#c765ff', '#5e5ce6',
  '#0a84ff', '#30d158', '#ffd60a', '#ff9f0a', '#64d2ff',
]

export const GOAL_ICONS: IconName[] = [
  'target', 'piggy', 'home', 'car', 'plane', 'book', 'heart', 'graduation',
  'gift', 'trophy', 'shield', 'star', 'briefcase', 'wallet', 'laptop', 'phone',
  'gym', 'coffee', 'tree', 'crown', 'map', 'package', 'tool', 'monitor',
  'banknote', 'coins', 'handCoins', 'landmark', 'receipt',
]

export function goalPct(saved: number, target: number): number {
  if (!target) return 0
  return Math.max(0, Math.min(100, Math.round((saved / target) * 100)))
}

/*
 * LOS ANILLOS SE LLENAN AL ENTRAR, UNA VEZ.
 *
 * La primera vez que se abre Metas en la sesión, cada anillo sube desde cero
 * hasta su porcentaje, escalonado tarjeta a tarjeta. Después ya no: un efecto
 * que se repite en cada visita deja de contar algo y pasa a ser espera.
 */
let ringsPlayedThisSession = false
export function useRingsIntro(): boolean {
  const [play] = useState(() => !ringsPlayedThisSession)
  useEffect(() => { ringsPlayedThisSession = true }, [])
  return play
}

export function ProgressRing({
  pct: value, color, size = 56, stroke = 6, children, intro = false, delay = 0,
}: {
  pct: number
  color: string
  size?: number
  stroke?: number
  children?: ReactNode
  /** Llenar desde cero al montar. */
  intro?: boolean
  delay?: number
}) {
  const [shown, setShown] = useState(!intro)
  useEffect(() => {
    if (!intro) return
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
    return () => cancelAnimationFrame(id)
  }, [intro])
  const radius = (size - stroke) / 2
  const c = size / 2
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className="mgl-ring" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} className="mgn-ring-track" pathLength={100} />
        <circle
          cx={c} cy={c} r={radius} fill="none" strokeWidth={stroke} stroke={color}
          pathLength={100}
          strokeDasharray={`${shown ? clamped : 0} 100`}
          strokeLinecap="round"
          className="mgn-ring-value"
          style={{ transitionDelay: intro ? `${delay}ms` : undefined }}
        />
      </svg>
      {children && <span className="mgl-ring-content">{children}</span>}
    </div>
  )
}

/** Texto y tono de la etiqueta de estado. */
export function statusPill(status: GoalStatus, t: ReturnType<typeof useT>, lang: string, money: (n: number) => string):
  { text: string; tone: 'ok' | 'ahead' | 'behind' | 'done' | 'muted' } {
  switch (status.kind) {
    case 'done': return { text: t('statusDone'), tone: 'done' }
    case 'ahead': return { text: t('statusAhead').replace('{n}', String(status.days)), tone: 'ahead' }
    case 'behind': return { text: t('statusBehind').replace('{amount}', money(status.amount)), tone: 'behind' }
    case 'overdue': return { text: t('statusOverdue'), tone: 'behind' }
    case 'onTrack': return {
      text: status.daysLeft > 0 ? t('statusOnTrackDays').replace('{n}', String(status.daysLeft)) : t('statusOnTrack'),
      tone: 'ok',
    }
    case 'pace': return {
      text: t('statusPace').replace('{date}', new Date(`${status.dateISO}T00:00:00`).toLocaleDateString(dateLocale(lang as 'es'), { month: 'short', year: 'numeric' })),
      tone: 'muted',
    }
    default: return { text: t('statusNoPace'), tone: 'muted' }
  }
}

/**
 * Mantener pulsado. Devuelve los manejadores y una función que dice si el
 * último toque fue largo, para que el `onClick` no abra también el detalle.
 */
export function useLongPress(onLong: () => void, ms = 450) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const cancel = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null } }
  return {
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        fired.current = false
        start.current = { x: e.clientX, y: e.clientY }
        cancel()
        timer.current = setTimeout(() => { fired.current = true; playSoftHaptic(); onLong() }, ms)
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (!start.current) return
        if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) cancel()
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** ¿El último toque fue largo? Se consume al leerlo. */
    consumeLong: () => { const was = fired.current; fired.current = false; return was },
  }
}

/** Selector de cuenta propio: logo, nombre y saldo, en vez del menú gris del sistema. */
export function AccountPickSheet({ title, accounts, value, onPick, onClose }: {
  title: string
  accounts: Account[]
  value: string
  onPick: (id: string) => void
  onClose: () => void
}) {
  const t = useT()
  useMobileBackDismiss(true, onClose)
  const ref = useDialogA11y<HTMLDivElement>(onClose, true)
  return createPortal(
    <div ref={ref} className="mobile-detail-sheet" style={{ zIndex: 440 }} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <section onClick={e => e.stopPropagation()}>
        <header>
          <span>{title}</span>
          <button aria-label={t('close')} onClick={onClose}><Icon name="close" size={18} /></button>
        </header>
        <div className="mobile-picker-list">
          {accounts.map(a => (
            <AccountPickerRow key={a.id} account={a} selected={a.id === value} onSelect={() => { onPick(a.id); onClose() }} />
          ))}
        </div>
      </section>
    </div>,
    sheetRoot(),
  )
}

/** Fila que muestra la cuenta elegida y abre el selector. */
export function AccountChoice({ label, account, currency, onOpen }: {
  label: string
  account: Account | undefined
  currency: CurrencyCode
  onOpen: () => void
}) {
  const t = useT()
  return (
    <button type="button" className="mgn-account-choice" onClick={onOpen}>
      <span className="mgn-account-dot" style={{ background: account?.color ?? 'var(--m-muted)' }} />
      <span className="mgn-account-text">
        <small>{label}</small>
        <b>{account ? `${account.name} · ${fmt(account.balance, accountCurrency(account, currency))}` : t('selectLabel')}</b>
      </span>
      <span className="mgn-account-change">{t('changeLabel')}</span>
    </button>
  )
}

/*
 * CONFETI, UNA VEZ.
 *
 * Solo al cerrar una meta. Son 28 trocitos en CSS que caen 1.6 s sobre todo lo
 * demás sin bloquear nada (pointer-events: none). Con «reducir movimiento» no
 * se pinta.
 */
export function Confetti({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(onDone, reduce ? 0 : 1800)
    return () => clearTimeout(id)
  }, [onDone])
  const [pieces] = useState(() => Array.from({ length: 28 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 280,
    color: GOAL_COLORS[i % GOAL_COLORS.length],
    rot: Math.random() * 360,
    dur: 1100 + Math.random() * 600,
  })))
  return createPortal(
    <div className="mgn-confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i key={i} style={{
          left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}ms`,
          animationDuration: `${p.dur}ms`, transform: `rotate(${p.rot}deg)`,
        }} />
      ))}
    </div>,
    sheetRoot(),
  )
}
