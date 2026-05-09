#!/usr/bin/env node
/**
 * Migra conteúdo do GitBook para o VitePress.
 *
 * Uso:
 *   node scripts/migrate-content.mjs            # dry-run (não escreve nada)
 *   node scripts/migrate-content.mjs --apply    # aplica de verdade
 *
 * Transformações aplicadas:
 *   - README.md  -> index.md (convenção VitePress, raiz e subpastas)
 *   - {% hint style="X" %}...{% endhint %}     -> ::: tip|warning|danger|info
 *   - {% embed url="..." %}...{% endembed %}   -> iframe responsivo (YouTube)
 *   - {% embed url="..." %}                     -> iframe ou link markdown
 *   - .gitbook/assets/foo.png                   -> /assets/foo.png (URL-encoded)
 *   - Frontmatter: remove icon, cover, coverY, layout
 *   - &#x20; -> espaço
 *   - Copia .gitbook/assets/ -> public/assets/  (somente com --apply)
 *
 * NÃO é alterado:
 *   - Tags <figure><img>...</figure> (HTML é válido em VitePress; só o caminho do src é reescrito)
 *   - Atributo data-size="original" do GitBook (ignorado pelo browser)
 *   - Emojis, listas, headings, tabelas
 */

import {
  readFileSync, writeFileSync, mkdirSync, readdirSync, statSync,
  cpSync, copyFileSync, existsSync, rmSync
} from 'node:fs'
import { dirname, resolve, relative, join, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DOCS_ROOT = resolve(__dirname, '..')
const SOURCE_ROOT = resolve(DOCS_ROOT, '..', 'docs-ondoctor-gitbook')
const ASSETS_SOURCE = resolve(SOURCE_ROOT, '.gitbook', 'assets')
const ASSETS_DEST = resolve(DOCS_ROOT, 'public', 'assets')
const RENAMES_MAP_PATH = resolve(DOCS_ROOT, '.vitepress', 'assets-renames.json')

const APPLY = process.argv.includes('--apply')
const VERBOSE = process.argv.includes('--verbose')
const NO_DEDUPE = process.argv.includes('--no-dedupe')

const SKIP_FILES = new Set(['SUMMARY.md'])
const SKIP_DIRS = new Set(['.git', '.gitbook', 'node_modules', '.vitepress'])

function walk(dir, baseDir = dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, baseDir, files)
    } else if (st.isFile() && entry.toLowerCase().endsWith('.md') && !SKIP_FILES.has(entry)) {
      files.push({ full, rel: relative(baseDir, full) })
    }
  }
  return files
}

function encodeAssetName(name) {
  let decoded
  try { decoded = decodeURIComponent(name) } catch { decoded = name }
  // Encode parens too — necessário para links markdown ![](...) com (n) no nome
  return encodeURIComponent(decoded)
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

/**
 * Varre os assets do GitBook, agrupa por hash MD5 e produz:
 *   - remap: filename duplicado -> filename canônico (menor nome, depois alfabético)
 *   - skipCopy: nomes que NÃO devem ser copiados (duplicados redundantes)
 *   - replacer: função que aplica o remap em texto markdown (paths /assets/<encoded>)
 */
function buildAssetDedupe(assetsDir) {
  const empty = {
    remap: new Map(), skipCopy: new Set(),
    dupGroups: 0, dupFiles: 0,
    replacer: (s) => s
  }
  if (!existsSync(assetsDir)) return empty

  const filesByHash = new Map()
  for (const entry of readdirSync(assetsDir)) {
    const full = join(assetsDir, entry)
    if (!statSync(full).isFile()) continue
    const hash = createHash('md5').update(readFileSync(full)).digest('hex')
    if (!filesByHash.has(hash)) filesByHash.set(hash, [])
    filesByHash.get(hash).push(entry)
  }

  const remap = new Map()
  const skipCopy = new Set()
  let dupGroups = 0, dupFiles = 0

  for (const files of filesByHash.values()) {
    if (files.length < 2) continue
    dupGroups++
    const canonical = files.slice().sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    )[0]
    for (const f of files) {
      if (f === canonical) continue
      remap.set(f, canonical)
      skipCopy.add(f)
      dupFiles++
    }
  }

  if (remap.size === 0) return empty

  // Constrói um regex único para substituir todos os paths duplicados de uma vez.
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const encodedEntries = [...remap.entries()]
    .map(([from, to]) => [encodeAssetName(from), encodeAssetName(to)])
    .filter(([from, to]) => from !== to)
    .sort((a, b) => b[0].length - a[0].length)

  const lookup = new Map(encodedEntries)
  const re = new RegExp(
    `/assets/(${encodedEntries.map(([f]) => escape(f)).join('|')})`,
    'g'
  )
  const replacer = (s) => s.replace(re, (_, from) => `/assets/${lookup.get(from)}`)

  return { remap, skipCopy, dupGroups, dupFiles, replacer }
}

