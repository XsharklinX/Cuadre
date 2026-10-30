import { useCallback, useRef, useState } from 'react'
import { playWarningHaptic } from '@/lib/sound'

/**
 * EL BOTÓN DE GUARDAR DICE QUÉ FALTA.
 *
 * Antes cada formulario resolvía la falta a su manera: un toast genérico, el
 * botón gris sin explicación o nada. Con un campo fuera de la vista (pasó con
 * la fecha en móviles pequeños) el usuario no tenía forma de saber qué le
 * pedían. Ahora el pie nombra el campo y, al tocarlo, la hoja se desplaza
 * hasta él, lo resalta un momento y vibra.
 *
 * Cada formulario declara sus campos con `register(key)` y su lista de faltas
 * en orden; el hook solo sabe llevar al primero.
 */
export function useMissingField<K extends string>() {
  const refs = useRef(new Map<K, HTMLElement>())
  const [flash, setFlash] = useState<K | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const register = useCallback((key: K) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el)
    else refs.current.delete(key)
  }, [])

  /** Lleva al campo: desplaza, resalta 1.2 s y vibra. Devuelve si lo encontró. */
  const goTo = useCallback((key: K) => {
    const el = refs.current.get(key)
    playWarningHaptic()
    if (timer.current) clearTimeout(timer.current)
    setFlash(key)
    timer.current = setTimeout(() => setFlash(null), 1200)
    if (!el) return false
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  }, [])

  /** Clase para el campo: resaltado mientras dura el aviso. */
  const flashClass = (key: K) => (flash === key ? ' form-needs-flash' : '')

  return { register, goTo, flashClass }
}
