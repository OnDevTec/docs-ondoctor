#!/usr/bin/env node
/**
 * Sugere nomes descritivos para imagens com nomes genéricos do GitBook.
 *
 * Como funciona:
 *   1. Varre public/assets/ procurando arquivos com nomes não-descritivos
 *      (image (N), Captura de tela..., hashes, numéricos puros).
 *   2. Encontra todos os .md que referenciam cada um.
 *   3. Para cada referência, extrai o heading mais próximo acima da linha.
 *   4. Gera um slug a partir do heading. Se múltiplos arquivos compartilham o
 *      mesmo heading, sufixa com -2, -3, etc.
 *   5. Salva relatório em RENAMES.md (markdown) e RENAMES.csv (planilha).
 *
 * Uso:
 *   node scripts/suggest-renames.mjs
 *
 * Saída esperada:
 *   - RENAMES.md       relatório legível com tabela por categoria
 *   - RENAMES.csv      para abrir em Excel/Sheets
 */

import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')

const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist'])

function classify(name) {
  if (/^image[\s_]?\(\d+\)/i.test(name)) return 'image-N'
  if (/^Captura de tela/i.test(name)) return 'captura-tela'
  if (/^\d{4,}\.(png|jpe?g|gif|svg|webp)$/i.test(name)) return 'numerico'
  if (/^\d{4}-\d{2}-\d{2}/.test(name)) return 'data-iso'

  const stem = name.replace(/\.[^.]+$/, '')
  // Hash de upload do GitBook: tem 2+ transições lowercase->uppercase OU mistura dígitos com letras
  // Exclui palavras comuns como "Novidade", "Correção", "Aberto", "Cancelados" etc.
  const lcUcTransitions = (stem.match(/[a-z][A-Z]/g) || []).length
  const hasDigit = /\d/.test(stem)
  const onlyAlpha = /^[A-Za-z]+$/.test(stem)
  if (onlyAlpha && lcUcTransitions === 0) return null  // palavra simples, deixa como está
  if (/^[A-Za-z0-9]{8,20}$/.test(stem) && (lcUcTransitions >= 2 || hasDigit)) return 'hash-aleatorio'
  if (/^[a-zA-Z]{2,5}\d+$/.test(stem)) return 'hash-aleatorio'
  return null
}

function isPollutedSlug(slug) {
  // Slugs derivados de headings que ainda continham markup tipo "![](/assets/foo.png)..." viram coisas como "assets-foo-png-..."
  return /\bassets-/.test(slug) || /-png-/.test(slug) || /-jpg-/.test(slug) || /-gif-/.test(slug)
}

function walkMd(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walkMd(full, files)
    else if (st.isFile() && entry.toLowerCase().endsWith('.md')) files.push(full)
  }
  return files
}

function slugify(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'imagem'
}

