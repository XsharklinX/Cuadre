#!/usr/bin/env node
// Empaqueta los simbolos de depuracion nativos para subirlos a Play Console.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUE HACE FALTA ESTO
//
// Play avisa en cada subida: "Este App Bundle contiene codigo nativo y no
// subiste simbolos de depuracion". Sin ellos, un fallo dentro de la libreria
// de Rust llega a Play Console como una pila de direcciones hexadecimales:
// se ve QUE reventó, pero no DONDE.
//
// `app/build.gradle.kts` ya pide `ndk { debugSymbolLevel = "FULL" }`, que en
// teoria deberia meterlos en el propio .aab. No lo hace: se comprobo el
// paquete de 1.9.9 y no trae `BUNDLE-METADATA/...nativesymbols/`. El .so
// conserva sus secciones `.symtab` y `.debug_info` —o sea, los simbolos
// EXISTEN—, pero AGP no llego a procesarlo; lo mas probable es que sea porque
// Tauri deja el .so en `jniLibs` como ENLACE SIMBOLICO (lo dice su propio log:
// "symlinking lib ... in jniLibs dir") y la tarea que los extrae no lo sigue.
//
// Pelearse con eso es fragil. Play acepta subir el zip a mano, y este script
// lo construye desde los .so que Cargo ya dejo compilados.
//
// ─────────────────────────────────────────────────────────────────────────
// USO
//
//   npm run symbols
//
// Deja `release/android/native-debug-symbols.zip`. En Play Console:
// Produccion > la version > "Simbolos de depuracion nativos".
//
// Se ejecuta DESPUES de empaquetar: lee lo que dejo la compilacion, no
// compila nada.

import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Cada objetivo de Rust con el nombre de ABI que espera Play.
 *
 * El zip se organiza por ABI (`arm64-v8a/libsharky_lib.so`), que es como Play
 * cruza cada fallo con su simbolo. Con los nombres de Rust —`aarch64-linux-
 * android`— no encontraria ninguno.
 */
const ABIS = [
  ['aarch64-linux-android',   'arm64-v8a'],
  ['armv7-linux-androideabi', 'armeabi-v7a'],
  ['i686-linux-android',      'x86'],
  ['x86_64-linux-android',    'x86_64'],
]

const LIB = 'libsharky_lib.so'

const entradas = []
for (const [target, abi] of ABIS) {
  const origen = join(repoRoot, 'src-tauri', 'target', target, 'release', LIB)
  if (!existsSync(origen)) {
    console.warn(`  · ${abi}: sin compilar, se omite`)
    continue
  }
  const data = readFileSync(origen)
  // Un .so ya despojado no sirve de nada en Play: ocuparia sitio y no
  // resolveria ni una linea. Mejor decirlo que subir un zip inutil.
  if (!data.includes(Buffer.from('.symtab'))) {
    console.warn(`  · ${abi}: el .so no conserva simbolos, se omite`)
    continue
  }
  entradas.push({ nombre: `${abi}/${LIB}`, data })
  console.log(`  · ${abi}: ${(statSync(origen).size / 1048576).toFixed(1)} MB`)
}

if (entradas.length === 0) {
  console.error('\nNo hay ningun .so con simbolos. Compila antes: npm run android:release')
  process.exit(1)
}

// ── Escritura del ZIP ──────────────────────────────────────────────────
// A mano, sin dependencias: meter una libreria de terceros en el arbol para
// escribir un zip de cuatro archivos no compensa.

const CRC_TABLA = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

const destino = join(repoRoot, 'release', 'android', 'native-debug-symbols.zip')
mkdirSync(dirname(destino), { recursive: true })

const locales = []
const centrales = []
let offset = 0

for (const { nombre, data } of entradas) {
  const nombreBuf = Buffer.from(nombre, 'utf8')
  const comprimido = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)

  const cabecera = Buffer.alloc(30)
  cabecera.writeUInt32LE(0x04034b50, 0)   // firma local
  cabecera.writeUInt16LE(20, 4)           // version necesaria
  cabecera.writeUInt16LE(0, 6)            // banderas
  cabecera.writeUInt16LE(8, 8)            // metodo: deflate
  cabecera.writeUInt32LE(0, 10)           // fecha/hora
  cabecera.writeUInt32LE(crc, 14)
  cabecera.writeUInt32LE(comprimido.length, 18)
  cabecera.writeUInt32LE(data.length, 22)
  cabecera.writeUInt16LE(nombreBuf.length, 26)
  cabecera.writeUInt16LE(0, 28)           // extra
  locales.push(cabecera, nombreBuf, comprimido)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)    // firma central
  central.writeUInt16LE(20, 4)            // version que lo creo
  central.writeUInt16LE(20, 6)            // version necesaria
  central.writeUInt16LE(0, 8)
  central.writeUInt16LE(8, 10)
  central.writeUInt32LE(0, 12)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(comprimido.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nombreBuf.length, 28)
  central.writeUInt32LE(offset, 42)
  centrales.push(central, nombreBuf)

  offset += cabecera.length + nombreBuf.length + comprimido.length
}

const cuerpoCentral = Buffer.concat(centrales)
const fin = Buffer.alloc(22)
fin.writeUInt32LE(0x06054b50, 0)
fin.writeUInt16LE(entradas.length, 8)
fin.writeUInt16LE(entradas.length, 10)
fin.writeUInt32LE(cuerpoCentral.length, 12)
fin.writeUInt32LE(offset, 16)

const salida = createWriteStream(destino)
for (const parte of [...locales, cuerpoCentral, fin]) salida.write(parte)
salida.end()

salida.on('finish', () => {
  const mb = (statSync(destino).size / 1048576).toFixed(1)
  console.log(`\nSimbolos listos (${entradas.length} ABI, ${mb} MB):\n  ${destino}`)
  console.log('\nPlay Console > Produccion > la version > "Simbolos de depuracion nativos".')
})