function destPathFor(relPath) {
  const base = basename(relPath)
  if (base === 'README.md' || base === 'readme.md') {
    const dir = dirname(relPath)
    return dir === '.' ? 'index.md' : join(dir, 'index.md')
  }
  return relPath
}

function transformFrontmatter(fm) {
  const lines = fm.split('\n')
  const kept = []
  let skipping = false
  for (const line of lines) {
    if (/^(icon|cover|coverY|layout):/i.test(line)) {
      skipping = true
      continue
    }
    if (skipping && /^\s+\S/.test(line)) continue
    skipping = false
    kept.push(line)
  }
  while (kept.length > 0 && !kept[0].trim()) kept.shift()
  while (kept.length > 0 && !kept[kept.length - 1].trim()) kept.pop()
  return kept.join('\n')
}

function convertEmbed(url, caption = '') {
  const ytMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]+)/)
  if (ytMatch) {
    const captionLine = caption ? `\n\n*${caption}*` : ''
    return `<div style="position:relative;padding-top:56.25%;margin:1.5rem 0">
  <iframe style="position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:8px" src="https://www.youtube.com/embed/${ytMatch[1]}" title="Vídeo" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
</div>${captionLine}`
  }
  return `[${caption || url}](${url})`
}

const HINT_MAP = { info: 'info', warning: 'warning', danger: 'danger', success: 'tip', note: 'info' }

/**
 * Identifica o tipo de release entry a partir do nome do ícone do GitBook.
 * Retorna null para ícones não-reconhecidos (mantém comportamento padrão de strip).
 */
function classifyReleaseIcon(iconName) {
  const lower = iconName.toLowerCase()
  if (lower.startsWith('novidade'))   return 'novidade'
  if (lower.startsWith('correção') ||
      lower.startsWith('correcao'))   return 'correcao'
  if (lower.startsWith('melhoria'))   return 'melhoria'
  if (lower.startsWith('atualização')||
      lower.startsWith('atualizacao')) return 'atualizacao'
  return null
}

/**
 * Extrai um Map de heading-text -> release-type a partir de headings com ícone GitBook.
 * Padrão: "### <img src=".gitbook/assets/Novidade.svg" ...> Título do recurso"
 */
