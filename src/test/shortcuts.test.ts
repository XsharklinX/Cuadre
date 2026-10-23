import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA: los atajos del icono existen de verdad en los tres sitios.
 *
 * ── LOS TRES SITIOS QUE TIENEN QUE COINCIDIR ──────────────────────────
 *  1. `shortcuts.xml` de Android, que es lo que sale al mantener pulsado.
 *  2. `SHORTCUT_IDS` en `useAppShortcut.ts`, la lista en tiempo de ejecución
 *     que decide si el enlace se acepta.
 *  3. El `useEffect` de `MobileShell`, que decide a dónde lleva cada uno.
 *
 * ── POR QUÉ DUELE QUE SE DESALINEEN ───────────────────────────────────
 * Un atajo declarado en el XML pero ausente de `SHORTCUT_IDS` aparece en el
 * menú del teléfono, el usuario lo pulsa, la app abre… y no pasa nada. Sin
 * error, sin aviso y sin nada en la pantalla que diga por qué. Pasó al añadir
 * «Cobrar»: el XML y el tipo estaban, la lista de ejecución no.
 *
 * El tipo de TypeScript no protege de esto: `SHORTCUT_IDS` es un array normal
 * al que le puede faltar un miembro del union sin que nada se queje.
 */

const RAIZ = join(__dirname, '..', '..')
const leer = (...partes: string[]) => readFileSync(join(RAIZ, ...partes), 'utf8')

const hook = leer('src', 'hooks', 'useAppShortcut.ts')
const shell = leer('src', 'mobile', 'MobileShell.tsx')
const xml = leer('src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res', 'xml', 'shortcuts.xml')
const strings = leer('src-tauri', 'gen', 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml')

/** Los ids del union `AppShortcut`. */
function idsDelTipo(): string[] {
  const linea = hook.match(/export type AppShortcut = (.+)/)?.[1] ?? ''
  return [...linea.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
}

/** Los ids de `SHORTCUT_IDS`, la lista que de verdad decide. */
function idsDeEjecucion(): string[] {
  const linea = hook.match(/const SHORTCUT_IDS: AppShortcut\[\] = \[(.*?)\]/s)?.[1] ?? ''
  return [...linea.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
}

/** Los `shortcutId` declarados en Android. */
function idsDeAndroid(): string[] {
  return [...xml.matchAll(/android:shortcutId="([^"]+)"/g)].map(m => m[1]).sort()
}

describe('los atajos del icono están enchufados', () => {
  it('el tipo y la lista de ejecución dicen lo mismo', () => {
    // Si falta uno en la lista, su enlace no pasa `isShortcutId` y el atajo
    // abre la app sin hacer nada.
    expect(idsDeEjecucion()).toEqual(idsDelTipo())
  })

  it('cada atajo de Android lo entiende la app', () => {
    const ejecucion = idsDeEjecucion()
    for (const id of idsDeAndroid()) {
      expect(ejecucion, `"${id}" sale en el teléfono y la app no lo acepta`).toContain(id)
    }
  })

  it('cada atajo de Android lleva a alguna parte', () => {
    // Aceptarlo y no hacer nada con él es el mismo fallo un paso más tarde.
    for (const id of idsDeAndroid()) {
      expect(shell, `"${id}" se acepta y nadie decide a dónde lleva`).toContain(`shortcut === '${id}'`)
    }
  })

  it('cada atajo de Android tiene sus dos textos', () => {
    // Sin el string, el build de Android falla; pero falla tarde y lejos.
    for (const id of idsDeAndroid()) {
      const base = `shortcut_${id.replace(/-/g, '_')}`
      expect(strings, `${base}_short`).toContain(`name="${base}_short"`)
      expect(strings, `${base}_long`).toContain(`name="${base}_long"`)
    }
  })

  it('«Cobrar» existe y entra en Negocio', () => {
    // Quien revende abre la app para esto y tenía que pasar por el inicio y
    // una pestaña para llegar.
    expect(idsDeAndroid()).toContain('collect')
    expect(shell).toMatch(/shortcut === 'collect'[\s\S]{0,400}setRoute\('business'\)/)
  })

  it('Android no declara más de cuatro: el menú del sistema corta', () => {
    // Un quinto atajo no se ve en la mayoría de los lanzadores, así que
    // añadirlo es trabajo que nadie encuentra.
    expect(idsDeAndroid().length).toBeLessThanOrEqual(4)
  })
})
