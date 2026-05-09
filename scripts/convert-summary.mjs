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

function parseSummary(content) {
  const lines = content.split(/\r?\n/)
  const sections = []
  let currentSection = null
  let stack = []

  function startSection(title, collapsed = true) {
    currentSection = { text: title, collapsed, items: [] }
    sections.push(currentSection)
    stack = [{ items: currentSection.items, depth: -1 }]
  }

  function ensureSection(fallbackTitle) {
    if (!currentSection) startSection(fallbackTitle, false)
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
const sidebar = parseSummary(content)
const output = { '/': sidebar }

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n', 'utf8')

console.log(`Sidebar gerado: ${OUTPUT}`)
console.log(`Grupos de topo: ${sidebar.length}`)
console.log(`Itens totais:   ${countItems(sidebar)}`)
for (const s of sidebar) {
  console.log(`  - ${s.text} (${countItems(s.items ?? [])} item(ns))`)
}
