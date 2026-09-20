import { isTauri } from '@/hooks/useTauri'

export interface BiometricStatus {
  available: boolean
  biometryType: 'fingerprint' | 'faceId' | 'iris' | 'none'
}

/** Returns whether biometric auth is available on this device. */
export async function checkBiometric(): Promise<BiometricStatus> {
  if (!isTauri()) return { available: false, biometryType: 'none' }
  try {
    const { checkStatus, BiometryType } = await import('@tauri-apps/plugin-biometric')
    const status = await checkStatus()
    const available = status.isAvailable
    const type = status.biometryType
    const biometryType =
      type === BiometryType.TouchID ? 'fingerprint'
      : type === BiometryType.FaceID ? 'faceId'
      : type === BiometryType.Iris ? 'iris'
      : 'none'
    return { available, biometryType }
  } catch {
    return { available: false, biometryType: 'none' }
  }
}

/** Prompts the user for biometric authentication. Throws on failure or cancellation. */
export async function authenticateBiometric(reason = 'Verificar tu identidad'): Promise<void> {
  if (!isTauri()) throw new Error('Biometric not available outside Tauri')
  const { authenticate } = await import('@tauri-apps/plugin-biometric')
  await authenticate(reason, {
    title: '$harky',
    subtitle: reason,
    cancelTitle: 'Cancelar',
    fallbackTitle: 'Usar PIN o patrón',
  })
}
