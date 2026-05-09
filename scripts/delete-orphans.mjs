#!/usr/bin/env node
/**
 * Detecta e (opcionalmente) deleta arquivos em public/assets/ que não são
 * referenciados por nenhum .md do projeto.
 *
 * Uso:
 *   node scripts/delete-orphans.mjs              # dry-run
 *   node scripts/delete-orphans.mjs --apply      # deleta os órfãos
 *
 * Considera referência qualquer ocorrência de "/assets/<nome>" em .md.
 * Compara com URL-decode para casar nomes encodados (espaços, parens, acentos).
 */

import { readFileSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')

const APPLY = process.argv.includes('--apply')
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist'])

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

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// 1. Coleta nomes referenciados em qualquer .md
const referenced = new Set()
const mdFiles = walkMd(ROOT)
for (const md of mdFiles) {
  const content = readFileSync(md, 'utf8')
  for (const m of content.matchAll(/\/assets\/([^"')\s>]+?)(?=["')\s>]|$)/g)) {
    let name
    try { name = decodeURIComponent(m[1]) } catch { name = m[1] }
    referenced.add(name)
  }
}

// 2. Lista arquivos em public/assets/ e identifica órfãos
const allFiles = readdirSync(ASSETS_DIR).filter(f => statSync(join(ASSETS_DIR, f)).isFile())
const orphans = allFiles.filter(f => !referenced.has(f))

let totalBytes = 0
for (const f of orphans) totalBytes += statSync(join(ASSETS_DIR, f)).size

console.log(`Modo: ${APPLY ? 'APPLY' : 'DRY-RUN'}`)
console.log()
console.log(`Arquivos em public/assets/: ${allFiles.length}`)
console.log(`Referenciados em .md:       ${allFiles.length - orphans.length}`)
console.log(`Órfãos (a deletar):         ${orphans.length}`)
console.log(`Espaço a liberar:           ${fmtBytes(totalBytes)}`)
console.log()

if (orphans.length === 0) {
  console.log('Nada a fazer.')
  process.exit(0)
}

// Amostra
console.log('Primeiros 15 órfãos:')
for (const f of orphans.slice(0, 15)) {
  const sz = fmtBytes(statSync(join(ASSETS_DIR, f)).size)
  console.log(`  ${sz.padStart(10)}  ${f}`)
}
if (orphans.length > 15) console.log(`  ... e mais ${orphans.length - 15}`)

if (APPLY) {
  console.log()
  console.log('Deletando...')
  let deleted = 0
  for (const f of orphans) {
    unlinkSync(join(ASSETS_DIR, f))
    deleted++
  }
  console.log(`Deletados: ${deleted}`)
} else {
  console.log()
  console.log(`[DRY-RUN] Nada foi deletado. Para aplicar:`)
  console.log(`  node scripts/delete-orphans.mjs --apply`)
}
