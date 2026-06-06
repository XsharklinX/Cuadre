import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Stub localStorage with in-memory implementation
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  clear:     () => storage.clear(),
  getItem:   (k: string) => storage.get(k) ?? null,
  removeItem:(k: string) => storage.delete(k),
  setItem:   (k: string, v: string) => storage.set(k, v),
  get length() { return storage.size },
  key: (i: number) => [...storage.keys()][i] ?? null,
})
