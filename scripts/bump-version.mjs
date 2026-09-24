#!/usr/bin/env node
// Sincroniza la VERSIÓN VISIBLE de la app con la entrada más nueva del
// changelog (`src/data/release.ts`), en los 3 archivos que deben coincidir
// siempre: package.json, src-tauri/tauri.conf.json y src-tauri/Cargo.toml.
// `APP_VERSION` se lee de package.json en build time, así que ahí queda
// reflejado automáticamente.
//
// POR QUÉ NO AUTO-INCREMENTA
//
// Antes subía el patch a ciegas en cada build (1.9.6 -> 1.9.7). Eso rompía de
// dos formas:
//
//   1. Publicó una 1.9.4 cuyo changelog más nuevo decía 1.9.3, así que al
//      actualizar "Novedades" se abría en una lista que no mencionaba lo que
//      el usuario acababa de instalar.
//   2. Cuando se añadió la comprobación que impide justo eso, empaquetar pasó
//      a ser imposible: el incremento corre ANTES de la comprobación, así que
//      exigía tener escrito el changelog de un número que todavía no existía.
//
// El changelog es lo único que sabe qué versión se está publicando, porque es
// donde se escribe a mano lo que lleva. Así que manda él.
//
// Se corre antes de cada build de Android (ver scripts/package-android.ps1).
//
// Nota: esto es independiente del `versionCode` interno de Android (el
// contador que exige Google Play, invisible al usuario) — ese sí sube solo en
// cada empaquetado, vive en release/android/version-code.txt y NO debe
// tocarse a mano ni bajarse nunca: rompería futuras subidas a la tienda.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Compara dos versiones X.Y.Z. Devuelve <0, 0 o >0. */
function compareVersions(a, b) {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/** La versión más alta que aparece en el changelog. */
function newestReleaseNote() {
  const source = readFileSync(join(repoRoot, 'src', 'data', 'release.ts'), 'utf8')
  const found = [...source.matchAll(/version:\s*'(\d+\.\d+\.\d+)'/g)].map(m => m[1])
  if (found.length === 0) {
    throw new Error('No se encontró ninguna entrada de versión en src/data/release.ts')
  }
  // La más alta, no la primera del archivo: si alguien añade una entrada en el
  // sitio equivocado, la versión que se publica sigue siendo la correcta.
  return found.sort(compareVersions).at(-1)
}

const pkgPath = join(repoRoot, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const current = pkg.version
const target = newestReleaseNote()

const diff = compareVersions(target, current)

if (diff < 0) {
  // El changelog se quedó atrás: alguien subió la versión a mano sin escribir
  // qué lleva. Publicar así deja al usuario con unas "Novedades" que no
  // mencionan lo que acaba de instalar.
  throw new Error(
    `La versión de package.json (${current}) es más nueva que la última entrada del ` +
    `changelog (${target}). Agrega la entrada de ${current} en src/data/release.ts, ` +
    `o corrige la versión.`,
  )
}

if (diff === 0) {
  console.log(`Versión ${current} (coincide con el changelog; el versionCode sí sube).`)
  process.exit(0)
}

pkg.version = target
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

const tauriConfPath = join(repoRoot, 'src-tauri', 'tauri.conf.json')
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
tauriConf.version = target
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n')

const cargoPath = join(repoRoot, 'src-tauri', 'Cargo.toml')
const cargo = readFileSync(cargoPath, 'utf8')
writeFileSync(cargoPath, cargo.replace(/^version\s*=\s*"[\d.]+"/m, `version     = "${target}"`))

console.log(`Versión actualizada: ${current} -> ${target} (según el changelog)`)
