import { useEffect, useState } from 'react'
import { markVersionSeen, readSeenVersion, shouldShowWhatsNew } from '@/mobile/MobileWhatsNew'
import { isMajorUpgrade } from '@/mobile/MobileWelcome2'

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
export function useWhatsNew(): { open: boolean; major: boolean; close: () => void } {
  const [open, setOpen] = useState(false)
  /*
   * `major` decide CUAL de los dos se abre, y se calcula ANTES de marcar nada.
   *
   * `shouldShowWhatsNew` marca la version como vista en la primera
   * instalacion, asi que la version anterior hay que leerla antes de llamarlo
   * o se pierde el dato con el que se compara.
   */
  const [major, setMajor] = useState(false)

  useEffect(() => {
    const id = setTimeout(() => {
      const desde = readSeenVersion()
      if (shouldShowWhatsNew()) {
        setMajor(isMajorUpgrade(desde))
        setOpen(true)
      }
    }, SETTLE_MS)
    return () => clearTimeout(id)
  }, [])

  return {
    open,
    major,
    close: () => { markVersionSeen(); setOpen(false) },
  }
}
