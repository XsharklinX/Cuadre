import { useEffect, useRef } from 'react'
import { useSettings } from '@/store/settings'
import { playSoftHaptic } from '@/lib/sound'

/**
 * MANTENER PULSADO EL SALDO PARA TAPARLO TODO.
 *
 * ── POR QUÉ ESTE GESTO ────────────────────────────────────────────────
 * El modo privado tenía su propio icono en la barra superior, en una franja
 * que ya llevaba ocho controles. Estaba ahí porque quien necesita tapar la
 * pantalla lo necesita AHORA —alguien acaba de sentarse al lado—, y esa
 * urgencia es real.
 *
 * Pero un icono de 40px al que hay que apuntar no es la forma más rápida de
 * darla. Mantener pulsado el número que estás mirando es más rápido, y está
 * justo donde está el dedo.
 *
 * ── SE SUELTA Y VUELVE ────────────────────────────────────────────────
 * Es momentáneo a propósito. El interruptor permanente sigue en el panel del
 * avatar para quien quiere la app tapada siempre; esto es para los diez
 * segundos que alguien tarda en levantarse.
 *
 * Si el modo privado ya estaba encendido, el gesto no hace nada: apagarlo
 * mientras aprietas sería lo contrario de lo que pides.
 */

/** Cuánto hay que aguantar para que tape. Menos es un toque; más, una espera. */
const HOLD_MS = 320

export function useHoldToHide<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const timer = useRef<number | null>(null)
  const nuestro = useRef(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const tapar = () => {
      const { privacyMode, togglePrivacyMode } = useSettings.getState()
      // Ya estaba tapado por el interruptor: no se toca.
      if (privacyMode) return
      nuestro.current = true
      togglePrivacyMode()
      playSoftHaptic()
    }

    const destapar = () => {
      if (timer.current !== null) { clearTimeout(timer.current); timer.current = null }
      if (!nuestro.current) return
      nuestro.current = false
      // Solo se devuelve lo que este gesto cambió: si el usuario encendió el
      // interruptor mientras apretaba, apagarlo aquí le quitaría lo que acaba
      // de pedir.
      if (useSettings.getState().privacyMode) useSettings.getState().togglePrivacyMode()
    }

    const abajo = () => {
      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = window.setTimeout(tapar, HOLD_MS)
    }

    el.addEventListener('pointerdown', abajo)
    el.addEventListener('pointerup', destapar)
    el.addEventListener('pointercancel', destapar)
    el.addEventListener('pointerleave', destapar)
    /*
     * Si el dedo se va de la pantalla sin un `pointerup` —una llamada
     * entrando, la app pasando a segundo plano— la app se quedaría tapada sin
     * que nadie la esté tapando, y sin forma de saber por qué.
     */
    window.addEventListener('blur', destapar)

    return () => {
      el.removeEventListener('pointerdown', abajo)
      el.removeEventListener('pointerup', destapar)
      el.removeEventListener('pointercancel', destapar)
      el.removeEventListener('pointerleave', destapar)
      window.removeEventListener('blur', destapar)
      destapar()
    }
  }, [])

  return ref
}
