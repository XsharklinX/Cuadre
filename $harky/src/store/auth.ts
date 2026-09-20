import { create } from 'zustand'
import { recordAuditEvent } from '@/data/audit'
import { getAuthRedirectUrl } from '@/lib/authRedirect'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { deriveNumericId } from '@/lib/publicId'
import { CLOUD_AUTH_ENABLED } from '@/lib/authConfig'
import { isTauri } from '@/hooks/useTauri'
import { toast } from '@/components/ui/Toast'
import { tt } from '@/i18n'
import { log } from '@/lib/logger'

const LOCAL_USER_KEY = 'sharky-user-v1'
const LOCAL_SESSION_KEY = 'sharky-session-v1'
const ITERATIONS = 120_000

interface StoredLocalUser {
  name: string
  email: string
  salt: string
  passwordHash: string
}

export interface AuthUser {
  id?: string
  name: string
  email: string
  mode: 'cloud' | 'local'
  avatarUrl?: string
  /** ID público de 9 dígitos, estable y propio de cada cuenta cloud. */
  publicId?: string
}

interface AuthState {
  user: AuthUser | null
  initialized: boolean
  recoveryMode: boolean
  hasLocalAccount: boolean
  cloudAvailable: boolean
  initialize: () => Promise<void>
  registerCloud: (fields: { name: string; email: string; password: string }) => Promise<'authenticated' | 'confirm-email'>
  loginCloud: (fields: { email: string; password: string }) => Promise<void>
  loginWithGoogle: () => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  registerLocal: (fields: { name: string; email: string; password: string }) => Promise<void>
  loginLocal: (fields: { email: string; password: string }) => Promise<void>
  logout: (scope?: 'local' | 'global') => Promise<void>
}

const encoder = new TextEncoder()
let authListenerAttached = false
let deepLinkListenerAttached = false
let resumeListenerAttached = false
let desktopDeepLinkConsumed = false
// El usuario tocó "Continuar con Google" en ESTA sesión. Solo entonces tiene
// sentido molestarlo con un toast de error: en Android (launchMode singleTask)
// `getCurrent()` devuelve el último intent de callback en CADA arranque, así
// que sin esta guarda salía "no se pudo conectar" cada vez que abrías la app.
let googleLoginPending = false
// Códigos OAuth ya intentados: un código caduca tras un solo uso, no hay que
// reintentar el mismo (viejo) en cada arranque —eso solo genera errores ruido.
const attemptedAuthCodes = new Set<string>()

function surfaceAuthError(error: unknown): void {
  log.error('No se pudo completar el enlace de autenticación', error)
  // Con Google oculto no molestamos con toasts de error de su callback.
  if (!CLOUD_AUTH_ENABLED || !googleLoginPending) return
  googleLoginPending = false
  toast(error instanceof Error ? error.message : tt('couldNotConnectGoogle'), { icon: 'alert', type: 'warn', duration: 6000 })
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

async function hashPassword(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: Uint8Array.from(salt).buffer,
    iterations: ITERATIONS,
  }, key, 256)
  return bytesToBase64(new Uint8Array(bits))
}

function readLocalUser(): StoredLocalUser | null {
  try {
    const value = localStorage.getItem(LOCAL_USER_KEY)
    return value ? JSON.parse(value) as StoredLocalUser : null
  } catch {
    return null
  }
}

function readLocalSession(): AuthUser | null {
  const stored = readLocalUser()
  return stored && sessionStorage.getItem(LOCAL_SESSION_KEY) === stored.email
    ? { name: stored.name, email: stored.email, mode: 'local' }
    : null
}

function pickString(meta: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = meta?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function mapCloudUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const email = user.email ?? ''
  const meta = user.user_metadata
  const name = pickString(meta, 'full_name', 'name', 'display_name') ?? email.split('@')[0]
  const avatarUrl = pickString(meta, 'avatar_url', 'picture')
  return {
    id: user.id,
    name,
    email,
    mode: 'cloud',
    avatarUrl,
    publicId: deriveNumericId(user.id),
  }
}

function requireSupabase() {
  if (!supabase) throw new Error(tt('errCloudNotConfiguredDevice'))
  return supabase
}

/**
 * Procesa un posible callback OAuth (`sharky://auth/callback?...`).
 * Devuelve el usuario si el intercambio de código creó sesión, o `null` si el
 * URL no era un callback o no traía código. Lanza si Google/Supabase
 * devolvieron un error explícito o si el intercambio falla.
 */
