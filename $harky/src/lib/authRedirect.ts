import { isTauri } from '@/hooks/useTauri'

const CALLBACK_PATH = '/auth/callback'
export const DESKTOP_AUTH_REDIRECT_URL = 'sharky://auth/callback'

export function buildAuthRedirectUrl(origin: string, configuredUrl?: string): string {
  const configured = configuredUrl?.trim()
  if (configured) return configured
  return new URL(CALLBACK_PATH, `${origin.replace(/\/+$/, '')}/`).toString()
}

export function getAuthRedirectUrl(): string {
  if (isTauri()) return DESKTOP_AUTH_REDIRECT_URL
  return buildAuthRedirectUrl(window.location.origin, import.meta.env.VITE_AUTH_REDIRECT_URL)
}
