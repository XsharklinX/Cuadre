import { useEffect } from 'react'
import { BACKUP_DEBOUNCE_MS } from '@/constants'
import { createRecoverySnapshot } from '@/data/recovery'
import { useFinance } from '@/store/finance'

export function useAutoBackup() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const snapshot = () => createRecoverySnapshot(useFinance.getState())

    snapshot()
    const unsubscribe = useFinance.subscribe(() => {
      clearTimeout(timer)
      timer = setTimeout(snapshot, BACKUP_DEBOUNCE_MS)
    })

    return () => {
      clearTimeout(timer)
      unsubscribe()
    }
  }, [])
}
