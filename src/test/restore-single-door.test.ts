import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GUARDIA: restaurar tiene que pasar por UNA sola puerta.
 *
 * ── LO QUE PASÓ ───────────────────────────────────────────────────────
 * Hay tres formas de restaurar datos en la app: la copia de seguridad, un
 * punto de recuperación desde Salud de datos, y la importación por QR desde
 * otro teléfono. Las tres llamaban a `restoreBackup` por su cuenta.
 *
 * Al añadir clientes y cobros, restaurar pasó a necesitar un paso más:
 * reconciliar esos datos contra el libro nuevo, porque si no, los cobros
 * quedan apuntando a movimientos borrados y las limpiezas del arranque los dan
 * por basura. Arreglé el primer camino y me dejé los otros dos.
 *
 * Los puntos de recuperación eran los peores de olvidar: la app los crea sola
 * antes de cada operación destructiva, así que son la red de seguridad. Usar
 * la red no puede costarte los clientes.
 *
 * ── QUÉ SE VIGILA ─────────────────────────────────────────────────────
 * Que nadie fuera del store y de `restoreAll.ts` llame a `restoreBackup`.
 * Quien quiera restaurar usa `restoreEverything`, que hace las dos mitades.
 */

const SRC = join(__dirname, '..')

/** Los archivos a los que SÍ les toca nombrar `restoreBackup`. */
const PERMITIDOS = [
  join('store', 'finance.ts'),   // lo define
  join('lib', 'restoreAll.ts'),  // la puerta única
]

function archivos(dir: string, salida: string[] = []): string[] {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name)
    if (entrada.isDirectory()) { archivos(ruta, salida); continue }
    if (!/\.tsx?$/.test(entrada.name)) continue
    if (entrada.name.includes('.test.')) continue
    salida.push(ruta)
  }
  return salida
}

describe('restaurar pasa por una sola puerta', () => {
  const infractores = archivos(SRC)
    .filter(ruta => !PERMITIDOS.some(permitido => ruta.endsWith(permitido)))
    .filter(ruta => {
      const texto = readFileSync(ruta, 'utf-8')
      // Se busca la LLAMADA, no la palabra: un comentario que la nombre o un
      // tipo que la declare no restauran nada.
      return /\brestoreBackup\s*\(/.test(texto)
    })
    .map(ruta => ruta.slice(SRC.length + 1))

  it('la puerta única existe y restaura las dos mitades', () => {
    // Si alguien la vacía, este guardia pasaría en verde sobre nada.
    const puerta = readFileSync(join(SRC, 'lib', 'restoreAll.ts'), 'utf-8')
    expect(puerta).toContain('restoreBackup')
    expect(puerta).toContain('reconcileBusinessData')
    expect(puerta).toContain('useCaprices')
  })

  it('nadie más llama a restoreBackup directamente', () => {
    expect(
      infractores,
      `Estos restauran el libro sin reconciliar los datos de negocio, así que dejan cobros apuntando a movimientos borrados:\n${infractores.map(f => `  ${f}`).join('\n')}`,
    ).toEqual([])
  })

  it('los tres caminos conocidos usan la puerta', () => {
    const caminos = [
      join('mobile', 'settings', 'SettingsData.tsx'),
      join('mobile', 'MobileDataHealth.tsx'),
      join('mobile', 'MobileQrImport.tsx'),
    ]
    for (const camino of caminos) {
      const texto = readFileSync(join(SRC, camino), 'utf-8')
      expect(texto, `${camino} no usa restoreEverything`).toContain('restoreEverything')
    }
  })
})
