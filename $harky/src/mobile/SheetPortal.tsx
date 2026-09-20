import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

/**
 * Portal para TODOS los sheets/overlays móviles.
 *
 * Monta en `.mobile-app` (el div raíz), NO en document.body. Dos razones, ambas
 * imprescindibles:
 *
 *  1) Las variables de tema (--surface, --text, --m-surface, --m-text, --accent…)
 *     se definen en `.app.mobile-app`. Fuera de ahí (p.ej. en document.body) NO
 *     existen → los sheets salían transparentes y los toggles sin color. Montar
 *     dentro de `.mobile-app` las conserva.
 *
 *  2) `.mobile-report-pane` / `.mobile-tool-pane` usan `will-change: transform`,
 *     y un ancestro con transform es el bloque contenedor de cualquier
 *     descendiente `position: fixed`. Eso anclaba los sheets al panel (corto,
 *     arriba) en vez del viewport — el bug del numpad de Metas a media pantalla.
 *     `.mobile-app` es ancestro de esos paneles pero NO tiene transform, así que
 *     el sheet se ancla al viewport correctamente.
 */
/** Contenedor donde montar sheets: `.mobile-app` (con las variables de tema) o
 *  document.body como último recurso. Exportado para los sitios que llaman a
 *  `createPortal` directamente (MobileGoals, MobileTransactionList). */
export function sheetRoot(): HTMLElement {
  if (typeof document === 'undefined') return null as unknown as HTMLElement
  return document.querySelector<HTMLElement>('.mobile-app') ?? document.body
}

export function SheetPortal({ children }: { children: ReactNode }) {
  const target = sheetRoot()
  if (!target) return null
  return createPortal(children, target)
}
