import { decryptSecure, encryptSecure, isAndroidTauri, type SecureBlob } from './secureBlob'

const STORAGE_KEY = 'sharky-applock-v1'

interface StoredLock {
  pin: SecureBlob | null
  pattern: SecureBlob | null
}

interface AppLock {
  pin: string | null
  pattern: string | null
}

/**
 * Carga el PIN/patrón cifrados con Android Keystore.
 * En cualquier otra plataforma no hace nada (el PIN/patrón viven en el
 * persist normal de `useSettings`).
 */
export async function loadAppLock(): Promise<AppLock> {
  if (!isAndroidTauri()) return { pin: null, pattern: null }

  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { pin: null, pattern: null }

  try {
    const stored = JSON.parse(raw) as StoredLock
    const pin = stored.pin ? await decryptSecure(stored.pin) : null
    const pattern = stored.pattern ? await decryptSecure(stored.pattern) : null

    if ((stored.pin && pin == null) || (stored.pattern && pattern == null)) {
      // La clave de Keystore ya no es válida o el blob está corrupto:
      // preferimos perder el PIN antes que dejar al usuario sin acceso.
      localStorage.removeItem(STORAGE_KEY)
      return { pin: null, pattern: null }
    }

    return { pin, pattern }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
    return { pin: null, pattern: null }
  }
}

/** Cifra y guarda el PIN/patrón. No hace nada fuera de Android+Tauri. */
export async function saveAppLock(pin: string | null, pattern: string | null): Promise<void> {
  if (!isAndroidTauri()) return

  if (pin == null && pattern == null) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }

  const stored: StoredLock = {
    pin: pin != null ? await encryptSecure(pin) : null,
    pattern: pattern != null ? await encryptSecure(pattern) : null,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}
