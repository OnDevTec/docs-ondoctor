#!/usr/bin/env node
/**
 * Aplica renomeações sugeridas em RENAMES.csv:
 *   - Renomeia os arquivos físicos em public/assets/
 *   - Atualiza todas as referências URL-encoded nos .md
 *   - Persiste o mapping em .vitepress/assets-renames.json (acumulativo)
 *
 * O migrate-content.mjs lê esse JSON depois de copiar os assets, então
 * re-rodar a migração a partir do GitBook NÃO desfaz os renames.
 *
 * Uso:
 *   node scripts/apply-renames.mjs              # dry-run
 *   node scripts/apply-renames.mjs --apply      # aplica
 *   node scripts/apply-renames.mjs --csv path   # CSV custom (default RENAMES.csv)
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
const csvIdx = process.argv.indexOf('--csv')
const CSV_PATH = csvIdx >= 0
  ? resolve(ROOT, process.argv[csvIdx + 1])
  : resolve(ROOT, 'RENAMES.csv')

const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist'])

function parseCsv(text) {
  const rows = []
  const lines = text.split(/\r?\n/).filter(l => l.length > 0)
  for (const line of lines) {
    const cells = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++ }
          else inQ = false
        } else cur += c
      } else {
        if (c === '"') inQ = true
        else if (c === ',') { cells.push(cur); cur = '' }
        else cur += c
      }
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
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

if (!existsSync(CSV_PATH)) {
  console.error(`CSV não encontrado: ${CSV_PATH}`)
  console.error(`Rode antes:  node scripts/suggest-renames.mjs`)
  process.exit(1)
}

const rows = parseCsv(readFileSync(CSV_PATH, 'utf8'))
const header = rows.shift()
const fromCol = header.indexOf('arquivo_atual')
const toCol = header.indexOf('sugestao')
if (fromCol < 0 || toCol < 0) {
  console.error(`CSV mal formado — esperado colunas 'arquivo_atual' e 'sugestao'`)
  process.exit(1)
}

// Coleta pares
const pairs = []
for (const row of rows) {
  const from = row[fromCol]
  const to = row[toCol]
  if (!from || !to || from === to) continue
  pairs.push({ from, to })
}

// Valida contra arquivos existentes e detecta colisões
const existingFiles = new Set(
  readdirSync(ASSETS_DIR).filter(f => statSync(join(ASSETS_DIR, f)).isFile())
)
const valid = []
const issues = []
const targetUsed = new Map()

for (const p of pairs) {
  if (!existingFiles.has(p.from)) {
    issues.push(`MISSING: '${p.from}' não existe em public/assets/`)
    continue
  }
  if (p.from !== p.to && existingFiles.has(p.to)) {
    issues.push(`TARGET-EXISTS: '${p.to}' já existe (origem: '${p.from}')`)
    continue
  }
  if (targetUsed.has(p.to)) {
    issues.push(`COLLISION: '${p.to}' alvo de '${p.from}' E de '${targetUsed.get(p.to)}'`)
    continue
  }
  targetUsed.set(p.to, p.from)
  valid.push(p)
}

console.log(`CSV: ${relative(ROOT, CSV_PATH)}`)
console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log()
console.log(`Renomeações planejadas: ${valid.length}`)
if (issues.length > 0) {
  console.log(`Problemas: ${issues.length}`)
  for (const i of issues.slice(0, 10)) console.log(`  ${i}`)
  if (issues.length > 10) console.log(`  ... e mais ${issues.length - 10}`)
}

// Constrói regex único para reescrever paths
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const encoded = valid
  .map(p => [encodeAsset(p.from), encodeAsset(p.to)])
  .filter(([f, t]) => f !== t)
  .sort((a, b) => b[0].length - a[0].length)
const lookup = new Map(encoded)
const re = encoded.length > 0
  ? new RegExp(`/assets/(${encoded.map(([f]) => escape(f)).join('|')})`, 'g')
  : null

// Atualiza .md
const mdFiles = walkMd(ROOT)
let mdChanged = 0, totalRefs = 0
for (const md of mdFiles) {
  if (!re) break
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
  // Renomeia arquivos
  let renamed = 0
  for (const p of valid) {
    renameSync(join(ASSETS_DIR, p.from), join(ASSETS_DIR, p.to))
    renamed++
  }
  console.log(`Arquivos renomeados: ${renamed}`)

  // Persiste mapping cumulativo (para migrate-content replicar em re-migração)
  let existing = {}
  if (existsSync(MAPPING_PATH)) {
    try { existing = JSON.parse(readFileSync(MAPPING_PATH, 'utf8')) } catch {}
  }
  // Se um nome canônico for renomeado de novo, encadeia: a -> b, b -> c  =>  a -> c
  const inverseExisting = new Map(Object.entries(existing).map(([from, to]) => [to, from]))
  for (const p of valid) {
    if (inverseExisting.has(p.from)) {
      // p.from era resultado de uma rename anterior; aponta o original direto para o novo destino
      const original = inverseExisting.get(p.from)
      existing[original] = p.to
      delete existing[p.from]
    } else {
      existing[p.from] = p.to
    }
  }
  mkdirSync(dirname(MAPPING_PATH), { recursive: true })
  writeFileSync(MAPPING_PATH, JSON.stringify(existing, Object.keys(existing).sort(), 2) + '\n', 'utf8')
  console.log(`Mapping salvo em: ${relative(ROOT, MAPPING_PATH)}`)
} else {
  console.log()
  console.log(`[DRY-RUN] Nada foi alterado. Para aplicar:`)
  console.log(`  node scripts/apply-renames.mjs --apply`)
}