function extractReleaseTypes(content) {
  const map = new Map()
  const re = /^#{2,4}\s+<img\b[^>]*\bsrc="(?:[^"]*\/)?(?:\.\.\/)*\.gitbook\/assets\/([^"]+\.svg)"[^>]*\/?>\s*(.+?)\s*$/gim
  for (const m of content.matchAll(re)) {
    const iconName = (() => {
      try { return decodeURIComponent(m[1]) } catch { return m[1] }
    })()
    const type = classifyReleaseIcon(iconName)
    if (!type) continue
    // Remove markdown bold/italic do título para casar depois
    const cleanTitle = m[2].replace(/^\*+|\*+$/g, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim()
    map.set(cleanTitle, type)
  }
  return map
}

function escapeAttr(s) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/**
 * Após todas as transformações, encontra ### Heading que constam no typeMap
 * e wrappa o bloco (heading + conteúdo até o próximo heading) em <ReleaseEntry>.
 * O título original some — vai virar prop title do componente.
 */
function wrapReleaseEntries(content, typeMap) {
  if (typeMap.size === 0) return content
  const lines = content.split('\n')
  const out = []
  let openEntry = false

  function closeEntry() {
    if (openEntry) {
      // Remove trailing blank lines antes de fechar
      while (out.length > 0 && out[out.length - 1].trim() === '') out.pop()
      out.push('')
      out.push('</ReleaseEntry>')
      out.push('')
      openEntry = false
    }
  }

  for (const line of lines) {
    const m = line.match(/^(#{3,4})\s+(.+?)\s*$/)
    if (m) {
      const cleanTitle = m[2].replace(/^\*+|\*+$/g, '').replace(/\*\*([^*]+)\*\*/g, '$1').trim()
      const type = typeMap.get(cleanTitle)
      closeEntry()
      if (type) {
        out.push('')
        out.push(`<ReleaseEntry type="${type}" title="${escapeAttr(cleanTitle)}">`)
        out.push('')
        openEntry = true
        continue
      }
    }
    // Top-level (h1/h2) fecha entry aberta
    if (/^#{1,2}\s/.test(line) && openEntry) {
      closeEntry()
    }
    out.push(line)
  }
  closeEntry()
  return out.join('\n')
}

function transform(content, dedupeReplacer = (s) => s) {
  let out = content

  // 0. Extrai tipos de release entries ANTES do strip de ícones
  const releaseTypes = extractReleaseTypes(out)

  // 1. Frontmatter cleanup
  out = out.replace(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/, (match, fm) => {
    const cleaned = transformFrontmatter(fm)
    if (!cleaned.trim()) return ''
    return `---\n${cleaned}\n---\n`
  })

  // 2. Hint blocks
  out = out.replace(
    /\{%\s*hint\s+style="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endhint\s*%\}/g,
    (match, style, body) => {
      const containerType = HINT_MAP[style.toLowerCase()] || 'tip'
      return `::: ${containerType}\n${body.trim()}\n:::`
    }
  )

  // 3. Embed blocks (block form must come before self-closing)
  out = out.replace(
    /\{%\s*embed\s+url="([^"]+)"\s*%\}([\s\S]*?)\{%\s*endembed\s*%\}/g,
    (match, url, body) => convertEmbed(url, body.trim())
  )
  out = out.replace(
    /\{%\s*embed\s+url="([^"]+)"\s*%\}/g,
    (match, url) => convertEmbed(url)
  )

  // 3b. File blocks: {% file src="..." %}  -> link de download
  out = out.replace(
    /\{%\s*file\s+src="([^"]+)"\s*%\}/g,
    (match, src) => {
      const filename = (() => {
        try { return decodeURIComponent(src.split('/').pop() || 'arquivo') }
        catch { return src.split('/').pop() || 'arquivo' }
      })()
      return `[Baixar: ${filename}](${src})`
    }
  )

  // 4. Asset paths — three contexts:
  //    a) HTML attribute: src="..." | href="..." | poster="..."
  out = out.replace(
    /(\b(?:src|href|poster)\s*=\s*)(["'])((?:\.\.\/)*)\.gitbook\/assets\/([^"']+)\2/gi,
    (m, attr, q, _dots, name) => `${attr}${q}/assets/${encodeAssetName(name)}${q}`
  )
  //    b) Markdown ![](<...>) com colchetes angulares (permite espaços/parens)
  out = out.replace(
    /(\]\()<((?:\.\.\/)*)\.gitbook\/assets\/([^>]+)>(\))/g,
    (m, p1, _dots, name, p4) => `${p1}/assets/${encodeAssetName(name)}${p4}`
  )
  //    c) Markdown ![](...) sem colchetes (sem espaços)
  out = out.replace(
    /(\]\()((?:\.\.\/)*)\.gitbook\/assets\/([^)\s]+)(\))/g,
    (m, p1, _dots, name, p4) => `${p1}/assets/${encodeAssetName(name)}${p4}`
  )

  // 5. HTML entity de espaço
  out = out.replace(/&#x20;/g, ' ')

  // 6. Remove âncoras explícitas do GitBook (VitePress já auto-gera anchors em headings)
  //    Ex: "## Título <a href="#titulo" id="titulo"></a>"
  out = out.replace(/\s*<a\s+href="#[^"]*"\s+id="[^"]*"><\/a>/gi, '')

  // 7. Remove ícones decorativos no início de headings
  //    Ex: "### <img src=... > Título"  ou  "### ![](url) Título"
  //    Esses ícones poluem o outline "Nesta página" e os permalinks.
  out = out.replace(
    /^(#{1,6}[ \t]+)(?:<img\b[^>]*\/?>|!\[[^\]]*\]\([^)]*\))[ \t]+/gm,
    '$1'
  )

  // 8. Remove referências a imagens hospedadas no CDN antigo do GitBook
  //    (decorativas, externas e legadas — podem sumir a qualquer momento)
  out = out.replace(
    /!\[[^\]]*\]\(https?:\/\/files\.gitbook\.com\/[^)]*\)/g,
    ''
  )

  // 9. Remove links/imagens marcados como "broken" pelo GitBook
  //    (arquivos que foram apagados ou perderam referência no GitBook)
  out = out.replace(/!\[[^\]]*\]\(\/broken\/[^)]*\)/g, '')
  out = out.replace(/<img\b[^>]*\bsrc=["']\/broken\/[^"']*["'][^>]*\/?>/gi, '')

  // 10. Remove atributo data-size="..." do GitBook (browsers ignoram)
  out = out.replace(/\s+data-size="[^"]*"/g, '')

  // 11. Aplica remap de assets duplicados (no-op se dedupe estiver desligado)
  out = dedupeReplacer(out)

  // 12. Wrappa release entries em <ReleaseEntry type="..." title="...">
  out = wrapReleaseEntries(out, releaseTypes)

  return out
}