function findContext(lines, lineIdx) {
  // Procura o heading mais próximo acima da linha
  let heading = null
  for (let i = lineIdx; i >= 0; i--) {
    const m = lines[i].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (m) {
      heading = m[2].replace(/[*_`]/g, '').trim()
      break
    }
  }
  // Procura também o título h1 (primeiro heading do arquivo)
  let pageTitle = null
  for (const line of lines) {
    const m = line.match(/^#\s+(.+?)\s*$/)
    if (m) { pageTitle = m[1].trim(); break }
  }
  return { heading, pageTitle }
}

// 1. Coleta arquivos não-descritivos
const allFiles = readdirSync(ASSETS_DIR)
const nonDesc = []
for (const f of allFiles) {
  const cat = classify(f)
  if (cat) nonDesc.push({ name: f, category: cat })
}

// 2. Coleta refs em todos os .md
const refsByName = new Map() // raw filename -> [{ md, line, heading, pageTitle }]
const mdFiles = walkMd(ROOT)

for (const md of mdFiles) {
  const content = readFileSync(md, 'utf8')
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const matches = [...lines[i].matchAll(/\/assets\/([^"')\s>]+?)(?=["')\s>]|$)/g)]
    for (const m of matches) {
      let filename
      try { filename = decodeURIComponent(m[1]) } catch { filename = m[1] }
      if (!refsByName.has(filename)) refsByName.set(filename, [])
      const ctx = findContext(lines, i)
      refsByName.get(filename).push({ md, line: i + 1, ...ctx })
    }
  }
}

// 3. Gera sugestões com disambiguation
const items = []
for (const { name, category } of nonDesc) {
  const refs = refsByName.get(name) || []
  if (refs.length === 0) {
    items.push({ name, category, refs: [], suggestion: null, heading: null, page: null, mdPath: null })
    continue
  }
  const first = refs[0]
  const heading = first.heading || first.pageTitle
  const ext = (name.match(/\.[^.]+$/) || [''])[0]
  items.push({
    name,
    category,
    refs,
    refCount: refs.length,
    heading: first.heading,
    page: first.pageTitle,
    mdPath: relative(ROOT, first.md),
    baseSlug: heading ? slugify(heading) : null,
    ext
  })
}

// Disambiguação: agrupa por baseSlug; sufixa -2, -3...
const slugCounter = new Map()
for (const item of items) {
  if (!item.baseSlug) { item.suggestion = null; continue }
  if (isPollutedSlug(item.baseSlug)) { item.suggestion = null; item.skipReason = 'slug-poluido'; continue }
  const n = (slugCounter.get(item.baseSlug) || 0) + 1
  slugCounter.set(item.baseSlug, n)
  item.suggestion = n === 1
    ? `${item.baseSlug}${item.ext}`
    : `${item.baseSlug}-${n}${item.ext}`
}

// 4. Ordena: refs DESC, depois nome
items.sort((a, b) => (b.refCount || 0) - (a.refCount || 0) || a.name.localeCompare(b.name))

// 5. Stats
const stats = { total: items.length, withRefs: 0, orphans: 0 }
const byCat = {}
for (const it of items) {
  if ((it.refCount || 0) > 0) stats.withRefs++; else stats.orphans++
  if (!byCat[it.category]) byCat[it.category] = { total: 0, withRefs: 0 }
  byCat[it.category].total++
  if ((it.refCount || 0) > 0) byCat[it.category].withRefs++
}

// 6. Escreve RENAMES.md
let md = `# Sugestões de renomeação de imagens\n\n`
md += `Gerado por \`scripts/suggest-renames.mjs\`. As sugestões são baseadas no heading mais próximo da linha onde a imagem aparece em cada \`.md\`.\n\n`
md += `## Resumo\n\n`
md += `- **Total de candidatos:** ${stats.total}\n`
md += `- **Referenciados em markdown:** ${stats.withRefs}\n`
md += `- **Órfãos (sem referência):** ${stats.orphans} — provavelmente seguros para deletar\n\n`
md += `### Por categoria\n\n`
md += `| Categoria | Total | Com refs |\n|---|---|---|\n`
for (const [cat, s] of Object.entries(byCat)) {
  md += `| ${cat} | ${s.total} | ${s.withRefs} |\n`
}
md += `\n`

const withRefs = items.filter(i => (i.refCount || 0) > 0)
const orphans = items.filter(i => (i.refCount || 0) === 0)

md += `## Com referências (${withRefs.length})\n\n`
md += `Ordenado por número de referências (mais usadas primeiro).\n\n`
md += `| Atual | Sugestão | Refs | Página / Heading |\n|---|---|---|---|\n`
for (const it of withRefs) {
  const ctx = it.heading ? `${it.page || '?'} → **${it.heading}**` : (it.page || '?')
  const nameEsc = it.name.replace(/\|/g, '\\|')
  const sug = it.suggestion ? `\`${it.suggestion}\`` : '—'
  md += `| \`${nameEsc}\` | ${sug} | ${it.refCount} | ${ctx} |\n`
}

if (orphans.length > 0) {
  md += `\n## Órfãos sem referência (${orphans.length})\n\n`
  md += `Estes arquivos foram migrados mas nenhum \`.md\` os referencia. Podem ser deletados com segurança ou renomeados manualmente.\n\n`
  md += `<details><summary>Expandir lista</summary>\n\n`
  md += `| Arquivo |\n|---|\n`
  for (const it of orphans) md += `| \`${it.name.replace(/\|/g, '\\|')}\` |\n`
  md += `\n</details>\n`
}

writeFileSync(resolve(ROOT, 'RENAMES.md'), md, 'utf8')

// 7. Escreve RENAMES.csv (sem órfãos)
let csv = 'arquivo_atual,sugestao,refs,categoria,heading,pagina,md_principal\n'
for (const it of withRefs) {
  const esc = (s) => s == null ? '' : `"${String(s).replace(/"/g, '""')}"`
  csv += `${esc(it.name)},${esc(it.suggestion)},${it.refCount},${esc(it.category)},${esc(it.heading)},${esc(it.page)},${esc(it.mdPath)}\n`
}
writeFileSync(resolve(ROOT, 'RENAMES.csv'), csv, 'utf8')

console.log(`RENAMES.md  (${stats.withRefs} com refs, ${stats.orphans} órfãos)`)
console.log(`RENAMES.csv (${stats.withRefs} linhas)`)
console.log()
console.log('Categorias:')
for (const [cat, s] of Object.entries(byCat)) {
  console.log(`  ${cat.padEnd(20)} ${String(s.total).padStart(5)} candidatos, ${String(s.withRefs).padStart(5)} com refs`)
}
