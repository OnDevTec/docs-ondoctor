#!/usr/bin/env node
/**
 * Converte o SUMMARY.md do GitBook em sidebar.json do VitePress.
 *
 * Uso:
 *   node scripts/convert-summary.mjs
 *
 * Lê:    ../docs-ondoctor-gitbook/SUMMARY.md
 * Grava: .vitepress/sidebar.json
 *
 * Mapeamento:
 *   - "## Nome"             -> grupo de topo (collapsed: true)
 *   - "* [text](README.md)" -> link "/" (raiz) ou "/pasta/" (índice da pasta)
 *   - "* [text](file.md)"   -> link "/file"
 *   - Indentação de 2 espaços = nível mais profundo (subgrupo)
 *   - "***"                 -> encerra a seção atual; itens seguintes ficam soltos
 *                              até o próximo "## ..."
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SOURCE = resolve(ROOT, '..', 'docs-ondoctor-gitbook', 'SUMMARY.md')
const OUTPUT = resolve(ROOT, '.vitepress', 'sidebar.json')

const DEFAULT_INTRO_TITLE = 'Introdução'
const DEFAULT_LOOSE_TITLE = 'Outros'

function pathToLink(rawPath) {
  if (!rawPath) return undefined
  let p = rawPath.trim()
  p = p.split('#')[0]
  p = decodeURIComponent(p)
  p = p.replace(/\\/g, '/')
  p = p.replace(/\.md$/i, '')
  p = p.replace(/(^|\/)README$/i, '$1')
  if (!p.startsWith('/')) p = '/' + p
  return p
}

function parseItemLine(line) {
  const m = line.match(/^(\s*)[*-]\s+\[(.+?)\]\(([^)]+?)(?:\s+"[^"]*")?\)\s*$/)
  if (!m) return null
  const indent = m[1].replace(/\t/g, '  ').length
  const depth = Math.floor(indent / 2)
  return { depth, text: m[2].trim(), link: pathToLink(m[3]) }
}

/**
 * Tira maiúsculas tipo CAPS LOCK e devolve Title Case, com correções para
 * marcas próprias.
 */
function prettifySectionTitle(title) {
  if (!title) return title
  // Se está tudo em CAPS, transforma. Se já é mista, deixa como veio.
  const isAllCaps = title === title.toUpperCase() && /[A-Z]/.test(title)
  let out = isAllCaps
    ? title.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
    : title
  // Branding
  out = out.replace(/Ondoctor/g, 'OnDoctor')
  out = out.replace(/\bTiss\b/gi, 'TISS')
  out = out.replace(/\bTuss\b/gi, 'TUSS')
  out = out.replace(/\bFaq\b/gi, 'FAQ')
  out = out.replace(/\bCrm\b/gi, 'CRM')
  out = out.replace(/\bBi\b/g, 'BI')
  out = out.replace(/\bNps\b/gi, 'NPS')
  return out
}

/**
 * Encurta labels de release notes "Versão - (DD/MM/YYYY)" para "DD/MM",
 * já que o ano fica explícito no grupo pai (ex: "Lançamentos 2026").
 */
function shortenReleaseLabel(text) {
  const m = text.match(/^Vers[aã]o\s*[-–—]\s*\((\d{2})\/(\d{2})\/(\d{4})\)\s*$/i)
  if (!m) return text
  return `${m[1]}/${m[2]}`
}

/**
 * Pós-processa as seções: aplica encurtamento de labels, mescla "Outros" em
 * "Termos" (renomeada para "Termos & Privacidade") e remove duplicatas.
 */
function postProcessSections(sections) {
  // Encurta labels de versões dentro de qualquer grupo "Lançamentos YYYY"
  function shortenInGroup(node) {
    if (!Array.isArray(node.items)) return
    const isYearGroup = /^Lan[çc]amentos\s+\d{4}$/i.test(node.text || '')
    for (const child of node.items) {
      if (isYearGroup && child.link) child.text = shortenReleaseLabel(child.text)
      shortenInGroup(child)
    }
  }
  for (const section of sections) shortenInGroup(section)

  // Merge "Outros" -> "Termos" e renomeia
  const outrosIdx = sections.findIndex(s => /^Outros$/i.test(s.text))
  const termosIdx = sections.findIndex(s => /^Termos/i.test(s.text))
  if (outrosIdx >= 0 && termosIdx >= 0) {
    const outros = sections[outrosIdx]
    const termos = sections[termosIdx]
    termos.text = 'Termos & Privacidade'
    termos.items.push(...(outros.items || []))
    sections.splice(outrosIdx, 1)
  } else if (termosIdx >= 0) {
    sections[termosIdx].text = 'Termos & Privacidade'
  }

  return sections
}

function parseSummary(content) {
  const lines = content.split(/\r?\n/)
  const sections = []
  let currentSection = null
  let stack = []

  function startSection(title, collapsed = true) {
    currentSection = { text: prettifySectionTitle(title), collapsed, items: [] }
    sections.push(currentSection)
    stack = [{ items: currentSection.items, depth: -1 }]
  }

  function ensureSection(fallbackTitle) {
    // Todos colapsados por padrão (incluindo o grupo de Introdução)
    if (!currentSection) startSection(fallbackTitle, true)
  }

  let sawDivider = false

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) continue
    if (/^#\s/.test(line)) continue

    const headerMatch = line.match(/^##\s+(.+?)\s*$/)
    if (headerMatch) {
      startSection(headerMatch[1].trim(), true)
      sawDivider = false
      continue
    }

    if (line.trim() === '***' || line.trim() === '---') {
      currentSection = null
      stack = []
      sawDivider = true
      continue
    }

    const item = parseItemLine(line)
    if (!item) continue

    ensureSection(sawDivider ? DEFAULT_LOOSE_TITLE : DEFAULT_INTRO_TITLE)
    sawDivider = false

    while (stack.length > 0 && stack[stack.length - 1].depth >= item.depth) {
      stack.pop()
    }

    const parent = stack[stack.length - 1] ?? { items: currentSection.items, depth: -1 }
    const node = { text: item.text, link: item.link }
    parent.items.push(node)

    node.items = []
    stack.push({ items: node.items, depth: item.depth, ref: node })
  }

  function cleanup(node) {
    if (Array.isArray(node.items)) {
      if (node.items.length === 0) {
        delete node.items
      } else {
        node.collapsed = true
        node.items.forEach(cleanup)
      }
    }
  }
  for (const section of sections) section.items.forEach(cleanup)

  return sections
}

function countItems(arr) {
  let n = 0
  for (const item of arr) {
    n++
    if (item.items) n += countItems(item.items)
  }
  return n
}

const content = readFileSync(SOURCE, 'utf8')
const sidebar = postProcessSections(parseSummary(content))
const output = { '/': sidebar }

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8')

console.log(`Sidebar gerado: ${OUTPUT}`)
console.log(`Grupos de topo: ${sidebar.length}`)
console.log(`Itens totais:   ${countItems(sidebar)}`)
for (const s of sidebar) {
  console.log(`  - ${s.text} (${countItems(s.items ?? [])} item(ns))`)
}
