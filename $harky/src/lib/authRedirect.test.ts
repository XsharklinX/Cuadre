import { describe, expect, it } from 'vitest'
import { buildAuthRedirectUrl, DESKTOP_AUTH_REDIRECT_URL } from '@/lib/authRedirect'

describe('auth redirect URL', () => {
  it('usa el origen activo durante desarrollo', () => {
    expect(buildAuthRedirectUrl('http://127.0.0.1:3002')).toBe('http://127.0.0.1:3002/auth/callback')
  })

  it('respeta la URL publica configurada para builds de escritorio', () => {
    expect(buildAuthRedirectUrl('http://tauri.localhost', 'https://sharky.example.com/auth/callback'))
      .toBe('https://sharky.example.com/auth/callback')
  })

  it('declara el protocolo nativo usado por Tauri', () => {
    expect(DESKTOP_AUTH_REDIRECT_URL).toBe('sharky://auth/callback')
  })
})
