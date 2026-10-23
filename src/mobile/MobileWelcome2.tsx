import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { APP_VERSION } from '@/data/release'
import { useT, type LangKey } from '@/i18n'
import { playSoftHaptic, playConfirmSound } from '@/lib/sound'
import { SheetPortal } from './SheetPortal'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import type { IconName } from '@/types'

/**
 * EL CARTEL DE LA 2.0.
 *
 * Aparece UNA vez, al actualizar a una versión mayor, en vez del historial de
 * cambios de siempre. Una versión que mueve de sitio la mitad de la app
 * necesita decir dónde está lo nuevo; una lista de arreglos no lo hace.
 *
 * ── LO QUE NO HACE, Y POR QUÉ ─────────────────────────────────────────
 * No enseña una sola función de nadie en concreto. Quien actualiza no tiene el
 * negocio de quien escribió la app: lo que se cuenta es QUÉ puede hacer ahora y
 * DÓNDE está, en general, para que cada uno lo lleve a lo suyo.
 *
 * No promete nada que no esté. Cada panel nombra la ruta exacta —el menú, la
 * pestaña, el ajuste— porque un cartel que entusiasma y no dice dónde buscar
 * deja al usuario peor que antes.
 *
 * Se puede cerrar desde el primer panel y con el botón atrás: un cartel que
 * secuestra la app al abrirla es un cartel que molesta, por bonito que sea.
 */

interface Panel {
  icon: IconName
  /** Color del panel. Va siempre sobre una mezcla, nunca como texto suelto. */
  tint: string
  titleKey: LangKey
  textKey: LangKey
  /** Dónde encontrarlo. Vacío en la portada. */
  whereKey?: LangKey
}

const PANELS: Panel[] = [
  {
    icon: 'coins',
    tint: 'var(--m-primary)',
    titleKey: 'w2CoverTitle',
    textKey: 'w2CoverText',
  },
  {
    icon: 'briefcase',
    tint: '#5bc0ff',
    titleKey: 'w2BizTitle',
    textKey: 'w2BizText',
    whereKey: 'w2BizWhere',
  },
  {
    icon: 'refresh',
    tint: '#35d0a2',
    titleKey: 'w2MatchTitle',
    textKey: 'w2MatchText',
    whereKey: 'w2MatchWhere',
  },
  {
    icon: 'shield',
    tint: '#ffd166',
    titleKey: 'w2SafeTitle',
    textKey: 'w2SafeText',
    whereKey: 'w2SafeWhere',
  },
]

export function MobileWelcome2({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [i, setI] = useState(0)
  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const panel = PANELS[i]
  const last = i === PANELS.length - 1

  const next = () => {
    if (last) { playConfirmSound(); onClose(); return }
    playSoftHaptic()
    setI(n => n + 1)
  }

  return (
    <SheetPortal>
      <div
        ref={dialogRef}
        className="mobile-detail-sheet mw2-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={t('w2CoverTitle')}
      >
        <section className="mw2" onClick={e => e.stopPropagation()}>
          <button className="mw2-skip" onClick={onClose}>{t('w2Skip')}</button>

          <div className="mw2-art" style={{ '--tint': panel.tint } as React.CSSProperties}>
            <span className="mw2-ico"><Icon name={panel.icon} size={30} /></span>
          </div>

          {/* La clave en el `key` fuerza el remontaje, y con él la animación de
              entrada: sin eso el texto cambia de golpe y el panel parece el
              mismo con otras palabras. */}
          <div className="mw2-copy" key={panel.titleKey}>
            {i === 0 && <span className="mw2-version">{APP_VERSION}</span>}
            <h2>{t(panel.titleKey)}</h2>
            <p>{t(panel.textKey)}</p>
            {panel.whereKey && (
              <p className="mw2-where">
                <Icon name="info" size={13} />
                <span>{t(panel.whereKey)}</span>
              </p>
            )}
          </div>

          <div className="mw2-dots" aria-hidden="true">
            {PANELS.map((p, n) => (
              <i key={p.titleKey} className={n === i ? 'on' : n < i ? 'done' : ''} />
            ))}
          </div>

          <button className="mw2-next" onClick={next}>
            {last ? t('w2Start') : t('w2Next')}
          </button>
        </section>
      </div>
    </SheetPortal>
  )
}

/**
 * ¿Es esta actualización un salto de versión MAYOR?
 *
 * Solo entonces merece el cartel. Para un 1.9.11 → 1.9.12 el historial de
 * cambios de siempre es exactamente lo adecuado, y un cartel a pantalla
 * completa por tres arreglos sería ruido.
 */
export function isMajorUpgrade(from: string | null, to: string = APP_VERSION): boolean {
  if (!from) return false
  const mayorDe = (v: string) => Number(v.split('.')[0]) || 0
  return mayorDe(to) > mayorDe(from)
}
