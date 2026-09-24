#!/usr/bin/env node
// Marca una versión como YA PUBLICADA en Google Play, escribiendo
// `docs/version.json` (el manifiesto que sirve GitHub Pages).
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUÉ ESTE ARCHIVO SIGUE EXISTIENDO
//
// Desde 1.9.7 la app pregunta directamente a Google Play si hay algo nuevo
// (plugin `in-app-update`), así que no necesita este manifiesto para nada.
//
// Pero las copias YA INSTALADAS —1.9.6 y anteriores— no tienen ese plugin:
// siguen leyendo este archivo y no hay forma de cambiarles el código. Es el
// ÚNICO canal que queda para avisarles de que actualicen.
//
// Y llevaba clavado en 1.7.4 mientras la app iba por la 1.9.6, así que durante
// nueve versiones no avisó a nadie. Mantenerlo al día es, literalmente, lo que
// rescata a esos usuarios.
//
// ─────────────────────────────────────────────────────────────────────────
// POR QUÉ NO SE ACTUALIZA SOLO AL COMPILAR
//
// Porque diría una mentira. Entre compilar el AAB y que Play lo publique pasan
// horas o días de revisión. Si el manifiesto se adelantara, los usuarios verían
// "actualiza a la 1.9.7", irían a Play y encontrarían la 1.9.6: exactamente el
// tipo de aviso que enseña a ignorar los avisos.
//
// Este archivo dice lo que está VIVO, no lo que está compilado. Por eso hace
// falta un humano que confirme que Play ya la publicó — y por eso es un
// comando de una línea, para que no dé pereza.
//
//   npm run release:live          → marca la versión de package.json
//   npm run release:live 1.9.7    → marca una concreta

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(repoRoot, 'docs', 'version.json')

const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'))
const version = process.argv[2] ?? pkg.version

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Versión no válida: "${version}". Formato esperado: 1.9.7`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const previous = manifest.android?.version

if (previous === version) {
  console.log(`docs/version.json ya estaba en ${version}. Sin cambios.`)
  process.exit(0)
}

manifest.android = { ...manifest.android, version }
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

console.log(`docs/version.json: ${previous} → ${version}`)
console.log('')
console.log('Falta un paso: haz commit y push para que GitHub Pages lo sirva.')
console.log('Hasta entonces, las versiones antiguas seguirán sin enterarse.')
