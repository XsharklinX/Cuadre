import { create } from 'zustand'
import { createBackup, parseBackup } from '@/data/backup'
import { recordAuditEvent } from '@/data/audit'
import { tt } from '@/i18n'
import { decryptWithPassphrase, encryptWithPassphrase } from '@/lib/backupCrypto'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/store/auth'
import { useFinance } from '@/store/finance'

export interface CloudBackupVersion {
  path: string
  createdAt: string
}

interface CloudBackupState {
  unlocked: boolean
  busy: boolean
  versions: CloudBackupVersion[]
  error?: string
  unlock: (passphrase: string) => void
  lock: () => void
  refresh: () => Promise<void>
  createNow: () => Promise<void>
  restore: (path: string) => Promise<void>
}

const BUCKET = 'encrypted-backups'
const RETENTION = 10
const AUTO_BACKUP_INTERVAL_MS = 10 * 60 * 1000
let sessionPassphrase = ''

export const encryptCloudBackupPayload = encryptWithPassphrase
export const decryptCloudBackupPayload = decryptWithPassphrase

function requireCloudUser(): string {
  const user = useAuth.getState().user
  if (!supabase || user?.mode !== 'cloud' || !user.id) throw new Error(tt('errSignInCloud'))
  return user.id
}

function requirePassphrase(): string {
  if (!sessionPassphrase) throw new Error(tt('errUnlockBackups'))
  return sessionPassphrase
}

async function listVersions(userId = requireCloudUser()): Promise<CloudBackupVersion[]> {
  if (!supabase) return []
  const { data, error } = await supabase.storage.from(BUCKET).list(userId, { limit: 100, sortBy: { column: 'name', order: 'desc' } })
  if (error) throw new Error(error.message)
  return data
    .filter(file => file.name.endsWith('.sharky.enc'))
    .map(file => ({ path: `${userId}/${file.name}`, createdAt: file.created_at ?? file.updated_at ?? new Date().toISOString() }))
}

async function createVersion(automatic = false): Promise<void> {
  const userId = requireCloudUser()
  const encrypted = await encryptCloudBackupPayload(JSON.stringify(createBackup(useFinance.getState())), requirePassphrase())
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.sharky.enc`
  if (!supabase) return
  const { error } = await supabase.storage.from(BUCKET).upload(`${userId}/${name}`, new Blob([encrypted], { type: 'application/octet-stream' }))
  if (error) throw new Error(error.message)

  const versions = await listVersions(userId)
  const stale = versions.slice(RETENTION)
  if (stale.length) await supabase.storage.from(BUCKET).remove(stale.map(version => version.path))
  localStorage.setItem(`sharky-cloud-backup-last-v1:${userId}`, new Date().toISOString())
  recordAuditEvent('backup', automatic ? 'Backup cloud automático cifrado' : 'Backup cloud cifrado creado')
}

export async function maybeCreateAutoCloudBackup(): Promise<void> {
  const user = useAuth.getState().user
  if (!sessionPassphrase || user?.mode !== 'cloud' || !user.id) return
  const last = localStorage.getItem(`sharky-cloud-backup-last-v1:${user.id}`)
  if (last && Date.now() - Date.parse(last) < AUTO_BACKUP_INTERVAL_MS) return
  await createVersion(true)
  await useCloudBackup.getState().refresh()
}

export const useCloudBackup = create<CloudBackupState>((set) => ({
  unlocked: false,
  busy: false,
  versions: [],

  unlock: (passphrase) => {
    if (passphrase.trim().length < 10) throw new Error(tt('errPassphraseShort'))
    sessionPassphrase = passphrase
    set({ unlocked: true, error: undefined })
  },

  lock: () => {
    sessionPassphrase = ''
    set({ unlocked: false })
  },

  refresh: async () => {
    set({ busy: true, error: undefined })
    try {
      set({ versions: await listVersions(), busy: false })
    } catch (cause) {
      set({ busy: false, error: cause instanceof Error ? cause.message : 'No se pudieron listar los backups.' })
      throw cause
    }
  },

  createNow: async () => {
    set({ busy: true, error: undefined })
    try {
      await createVersion()
      set({ versions: await listVersions(), busy: false })
    } catch (cause) {
      set({ busy: false, error: cause instanceof Error ? cause.message : 'No se pudo crear el backup.' })
      throw cause
    }
  },

  restore: async (path) => {
    set({ busy: true, error: undefined })
    try {
      if (!supabase) throw new Error(tt('errCloudNotConfigured'))
      const { data, error } = await supabase.storage.from(BUCKET).download(path)
      if (error) throw new Error(error.message)
      useFinance.getState().restoreBackup(parseBackup(await decryptCloudBackupPayload(await data.text(), requirePassphrase())))
      recordAuditEvent('recovery', 'Backup cloud cifrado restaurado')
      set({ busy: false })
    } catch (cause) {
      set({ busy: false, error: cause instanceof Error ? cause.message : 'No se pudo restaurar el backup.' })
      throw cause
    }
  },
}))
