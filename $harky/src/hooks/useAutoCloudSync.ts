import { useEffect } from 'react'
import { useCloudSync } from '@/data/cloudSync'
import { useAuth } from '@/store/auth'
import { useFinance } from '@/store/finance'
import { toast } from '@/components/ui/Toast'

import { SYNC_DEBOUNCE_MS } from '@/constants'

const DIRTY_PREFIX = 'sharky-cloud-dirty-v1:'
const SYNC_ERROR_TOAST_THROTTLE_MS = 60_000

let lastSyncErrorToastAt = 0

function dirtyKey(userId: string): string {
  return `${DIRTY_PREFIX}${userId}`
}

export function useAutoCloudSync(): void {
  const user = useAuth(state => state.user)

  useEffect(() => {
    const userId = user?.mode === 'cloud' ? user.id : undefined
    if (!userId) {
      useCloudSync.getState().setPending(false)
      return
    }

    let timer: ReturnType<typeof setTimeout> | undefined
    let stopped = false

    const run = async () => {
      if (stopped || !navigator.onLine || useCloudSync.getState().busy) return
      try {
        await useCloudSync.getState().syncNow()
        localStorage.removeItem(dirtyKey(userId))
        useCloudSync.getState().setPending(false)
      } catch (err) {
        useCloudSync.getState().setPending(true)
        const now = Date.now()
        if (now - lastSyncErrorToastAt > SYNC_ERROR_TOAST_THROTTLE_MS) {
          lastSyncErrorToastAt = now
          const msg = err instanceof Error ? err.message : 'No fue posible sincronizar.'
          toast(msg, { icon: 'alert', type: 'warn', duration: 4000 })
        }
      }
    }

    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => void run(), SYNC_DEBOUNCE_MS)
    }

    const markDirty = () => {
      if (useCloudSync.getState().busy) return
      localStorage.setItem(dirtyKey(userId), new Date().toISOString())
      useCloudSync.getState().setPending(true)
      schedule()
    }

    const unsubscribe = useFinance.subscribe(markDirty)
    const handleOnline = () => {
      if (localStorage.getItem(dirtyKey(userId))) schedule()
    }
    window.addEventListener('online', handleOnline)

    if (localStorage.getItem(dirtyKey(userId))) {
      useCloudSync.getState().setPending(true)
      schedule()
    }

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('online', handleOnline)
    }
  }, [user?.id, user?.mode])
}
