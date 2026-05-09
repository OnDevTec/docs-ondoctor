#!/usr/bin/env node
/**
 * Indexa todas as páginas da documentação no Algolia.
 *
 * Cada página vira múltiplos records (um por heading H1/H2/H3) para que a busca
 * tenha granularidade — usuários encontram seções específicas, não só páginas.
 *
 * Variáveis de ambiente esperadas:
 *   ALGOLIA_APP_ID       (default: PWJ3F2P9D6)
 *   ALGOLIA_ADMIN_KEY    (obrigatório — secret, NÃO commitar)
 *   ALGOLIA_INDEX_NAME   (default: ondoctor-docs)
 *
 * Uso:
 *   ALGOLIA_ADMIN_KEY=xxx node scripts/index-algolia.mjs
 *   ALGOLIA_ADMIN_KEY=xxx node scripts/index-algolia.mjs --dry-run
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { algoliasearch } from 'algoliasearch'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const APP_ID = process.env.ALGOLIA_APP_ID || 'PWJ3F2P9D6'
const ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY
const INDEX_NAME = process.env.ALGOLIA_INDEX_NAME || 'ondoctor-docs'
const SITE_URL = 'https://docs.ondoctor.app'
const DRY_RUN = process.argv.includes('--dry-run')

const SKIP_DIRS = new Set(['node_modules', '.vitepress', 'public', 'scripts', 'dist', 'knowledge-bundle'])

if (!DRY_RUN && !ADMIN_KEY) {
  console.error('ERRO: variável ALGOLIA_ADMIN_KEY não definida.')
  console.error('Use:  ALGOLIA_ADMIN_KEY=xxx npm run index:algolia')
  console.error('Ou crie um .env local (já no .gitignore).')
  process.exit(1)
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

function pathToUrl(relPath) {
  let url = relPath.replace(/\\/g, '/')
  url = url.replace(/(^|\/)index\.md$/, '$1')
  url = url.replace(/\.md$/, '')
  if (!url.startsWith('/')) url = '/' + url
  return SITE_URL + url
}

function topLevelSection(relPath) {
  const p = relPath.replace(/\\/g, '/').split('/')[0]
  const map = {
    'index.md': 'Início',
    'apresentacao.md': 'Início',
    novidades: 'Novidades',
    'ajuda-e-manuais': 'Ajuda e Manuais',
    'universidade-ondoctor': 'Universidade',
    termos: 'Termos',
    dados: 'Dados'
  }
  return map[p] || 'Documentação'
}

function stripFrontmatter(content) {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildRecords(filePath) {
  const rel = relative(ROOT, filePath).replace(/\\/g, '/')
  const fullContent = readFileSync(filePath, 'utf-8')
  const body = stripFrontmatter(fullContent)
  const lines = body.split(/\r?\n/)

  const baseUrl = pathToUrl(rel)
  const section = topLevelSection(rel)

  // Cada record representa um heading + o conteúdo até o próximo heading
  const records = []
  let pageTitle = ''
  let h1 = '', h2 = '', h3 = ''
  let buffer = []
  let currentLevel = 0
  let currentTitle = ''
  let currentAnchor = ''
  let inFence = false

  function flushSection() {
    if (currentLevel === 0) return  // ainda no preâmbulo, sem heading
    const content = cleanText(buffer.join(' '))
    if (!currentTitle && !content) return
    const url = baseUrl + (currentAnchor ? '#' + currentAnchor : '')
    // type segue convenção do DocSearch: lvlN para hit de heading, content para texto
    let type = 'content'
    if (currentLevel === 1) type = 'lvl1'
    else if (currentLevel === 2) type = 'lvl2'
    else if (currentLevel === 3) type = 'lvl3'
    records.push({
      objectID: url,
      url,
      lang: 'pt-BR',
      type,
      section,
      h1: h1 || pageTitle,
      h2: h2 || null,
      h3: h3 || null,
      title: currentTitle || h1 || pageTitle,
      content: content.slice(0, 1500),
      anchor: currentAnchor || null,
      hierarchy: {
        lvl0: section,
        lvl1: h1 || pageTitle,
        lvl2: h2 || null,
        lvl3: h3 || null,
        lvl4: null,
        lvl5: null,
        lvl6: null
      }
    })
  }

  function slugify(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  for (const line of lines) {
    if (/^```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue

    const m = line.match(/^(#{1,3})\s+(.+?)\s*$/)
    if (m) {
      flushSection()
      buffer = []
      const level = m[1].length
      const title = cleanText(m[2])
      const anchor = slugify(title)
      if (level === 1) { h1 = title; h2 = ''; h3 = '' }
      else if (level === 2) { h2 = title; h3 = '' }
      else if (level === 3) { h3 = title }
      if (level === 1 && !pageTitle) pageTitle = title
      currentLevel = level
      currentTitle = title
      currentAnchor = level === 1 ? '' : anchor
      continue
    }

    buffer.push(line)
  }
  flushSection()

  // Garante pelo menos 1 record por arquivo (caso não tenha headings claros)
  if (records.length === 0 && pageTitle) {
    records.push({
      objectID: baseUrl,
      url: baseUrl,
      lang: 'pt-BR',
      type: 'lvl1',
      section,
      h1: pageTitle,
      h2: null,
      h3: null,
      title: pageTitle,
      content: cleanText(body).slice(0, 1500),
      anchor: null,
      hierarchy: { lvl0: section, lvl1: pageTitle, lvl2: null, lvl3: null, lvl4: null, lvl5: null, lvl6: null }
    })
  }

  return records
}

const mdFiles = walkMd(ROOT)
const allRecords = []
for (const f of mdFiles) {
  for (const r of buildRecords(f)) allRecords.push(r)
}

console.log(`Páginas processadas: ${mdFiles.length}`)
console.log(`Records gerados:     ${allRecords.length}`)
console.log(`Index destino:       ${INDEX_NAME} @ ${APP_ID}`)
console.log()

if (DRY_RUN) {
  console.log('Amostra dos primeiros 3 records:')
  for (const r of allRecords.slice(0, 3)) {
    console.log(`  ${r.url}`)
    console.log(`    ${r.section} > ${r.h1}${r.h2 ? ' > ' + r.h2 : ''}${r.h3 ? ' > ' + r.h3 : ''}`)
    console.log(`    ${r.content.slice(0, 100)}...`)
  }
  console.log()
  console.log('[DRY-RUN] Nada enviado ao Algolia.')
  console.log('Para aplicar:  ALGOLIA_ADMIN_KEY=xxx npm run index:algolia')
  process.exit(0)
}

const client = algoliasearch(APP_ID, ADMIN_KEY)

console.log('Configurando settings do índice...')
await client.setSettings({
  indexName: INDEX_NAME,
  indexSettings: {
    // Atributos pesquisáveis (ordem importa para ranking)
    searchableAttributes: [
      'unordered(hierarchy.lvl1)',
      'unordered(hierarchy.lvl2)',
      'unordered(hierarchy.lvl3)',
      'unordered(hierarchy.lvl4)',
      'unordered(hierarchy.lvl5)',
      'unordered(hierarchy.lvl6)',
      'content'
    ],
    // Filtros usados pelo DocSearch (lang:pt-BR é mandatório, type para boost)
    attributesForFaceting: ['filterOnly(lang)', 'filterOnly(type)'],
    attributesToRetrieve: [
      'hierarchy.lvl0', 'hierarchy.lvl1', 'hierarchy.lvl2', 'hierarchy.lvl3',
      'hierarchy.lvl4', 'hierarchy.lvl5', 'hierarchy.lvl6',
      'content', 'type', 'url', 'anchor'
    ],
    attributesToHighlight: [
      'hierarchy.lvl1', 'hierarchy.lvl2', 'hierarchy.lvl3',
      'hierarchy.lvl4', 'hierarchy.lvl5', 'hierarchy.lvl6',
      'content'
    ],
    attributesToSnippet: ['content:30'],
    customRanking: [
      'desc(weight.pageRank)',
      'desc(weight.level)',
      'asc(weight.position)'
    ],
    attributeForDistinct: 'url',
    distinct: 1,
    minWordSizefor1Typo: 4,
    minWordSizefor2Typos: 8,
    queryLanguages: ['pt'],
    indexLanguages: ['pt'],
    removeStopWords: ['pt']
  }
})

console.log('Substituindo todos os records do índice...')
const res = await client.replaceAllObjects({
  indexName: INDEX_NAME,
  objects: allRecords,
  batchSize: 1000
})

console.log()
console.log(`Tasks enviadas: ${res.length}`)
console.log(`Indexação concluída. Verifique em https://www.algolia.com/apps/${APP_ID}/explorer/browse/${INDEX_NAME}`)
