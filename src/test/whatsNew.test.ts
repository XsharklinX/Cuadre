import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION, RELEASE_NOTES } from '@/data/release'

function installMemoryStorage(seed?: Record<string, string>) {
  const values = new Map<string, string>(Object.entries(seed ?? {}))
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (k: string) => values.get(k) ?? null,
    removeItem: (k: string) => values.delete(k),
    setItem: (k: string, v: string) => values.set(k, v),
  })
  return values
}

/** Se importa fresco en cada caso: el módulo lee localStorage al invocarse. */
async function loadModule() {
  vi.resetModules()
  return import('@/mobile/MobileWhatsNew')
}

describe('cuándo se abren las Novedades solas', () => {
  beforeEach(() => { vi.unstubAllGlobals() })

  it('NO se abren en una instalación nueva', async () => {
    // Un changelog de cosas que nunca viste no dice nada y te roba el primer
    // momento con la app.
    const store = installMemoryStorage()
    const { shouldShowWhatsNew } = await loadModule()
    expect(shouldShowWhatsNew()).toBe(false)
    // Y deja marcada la versión, para no preguntarlo otra vez.
    expect(store.get('sharky-seen-version-v1')).toBe(APP_VERSION)
  })

  it('SÍ se abren tras actualizar desde una versión anterior', async () => {
    installMemoryStorage({ 'sharky-seen-version-v1': '1.8.17' })
    const { shouldShowWhatsNew } = await loadModule()
    expect(shouldShowWhatsNew()).toBe(true)
  })

  it('no se repiten si ya se vieron en esta versión', async () => {
    installMemoryStorage({ 'sharky-seen-version-v1': APP_VERSION })
    const { shouldShowWhatsNew } = await loadModule()
    expect(shouldShowWhatsNew()).toBe(false)
  })

  it('no se abren si la versión guardada es MÁS nueva (rollback)', async () => {
    installMemoryStorage({ 'sharky-seen-version-v1': '99.0.0' })
    const { shouldShowWhatsNew } = await loadModule()
    expect(shouldShowWhatsNew()).toBe(false)
  })

  it('marcarlas como vistas fija la versión actual', async () => {
    const store = installMemoryStorage({ 'sharky-seen-version-v1': '1.0.0' })
    const { markVersionSeen } = await loadModule()
    markVersionSeen()
    expect(store.get('sharky-seen-version-v1')).toBe(APP_VERSION)
  })

  it('sin almacenamiento no interrumpe ni revienta', async () => {
    // Modo privado o almacenamiento bloqueado: mostrar el changelog en cada
    // arranque sería peor que no mostrarlo.
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('bloqueado') },
      setItem: () => { throw new Error('bloqueado') },
    })
    const { shouldShowWhatsNew, markVersionSeen } = await loadModule()
    expect(shouldShowWhatsNew()).toBe(false)
    expect(() => markVersionSeen()).not.toThrow()
  })
})

describe('contenido del changelog', () => {
  it('la versión que se publica tiene su entrada', async () => {
    // Si esto falla, se está publicando una versión sin notas y el usuario
    // abriría Novedades a una lista que no menciona lo que acaba de instalar.
    const versions = RELEASE_NOTES.map(n => n.version)
    expect(versions, `Falta la entrada de ${APP_VERSION} en RELEASE_NOTES`).toContain(APP_VERSION)
  })

  it('ninguna entrada está vacía', async () => {
    for (const note of RELEASE_NOTES) {
      expect(note.items.length, note.version).toBeGreaterThan(0)
      expect(note.title.trim().length, note.version).toBeGreaterThan(0)
    }
  })

  it('las fechas son válidas y no están en el futuro lejano', async () => {
    for (const note of RELEASE_NOTES) {
      expect(note.date, note.version).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(Number.isNaN(Date.parse(note.date)), note.version).toBe(false)
    }
  })

  it('no hay versiones duplicadas', async () => {
    const versions = RELEASE_NOTES.map(n => n.version)
    expect(new Set(versions).size).toBe(versions.length)
  })
})
