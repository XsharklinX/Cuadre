#!/usr/bin/env node
// Sube en 1 el número de PATCH (X.Y.Z -> X.Y.Z+1) en los 3 archivos que
// deben coincidir siempre: package.json, src-tauri/tauri.conf.json y
// src-tauri/Cargo.toml. `APP_VERSION` en la app se lee de package.json en
// build time, así que ahí queda reflejado automáticamente.
//
// Se corre antes de cada build de Android (ver scripts/package-android.ps1)
// para que la versión visible en Configuración > Acerca de suba sola con
// cada paquete generado, sin que haya que acordarse de tocarla a mano.
//
// Nota: esto es independiente del `versionCode` interno de Android (el
// contador que exige Google Play, invisible al usuario) — ese sigue su
// propio mecanismo en tauri.conf.json (`autoIncrementVersionCode`) y NO debe
// tocarse manualmente ni bajarse nunca: rompería futuras subidas a la tienda.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

function bumpPatch(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/)
  if (!match) throw new Error(`Versión con formato inesperado: "${version}"`)
  const [, major, minor, patch] = match
  return `${major}.${minor}.${Number(patch) + 1}`
}

const pkgPath = join(repoRoot, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const previousVersion = pkg.version
const nextVersion = bumpPatch(previousVersion)
pkg.version = nextVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')

const tauriConfPath = join(repoRoot, 'src-tauri', 'tauri.conf.json')
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'))
tauriConf.version = nextVersion
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n')

const cargoPath = join(repoRoot, 'src-tauri', 'Cargo.toml')
const cargo = readFileSync(cargoPath, 'utf8')
const nextCargo = cargo.replace(/^version\s*=\s*"[\d.]+"/m, `version     = "${nextVersion}"`)
writeFileSync(cargoPath, nextCargo)

console.log(`Versión actualizada: ${previousVersion} -> ${nextVersion}`)
