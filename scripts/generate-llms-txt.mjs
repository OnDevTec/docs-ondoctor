#!/usr/bin/env node
/**
 * Gera /public/llms.txt — índice estruturado da documentação para LLMs.
 *
 * Formato segue https://llmstxt.org/ — markdown com seções, links absolutos,
 * descrições curtas. Permite que assistentes AI naveguem o site eficientemente.
 *
 * Saída: public/llms.txt (servida em /llms.txt)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SITE_URL = 'https://docs.ondoctor.app'
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

function extractMeta(filePath) {
  const content = readFileSync(filePath, 'utf-8')
  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
  const titleMatch = body.match(/^#\s+(.+?)\s*$/m)
  const title = titleMatch ? titleMatch[1].trim() : ''

  const cleaned = body
    .replace(/^#\s+.+$/m, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`#]/g, '')
  const paragraphs = cleaned.split(/\r?\n\s*\r?\n/).map(p => p.trim()).filter(p => p.length > 30)
  const desc = (paragraphs[0] || '').slice(0, 200).replace(/\s+/g, ' ').trim()

  return { title, desc }
}

function pathToUrl(relPath) {
  let url = relPath.replace(/\\/g, '/')
  url = url.replace(/(^|\/)index\.md$/, '$1')
  url = url.replace(/\.md$/, '')
  if (!url.startsWith('/')) url = '/' + url
  return SITE_URL + url
}

const files = walkMd(ROOT)

// Agrupa por seção de topo (introdução, novidades, universidade, termos, dados)
const sections = {
  'Introdução': [],
  'Universidade OnDoctor': [],
  'Novidades': [],
  'FAQ': [],
  'Termos': [],
  'Dados': [],
  'Outros': []
}

for (const f of files) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  const meta = extractMeta(f)
  const url = pathToUrl(rel)
  const entry = { rel, url, ...meta }

  if (rel === 'index.md' || rel === 'apresentacao.md') sections['Introdução'].push(entry)
  else if (rel.startsWith('novidades/')) sections['Novidades'].push(entry)
  else if (rel.startsWith('universidade-ondoctor/faq/')) sections['FAQ'].push(entry)
  else if (rel.startsWith('universidade-ondoctor/')) sections['Universidade OnDoctor'].push(entry)
  else if (rel.startsWith('termos/')) sections['Termos'].push(entry)
  else if (rel.startsWith('dados/')) sections['Dados'].push(entry)
  else sections['Outros'].push(entry)
}

let out = `# OnDoctor — Documentação Oficial\n\n`
out += `> Gestão completa para clínicas, consultórios e profissionais da saúde: agenda online, prontuário eletrônico, gestão financeira, telemedicina, assinatura digital e controle de estoque.\n\n`
out += `Documentação em português (pt-BR). Site oficial: ${SITE_URL}\n\n`

for (const [sectionName, entries] of Object.entries(sections)) {
  if (entries.length === 0) continue
  out += `## ${sectionName}\n\n`
  for (const e of entries.sort((a, b) => a.url.localeCompare(b.url))) {
    const desc = e.desc ? `: ${e.desc}` : ''
    out += `- [${e.title || e.rel}](${e.url})${desc}\n`
  }
  out += `\n`
}

const outPath = resolve(ROOT, 'public', 'llms.txt')
writeFileSync(outPath, out, 'utf-8')

const stats = Object.entries(sections).map(([k, v]) => `${k}: ${v.length}`).join(', ')
console.log(`Gerado: ${outPath}`)
console.log(`Páginas: ${files.length}`)
console.log(`Seções: ${stats}`)
console.log(`Tamanho: ${(out.length / 1024).toFixed(1)} KB`)
