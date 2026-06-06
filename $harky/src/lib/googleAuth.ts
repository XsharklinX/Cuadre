import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export interface GoogleUser {
  id:       string   // Google sub — unique per user per app
  name:     string
  email:    string
  picture?: string
}

interface GoogleAuthState {
  user:    GoogleUser | null
  signIn:  (credential: string) => void
  signOut: () => void
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}

export const useGoogleAuth = create<GoogleAuthState>()(
  persist(
    (set) => ({
      user: null,
      signIn: (credential: string) => {
        const p = decodeJwt(credential)
        if (!p.sub) return
        set({
          user: {
            id:      p.sub as string,
            name:    (p.name as string) || (p.email as string) || 'User',
            email:   (p.email as string) || '',
            picture: p.picture as string | undefined,
          },
        })
      },
      signOut: () => set({ user: null }),
    }),
    { name: 'sharky-google-user', storage: createJSONStorage(() => localStorage) },
  ),
)

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (r: { credential: string }) => void
            auto_select?: boolean
          }) => void
          renderButton: (el: HTMLElement, opts: object) => void
          prompt: () => void
        }
      }
    }
  }
}

let gisLoaded = false
let gisLoading = false
const callbacks: Array<() => void> = []

export function loadGIS(onReady: () => void) {
  if (gisLoaded) { onReady(); return }
  callbacks.push(onReady)
  if (gisLoading) return
  gisLoading = true
  const s = document.createElement('script')
  s.src = 'https://accounts.google.com/gsi/client'
  s.async = true; s.defer = true
  s.onload = () => { gisLoaded = true; callbacks.forEach(cb => cb()); callbacks.length = 0 }
  document.head.appendChild(s)
}
