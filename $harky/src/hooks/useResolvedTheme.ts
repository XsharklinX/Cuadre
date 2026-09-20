import { useSyncExternalStore } from 'react'
import { useSettings } from '@/store/settings'

const QUERY = '(prefers-color-scheme: dark)'

function getSystemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia(QUERY).matches ? 'dark' : 'light'
}

function subscribe(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(QUERY)
  mql.addEventListener('change', callback)
  return () => mql.removeEventListener('change', callback)
}

/** Tema resuelto: si el usuario eligió 'system', sigue `prefers-color-scheme` del SO. */
export function useResolvedTheme(): 'dark' | 'light' | 'amoled' {
  const theme = useSettings(s => s.theme)
  const systemTheme = useSyncExternalStore(subscribe, getSystemTheme, getSystemTheme)
  return theme === 'system' ? systemTheme : theme
}
