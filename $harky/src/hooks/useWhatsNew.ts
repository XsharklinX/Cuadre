import { useEffect, useState } from 'react'
import { markVersionSeen, shouldShowWhatsNew } from '@/mobile/MobileWhatsNew'

/** Retraso antes de mostrarlo, para no atropellar el arranque. */
const SETTLE_MS = 1200

/**
 * ¿Hay que abrir las Novedades tras una actualización?
 *
 * Vive a nivel de App, NO dentro del Perfil. Estaba en `MobileProfile`, que se
 * carga en diferido y solo se monta al entrar a esa pestaña: como la app
 * arranca en Movimientos, la comprobación no llegaba a ejecutarse nunca y el
 * changelog no aparecía tras actualizar. Aparecía más tarde, si al usuario se
 * le ocurría visitar el Perfil — que es justo cuando ya no significa nada.
 */
export function useWhatsNew(): { open: boolean; close: () => void } {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      if (shouldShowWhatsNew()) setOpen(true)
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [])

  return {
    open,
    close: () => { markVersionSeen(); setOpen(false) },
  }
}