function diffSummary(orig, transformed) {
  return {
    hint: (orig.match(/\{%\s*hint/g) || []).length,
    embed: (orig.match(/\{%\s*embed/g) || []).length,
    assetRefs: (orig.match(/\.gitbook\/assets\//g) || []).length,
    figures: (orig.match(/<figure/g) || []).length,
    htmlEntities: (orig.match(/&#x20;/g) || []).length,
    bytesBefore: Buffer.byteLength(orig),
    bytesAfter: Buffer.byteLength(transformed)
  }
}

console.log(`Modo: ${APPLY ? 'APPLY (gravando arquivos)' : 'DRY-RUN (nada será gravado)'}`)
console.log(`Origem:  ${SOURCE_ROOT}`)
console.log(`Destino: ${DOCS_ROOT}`)
console.log()

const dedupe = NO_DEDUPE ? buildAssetDedupe('') : buildAssetDedupe(ASSETS_SOURCE)
if (!NO_DEDUPE && dedupe.dupGroups > 0) {
  console.log(`Dedupe de assets:`)
  console.log(`  ${dedupe.dupGroups} grupo(s) de duplicados detectado(s)`)
  console.log(`  ${dedupe.dupFiles} arquivo(s) redundante(s) serão omitidos da cópia`)
  console.log(`  Referências nos .md serão reescritas para o nome canônico (menor nome de cada grupo)`)
  console.log()
}

const files = walk(SOURCE_ROOT)
console.log(`Encontrados ${files.length} arquivo(s) .md`)

let changedCount = 0
let unchangedCount = 0
let renamedCount = 0
const samples = []
const totals = { hint: 0, embed: 0, assetRefs: 0, figures: 0, htmlEntities: 0 }

for (const file of files) {
  const original = readFileSync(file.full, 'utf8')
  const transformed = transform(original, dedupe.replacer)
  const isDifferent = original !== transformed

  const destRel = destPathFor(file.rel)
  const destFull = resolve(DOCS_ROOT, destRel)
  const wasRenamed = destRel !== file.rel

  if (isDifferent) changedCount++
  else unchangedCount++
  if (wasRenamed) renamedCount++

  const stats = diffSummary(original, transformed)
  totals.hint += stats.hint
  totals.embed += stats.embed
  totals.assetRefs += stats.assetRefs
  totals.figures += stats.figures
  totals.htmlEntities += stats.htmlEntities

  if (APPLY) {
    mkdirSync(dirname(destFull), { recursive: true })
    writeFileSync(destFull, transformed, 'utf8')
  } else if (samples.length < 5 && (isDifferent || wasRenamed)) {
    samples.push({ src: file.rel, dst: destRel, stats, renamed: wasRenamed })
  }

  if (VERBOSE) {
    const tag = wasRenamed ? '[RENAME]' : isDifferent ? '[CHANGE]' : '        '
    console.log(`${tag} ${file.rel}${wasRenamed ? ' -> ' + destRel : ''}`)
  }
}

console.log()
console.log('Resumo:')
console.log(`  Arquivos com mudanças no conteúdo: ${changedCount}`)
console.log(`  Arquivos renomeados (README.md -> index.md): ${renamedCount}`)
console.log(`  Sem alteração de conteúdo: ${unchangedCount}`)
console.log()
console.log('Conversões totais detectadas:')
console.log(`  Blocos {% hint %}:           ${totals.hint}`)
console.log(`  Blocos {% embed %}:          ${totals.embed}`)
console.log(`  Refs .gitbook/assets/:       ${totals.assetRefs}`)
console.log(`  Tags <figure>:               ${totals.figures}`)
console.log(`  Entidades &#x20;:            ${totals.htmlEntities}`)

if (!APPLY) {
  console.log()
  if (samples.length > 0) {
    console.log('Amostra dos primeiros arquivos afetados:')
    for (const s of samples) {
      const arrow = s.renamed ? `${s.src} -> ${s.dst}` : s.src
      console.log(`  - ${arrow}`)
      console.log(`    ${JSON.stringify(s.stats)}`)
    }
  }
  console.log()
  console.log(`Para aplicar de verdade:  node scripts/migrate-content.mjs --apply`)
} else {
  if (existsSync(ASSETS_SOURCE)) {
    console.log()
    console.log(`Copiando assets:`)
    console.log(`  ${ASSETS_SOURCE}`)
    console.log(`  -> ${ASSETS_DEST}`)
    if (existsSync(ASSETS_DEST)) {
      rmSync(ASSETS_DEST, { recursive: true, force: true })
    }
    mkdirSync(ASSETS_DEST, { recursive: true })

    // Carrega mapping de renames manuais (gerado por apply-renames.mjs)
    let renameMap = {}
    if (existsSync(RENAMES_MAP_PATH)) {
      try { renameMap = JSON.parse(readFileSync(RENAMES_MAP_PATH, 'utf8')) }
      catch (e) { console.log(`  AVISO: assets-renames.json inválido (${e.message})`) }
    }
    const renameCount = Object.keys(renameMap).length

    let copied = 0, skipped = 0, renamed = 0
    for (const entry of readdirSync(ASSETS_SOURCE)) {
      const src = join(ASSETS_SOURCE, entry)
      const st = statSync(src)
      if (st.isDirectory()) {
        cpSync(src, join(ASSETS_DEST, entry), { recursive: true })
        continue
      }
      if (dedupe.skipCopy.has(entry)) {
        skipped++
        continue
      }
      const finalName = renameMap[entry] || entry
      if (finalName !== entry) renamed++
      copyFileSync(src, join(ASSETS_DEST, finalName))
      copied++
    }
    console.log(`  ${copied} arquivo(s) copiado(s)`)
    if (skipped > 0) {
      console.log(`  ${skipped} duplicado(s) omitido(s) (mesmo conteúdo de um canônico)`)
    }
    if (renameCount > 0) {
      console.log(`  ${renamed} arquivo(s) renomeado(s) via assets-renames.json`)
    }

    // Aplica o mesmo mapping nas refs dos .md já gravados
    if (renameCount > 0 && APPLY) {
      const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const encoded = Object.entries(renameMap)
        .map(([from, to]) => [encodeAssetName(from), encodeAssetName(to)])
        .filter(([f, t]) => f !== t)
        .sort((a, b) => b[0].length - a[0].length)
      const lookup = new Map(encoded)
      const re = new RegExp(`/assets/(${encoded.map(([f]) => escape(f)).join('|')})`, 'g')
      let mdRefsUpdated = 0
      for (const file of files) {
        const destRel = destPathFor(file.rel)
        const destFull = resolve(DOCS_ROOT, destRel)
        if (!existsSync(destFull)) continue
        const c = readFileSync(destFull, 'utf8')
        let count = 0
        const updated = c.replace(re, (_, from) => { count++; return `/assets/${lookup.get(from)}` })
        if (count > 0) {
          writeFileSync(destFull, updated, 'utf8')
          mdRefsUpdated += count
        }
      }
      console.log(`  ${mdRefsUpdated} ref(s) em .md reescritas via assets-renames.json`)
    }
  } else {
    console.log()
    console.log(`AVISO: pasta de assets não encontrada em ${ASSETS_SOURCE}`)
  }
  console.log()
  console.log('Migração concluída.')
  console.log(`Próximos passos:`)
  console.log(`  1. npm run convert:sidebar    (regerar sidebar caso o SUMMARY tenha mudado)`)
  console.log(`  2. npm run docs:dev           (rodar local em http://localhost:5173)`)
}
