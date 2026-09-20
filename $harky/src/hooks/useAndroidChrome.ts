import { useEffect } from 'react'
import { setSystemBarsAppearance } from '@/lib/systemBars'
import type { ThemeName } from '@/types'

const PALETTE: Record<ThemeName, { bg: string; surface: string; scheme: 'dark' | 'light' }> = {
  dark: { bg: '#0a0e16', surface: '#111827', scheme: 'dark' },
  amoled: { bg: '#000000', surface: '#0a0a0a', scheme: 'dark' },
  light: { bg: '#f4f7fb', surface: '#ffffff', scheme: 'light' },
  system: { bg: '#0a0e16', surface: '#111827', scheme: 'dark' },
}

function upsertMeta(name: string, content: string) {
  let tag = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.name = name
    document.head.appendChild(tag)
  }
  tag.content = content
}

export function useAndroidChrome(theme: ThemeName, mobileShell = false) {
  useEffect(() => {
    if (typeof document === 'undefined') return

    const palette = PALETTE[theme] ?? PALETTE.dark
    const themeColor = mobileShell ? palette.bg : palette.surface

    document.documentElement.style.backgroundColor = palette.bg
    document.body.style.backgroundColor = palette.bg
    upsertMeta('theme-color', themeColor)
    upsertMeta('color-scheme', palette.scheme)
    // Los iconos de las barras del sistema (Android edge-to-edge) siguen el tema
    // de la app: oscuros en claro, claros en oscuro. Best-effort (ver systemBars).
    void setSystemBarsAppearance(palette.scheme)
  }, [mobileShell, theme])
}
