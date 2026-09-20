import { useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { APP_VERSION, RELEASE_NOTES, countByKind, parseReleaseItems, type ReleaseItemKind } from '@/data/release'
import { dateLocale } from '@/data/helpers'
import { useT } from '@/i18n'
import { useSettings } from '@/store/settings'
import { useDialogA11y } from './useDialogA11y'
import { useMobileBackDismiss } from './useMobileBackDismiss'
import { SheetPortal } from './SheetPortal'

const SEEN_KEY = 'sharky-seen-version-v1'

/** Compara dos versiones semánticas. >0 si `a` es más nueva que `b`. */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** La última versión cuyas novedades ya vio el usuario. */
function readSeenVersion(): string | null {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    // Modo privado o almacenamiento bloqueado: se trata como "ya visto" para
    // no mostrar las novedades en cada arranque, que seria peor que no verlas.
    return APP_VERSION
  }
}

export function markVersionSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, APP_VERSION)
  } catch {
    // Sin almacenamiento no hay nada que recordar; no es un error que deba
    // interrumpir nada.
  }
}

/**
 * ¿Hay que mostrar las novedades ahora mismo?
 *
 * Solo tras una ACTUALIZACIÓN real, nunca en una instalación nueva: a quien
 * abre la app por primera vez, un changelog de cosas que nunca vio no le dice
 * nada y le roba el primer momento.
 */
export function shouldShowWhatsNew(): boolean {
  const seen = readSeenVersion()
  if (seen === null) {
    // Primera vez: se marca como vista y no se muestra.
    markVersionSeen()
    return false
  }
  return compareVersions(APP_VERSION, seen) > 0
}

/**
 * NOVEDADES — el historial de versiones de la app.
 *
 * `RELEASE_NOTES` existía desde hacía versiones pero no se mostraba en ningún
 * lado: seis versiones documentadas que nadie podía leer. Esta pantalla las
 * saca a la superficie y se abre sola tras cada actualización.
 *
 * `highlightLatest` marca la versión recién instalada, que es la razón por la
 * que la pantalla se abrió sola.
 */
export function MobileWhatsNew({
  onClose,
  highlightLatest = false,
}: {
  onClose: () => void
  highlightLatest?: boolean
}) {
  const t = useT()
  const lang = useSettings(s => s.language ?? 'es')

  useMobileBackDismiss(true, onClose)
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose)

  const close = () => {
    markVersionSeen()
    onClose()
  }

  // Orden descendente por versión, no por el orden del archivo: si alguien
  // agrega una entrada en el sitio equivocado, la lista sigue siendo correcta.
  const notes = useMemo(
    () => [...RELEASE_NOTES].sort((a, b) => compareVersions(b.version, a.version)),
    [],
  )

  const formatDate = (date: string) =>
    new Date(`${date}T00:00:00`).toLocaleDateString(dateLocale(lang), {
      year: 'numeric', month: 'long', day: 'numeric',
    })

  return (
    <SheetPortal>
      <div ref={dialogRef} className="mobile-detail-sheet mnews-overlay" role="dialog" aria-modal="true" onClick={close}>
        <section className="mnews-sheet" onClick={e => e.stopPropagation()}>
          <header className="mnews-header">
            <span>{highlightLatest ? t('whatsNewInVersion').replace('{v}', APP_VERSION) : t('whatsNewTitle')}</span>
            <button aria-label={t('close')} onClick={close}><Icon name="close" size={18} /></button>
          </header>

          {highlightLatest && <p className="mnews-intro">{t('whatsNewIntro')}</p>}

          <ol className="mnews-list">
            {notes.map((note, i) => {
              const isCurrent = note.version === APP_VERSION
              return (
                <li key={note.version} className={`mnews-entry${isCurrent && highlightLatest ? ' current' : ''}`}>
                  <div className="mnews-entry-head">
                    <span className="mnews-version">
                      {note.version}
                      {isCurrent && <em className="mnews-badge">{t('currentVersionBadge')}</em>}
                    </span>
                    <time className="mnews-date" dateTime={note.date}>{formatDate(note.date)}</time>
                  </div>
                  <h3 className="mnews-entry-title">{note.title}</h3>

                  {(() => {
                    const items = parseReleaseItems(note.items)
                    const counts = countByKind(items)
                    /**
                     * AGRUPADO POR TIPO. Antes eran veinte viñetas donde todo
                     * pesaba igual: nadie distinguía "rediseñamos Cuentas" de
                     * "corregimos un margen", y el resultado es que no se lee
                     * ninguna.
                     *
                     * Lo nuevo primero, las correcciones al final: quien abre
                     * un changelog quiere saber qué GANÓ, no qué estaba roto.
                     */
                    const groups: Array<{ kind: ReleaseItemKind; label: string }> = [
                      { kind: 'new', label: t('releaseNew') },
                      { kind: 'better', label: t('releaseBetter') },
                      { kind: 'fix', label: t('releaseFixed') },
                    ]
                    return (
                      <>
                        {/* Resumen de un vistazo, para quien no va a leer las
                            veinte líneas — que es casi todo el mundo. */}
                        <div className="mnews-counts">
                          {counts.new > 0 && <span className="mnews-count new">{counts.new} {t('releaseNew')}</span>}
                          {counts.better > 0 && <span className="mnews-count better">{counts.better} {t('releaseBetter')}</span>}
                          {counts.fix > 0 && <span className="mnews-count fix">{counts.fix} {t('releaseFixed')}</span>}
                        </div>

                        {groups.map(group => {
                          const rows = items.filter(x => x.kind === group.kind)
                          if (rows.length === 0) return null
                          return (
                            <div key={group.kind} className="mnews-group">
                              <p className={`mnews-group-title ${group.kind}`}>{group.label}</p>
                              <ul className="mnews-items">
                                {rows.map((item, j) => (
                                  <li key={j} className={item.highlight ? 'highlight' : undefined}>
                                    {item.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )
                        })}
                      </>
                    )
                  })()}
                  {/* La primera entrada abierta y el resto tambien: un
                      changelog plegado obliga a tocar para leer lo que el
                      usuario vino justamente a leer. */}
                  {i === notes.length - 1 && (
                    <p className="mnews-oldest">{t('olderVersionsHint')}</p>
                  )}
                </li>
              )
            })}
          </ol>

          <button className="mnews-done" onClick={close}>{t('gotItLabel')}</button>
        </section>
      </div>
    </SheetPortal>
  )
}
