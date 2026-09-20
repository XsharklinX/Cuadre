import { isTauri } from '@/hooks/useTauri'

/** Resultado cifrado: IV + datos, ambos en Base64. */
export interface SecureBlob {
  iv: string
  data: string
}

/** True si la app corre en Android dentro de Tauri (donde existe el plugin keystore). */
export function isAndroidTauri(): boolean {
  return isTauri() && /android/i.test(navigator.userAgent)
}

/** Cifra `plaintext` con la clave de Android Keystore. `null` si no está disponible. */
export async function encryptSecure(plaintext: string): Promise<SecureBlob | null> {
  if (!isAndroidTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<SecureBlob>('plugin:keystore|encrypt', { plaintext })
  } catch {
    return null
  }
}

/** Descifra un blob. `null` si no está disponible o si la clave/datos son inválidos. */
export async function decryptSecure(blob: SecureBlob): Promise<string | null> {
  if (!isAndroidTauri()) return null
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const res = await invoke<{ plaintext: string }>('plugin:keystore|decrypt', { iv: blob.iv, data: blob.data })
    return res.plaintext
  } catch {
    return null
  }
}
