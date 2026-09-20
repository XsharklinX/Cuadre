import { isTauri } from '@/hooks/useTauri'
import { decryptSecure, encryptSecure, isAndroidTauri, type SecureBlob } from '@/lib/secureBlob'

interface AuthStorage {
  getItem: (key: string) => Promise<string | null> | string | null
  setItem: (key: string, value: string) => Promise<void> | void
  removeItem: (key: string) => Promise<void> | void
}

async function tauriInvoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(cmd, args)
}

const memoryStorage = new Map<string, string>()
const hasBrowserStorage = typeof localStorage !== 'undefined'
  && typeof localStorage.getItem === 'function'
  && typeof localStorage.setItem === 'function'
  && typeof localStorage.removeItem === 'function'

const browserStorage: AuthStorage = {
  getItem: key => hasBrowserStorage ? localStorage.getItem(key) : memoryStorage.get(key) ?? null,
  setItem: (key, value) => {
    if (hasBrowserStorage) localStorage.setItem(key, value)
    else memoryStorage.set(key, value)
  },
  removeItem: key => {
    if (hasBrowserStorage) localStorage.removeItem(key)
    else memoryStorage.delete(key)
  },
}

const tauriCredentialStorage: AuthStorage = {
  getItem: key => tauriInvoke<string | null>('secure_storage_get', { key }),
  setItem: (key, value) => tauriInvoke<void>('secure_storage_set', { key, value }),
  removeItem: key => tauriInvoke<void>('secure_storage_remove', { key }),
}

// El crate `keyring` solo trae backend nativo para Windows (ver Cargo.toml,
// feature "windows-native"). En Android no hay backend de `keyring`, así que
// secure_storage_get/set se reemplazan por almacenamiento cifrado con
// Android Keystore (ver src/lib/secureBlob.ts).
const SECURE_PREFIX = 'sb-secure-'
// Respaldo en claro cuando el Android Keystore no está disponible o falla en
// este equipo. Se guarda dentro del sandbox privado de la app (localStorage
// del WebView, no accesible por otras apps), que es el mismo nivel de
// aislamiento que usa la mayoría de apps para sus tokens de sesión.
const PLAINTEXT_PREFIX = 'sb-plain-'

// El verificador PKCE es un valor efímero (solo vive durante el ida y vuelta al
// navegador) y de baja sensibilidad: su único propósito es completar el
// `exchangeCodeForSession`. Cifrarlo con Keystore lo hacía frágil —si el cifrado
// funcionaba al escribir pero el descifrado fallaba en el proceso nuevo tras
// volver del navegador, el verificador se perdía y el login NUNCA se
// completaba—. Guardarlo en claro dentro del sandbox privado de la app garantiza
// que sobreviva el ida y vuelta. (PKCE protege el *código* en tránsito, no el
// verificador guardado localmente.)
function isVerifierKey(key: string): boolean {
  return key.includes('code-verifier')
}

// Android: guardamos la sesión y el verificador PKCE cifrados con Keystore.
// PERO si el cifrado/descifrado falla en algún equipo (Keystore no disponible,
// clave invalidada, etc.), NO podemos descartar el dato en silencio: eso
// rompía el login con Google (la sesión "conectaba" un instante y volvía al
// botón de conectar, porque el token nunca llegaba a persistirse). Por eso
// cae a un respaldo en TEXTO PLANO dentro del sandbox privado de la app, para
// que el login sea funcional aunque Keystore no esté operativo.
const androidKeystoreStorage: AuthStorage = {
  getItem: async (key) => {
    if (!hasBrowserStorage) return null
    const encrypted = localStorage.getItem(SECURE_PREFIX + key)
    if (encrypted) {
      try {
        const decrypted = await decryptSecure(JSON.parse(encrypted) as SecureBlob)
        if (decrypted !== null) return decrypted
      } catch {
        // Cae al respaldo en claro más abajo.
      }
    }
    return localStorage.getItem(PLAINTEXT_PREFIX + key)
  },
  setItem: async (key, value) => {
    if (!hasBrowserStorage) return
    // Verificador PKCE: siempre en claro para que sobreviva el ida y vuelta al
    // navegador aunque el Keystore falle al descifrar en el proceso nuevo.
    if (isVerifierKey(key)) {
      localStorage.setItem(PLAINTEXT_PREFIX + key, value)
      localStorage.removeItem(SECURE_PREFIX + key)
      return
    }
    const blob = await encryptSecure(value)
    if (blob) {
      localStorage.setItem(SECURE_PREFIX + key, JSON.stringify(blob))
      localStorage.removeItem(PLAINTEXT_PREFIX + key)
    } else {
      // Keystore no operativo: no perder el dato — respaldo en claro.
      localStorage.setItem(PLAINTEXT_PREFIX + key, value)
      localStorage.removeItem(SECURE_PREFIX + key)
    }
  },
  removeItem: (key) => {
    if (!hasBrowserStorage) return
    localStorage.removeItem(SECURE_PREFIX + key)
    localStorage.removeItem(PLAINTEXT_PREFIX + key)
  },
}

export const usesNativeCredentialStorage = isTauri()

// Defensa: si en algún momento el SDK dejó tokens Supabase en TEXTO PLANO en
// localStorage con el nombre por defecto (p.ej. una build web previa migrada a
// nativo), se eliminan al arrancar en Tauri para que no queden legibles.
//
// CRÍTICO: NO tocar las claves con prefijo `sb-secure-` ni `sb-plain-`. Ahí es
// donde `androidKeystoreStorage` guarda —cifrado o, como respaldo, en claro— el
// verificador PKCE y la sesión. Sin esta exclusión, cada arranque en frío
// (p.ej. al volver del navegador tras el login con Google) borraba el
// verificador y `exchangeCodeForSession` fallaba: el login nunca se completaba.
if (usesNativeCredentialStorage && hasBrowserStorage) {
  Object.keys(localStorage)
    .filter(key =>
      !key.startsWith(SECURE_PREFIX)
      && !key.startsWith(PLAINTEXT_PREFIX)
      && /^sb-.*-auth-token(?:-code-verifier)?$/.test(key))
    .forEach(key => localStorage.removeItem(key))
}

export const secureAuthStorage: AuthStorage = isAndroidTauri()
  ? androidKeystoreStorage
  : usesNativeCredentialStorage
    ? tauriCredentialStorage
    : browserStorage

/**
 * true si la sesión de Supabase (no el verificador PKCE, que siempre vive en
 * claro a propósito — ver comentario de `isVerifierKey`) está guardada sin
 * cifrar porque el Android Keystore falló al cifrar/descifrar en este
 * equipo. Antes este respaldo era completamente silencioso; esto permite
 * mostrarlo como advertencia en vez de ocultarlo (roadmap P2 > Seguridad).
 */
export function isSessionStoredInPlaintext(): boolean {
  if (!isAndroidTauri() || !hasBrowserStorage) return false
  return Object.keys(localStorage).some(key =>
    key.startsWith(PLAINTEXT_PREFIX) && !isVerifierKey(key.slice(PLAINTEXT_PREFIX.length)))
}
