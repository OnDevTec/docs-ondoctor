#!/usr/bin/env node
/**
 * Detecta arquivos .mp4 em public/assets/ que na verdade são GIFs
 * (vítimas do bug onde o migrate-content renomeia via assets-renames.json
 * sem converter o conteúdo). Renomeia de volta para .gif para que o
 * convert-gifs-to-mp4 possa fazer a conversão real depois.
 *
 * Uso:
 *   node scripts/fix-fake-mp4.mjs              # dry-run
 *   node scripts/fix-fake-mp4.mjs --apply      # aplica
 */

import { readdirSync, statSync, openSync, readSync, closeSync, renameSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ASSETS_DIR = resolve(__dirname, '..', 'public', 'assets')
const APPLY = process.argv.includes('--apply')

function isReallyGif(filePath) {
  try {
    const buf = Buffer.alloc(6)
    const fd = openSync(filePath, 'r')
    readSync(fd, buf, 0, 6, 0)
    closeSync(fd)
    const sig = buf.toString('ascii')
    return sig.startsWith('GIF87a') || sig.startsWith('GIF89a')
  } catch { return false }
}

const fakes = []
for (const f of readdirSync(ASSETS_DIR)) {
  if (!f.toLowerCase().endsWith('.mp4')) continue
  const full = join(ASSETS_DIR, f)
  if (!statSync(full).isFile()) continue
  if (isReallyGif(full)) fakes.push(f)
}

console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log(`Arquivos .mp4 com conteúdo GIF: ${fakes.length}`)
for (const f of fakes) console.log(`  ${f}`)

if (APPLY && fakes.length > 0) {
  for (const f of fakes) {
    const from = join(ASSETS_DIR, f)
    const to = join(ASSETS_DIR, f.replace(/\.mp4$/i, '.gif'))
    renameSync(from, to)
  }
  console.log(`\nRenomeados ${fakes.length} de .mp4 -> .gif`)
  console.log(`Próximo: rode npm run convert:gifs -- --apply  e depois  npm run optimize:videos -- --apply`)
}