async function handleAuthCallbackUrls(urls: string[] | null | undefined): Promise<AuthUser | null> {
  if (!supabase || !urls?.length) return null
  const callback = urls.find(url => url.startsWith('sharky://auth/callback'))
  if (!callback) return null

  const url = new URL(callback)
  // El código o el error pueden venir en query (?) o en fragment (#).
  const params = new URLSearchParams(url.search || url.hash.replace(/^#/, ''))
  const errorDescription = params.get('error_description') ?? params.get('error')
  if (errorDescription) throw new Error(errorDescription)

  const code = params.get('code')
  if (!code) return null
  // Ya intentamos este código (p.ej. el mismo intent viejo que Android reenvía
  // en cada arranque): no reintentar — el código es de un solo uso.
  if (attemptedAuthCodes.has(code)) return null
  attemptedAuthCodes.add(code)

  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) throw new Error(error.message)
  if (data.session?.user) googleLoginPending = false
  return data.session?.user ? mapCloudUser(data.session.user) : null
}

async function consumeInitialAuthDeepLink(setUser: (user: AuthUser) => void): Promise<void> {
  if (!supabase || !isTauri() || desktopDeepLinkConsumed) return
  desktopDeepLinkConsumed = true
  const { getCurrent } = await import('@tauri-apps/plugin-deep-link')
  const user = await handleAuthCallbackUrls(await getCurrent())
  if (user) setUser(user)
}

async function attachRuntimeDeepLinkListener(setUser: (user: AuthUser) => void): Promise<void> {
  if (!supabase || !isTauri() || deepLinkListenerAttached) return
  deepLinkListenerAttached = true
  const { onOpenUrl } = await import('@tauri-apps/plugin-deep-link')
  await onOpenUrl(async urls => {
    try {
      const user = await handleAuthCallbackUrls(urls)
      if (user) setUser(user)
    } catch (error) {
      // El código pudo haberse canjeado ya por otra vía (red de seguridad al
      // reanudar): si la sesión ya existe, no es un error real.
      const { data } = await supabase!.auth.getSession()
      if (data.session?.user) { googleLoginPending = false; setUser(mapCloudUser(data.session.user)); return }
      surfaceAuthError(error)
    }
  })
}

export const useAuth = create<AuthState>((set, get) => ({
  user: readLocalSession(),
  initialized: false,
  recoveryMode: false,
  hasLocalAccount: !!readLocalUser(),
  cloudAvailable: isSupabaseConfigured,

  initialize: async () => {
    if (get().initialized) return
    // Cloud desactivado por producto: no tocar Supabase para nada al
    // arrancar (ni getSession, ni listeners). La app queda 100% local.
    if (!CLOUD_AUTH_ENABLED || !supabase) {
      set({ initialized: true })
      return
    }

    if (!authListenerAttached) {
      authListenerAttached = true
      // Un intercambio de código exitoso dispara este listener con SIGNED_IN,
      // así que la sesión queda reflejada aunque el deep link se procese por
      // cualquiera de las vías (inicial, runtime o red de seguridad).
      supabase.auth.onAuthStateChange((event, session) => {
        if (session?.user) set({
          user: mapCloudUser(session.user),
          initialized: true,
          recoveryMode: event === 'PASSWORD_RECOVERY' || get().recoveryMode,
        })
        else if (get().user?.mode === 'cloud') set({ user: readLocalSession(), initialized: true })
      })
    }

    // Red de seguridad (Android): al volver del navegador externo, algunos
    // dispositivos no entregan el deep link por `onOpenUrl`. Al recuperar el
    // foco revisamos si ya hay sesión y, si no, reintentamos consumir el deep
    // link pendiente. Idempotente: si ya hay sesión cloud, no hace nada.
    // Activo SIEMPRE (no solo con Google): los enlaces de confirmar correo y
    // de recuperar contraseña llegan por el mismo sharky://auth/callback.
    if (isTauri() && !resumeListenerAttached) {
      resumeListenerAttached = true
      const recheckOnResume = async () => {
        if (document.visibilityState !== 'visible' || !supabase) return
        if (get().user?.mode === 'cloud') return
        try {
          const { data } = await supabase.auth.getSession()
          if (data.session?.user) { googleLoginPending = false; set({ user: mapCloudUser(data.session.user), initialized: true }); return }
          const { getCurrent } = await import('@tauri-apps/plugin-deep-link')
          const user = await handleAuthCallbackUrls(await getCurrent())
          // recoveryMode se preserva: PASSWORD_RECOVERY pudo haberlo activado.
          if (user) set({ user, initialized: true })
        } catch (error) {
          // Solo se muestra si el usuario inició login en esta sesión
          // (surfaceAuthError lo verifica), para no molestar en cada arranque.
          surfaceAuthError(error)
        }
      }
      document.addEventListener('visibilitychange', () => void recheckOnResume())
    }

    // Procesar el deep link de auth SIEMPRE: además del OAuth de Google, por
    // aquí entran la confirmación de correo y la recuperación de contraseña.
    // Los códigos ya intentados se dedupen y los toasts siguen condicionados,
    // así que esto no reintroduce el aviso fantasma en cada arranque.
    try {
      // No tocar recoveryMode aquí: si el código canjeado era de recuperación
      // de contraseña, onAuthStateChange (PASSWORD_RECOVERY) ya lo puso en
      // true y este set NO debe pisarlo.
      await attachRuntimeDeepLinkListener(user => set({ user, initialized: true }))
      await consumeInitialAuthDeepLink(user => set({ user, initialized: true }))
    } catch (error) {
      // Arranque en frío desde el deep link: solo se avisa si el usuario inició
      // el login en esta sesión y no acabó habiendo sesión de todos modos.
      const { data } = await supabase.auth.getSession()
      if (!data.session?.user) surfaceAuthError(error)
    }

    const { data, error } = await supabase.auth.getSession()
    if (error) log.error('No se pudo restaurar la sesión cloud', error)
    const cloudUser = data.session?.user ? mapCloudUser(data.session.user) : null
    set({ user: cloudUser ?? readLocalSession(), initialized: true })
  },

  registerCloud: async ({ name, email, password }) => {
    const client = requireSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    const { data, error } = await client.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { display_name: name.trim() },
        emailRedirectTo: getAuthRedirectUrl(),
      },
    })
    if (error) throw new Error(error.message)
    recordAuditEvent('account', 'Cuenta cloud creada', normalizedEmail)
    if (!data.session) return 'confirm-email'
    if (data.user) set({ user: mapCloudUser(data.user) })
    return 'authenticated'
  },

  loginCloud: async ({ email, password }) => {
    const client = requireSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    const { data, error } = await client.auth.signInWithPassword({ email: normalizedEmail, password })
    if (error) throw new Error(tt('errBadCredentialsUnconfirmed'))
    set({ user: mapCloudUser(data.user) })
    recordAuditEvent('account', 'Inicio de sesión cloud', normalizedEmail)
  },

  loginWithGoogle: async () => {
    const client = requireSupabase()
    const redirectTo = getAuthRedirectUrl()
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: isTauri() },
    })
    if (error) throw new Error(error.message)
    // A partir de aquí sí queremos avisar si el callback falla: el usuario
    // inició el login activamente en esta sesión.
    googleLoginPending = true
    if (isTauri() && data.url) {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(data.url)
    }
  },

  requestPasswordReset: async (email) => {
    const client = requireSupabase()
    const normalizedEmail = email.trim().toLowerCase()
    const { error } = await client.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getAuthRedirectUrl(),
    })
    if (error) throw new Error(error.message)
    recordAuditEvent('account', 'Recuperación de contraseña solicitada', normalizedEmail)
  },

  updatePassword: async (password) => {
    const client = requireSupabase()
    const { error } = await client.auth.updateUser({ password })
    if (error) throw new Error(error.message)
    recordAuditEvent('account', 'Contraseña cloud actualizada')
    set({ recoveryMode: false })
  },

  registerLocal: async ({ name, email, password }) => {
    if (readLocalUser()) throw new Error(tt('errLocalUserExists'))
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const normalizedEmail = email.trim().toLowerCase()
    const stored: StoredLocalUser = {
      name: name.trim(),
      email: normalizedEmail,
      salt: bytesToBase64(salt),
      passwordHash: await hashPassword(password, salt),
    }
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(stored))
    sessionStorage.setItem(LOCAL_SESSION_KEY, stored.email)
    recordAuditEvent('account', 'Cuenta local creada', stored.email)
    set({ user: { name: stored.name, email: stored.email, mode: 'local' }, hasLocalAccount: true })
  },

  loginLocal: async ({ email, password }) => {
    const stored = readLocalUser()
    const normalizedEmail = email.trim().toLowerCase()
    if (!stored || stored.email !== normalizedEmail) throw new Error(tt('errBadCredentials'))
    const passwordHash = await hashPassword(password, base64ToBytes(stored.salt))
    if (passwordHash !== stored.passwordHash) throw new Error(tt('errBadCredentials'))
    sessionStorage.setItem(LOCAL_SESSION_KEY, stored.email)
    recordAuditEvent('account', 'Inicio de sesión local', stored.email)
    set({ user: { name: stored.name, email: stored.email, mode: 'local' } })
  },

  logout: async (scope = 'local') => {
    const mode = get().user?.mode
    sessionStorage.removeItem(LOCAL_SESSION_KEY)
    if (mode === 'cloud' && supabase) {
      const { error } = await supabase.auth.signOut({ scope })
      if (error) throw new Error(error.message)
    }
    recordAuditEvent('account', scope === 'global' ? 'Cierre remoto de sesiones' : 'Cierre de sesión')
    set({ user: null })
  },
}))
