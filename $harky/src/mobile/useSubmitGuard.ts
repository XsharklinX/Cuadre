import { useRef, useState } from 'react'

/**
 * Evita duplicar dinero por doble toque: un segundo `beginSubmit()` mientras
 * el primero sigue en curso se bloquea (devuelve `false`) hasta que se llame
 * `endSubmit()`. `submitting` es el booleano reactivo para deshabilitar el
 * botón de guardar mientras la mutación está en curso.
 */
export function useSubmitGuard() {
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  const beginSubmit = (): boolean => {
    if (inFlight.current) return false
    inFlight.current = true
    setSubmitting(true)
    return true
  }

  const endSubmit = () => {
    inFlight.current = false
    setSubmitting(false)
  }

  return { submitting, beginSubmit, endSubmit }
}
