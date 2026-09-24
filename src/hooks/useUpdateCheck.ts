import { useEffect, useState } from 'react'
import { checkForUpdate, type UpdateStatus } from '@/lib/inAppUpdate'
import { decideUpdatePrompt, type UpdateDecision } from '@/data/updatePrompt'
import { useSettings } from '@/store/settings'

/**
 * ¿HAY QUE OFRECER ACTUALIZAR?
 *
 * ────────────────────────────────────────────────────────────────────────
 * LO QUE HABÍA ANTES, Y POR QUÉ NO FUNCIONÓ
 *
 * Esto consultaba un `version.json` publicado a mano en GitHub Pages y
 * comparaba números de versión. El archivo se quedó en **1.7.4** mientras la
 * app llegaba a la 1.9.6, así que durante nueve versiones la comparación dio
 * siempre «no hay nada nuevo» y el aviso no le apareció a NADIE.
 *
 * No fue un descuido puntual: actualizar ese archivo era un paso manual
 * apuntado en la documentación de publicación, y los pasos manuales se
 * olvidan. Un dato que hay que acordarse de mantener es un dato que algún día
 * estará mal.
 *
 * Ahora se le pregunta a Google Play, que es quien sabe la verdad. No hay
 * archivo que mantener, así que no hay nada que olvidar.
 *
 * ────────────────────────────────────────────────────────────────────────
 * El retraso no es decorativo: preguntarle a Play mientras la app está
 * montando compite por el hilo justo cuando se nota. Un aviso de actualizar
 * puede esperar dos segundos; el primer pintado, no.
 */
const SETTLE_MS = 2200

export interface UpdateOffer {
  status: UpdateStatus
  decision: Extract<UpdateDecision, { show: true }>
}

export function useUpdateCheck(suppressed = false): UpdateOffer | null {
  const [offer, setOffer] = useState<UpdateOffer | null>(null)
  const updateSnooze = useSettings(s => s.updateSnooze)

  useEffect(() => {
    if (suppressed) return
    let cancelled = false

    const id = setTimeout(() => {
      void (async () => {
        const status = await checkForUpdate()
        if (cancelled) return
        const decision = decideUpdatePrompt(status, updateSnooze, Date.now())
        if (decision.show) setOffer({ status, decision })
      })()
    }, SETTLE_MS)

    return () => { cancelled = true; clearTimeout(id) }
    // Una sola consulta por sesión. Con `updateSnooze` en las dependencias,
    // posponer el aviso lo volvería a evaluar y podría reabrirlo en la cara
    // de quien acaba de cerrarlo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppressed])

  return offer
}
