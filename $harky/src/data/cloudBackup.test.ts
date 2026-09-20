import { describe, expect, it } from 'vitest'
import { decryptCloudBackupPayload, encryptCloudBackupPayload } from '@/data/cloudBackup'

describe('encrypted cloud backups', () => {
  it('descifra el contenido con la misma frase secreta', async () => {
    const payload = '{"version":1,"data":{"accounts":[]}}'
    const encrypted = await encryptCloudBackupPayload(payload, 'frase secreta de prueba')
    await expect(decryptCloudBackupPayload(encrypted, 'frase secreta de prueba')).resolves.toBe(payload)
    expect(encrypted).not.toContain(payload)
  })

  it('rechaza una frase secreta incorrecta', async () => {
    const encrypted = await encryptCloudBackupPayload('contenido privado', 'frase correcta extensa')
    await expect(decryptCloudBackupPayload(encrypted, 'frase incorrecta extensa')).rejects.toThrow('frase secreta')
  })
})
