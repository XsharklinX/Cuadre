import { useEffect, useState } from 'react'
import { checkSharedFiles, isTauri, type SharedReceipt } from './useTauri'

/**
 * Detecta cuando el usuario compartió una o varias fotos/PDFs hacia $harky
 * desde otra app (Galería, Drive, WhatsApp, etc.). Revisa al montar y cada
 * vez que la app vuelve a primer plano — los archivos compartidos se
 * consumen una sola vez. Compartir más de uno habilita el flujo de recibos
 * por lotes; compartir uno solo se comporta igual que antes.
 */
export function useSharedReceipt(): [SharedReceipt[], () => void] {
  const [receipts, setReceipts] = useState<SharedReceipt[]>([])

  useEffect(() => {
    if (!isTauri()) return

    const check = () => { void checkSharedFiles().then(found => { if (found.length) setReceipts(found) }) }
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    check()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
    }
  }, [])

  return [receipts, () => setReceipts([])]
}
