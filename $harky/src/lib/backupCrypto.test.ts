import { describe, expect, it } from 'vitest'
import { decryptWithPassphrase, encryptWithPassphrase, looksEncrypted } from './backupCrypto'

describe('backupCrypto', () => {
  it('cifra y descifra el mismo texto con la passphrase correcta', async () => {
    const original = JSON.stringify({ hello: 'world', n: 42 })
    const encrypted = await encryptWithPassphrase(original, 'correcto-caballo-batería-grapa')
    const decrypted = await decryptWithPassphrase(encrypted, 'correcto-caballo-batería-grapa')
    expect(decrypted).toBe(original)
  })

  it('rechaza una passphrase incorrecta', async () => {
    const encrypted = await encryptWithPassphrase('secreto', 'clave-correcta-123')
    await expect(decryptWithPassphrase(encrypted, 'clave-incorrecta-456')).rejects.toThrow()
  })

  it('rechaza contenido corrupto (no JSON)', async () => {
    await expect(decryptWithPassphrase('no soy json', 'cualquiera')).rejects.toThrow()
  })

  it('rechaza un envelope con formato desconocido', async () => {
    const badEnvelope = JSON.stringify({ version: 2, algorithm: 'AES-GCM', iterations: 1, salt: '', iv: '', ciphertext: '' })
    await expect(decryptWithPassphrase(badEnvelope, 'x')).rejects.toThrow()
  })

  it('looksEncrypted detecta un backup cifrado vs. uno plano', async () => {
    const encrypted = await encryptWithPassphrase('data', 'passphrase-larga-123')
    const plain = JSON.stringify({ version: 1, exportedAt: '2026-01-01', data: {} })
    expect(looksEncrypted(encrypted)).toBe(true)
    expect(looksEncrypted(plain)).toBe(false)
    expect(looksEncrypted('not json at all')).toBe(false)
  })
})
