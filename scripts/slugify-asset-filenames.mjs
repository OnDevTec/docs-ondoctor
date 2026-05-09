#!/usr/bin/env node
/**
 * Normaliza TODOS os nomes em public/assets/ para slug seguro:
 *   - Lowercase
 *   - Acentos removidos
 *   - Espaços, parens e caracteres especiais -> "-"
 *   - Extensão em lowercase
 *
 * Lida com colisões sufixando -2, -3.
 * Reescreve refs nos .md e atualiza .vitepress/assets-renames.json.
 *
 * Uso:
 *   node scripts/slugify-asset-filenames.mjs              # dry-run
 *   node scripts/slugify-asset-filenames.mjs --apply      # aplica
 */

import {
  readFileSync, writeFileSync, renameSync, readdirSync, statSync, existsSync, mkdirSync
} from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')
const MAPPING_PATH = resolve(ROOT, '.vitepress', 'assets-renames.json')

const APPLY = process.argv.includes('--apply')
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist'])

function slugifyFilename(name) {
  const m = name.match(/^(.*)\.([^.]+)$/)
  if (!m) return null
  const stem = m[1]
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (!stem) return null
  return `${stem}.${m[2].toLowerCase()}`
}

function encodeAsset(name) {
  let decoded
  try { decoded = decodeURIComponent(name) } catch { decoded = name }
  return encodeURIComponent(decoded).replace(/\(/g, '%28').replace(/\)/g, '%29')
}

function walkMd(dir, files = []) {
  for (const e of readdirSync(dir)) {
    if (e.startsWith('.') || SKIP_DIRS.has(e)) continue
    const full = join(dir, e)
    const st = statSync(full)
    if (st.isDirectory()) walkMd(full, files)
    else if (st.isFile() && e.toLowerCase().endsWith('.md')) files.push(full)
  }
  return files
}

const allFiles = readdirSync(ASSETS_DIR).filter(f => statSync(join(ASSETS_DIR, f)).isFile()).sort()

const used = new Set(allFiles)
const planned = []
for (const f of allFiles) {
  let target = slugifyFilename(f)
  if (!target || target === f) continue
  // Resolve colisões
  if (used.has(target) && target !== f) {
    const m = target.match(/^(.*)(\.[^.]+)$/)
    let n = 2
    while (true) {
      const candidate = `${m[1]}-${n}${m[2]}`
      if (!used.has(candidate)) { target = candidate; break }
      n++
    }
  }
  used.delete(f)
  used.add(target)
  planned.push({ from: f, to: target })
}

console.log(`Arquivos em public/assets/: ${allFiles.length}`)
console.log(`Renomeações planejadas: ${planned.length}`)
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log()

// Amostra
for (const p of planned.slice(0, 10)) {
  console.log(`  ${p.from}  ->  ${p.to}`)
}
if (planned.length > 10) console.log(`  ... e mais ${planned.length - 10}`)
console.log()

if (planned.length === 0) {
  console.log('Nada a fazer. Todos os nomes já estão limpos.')
  process.exit(0)
}

// Reescreve refs em .md
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const encoded = planned
  .map(p => [encodeAsset(p.from), encodeAsset(p.to)])
  .filter(([f, t]) => f !== t)
  .sort((a, b) => b[0].length - a[0].length)
const lookup = new Map(encoded)
const re = new RegExp(`/assets/(${encoded.map(([f]) => escape(f)).join('|')})`, 'g')

const mdFiles = walkMd(ROOT)
let mdChanged = 0, totalRefs = 0
for (const md of mdFiles) {
  const orig = readFileSync(md, 'utf8')
  let count = 0
  const updated = orig.replace(re, (_, from) => { count++; return `/assets/${lookup.get(from)}` })
  if (count > 0) {
    if (APPLY) writeFileSync(md, updated, 'utf8')
    mdChanged++
    totalRefs += count
  }
}
console.log(`Refs em .md: ${totalRefs} reescrita(s) em ${mdChanged} arquivo(s)`)

if (APPLY) {
  let renamed = 0
  for (const p of planned) {
    renameSync(join(ASSETS_DIR, p.from), join(ASSETS_DIR, p.to))
    renamed++
  }
  console.log(`Arquivos renomeados: ${renamed}`)

  // Atualiza mapping cumulativo
  let existing = {}
  if (existsSync(MAPPING_PATH)) {
    try { existing = JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) } catch {}
  }
  // Encadeia: se existing[X] = p.from, atualiza para existing[X] = p.to
  const inverse = new Map(Object.entries(existing).map(([k, v]) => [v, k]))
  for (const p of planned) {
    if (inverse.has(p.from)) {
      const original = inverse.get(p.from)
      existing[original] = p.to
    } else {
      existing[p.from] = p.to
    }
  }
  mkdirSync(dirname(MAPPING_PATH), { recursive: true })
  writeFileSync(MAPPING_PATH, JSON.stringify(existing, Object.keys(existing).sort(), 2) + '\n', 'utf8')
  console.log(`Mapping atualizado: ${relative(ROOT, MAPPING_PATH)}`)
} else {
  console.log()
  console.log(`[DRY-RUN] Nada foi alterado. Para aplicar:`)
  console.log(`  node scripts/slugify-asset-filenames.mjs --apply`)
}
