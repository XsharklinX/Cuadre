import { tt } from '@/i18n'

/**
 * Cifrado simétrico con passphrase (PBKDF2 + AES-GCM vía Web Crypto) para
 * proteger backups. Extraído de `data/cloudBackup.ts` a un módulo neutral
 * para poder reusarlo también en el backup/restore local de archivos, sin
 * acoplar ese flujo a Supabase.
 */
export interface EncryptedEnvelope {
  version: 1
  algorithm: 'AES-GCM'
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

const ITERATIONS = 250_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach(byte => { binary += String.fromCharCode(byte) })
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0))
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: Uint8Array.from(salt).buffer,
    iterations: ITERATIONS,
  }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function encryptWithPassphrase(value: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value))
  const envelope: EncryptedEnvelope = {
    version: 1,
    algorithm: 'AES-GCM',
    iterations: ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  }
  return JSON.stringify(envelope)
}

export async function decryptWithPassphrase(value: string, passphrase: string): Promise<string> {
  let envelope: EncryptedEnvelope
  try {
    envelope = JSON.parse(value) as EncryptedEnvelope
  } catch {
    throw new Error(tt('errEncBackupCorrupt'))
  }
  if (envelope.version !== 1 || envelope.algorithm !== 'AES-GCM' || envelope.iterations !== ITERATIONS) {
    throw new Error(tt('errEncBackupFormat'))
  }
  try {
    const key = await deriveKey(passphrase, base64ToBytes(envelope.salt))
    const iv = Uint8Array.from(base64ToBytes(envelope.iv))
    const ciphertext = Uint8Array.from(base64ToBytes(envelope.ciphertext))
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return decoder.decode(clear)
  } catch {
    throw new Error(tt('errPassphraseWrong'))
  }
}

/** Heurística para saber si un texto de backup está cifrado, sin intentar descifrarlo. */
export function looksEncrypted(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as Partial<EncryptedEnvelope>
    return parsed.version === 1 && parsed.algorithm === 'AES-GCM' && typeof parsed.ciphertext === 'string'
  } catch {
    return false
  }
}
