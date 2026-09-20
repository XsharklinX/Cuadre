import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/globals.css'
import App from './App'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { registerSW } from 'virtual:pwa-register'

const isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window
if (!isTauri) registerSW({ immediate: true })

async function clearDesktopPwaCaches(): Promise<void> {
  if (!isTauri) return
  const registrations = await navigator.serviceWorker?.getRegistrations?.() ?? []
  await Promise.all(registrations.map(registration => registration.unregister()))
  const cacheNames = await globalThis.caches?.keys?.() ?? []
  await Promise.all(cacheNames.map(cacheName => globalThis.caches.delete(cacheName)))
}

void clearDesktopPwaCaches().finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
})
