#!/usr/bin/env node
/**
 * Valida links internos e referências de assets em todos os .md.
 *
 * Detecta:
 *   - Links markdown [texto](caminho) que apontam para arquivos inexistentes
 *   - Imagens markdown ![alt](caminho)
 *   - Atributos src/href em HTML inline (`<img>`, `<a>`, `<video>`, `<iframe>`)
 *   - Links com âncoras (#fragment) verificando que o arquivo destino existe
 *
 * Não verifica:
 *   - URLs externas (http://, https://)
 *   - Anchors dentro do mesmo arquivo (próximas versões podem incluir)
 *   - Links em frontmatter
 *
 * Saída: zero exit code se tudo OK, 1 se houver links quebrados.
 *
 * Uso:
 *   node scripts/check-links.mjs
 *   node scripts/check-links.mjs --json     # output em JSON (para CI)
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, resolve, join, relative, normalize, posix } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ASSETS_DIR = resolve(ROOT, 'public', 'assets')
const PUBLIC_DIR = resolve(ROOT, 'public')

const JSON_OUT = process.argv.includes('--json')
const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist', '.playwright-mcp'])

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

function decodeUri(s) {
  try { return decodeURIComponent(s) } catch { return s }
}

/**
 * Resolve um caminho de link para o arquivo real esperado em disco.
 * Trata:
 *   - /path/         -> ROOT/path/index.md  ou  ROOT/path.md
 *   - /path          -> idem
 *   - ./relative.md  -> resolvido a partir do .md de origem
 *   - /assets/x.png  -> ROOT/public/assets/x.png
 *   - link com #frag -> usa só a parte antes do #
 */
function resolveTarget(linkRaw, fromMdAbsPath) {
  let link = linkRaw.trim()
  // Remove âncora e querystring
  const hashIdx = link.indexOf('#')
  if (hashIdx >= 0) link = link.slice(0, hashIdx)
  const queryIdx = link.indexOf('?')
  if (queryIdx >= 0) link = link.slice(0, queryIdx)
  if (!link) return null  // só anchor; ignorar
  link = decodeUri(link)

  // Caminho absoluto (começa com /)
  let abs
  if (link.startsWith('/')) {
    // /assets/... -> public/assets/...
    if (link.startsWith('/assets/') || link.match(/^\/(favicon|apple-touch-icon|android-chrome|favicon-)/)) {
      abs = resolve(PUBLIC_DIR, link.slice(1))
      return { abs, type: 'asset' }
    }
    // /algum/caminho -> docs root
    abs = resolve(ROOT, link.slice(1))
  } else {
    // Relativo ao .md de origem
    abs = resolve(dirname(fromMdAbsPath), link)
  }

  // Se o destino é um arquivo direto e existe, retorna
  if (existsSync(abs) && statSync(abs).isFile()) {
    return { abs, type: 'page' }
  }

  // Tenta resolver como página VitePress (cleanUrls)
  const candidates = []
  if (link.endsWith('/')) {
    candidates.push(join(abs, 'index.md'))
    candidates.push(abs + '.md')
  } else if (!/\.[a-z0-9]{1,5}$/i.test(link)) {
    candidates.push(abs + '.md')
    candidates.push(join(abs, 'index.md'))
  } else {
    candidates.push(abs)
  }

  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return { abs: c, type: 'page' }
  }

  return { abs: null, type: 'page', tried: candidates }
}

function extractLinks(content) {
  const links = []
  // Markdown [text](url) — captura url; ignora urls com espaços salvas em <>
  for (const m of content.matchAll(/(?<!\\)\[([^\]]*)\]\(\s*<?([^)\s>]+)>?\s*(?:"[^"]*")?\)/g)) {
    links.push({ text: m[1], url: m[2], context: 'markdown' })
  }
  // HTML attrs: src= / href=
  for (const m of content.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    links.push({ text: '', url: m[1], context: 'html' })
  }
  return links
}

function isExternal(url) {
  return /^(?:https?:|mailto:|tel:|\/\/)/i.test(url) || url.startsWith('data:')
}

const mdFiles = walkMd(ROOT)
const broken = []
let totalChecked = 0

for (const md of mdFiles) {
  const content = readFileSync(md, 'utf8')
  // Remove blocos de código para evitar falsos positivos
  const cleaned = content
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '')
  const links = extractLinks(cleaned)
  for (const link of links) {
    if (isExternal(link.url) || link.url.startsWith('#')) continue
    totalChecked++
    const result = resolveTarget(link.url, md)
    if (!result) continue  // só anchor
    if (!result.abs) {
      broken.push({
        file: relative(ROOT, md).replace(/\\/g, '/'),
        url: link.url,
        text: link.text,
        context: link.context,
        type: result.type,
        tried: result.tried?.map(t => relative(ROOT, t).replace(/\\/g, '/'))
      })
    }
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({
    checked: totalChecked, broken: broken.length, items: broken
  }, null, 2))
  process.exit(broken.length > 0 ? 1 : 0)
}

console.log(`Links verificados: ${totalChecked}`)
console.log(`Quebrados: ${broken.length}`)

if (broken.length > 0) {
  console.log()
  console.log('Detalhes:')
  // Agrupa por arquivo
  const byFile = new Map()
  for (const b of broken) {
    if (!byFile.has(b.file)) byFile.set(b.file, [])
    byFile.get(b.file).push(b)
  }
  for (const [file, items] of byFile) {
    console.log(`\n  ${file}`)
    for (const it of items) {
      const ctx = it.text ? `[${it.text.slice(0, 40)}]` : `(${it.context})`
      console.log(`    -> ${it.url}  ${ctx}`)
    }
  }
  process.exit(1)
} else {
  console.log()
  console.log('Tudo OK.')
}
